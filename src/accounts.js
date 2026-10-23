/**
 * accounts.js — Carrega credenciais de cada conta a partir do .env
 *
 * Convencao de env vars:
 *   ACCOUNT_A_LONG_LIVED_TOKEN, ACCOUNT_A_INSTAGRAM_USER_ID, ...
 *   ACCOUNT_B_LONG_LIVED_TOKEN, ACCOUNT_B_INSTAGRAM_USER_ID, ...
 *
 * O campo "account" no calendar.json e "a" ou "b" (case insensitive).
 */

import { resolve } from 'path';

export function getAccountCredentials(accountKey) {
  const prefix = `ACCOUNT_${accountKey.toUpperCase()}_`;

  const token = process.env[`${prefix}LONG_LIVED_TOKEN`];
  const userId = process.env[`${prefix}INSTAGRAM_USER_ID`];
  const appId = process.env[`${prefix}INSTAGRAM_APP_ID`];
  const appSecret = process.env[`${prefix}META_APP_SECRET`];

  if (!token || !userId) {
    throw new Error(
      `Credenciais da conta "${accountKey}" nao encontradas no .env.\n` +
      `Esperado: ${prefix}LONG_LIVED_TOKEN e ${prefix}INSTAGRAM_USER_ID`
    );
  }

  return { token, userId, appId, appSecret, prefix, key: accountKey.toUpperCase() };
}

/**
 * Retorna todas as contas configuradas (A, B, C, ...)
 */
export function getAllAccounts() {
  const accounts = [];
  for (const letter of 'ABCDEFGHIJ'.split('')) {
    const token = process.env[`ACCOUNT_${letter}_LONG_LIVED_TOKEN`];
    const userId = process.env[`ACCOUNT_${letter}_INSTAGRAM_USER_ID`];
    if (token && userId) {
      accounts.push(getAccountCredentials(letter));
    }
  }
  return accounts;
}

/**
 * Resolve o caminho local de um arquivo de midia.
 * Se CONTENT_A_DIR / CONTENT_B_DIR estiverem no .env (ex: pasta do Google Drive
 * sincronizada no computador), "content-a/reel-01.mp4" vira
 * "<CONTENT_A_DIR>/reel-01.mp4". Senao, usa a pasta do projeto.
 */
export function resolveMediaPath(mediaFile, accountKey) {
  const dir = process.env[`CONTENT_${String(accountKey).toUpperCase()}_DIR`];
  if (dir) {
    const fileName = mediaFile.split(/[\\/]/).pop();
    return resolve(dir, fileName);
  }
  return resolve(process.cwd(), mediaFile);
}
