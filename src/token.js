/**
 * token.js — Gerenciamento de tokens para multiplas contas
 *
 * Comandos:
 *   node src/token.js exchange a   → Troca token curto da conta A
 *   node src/token.js refresh a    → Renova token da conta A
 *   node src/token.js refresh all  → Renova todas as contas
 *   node src/token.js info a       → Info do token da conta A
 */

import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { apiGet, API_VERSION } from './api.js';
import { getAccountCredentials, getAllAccounts } from './accounts.js';

const ENV_PATH = resolve(process.cwd(), '.env');

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

// ─── Renovar token ───
async function refreshToken(accountKey) {
  const account = getAccountCredentials(accountKey);

  console.log(`🔄 Renovando token da conta ${account.key}...`);

  const data = await apiGet('/refresh_access_token', {
    grant_type: 'ig_refresh_token',
    access_token: account.token,
  });

  console.log(`✅ Conta ${account.key} renovada! Expira em ${Math.round(data.expires_in / 86400)} dias`);

  // Se rodando local, atualiza .env
  if (process.env.GITHUB_ACTIONS !== 'true') {
    updateEnvVar(`${account.prefix}LONG_LIVED_TOKEN`, data.access_token);
  }

  return data.access_token;
}

// ─── Info do token ───
async function tokenInfo(accountKey) {
  const account = getAccountCredentials(accountKey);

  const me = await apiGet(`/${API_VERSION}/me`, {
    fields: 'id,username,account_type,media_count',
    access_token: account.token,
  });

  console.log(`📋 Conta ${account.key}:`);
  console.log(`   @${me.username} | ID: ${me.id} | Tipo: ${me.account_type} | Posts: ${me.media_count || 0}`);
}

// ─── CLI ───
const command = process.argv[2];
const target = (process.argv[3] || '').toLowerCase();

try {
  switch (command) {
    case 'refresh':
      if (target === 'all') {
        const accounts = getAllAccounts();
        if (accounts.length === 0) {
          console.error('❌ Nenhuma conta configurada no .env');
          process.exit(1);
        }
        for (const acc of accounts) {
          await refreshToken(acc.key);
        }
        console.log(`\n✅ ${accounts.length} conta(s) renovada(s)`);
      } else if (target) {
        await refreshToken(target);
      } else {
        console.log('Uso: node src/token.js refresh <a|b|all>');
      }
      break;

    case 'info':
      if (target) {
        await tokenInfo(target);
      } else {
        const accounts = getAllAccounts();
        for (const acc of accounts) {
          await tokenInfo(acc.key);
        }
      }
      break;

    default:
      console.log('Uso:');
      console.log('  node src/token.js refresh a     — Renova token da conta A');
      console.log('  node src/token.js refresh all   — Renova todas');
      console.log('  node src/token.js info a        — Info da conta A');
  }
} catch (err) {
  console.error(`\n❌ Erro: ${err.message}`);
  process.exit(1);
}
