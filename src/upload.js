/**
 * upload.js — Upload de UM arquivo para o Cloudinary (teste manual)
 *
 * Comando: node src/upload.js <arquivo> [pasta]
 *   Ex: node src/upload.js content-a/reel-01.mp4 cliente-a
 *
 * Para subir tudo de uma vez, use: npm run bulk-upload
 */

import 'dotenv/config';
import { statSync } from 'fs';
import { basename } from 'path';
import { uploadToCloudinary, getCloudinaryCredentials } from './cloudinary.js';

try {
  getCloudinaryCredentials();
} catch (err) {
  console.error(`❌ ${err.message}`);
  process.exit(1);
}

const filePath = process.argv[2];
const folder = process.argv[3] || 'cliente-uploads';

if (!filePath) {
  console.log('Uso: node src/upload.js <arquivo> [pasta]');
  console.log('  Ex: node src/upload.js content-a/reel-01.mp4 cliente-a');
  process.exit(1);
}

try {
  const stats = statSync(filePath);
  console.log(`📁 Arquivo: ${basename(filePath)} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
} catch {
  console.error(`❌ Arquivo nao encontrado: ${filePath}`);
  process.exit(1);
}

console.log(`☁️  Enviando para Cloudinary (pasta: ${folder})...`);

try {
  const up = await uploadToCloudinary(filePath, folder);
  console.log('\n✅ Upload concluido!');
  console.log(`   URL: ${up.url}`);
  console.log(`   Tipo: ${up.resourceType}`);
  console.log(`   Tamanho: ${(up.bytes / 1024 / 1024).toFixed(1)} MB`);
  if (up.duration) console.log(`   Duracao: ${Math.round(up.duration)}s`);
  if (up.width) console.log(`   Resolucao: ${up.width}x${up.height}`);
} catch (err) {
  console.error(`\n❌ Erro: ${err.message}`);
  process.exit(1);
}
