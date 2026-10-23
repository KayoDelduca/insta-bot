/**
 * auth.js — Servidor OAuth para pegar token do Instagram
 *
 * Comando: node src/auth.js a
 *          node src/auth.js b
 *
 * Faz o fluxo OAuth para a conta escolhida (a ou b).
 */

import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { createInterface } from 'readline';
import { API_VERSION } from './api.js';

const ENV_PATH = resolve(process.cwd(), '.env');

const accountKey = (process.argv[2] || '').toUpperCase();
if (!accountKey || !['A', 'B', 'C', 'D', 'E'].includes(accountKey)) {
  console.log('Uso: node src/auth.js <a|b>');
  console.log('  Exemplo: node src/auth.js a   (autoriza conta A)');
  process.exit(1);
}

const prefix = `ACCOUNT_${accountKey}_`;
const APP_ID = process.env[`${prefix}INSTAGRAM_APP_ID`];
const APP_SECRET = process.env[`${prefix}META_APP_SECRET`];

if (!APP_ID || !APP_SECRET) {
  console.error(`❌ ${prefix}INSTAGRAM_APP_ID e ${prefix}META_APP_SECRET precisam estar no .env`);
  process.exit(1);
}

function updateEnvVar(key, value) {
  let env = '';
  try {
    env = readFileSync(ENV_PATH, 'utf-8');
  } catch {
    // .env ainda nao existe — cria a partir do .env.example se houver
    try { env = readFileSync(resolve(process.cwd(), '.env.example'), 'utf-8'); } catch { env = ''; }
  }
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(env)) {
    env = env.replace(regex, `${key}=${value}`);
  } else {
    env += `\n${key}=${value}\n`;
  }
  writeFileSync(ENV_PATH, env);
}

// Redirect URI — vai precisar configurar no Meta for Developers
// Pode usar qualquer URL que voce controle. Se nao tiver, use https://localhost/
const REDIRECT_URI = process.env.OAUTH_REDIRECT_URI || 'https://localhost/';

// So o necessario para publicar. Pedir permissao a mais que o app nao tem
// configurada faz o Instagram recusar a autorizacao.
const scopes = [
  'instagram_business_basic',
  'instagram_business_content_publish',
].join(',');

const authUrl = `https://www.instagram.com/oauth/authorize?enable_fb_login=0&force_authentication=1&client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${scopes}&response_type=code`;

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  🔐 Autorizacao Instagram — Conta ${accountKey}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
console.log('1. Abra este link no navegador:');
console.log('');
console.log(authUrl);
console.log('');
console.log('2. Autorize o app no Instagram');
console.log('3. Voce sera redirecionado — copie o CODIGO da URL');
console.log('   (o valor depois de "code=", sem o #_ no final)');
console.log('');
console.log('4. Cole o codigo aqui e pressione Enter:');
console.log('');

const rl = createInterface({ input: process.stdin, output: process.stdout });

rl.question('   Codigo: ', async (code) => {
  rl.close();

  code = code.replace(/#_$/, '').trim();

  if (!code) {
    console.error('\n❌ Codigo vazio');
    process.exit(1);
  }

  try {
    // Trocar codigo por token curto
    console.log('\n🔄 Trocando codigo por token...');

    const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: APP_ID,
        client_secret: APP_SECRET,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI,
        code: code,
      }),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error_message) {
      throw new Error(tokenData.error_message);
    }

    console.log(`✅ Token curto obtido! User ID: ${tokenData.user_id}`);

    // Trocar por token longo
    console.log('🔄 Trocando por token de longa duracao (60 dias)...');

    const longRes = await fetch(
      `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${APP_SECRET}&access_token=${tokenData.access_token}`
    );
    const longData = await longRes.json();

    if (longData.error) {
      throw new Error(longData.error.message);
    }

    console.log(`✅ Token longo gerado! Expira em ${Math.round(longData.expires_in / 86400)} dias`);

    // Buscar info
    const meRes = await fetch(
      `https://graph.instagram.com/${API_VERSION}/me?fields=id,username&access_token=${longData.access_token}`
    );
    const me = await meRes.json();

    console.log(`✅ Conta: @${me.username} (ID: ${me.id})`);

    // Salvar no .env
    updateEnvVar(`${prefix}LONG_LIVED_TOKEN`, longData.access_token);
    updateEnvVar(`${prefix}INSTAGRAM_USER_ID`, me.id);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  ✅ Conta ${accountKey} configurada!`);
    console.log(`  @${me.username} — token valido por 60 dias`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (err) {
    console.error(`\n❌ Erro: ${err.message}`);
    process.exit(1);
  }
});
