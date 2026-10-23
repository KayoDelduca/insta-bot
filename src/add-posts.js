/**
 * add-posts.js — Junta posts de outro arquivo no calendar.json SEM apagar os que ja existem.
 *
 * Comando: node src/add-posts.js calendar-a.json
 *
 * - Mantem todos os posts atuais (inclusive status "published" que o bot gravou)
 * - Adiciona so os posts cujo "id" ainda nao existe
 * - Atualiza start_date, end_date e total_posts
 *
 * Sempre rode "git pull" antes, para pegar o calendario mais recente do GitHub.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const src = process.argv[2];
if (!src) {
  console.log('Uso: node src/add-posts.js <arquivo.json>');
  process.exit(1);
}

const calPath = resolve(process.cwd(), 'calendar.json');
const cal = JSON.parse(readFileSync(calPath, 'utf-8'));
const extra = JSON.parse(readFileSync(resolve(process.cwd(), src), 'utf-8'));
const newPosts = Array.isArray(extra) ? extra : extra.posts;

const existing = new Set(cal.posts.map(p => p.id));
let added = 0;
let skipped = 0;
for (const p of newPosts) {
  if (existing.has(p.id)) { skipped++; continue; }
  cal.posts.push(p);
  added++;
}

cal.posts.sort((a, b) => `${a.date} ${a.time} ${a.account}`.localeCompare(`${b.date} ${b.time} ${b.account}`));
const dates = cal.posts.map(p => p.date).sort();
cal.start_date = dates[0];
cal.end_date = dates[dates.length - 1];
cal.total_posts = cal.posts.length;

writeFileSync(calPath, JSON.stringify(cal, null, 2) + '\n');

const byAcc = {};
for (const p of cal.posts) byAcc[p.account] = (byAcc[p.account] || 0) + 1;
console.log(`✅ ${added} post(s) adicionados${skipped ? `, ${skipped} ja existiam (ignorados)` : ''}`);
console.log(`   Total agora: ${cal.total_posts} | ${Object.entries(byAcc).map(([a, n]) => `Conta ${a.toUpperCase()}: ${n}`).join(' | ')}`);
console.log(`   Periodo: ${cal.start_date} → ${cal.end_date}`);
