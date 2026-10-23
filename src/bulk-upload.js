/**
 * bulk-upload.js — Sobe TODOS os videos do calendario para o Cloudinary de uma vez
 *                  e grava a URL publica em "media_url" de cada post.
 *
 * Comando: npm run bulk-upload
 *          node src/bulk-upload.js            (todos os posts pendentes sem media_url)
 *          node src/bulk-upload.js a          (so a conta A)
 *          node src/bulk-upload.js --force    (re-envia mesmo quem ja tem media_url)
 *
 * Por que isso importa:
 *   - Os videos NAO precisam ir pro GitHub (limite 100 MB/arquivo, repo pesado).
 *   - O GitHub Actions so precisa do calendar.json com as URLs.
 *   - Rode isso no seu computador UMA vez por semana (ou por lote) e de git push.
 *
 * O public_id no Cloudinary e o id do post (ex: a-d1-01), entao rodar de novo
 * sobrescreve em vez de duplicar.
 */

import 'dotenv/config';
import { readFileSync, writeFileSync, statSync } from 'fs';
import { resolve } from 'path';
import { resolveMediaPath } from './accounts.js';
import { uploadToCloudinary, getCloudinaryCredentials } from './cloudinary.js';

const args = process.argv.slice(2);
const force = args.includes('--force');
const onlyAccount = (args.find(a => !a.startsWith('--')) || '').toLowerCase();

try {
  getCloudinaryCredentials();
} catch (err) {
  console.error(`❌ ${err.message}`);
  process.exit(1);
}

const calendarPath = resolve(process.cwd(), 'calendar.json');
const calendar = JSON.parse(readFileSync(calendarPath, 'utf-8'));

const targets = calendar.posts.filter(p => {
  if (p.status === 'published' || p.posted) return false;
  if (onlyAccount && (p.account || 'a').toLowerCase() !== onlyAccount) return false;
  if (p.media_url && !force) return false;
  return Boolean(p.media_file || p.media);
});

if (targets.length === 0) {
  console.log('✅ Nada para enviar — todos os posts pendentes ja tem media_url.');
  process.exit(0);
}

console.log(`☁️  ${targets.length} arquivo(s) para enviar ao Cloudinary\n`);

let ok = 0;
let missing = 0;
let failed = 0;
let totalBytes = 0;

for (const [i, post] of targets.entries()) {
  const accountKey = (post.account || 'a').toLowerCase();
  const mediaFile = post.media_file || post.media;
  const filePath = resolveMediaPath(mediaFile, accountKey);
  const label = `[${i + 1}/${targets.length}] ${post.id}`;

  try {
    statSync(filePath);
  } catch {
    console.log(`⏭️  ${label} — arquivo nao existe: ${mediaFile}`);
    missing++;
    continue;
  }

  const folder = `cliente-${accountKey}`;
  process.stdout.write(`⬆️  ${label} ${mediaFile} → ${folder}/${post.id} ... `);

  try {
    const up = await uploadToCloudinary(filePath, folder, post.id);
    post.media_url = up.url;
    post.media_bytes = up.bytes;
    if (up.duration) post.media_duration_s = Math.round(up.duration);
    if (up.width && up.height) post.media_size = `${up.width}x${up.height}`;
    totalBytes += up.bytes || 0;
    ok++;
    console.log(`OK (${(up.bytes / 1024 / 1024).toFixed(1)} MB${up.duration ? `, ${Math.round(up.duration)}s` : ''})`);

    // Salva a cada arquivo — se cair a internet, nao perde o progresso
    writeFileSync(calendarPath, JSON.stringify(calendar, null, 2) + '\n');
  } catch (err) {
    failed++;
    console.log(`ERRO: ${err.message}`);
  }
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  ✅ Enviados: ${ok}  (${(totalBytes / 1024 / 1024).toFixed(0)} MB)`);
if (missing) console.log(`  ⏭️  Arquivo local faltando: ${missing}`);
if (failed) console.log(`  ❌ Falhas: ${failed}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('\n📝 Proximo passo: npm run check  →  git add calendar.json && git commit -m "calendario" && git push');

process.exit(failed > 0 ? 1 : 0);
