// Stories fixos que saem todo dia na Mulher Graciosa (conta B).
// Roda pelo GitHub Actions (.github/workflows/stories-diarios.yml).
// As imagens ja estao no Cloudinary; para trocar, edite a lista abaixo.
import 'dotenv/config';
import { getAccountCredentials } from './accounts.js';
import { API_VERSION } from './api.js';

const STORIES = [
  'https://res.cloudinary.com/o110jmpz/image/upload/v1793626670/cliente-b/feedbacks/fb-medidas-1.jpg',
  'https://res.cloudinary.com/o110jmpz/image/upload/v1793626671/cliente-b/feedbacks/fb-medidas-2.jpg',
  'https://res.cloudinary.com/o110jmpz/image/upload/v1793803203/cliente-b/feedbacks/fb-pagamento-metodos.jpg',
];
const PAUSA = 25000;
const DRY = process.env.DRY_RUN === 'true';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const account = getAccountCredentials('b');

async function ig(method, path, params) {
  const url = new URL(`https://graph.instagram.com/${API_VERSION}/${path}`);
  const opts = { method };
  if (method === 'GET') {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  } else {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(params);
  }
  const data = await (await fetch(url, opts)).json();
  if (data.error) throw new Error(`${data.error.message} (code ${data.error.code})`);
  return data;
}

async function publishStory(image_url) {
  const c = await ig('POST', `${account.userId}/media`, { media_type: 'STORIES', image_url, access_token: account.token });
  for (let i = 0; i < 30; i++) {
    const s = await ig('GET', c.id, { fields: 'status_code,status', access_token: account.token })
      .catch(err => { if (/code 24\)/.test(err.message) && i < 10) return {}; throw err; });
    if (s.status_code === 'FINISHED') break;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error(`Processamento: ${s.status}`);
    await sleep(4000);
  }
  return ig('POST', `${account.userId}/media_publish`, { creation_id: c.id, access_token: account.token });
}

let falhas = 0;
for (const [i, url] of STORIES.entries()) {
  if (DRY) { console.log(`(simulacao) ${url}`); continue; }
  try {
    const p = await publishStory(url);
    console.log(`✅ ${url.split('/').pop()} → story ${p.id}`);
  } catch (err) {
    falhas++;
    console.error(`❌ ${url.split('/').pop()}: ${err.message}`);
  }
  if (i < STORIES.length - 1) await sleep(PAUSA);
}
process.exit(falhas ? 1 : 0);
