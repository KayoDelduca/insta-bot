/**
 * cloudinary.js — Upload assinado para o Cloudinary (compartilhado entre scripts)
 */

import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { basename, extname } from 'path';

const VIDEO_EXT = ['.mp4', '.mov', '.avi', '.webm', '.m4v'];

export function getCloudinaryCredentials() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      'Credenciais do Cloudinary nao encontradas. ' +
      'Esperado: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET'
    );
  }
  return { cloudName, apiKey, apiSecret };
}

export function isVideo(filePath) {
  return VIDEO_EXT.includes(extname(filePath).toLowerCase());
}

/**
 * Faz upload de um arquivo e retorna { url, bytes, duration, resourceType }
 * @param {string} filePath  caminho local
 * @param {string} folder    pasta no Cloudinary (ex: cliente-a)
 * @param {string} [publicId] nome fixo do arquivo no Cloudinary (evita duplicar em re-upload)
 */
export async function uploadToCloudinary(filePath, folder, publicId) {
  const { cloudName, apiKey, apiSecret } = getCloudinaryCredentials();
  const resourceType = isVideo(filePath) ? 'video' : 'image';
  const timestamp = Math.floor(Date.now() / 1000);

  // Parametros assinados precisam estar em ordem alfabetica
  const params = { folder, timestamp };
  if (publicId) {
    params.overwrite = 'true';
    params.public_id = publicId;
  }
  const paramsToSign = Object.keys(params)
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&');
  const signature = createHash('sha1').update(paramsToSign + apiSecret).digest('hex');

  const fileBuffer = readFileSync(filePath);
  const formData = new FormData();
  formData.append('file', new Blob([fileBuffer]), basename(filePath));
  formData.append('api_key', apiKey);
  formData.append('signature', signature);
  for (const [k, v] of Object.entries(params)) {
    formData.append(k, String(v));
  }

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
    { method: 'POST', body: formData }
  );
  const data = await res.json();

  if (data.error) {
    throw new Error(`Cloudinary: ${data.error.message}`);
  }

  return {
    url: data.secure_url,
    bytes: data.bytes,
    duration: data.duration,
    width: data.width,
    height: data.height,
    resourceType: data.resource_type,
  };
}
