/**
 * status.js — Verifica status de todas as contas
 *
 * Comando: npm run status
 *          node src/status.js a
 */

import 'dotenv/config';
import { apiGet, API_VERSION } from './api.js';
import { getAccountCredentials, getAllAccounts } from './accounts.js';

async function showStatus(account) {
  const me = await apiGet(`/${API_VERSION}/me`, {
    fields: 'id,username,account_type,media_count,followers_count,follows_count',
    access_token: account.token,
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  📊 Conta ${account.key}: @${me.username}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Tipo: ${me.account_type}`);
  console.log(`  Posts: ${me.media_count || 0}`);
  if (me.followers_count !== undefined) {
    console.log(`  Seguidores: ${me.followers_count}`);
    console.log(`  Seguindo: ${me.follows_count}`);
  }

  // Ultimos posts
  const media = await apiGet(`/${API_VERSION}/${account.userId}/media`, {
    fields: 'id,caption,media_type,timestamp,like_count,comments_count',
    limit: 3,
    access_token: account.token,
  });

  if (media.data && media.data.length > 0) {
    console.log('\n  📱 Ultimos posts:');
    for (const post of media.data) {
      const date = new Date(post.timestamp).toLocaleDateString('pt-BR');
      const caption = (post.caption || '').substring(0, 40);
      console.log(`  ${date} | ${post.media_type} | ❤️ ${post.like_count || 0} | 💬 ${post.comments_count || 0}`);
      if (caption) console.log(`           "${caption}..."`);
    }
  }

  console.log('  ✅ Token funcionando!\n');
}

const target = (process.argv[2] || '').toLowerCase();

try {
  if (target) {
    await showStatus(getAccountCredentials(target));
  } else {
    const accounts = getAllAccounts();
    if (accounts.length === 0) {
      console.error('❌ Nenhuma conta configurada no .env');
      process.exit(1);
    }
    for (const acc of accounts) {
      await showStatus(acc);
    }
  }
} catch (err) {
  console.error(`❌ Erro: ${err.message}`);
  process.exit(1);
}
