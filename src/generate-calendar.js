/**
 * generate-calendar.js — Gera 6 reels/dia por 7 dias para as contas escolhidas
 *
 * Comando: node src/generate-calendar.js 2026-11-02            (contas A e B)
 *          node src/generate-calendar.js 2026-11-03 c,d        (contas backup)
 *          node src/generate-calendar.js 2026-11-03 c,d --videos-de 2026-10-24
 *
 * Grava num arquivo separado (ex: calendar-cd-2026-11-03.json), NUNCA no
 * calendar.json — assim nao apaga os posts das outras contas. Edite as
 * legendas nesse arquivo e junte no calendario com:
 *          node src/add-posts.js calendar-cd-2026-11-03.json
 *
 * Contas backup (C, D — veja BACKUP_OF no accounts.js) usam os MESMOS videos
 * da conta de origem: o reel 1 da C e o primeiro post da A a partir de
 * --videos-de (padrao: a propria data de inicio), e assim por diante.
 * O media_url do Cloudinary e copiado, entao nao precisa subir de novo.
 * A legenda vem como modelo — escreva uma diferente da conta de origem.
 *
 * Horarios: 10:00, 12:30, 15:00, 17:30, 20:00, 22:30
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { BACKUP_OF } from './accounts.js';

const args = process.argv.slice(2);
const startDate = args[0];
const accountsArg = args[1] && !args[1].startsWith('--') ? args[1] : 'a,b';
const videosIdx = args.indexOf('--videos-de');
const videosFrom = videosIdx >= 0 ? args[videosIdx + 1] : startDate;

if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(videosFrom || '')) {
  console.log('Uso: node src/generate-calendar.js <data-inicio> [contas] [--videos-de <data>]');
  console.log('  Exemplo: node src/generate-calendar.js 2026-11-02');
  console.log('           node src/generate-calendar.js 2026-11-03 c,d');
  console.log('');
  console.log('  Gera 7 dias x 6 reels/dia por conta (padrao: contas a,b)');
  process.exit(1);
}

const TIMES = ['10:00', '12:30', '15:00', '17:30', '20:00', '22:30'];
const ACCOUNTS = accountsArg.toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
const DAYS = 7;
const PER_ACCOUNT = DAYS * TIMES.length;

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

// Videos das contas de origem, na ordem em que foram (ou serao) postados
let mainPosts = [];
try {
  mainPosts = JSON.parse(readFileSync(resolve(process.cwd(), 'calendar.json'), 'utf-8')).posts;
} catch {
  // sem calendar.json: contas backup caem no nome padrao do arquivo
}

function sourceVideos(source) {
  return mainPosts
    .filter(p => (p.account || 'a').toLowerCase() === source && p.date >= videosFrom)
    .sort((x, y) => `${x.date} ${x.time}`.localeCompare(`${y.date} ${y.time}`))
    .slice(0, PER_ACCOUNT);
}

const videosByAccount = {};
for (const account of ACCOUNTS) {
  const source = BACKUP_OF[account];
  if (!source) continue;
  videosByAccount[account] = sourceVideos(source);
  const found = videosByAccount[account].length;
  console.log(`🎬 Conta ${account.toUpperCase()} usa os videos da conta ${source.toUpperCase()} a partir de ${videosFrom}: ${found}/${PER_ACCOUNT} encontrados no calendar.json`);
  if (found < PER_ACCOUNT) {
    console.log(`   ⚠️  Os que faltam apontam para content-${source}/reel-NN.mp4 (rode "npm run bulk-upload" depois de juntar)`);
  }
}

const posts = [];

for (let day = 0; day < DAYS; day++) {
  const date = addDays(startDate, day);

  for (let slot = 0; slot < TIMES.length; slot++) {
    const time = TIMES[slot];
    const postNum = day * TIMES.length + slot + 1;
    const paddedNum = String(postNum).padStart(2, '0');

    for (const account of ACCOUNTS) {
      const source = BACKUP_OF[account];
      const video = videosByAccount[account]?.[postNum - 1];

      const post = {
        // Data no id para nao colidir com semanas anteriores no add-posts.js
        id: `${account}-${startDate}-${paddedNum}`,
        account: account,
        date: date,
        time: time,
        type: 'reel',
        caption: `[LEGENDA DO REEL ${paddedNum} — CONTA ${account.toUpperCase()}]\n\nEdite aqui a legenda.\n\n#hashtags`,
        media: video?.media || `content-${source || account}/reel-${paddedNum}.mp4`,
        status: 'pending',
      };
      if (video?.media_url) post.media_url = video.media_url;
      if (video) post.video_of = video.id;
      posts.push(post);
    }
  }
}

const calendar = {
  timezone: 'America/Sao_Paulo',
  schedule: '6 reels/dia — 10:00, 12:30, 15:00, 17:30, 20:00, 22:30',
  start_date: startDate,
  end_date: addDays(startDate, DAYS - 1),
  total_posts: posts.length,
  posts: posts,
};

const outName = `calendar-${ACCOUNTS.join('')}-${startDate}.json`;
writeFileSync(resolve(process.cwd(), outName), JSON.stringify(calendar, null, 2) + '\n');

console.log(`✅ ${outName} gerado!`);
console.log(`   Periodo: ${startDate} a ${calendar.end_date}`);
console.log(`   Posts: ${posts.length} (${PER_ACCOUNT} por conta: ${ACCOUNTS.join(', ').toUpperCase()})`);
console.log(`   Horarios: ${TIMES.join(', ')}`);
console.log('');
console.log('📝 Proximo passo:');
console.log(`   1. Edite as legendas em ${outName}`);
console.log(`   2. git pull && node src/add-posts.js ${outName}`);
console.log('   3. npm run bulk-upload && npm run check');
console.log('   4. git add calendar.json && git commit -m "..." && git push');
