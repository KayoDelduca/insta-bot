/**
 * scheduler.js — Le o calendario e publica os posts que estao na hora
 *
 * Comando: node src/scheduler.js
 *          DRY_RUN=true node src/scheduler.js   (simula, nao publica)
 *
 * Regras:
 *   - Suporta multiplas contas (campo "account" no calendar.json)
 *   - Publica posts pendentes cujo horario ja chegou (ate 5 min antes),
 *     inclusive de dias anteriores (ate 3 dias). O cron do GitHub pode
 *     atrasar horas ou pular execucoes; o post perdido sai na proxima.
 *   - No maximo 1 post por conta por execucao, do mais antigo para o mais
 *     novo, e nunca menos de 60 min depois do ultimo post daquela conta
 *     (evita rajada de posts e bloqueio por spam).
 *   - Pula posts cuja legenda ainda e o texto-modelo "[LEGENDA ...]"
 *   - Prefere "media_url" (ja no Cloudinary) e so faz upload se houver
 *     apenas o arquivo local "media"
 *   - Registra erros no proprio calendar.json (last_error / attempts)
 *
 * Usado pelo GitHub Actions nos 6 horarios do cron.
 */

import 'dotenv/config';
import { readFileSync, writeFileSync, statSync } from 'fs';
import { basename, resolve } from 'path';
import { getAccountCredentials, resolveMediaPath } from './accounts.js';
import { uploadToCloudinary } from './cloudinary.js';
import { API_VERSION } from './api.js';

