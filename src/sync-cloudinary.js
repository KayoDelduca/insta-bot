/**
 * sync-cloudinary.js — Voce subiu os videos pelo SITE do Cloudinary?
 *                      Este script busca as URLs la e preenche "media_url" no calendar.json.
 *
 * Comando: npm run sync
 *
 * Tambem reaproveita o que o bulk-upload ja enviou (cliente-b/b-d1-01 etc.),
 * entao se voce gerou o calendario de novo, basta rodar isto em vez de subir tudo.
 *
 * Como organizar no Cloudinary (Media Library):
 *   pasta  cliente-a/   com  reel-01.mp4, reel-02.mp4 ... reel-42.mp4
 *   pasta  cliente-b/   com  reel-01.mp4, reel-02.mp4 ... reel-42.mp4
 *
 * O nome do arquivo precisa ter "reel-NN" em algum lugar (ex: reel-07, reel-07_final,
 * meu-reel-07). O numero NN e o que liga ao post do calendario.
 */

import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { getCloudinaryCredentials } from './cloudinary.js';

let creds;
try {
  creds = getCloudinaryCredentials();
} catch (err) {
  console.error(`❌ ${err.message}`);
  process.exit(1);
}

const auth = 'Basic ' + Buffer.from(`${creds.apiKey}:${creds.apiSecret}`).toString('base64');

async function listFolder(folder) {
  const all = [];
  for (const resourceType of ['video', 'image']) {
    let cursor;
    do {
      const url = new URL(`https://api.cloudinary.com/v1_1/${creds.cloudName}/resources/${resourceType}`);
      url.searchParams.set('type', 'upload');
      url.searchParams.set('prefix', `${folder}/`);
      url.searchParams.set('max_results', '500');
      if (cursor) url.searchParams.set('next_cursor', cursor);

      const res = await fetch(url, { headers: { Authorization: auth } });
      const data = await res.json();
      if (data.error) throw new Error(`Cloudinary (${folder}): ${data.error.message}`);

      all.push(...(data.resources || []));
      cursor = data.next_cursor;
    } while (cursor);
  }
  return all;
}

const calendarPath = resolve(process.cwd(), 'calendar.json');
const calendar = JSON.parse(readFileSync(calendarPath, 'utf-8'));

const accounts = [...new Set(calendar.posts.map(p => (p.account || 'a').toLowerCase()))];
let filled = 0;
let already = 0;
const notFound = [];

for (const acc of accounts) {
  const folder = `cliente-${acc}`;
  process.stdout.write(`☁️  Lendo pasta ${folder}/ no Cloudinary... `);
  let resources;
  try {
    resources = await listFolder(folder);
  } catch (err) {
    console.log(`ERRO: ${err.message}`);
    continue;
  }
  console.log(`${resources.length} arquivo(s)`);

  // Mapa 1: id do post (ex: cliente-b/b-d1-01, enviado pelo bulk-upload) → URL
  const byId = new Map();
  // Mapa 2: numero do reel (ex: reel-07.mp4 enviado pelo site) → URL
  const byNumber = new Map();
  for (const r of resources) {
    const base = r.public_id.split('/').pop();
    byId.set(base, r.secure_url);
    const m = r.public_id.match(/reel[-_ ]?(\d{1,3})/i);
    if (m) {
      const n = String(Number(m[1])).padStart(2, '0');
      if (!byNumber.has(n)) byNumber.set(n, r.secure_url);
    }
  }

  for (const post of calendar.posts) {
    if ((post.account || 'a').toLowerCase() !== acc) continue;
    if (post.status === 'published' || post.posted) continue;
    if (post.media_url) { already++; continue; }

    const m = (post.media || post.id || '').match(/reel[-_]?(\d{1,3})|-(\d{2,3})$/i);
    const n = m ? String(Number(m[1] || m[2])).padStart(2, '0') : null;

    if (byId.has(post.id)) {
      post.media_url = byId.get(post.id);
      filled++;
    } else if (n && byNumber.has(n)) {
      post.media_url = byNumber.get(n);
      filled++;
    } else {
      notFound.push(`${post.id} (esperado ${folder}/reel-${n || '??'})`);
    }
  }
}

writeFileSync(calendarPath, JSON.stringify(calendar, null, 2) + '\n');

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  ✅ URLs preenchidas agora: ${filled}`);
if (already) console.log(`  ✔️  Ja tinham URL: ${already}`);
if (notFound.length) {
  console.log(`  ❌ Sem video no Cloudinary: ${notFound.length}`);
  for (const x of notFound.slice(0, 20)) console.log(`     - ${x}`);
  if (notFound.length > 20) console.log(`     ... e mais ${notFound.length - 20}`);
}
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('\n📝 Proximo passo: npm run check  →  git add calendar.json && git commit -m "calendario" && git push');
process.exit(notFound.length ? 1 : 0);
