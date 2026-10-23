/**
 * generate-calendar.js — Gera um calendar.json com 6 reels/dia por 7 dias, pra 2 contas
 *
 * Comando: node src/generate-calendar.js 2026-11-02
 *          (data de inicio — primeiro dia de postagem)
 *
 * Gera 84 entradas: 42 pra conta A, 42 pra conta B
 * Horarios: 10:00, 12:30, 15:00, 17:30, 20:00, 22:30
 *
 * O campo "media" aponta para content-a/ ou content-b/ com nome padrao.
 * Voce so precisa colocar os videos la e ajustar as legendas.
 */

import { writeFileSync } from 'fs';
import { resolve } from 'path';

const startDate = process.argv[2];

if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
  console.log('Uso: node src/generate-calendar.js <data-inicio>');
  console.log('  Exemplo: node src/generate-calendar.js 2026-11-02');
  console.log('');
  console.log('  Gera 7 dias x 6 reels/dia x 2 contas = 84 posts');
  process.exit(1);
}

const TIMES = ['10:00', '12:30', '15:00', '17:30', '20:00', '22:30'];
const ACCOUNTS = ['a', 'b'];
const DAYS = 7;

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

const posts = [];

for (let day = 0; day < DAYS; day++) {
  const date = addDays(startDate, day);

  for (let slot = 0; slot < TIMES.length; slot++) {
    const time = TIMES[slot];
    const postNum = day * TIMES.length + slot + 1;

    for (const account of ACCOUNTS) {
      const paddedNum = String(postNum).padStart(2, '0');

      posts.push({
        id: `${account}-d${day + 1}-${paddedNum}`,
        account: account,
        date: date,
        time: time,
        type: 'reel',
        caption: `[LEGENDA DO REEL ${paddedNum} — CONTA ${account.toUpperCase()}]\n\nEdite aqui a legenda.\n\n#hashtags`,
        media: `content-${account}/reel-${paddedNum}.mp4`,
        status: 'pending',
      });
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

const outPath = resolve(process.cwd(), 'calendar.json');
writeFileSync(outPath, JSON.stringify(calendar, null, 2));

console.log(`✅ calendar.json gerado!`);
console.log(`   Periodo: ${startDate} a ${calendar.end_date}`);
console.log(`   Posts: ${posts.length} (${posts.length / 2} por conta)`);
console.log(`   Horarios: ${TIMES.join(', ')}`);
console.log('');
console.log('📝 Proximo passo:');
console.log('   1. Coloque os videos em content-a/ e content-b/');
console.log('      (nomes: reel-01.mp4, reel-02.mp4, ..., reel-42.mp4)');
console.log('   2. Edite as legendas no calendar.json');
console.log('   3. Configure o .env com as credenciais');