const DRY_RUN = String(process.env.DRY_RUN).toLowerCase() === 'true';
const EARLY_MINUTES = 5;     // pode publicar ate 5 min antes do horario
const MAX_LATE_DAYS = 3;     // post atrasado mais que isso e ignorado (calendario antigo)
const MAX_PER_ACCOUNT = 1;   // posts por conta por execucao (nunca dois Reels seguidos)
const MIN_GAP_MINUTES = 60;  // intervalo minimo entre dois posts da mesma conta
const MAX_ATTEMPTS = 3;      // depois disso, para de tentar e marca como "failed"
const PLACEHOLDER_RE = /^\s*\[LEGENDA/i;

// ─── Helpers de data/hora ───

function getNowBR(now = new Date()) {
  const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const timeStr = now.toLocaleTimeString('en-GB', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return { date: dateStr, time: timeStr, raw: now };
}

// "YYYY-MM-DD HH:MM" — compara direto como texto
function stamp({ date, time }) {
  return `${date} ${time || '00:00'}`;
}

function isDue(post, nowBR) {
  const limit = getNowBR(new Date(nowBR.raw.getTime() + EARLY_MINUTES * 60_000));
  const oldest = getNowBR(new Date(nowBR.raw.getTime() - MAX_LATE_DAYS * 86_400_000));
  const s = stamp(post);
  return s <= stamp(limit) && s >= stamp(oldest);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Publicar no Instagram ───

async function igPost(path, body) {
  const res = await fetch(`https://graph.instagram.com/${API_VERSION}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.error) {
    throw new Error(`${data.error.message} (code ${data.error.code})`);
  }
  return data;
}

async function igGet(path, params) {
  const url = new URL(`https://graph.instagram.com/${API_VERSION}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) {
    throw new Error(`${data.error.message} (code ${data.error.code})`);
  }
  return data;
}

async function waitForContainer(containerId, token) {
  // Reels podem levar alguns minutos para processar
  for (let i = 0; i < 60; i++) {
    const status = await igGet(containerId, {
      fields: 'status_code,status',
      access_token: token,
    });
    if (status.status_code === 'FINISHED') return;
    if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
      throw new Error(`Processamento falhou: ${JSON.stringify(status.status)}`);
    }
    await sleep(5000);
  }
  throw new Error('Timeout: video nao processou em 5 minutos');
}

async function publishReel(mediaUrl, caption, account) {
  const container = await igPost(`${account.userId}/media`, {
    media_type: 'REELS',
    video_url: mediaUrl,
    caption,
    share_to_feed: true,
    access_token: account.token,
  });

  console.log('   ⏳ Processando video...');
  await waitForContainer(container.id, account.token);
  console.log('   ✅ Video processado');

  return igPost(`${account.userId}/media_publish`, {
    creation_id: container.id,
    access_token: account.token,
  });
}

async function publishStory(media, account) {
  // media = { video_url } ou { image_url }. Stories nao tem legenda.
  const container = await igPost(`${account.userId}/media`, {
    media_type: 'STORIES',
    ...media,
    access_token: account.token,
  });
  await waitForContainer(container.id, account.token);
  return igPost(`${account.userId}/media_publish`, {
    creation_id: container.id,
    access_token: account.token,
  });
}

async function publishImage(mediaUrl, caption, account) {
  const container = await igPost(`${account.userId}/media`, {
    image_url: mediaUrl,
    caption,
    access_token: account.token,
  });

  // Imagens tambem podem demorar um pouco
  await waitForContainer(container.id, account.token);

  return igPost(`${account.userId}/media_publish`, {
    creation_id: container.id,
    access_token: account.token,
  });
}

// ─── Main ───

const calendarPath = resolve(process.cwd(), 'calendar.json');
let calendar;
try {
  calendar = JSON.parse(readFileSync(calendarPath, 'utf-8'));
} catch {
  console.error('❌ calendar.json nao encontrado ou invalido');
  process.exit(1);
}

const nowBR = getNowBR();
console.log(`📅 Hoje: ${nowBR.date} | Agora: ${nowBR.time} (America/Sao_Paulo)${DRY_RUN ? ' | 🧪 DRY RUN' : ''}`);

// Mais antigos primeiro; sem horario = posta na primeira execucao do dia
const pending = calendar.posts
  .filter(p => !(p.posted || p.status === 'published' || p.status === 'failed' || p.status === 'skipped'))
  .filter(p => isDue(p, nowBR))
  .sort((x, y) => stamp(x).localeCompare(stamp(y)));

// Ultimo post publicado de cada conta
const lastPostedAt = {};
for (const p of calendar.posts) {
  if (!p.posted_at) continue;
  const key = (p.account || 'a').toLowerCase();
  const t = new Date(p.posted_at).getTime();
  if (!(lastPostedAt[key] >= t)) lastPostedAt[key] = t;
}

const perAccount = {};
const duePosts = pending.filter(p => {
  const key = (p.account || 'a').toLowerCase();
  const minutesSinceLast = (nowBR.raw.getTime() - (lastPostedAt[key] || 0)) / 60_000;
  if (minutesSinceLast < MIN_GAP_MINUTES) return false;
  perAccount[key] = (perAccount[key] || 0) + 1;
  return perAccount[key] <= MAX_PER_ACCOUNT;
});

const waiting = pending.length - duePosts.length;
if (waiting > 0) console.log(`⏳ ${waiting} post(s) atrasado(s) ficam para as proximas execucoes`);

if (duePosts.length === 0) {
  console.log('😴 Nenhum post para este horario.');
  process.exit(0);
}

console.log(`📋 ${duePosts.length} post(s) para agora\n`);

let changed = false;
let errors = 0;

function markError(post, message) {
  post.attempts = (post.attempts || 0) + 1;
  post.last_error = message;
  post.last_attempt_at = new Date().toISOString();
  if (post.attempts >= MAX_ATTEMPTS) {
    post.status = 'failed';
    console.error(`   🛑 ${post.attempts} tentativas — marcado como "failed". Corrija e volte status para "pending".`);
  }
  changed = true;
  errors++;
}

for (const post of duePosts) {
  const accountKey = (post.account || 'a').toLowerCase();
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  📌 ${post.id} [Conta ${accountKey.toUpperCase()}]`);
  console.log(`  Tipo: ${post.type} | Hora: ${post.time}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Legenda nao editada? Nao publica texto-modelo.
  if (!post.caption || PLACEHOLDER_RE.test(post.caption)) {
    console.error('   ⏭️  Legenda ainda e o texto-modelo. Pulando (status: skipped).');
    post.status = 'skipped';
    post.last_error = 'Legenda nao editada';
    changed = true;
    errors++;
    continue;
  }

  let account;
  try {
    account = getAccountCredentials(accountKey);
  } catch (err) {
    console.error(`   ❌ ${err.message}`);
    markError(post, err.message);
    continue;
  }

  // Resolver midia: prefere media_url (ja hospedada)
  let mediaUrl = post.media_url;
  const mediaFile = post.media_file || post.media;

  if (!mediaUrl && mediaFile) {
    const filePath = resolveMediaPath(mediaFile, accountKey);
    try {
      statSync(filePath);
    } catch {
      const msg = `Arquivo nao encontrado: ${mediaFile} (rode "npm run bulk-upload" antes, ou coloque o arquivo no repo)`;
      console.error(`   ❌ ${msg}`);
      markError(post, msg);
      continue;
    }

    const folder = `cliente-${accountKey}`;
    console.log(`   ☁️  Upload: ${basename(filePath)} → ${folder}/`);

    if (DRY_RUN) {
      mediaUrl = `https://dry-run.local/${folder}/${basename(filePath)}`;
    } else {
      try {
        const up = await uploadToCloudinary(filePath, folder, post.id);
        mediaUrl = up.url;
        post.media_url = mediaUrl; // salva pra nao subir de novo numa retentativa
        changed = true;
        console.log('   ✅ Upload OK');
      } catch (err) {
        console.error(`   ❌ Erro upload: ${err.message}`);
        markError(post, `Upload: ${err.message}`);
        continue;
      }
    }
  }

  if (!mediaUrl) {
    console.error('   ❌ Sem midia definida');
    markError(post, 'Sem midia definida (media ou media_url)');
    continue;
  }

  if (DRY_RUN) {
    console.log(`   🧪 DRY RUN — publicaria ${post.type}${(post.story !== false && calendar.stories !== false) ? " + story" : ""} em @conta-${accountKey}: ${mediaUrl}`);
    continue;
  }

  console.log('   📤 Publicando...');
  try {
    const published = post.type === 'reel'
      ? await publishReel(mediaUrl, post.caption, account)
      : await publishImage(mediaUrl, post.caption, account);

    console.log(`   ✅ Publicado! ID: ${published.id}`);

    post.posted = true;
    post.status = 'published';
    post.posted_at = new Date().toISOString();
    post.instagram_id = published.id;
    delete post.last_error;
    changed = true;
  } catch (err) {
    console.error(`   ❌ Erro: ${err.message}`);
    markError(post, err.message);
    continue;
  }

  // ─── Story com a mesma midia (opcional) ───
  // Liga/desliga no calendar.json: "stories": true no topo, ou "story": false num post.
  // Story de video tem limite de 60 s; se o Reel for maior, o Instagram recusa e
  // o bot so registra em story_error (o Reel ja foi publicado normalmente).
  const wantStory = post.story !== false && calendar.stories !== false && !post.story_id;
  if (wantStory) {
    console.log('   📲 Publicando no Story...');
    try {
      const story = post.type === 'reel'
        ? await publishStory({ video_url: mediaUrl }, account)
        : await publishStory({ image_url: mediaUrl }, account);
      post.story_id = story.id;
      post.story_posted_at = new Date().toISOString();
      delete post.story_error;
      console.log(`   ✅ Story publicado! ID: ${story.id}`);
    } catch (err) {
      post.story_error = err.message;
      console.error(`   ⚠️  Story falhou (Reel ja esta no ar): ${err.message}`);
    }
    changed = true;
  }
}

if (changed && !DRY_RUN) {
  writeFileSync(calendarPath, JSON.stringify(calendar, null, 2) + '\n');
  console.log('\n📁 calendar.json atualizado');
}

if (errors > 0) {
  console.error(`\n⚠️  ${errors} post(s) com problema — veja acima.`);
  // Sai com erro para o GitHub te avisar por e-mail (o calendario ja foi salvo)
  process.exit(1);
}

console.log('\n🎉 Tudo publicado.');
