/**
 * check-calendar.js — Confere se o calendario esta pronto pro automatico
 *
 * Comando: npm run check
 *
 * Verifica, para cada post pendente:
 *   - legenda editada (nao e o texto-modelo) e com ate 2.200 caracteres
 *   - ate 30 hashtags
 *   - tem media_url (Cloudinary) OU o arquivo local existe
 *   - data/horario validos e no futuro
 *   - conta A/B tem credenciais no .env (se o .env existir)
 *
 * Nao publica nada. So avisa.
 */

import 'dotenv/config';
import { readFileSync, statSync } from 'fs';
import { resolve } from 'path';
import { resolveMediaPath } from './accounts.js';

const PLACEHOLDER_RE = /^\s*\[LEGENDA/i;
const calendarPath = resolve(process.cwd(), 'calendar.json');

let calendar;
try {
  calendar = JSON.parse(readFileSync(calendarPath, 'utf-8'));
} catch (err) {
  console.error(`❌ calendar.json invalido: ${err.message}`);
  process.exit(1);
}

const now = new Date();
const todayBR = now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

const problems = [];
const warnings = [];
let pending = 0;
let published = 0;
let withUrl = 0;
let withLocal = 0;
const perAccount = {};

for (const p of calendar.posts) {
  const acc = (p.account || 'a').toLowerCase();
  perAccount[acc] = perAccount[acc] || { pending: 0, published: 0 };

  if (p.status === 'published' || p.posted) {
    published++;
    perAccount[acc].published++;
    continue;
  }
  if (p.status === 'failed') {
    problems.push(`${p.id}: status "failed" (${p.last_error || 'sem detalhe'}) — corrija e volte para "pending"`);
    continue;
  }
  if (p.status === 'skipped') {
    problems.push(`${p.id}: foi pulado (${p.last_error || 'legenda'}) — edite e volte para "pending"`);
    continue;
  }

  pending++;
  perAccount[acc].pending++;

  // Legenda
  if (!p.caption || PLACEHOLDER_RE.test(p.caption)) {
    problems.push(`${p.id}: legenda ainda e o texto-modelo`);
  } else {
    if (p.caption.length > 2200) problems.push(`${p.id}: legenda com ${p.caption.length} caracteres (max 2.200)`);
    const tags = (p.caption.match(/#\w+/g) || []).length;
    if (tags > 30) problems.push(`${p.id}: ${tags} hashtags (max 30)`);
    // Conta backup: legenda igual a da conta de origem chama atencao do Instagram
    const original = p.video_of && calendar.posts.find(o => o.id === p.video_of);
    if (original && original.caption?.trim() === p.caption.trim()) {
      problems.push(`${p.id}: legenda igual a de ${original.id} — escreva uma diferente na conta backup`);
    }
  }

  // Midia
  if (p.media_url) {
    withUrl++;
    if (!/^https:\/\//.test(p.media_url)) problems.push(`${p.id}: media_url precisa ser https`);
  } else if (p.media || p.media_file) {
    const f = resolveMediaPath(p.media || p.media_file, acc);
    try {
      const st = statSync(f);
      withLocal++;
      if (st.size > 100 * 1024 * 1024) {
        warnings.push(`${p.id}: arquivo local com ${(st.size / 1024 / 1024).toFixed(0)} MB — GitHub recusa >100 MB. Use "npm run bulk-upload".`);
      } else {
        warnings.push(`${p.id}: sem media_url — o arquivo local so funciona se estiver no GitHub. Prefira "npm run bulk-upload".`);
      }
    } catch {
      problems.push(`${p.id}: sem media_url e arquivo nao existe: ${p.media || p.media_file}`);
    }
  } else {
    problems.push(`${p.id}: sem midia (media ou media_url)`);
  }

  // Data/hora
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date || '')) problems.push(`${p.id}: data invalida "${p.date}"`);
  if (p.time && !/^\d{2}:\d{2}$/.test(p.time)) problems.push(`${p.id}: horario invalido "${p.time}"`);
  if (p.date && p.date < todayBR) warnings.push(`${p.id}: data ${p.date} ja passou — nunca sera publicado`);

  if (!['reel', 'image'].includes(p.type)) warnings.push(`${p.id}: tipo "${p.type}" desconhecido (use "reel" ou "image")`);
}

// Credenciais (so se .env existe localmente)
for (const acc of Object.keys(perAccount)) {
  const prefix = `ACCOUNT_${acc.toUpperCase()}_`;
  if (process.env[`${prefix}LONG_LIVED_TOKEN`] === undefined && Object.keys(process.env).some(k => k.startsWith('ACCOUNT_'))) {
    warnings.push(`Conta ${acc.toUpperCase()}: ${prefix}LONG_LIVED_TOKEN nao esta no .env (rode: node src/auth.js ${acc})`);
  }
}

// Volume por dia (limite da API: 100 posts/24h por conta — folga enorme, mas avisa)
const perDay = {};
for (const p of calendar.posts) {
  if (p.status === 'published') continue;
  const k = `${p.account}|${p.date}`;
  perDay[k] = (perDay[k] || 0) + 1;
}
for (const [k, n] of Object.entries(perDay)) {
  if (n > 25) warnings.push(`Conta ${k.split('|')[0].toUpperCase()} em ${k.split('|')[1]}: ${n} posts no dia — muito acima do recomendado`);
}

// ─── Relatorio ───
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  🔎 Check do calendario');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  Periodo: ${calendar.start_date} → ${calendar.end_date}`);
console.log(`  Publicados: ${published} | Pendentes: ${pending}`);
for (const [acc, s] of Object.entries(perAccount)) {
  console.log(`    Conta ${acc.toUpperCase()}: ${s.pending} pendentes, ${s.published} publicados`);
}
console.log(`  Midia no Cloudinary (media_url): ${withUrl} | Arquivo local: ${withLocal}`);
console.log('');

if (warnings.length) {
  console.log(`⚠️  Avisos (${warnings.length}):`);
  for (const w of warnings.slice(0, 40)) console.log(`   - ${w}`);
  if (warnings.length > 40) console.log(`   ... e mais ${warnings.length - 40}`);
  console.log('');
}

if (problems.length) {
  console.log(`❌ Problemas que IMPEDEM a publicacao (${problems.length}):`);
  for (const p of problems.slice(0, 40)) console.log(`   - ${p}`);
  if (problems.length > 40) console.log(`   ... e mais ${problems.length - 40}`);
  console.log('');
  process.exit(1);
}

console.log('✅ Calendario pronto. Pode dar git push e deixar o GitHub Actions trabalhar.');
