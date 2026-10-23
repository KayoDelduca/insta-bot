/**
 * api.js — Wrapper para chamadas a Graph API do Instagram
 *
 * Versao da API centralizada aqui. Cada versao vive ~2 anos:
 *   v24.0 → expira em fev/2028. Quando chegar perto, troque so esta linha.
 *   Lista: https://developers.facebook.com/docs/graph-api/changelog/versions
 */

export const API_VERSION = 'v24.0';

const BASE_URL = 'https://graph.instagram.com';
const FB_BASE_URL = 'https://graph.facebook.com';

/**
 * Faz uma chamada GET a API
 */
export async function apiGet(endpoint, params = {}, base = BASE_URL) {
  const url = new URL(endpoint, base);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  const res = await fetch(url.toString());
  const data = await res.json();

  if (data.error) {
    throw new Error(`Instagram API Error: ${data.error.message} (code ${data.error.code})`);
  }

  return data;
}

/**
 * Faz uma chamada POST a API
 */
export async function apiPost(endpoint, body = {}, base = BASE_URL) {
  const url = new URL(endpoint, base);

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (data.error) {
    throw new Error(`Instagram API Error: ${data.error.message} (code ${data.error.code})`);
  }

  return data;
}

export { BASE_URL, FB_BASE_URL };
