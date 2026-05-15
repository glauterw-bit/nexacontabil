import * as crypto from 'crypto';

/**
 * AES-256-GCM para criptografar tokens OAuth no banco.
 * Chave vem de CLOUD_ENCRYPTION_KEY (32 bytes hex) ou JWT_SECRET (fallback).
 */
function getKey(): Buffer {
  const raw = process.env.CLOUD_ENCRYPTION_KEY || process.env.JWT_SECRET || 'fallback-dev-key-not-secure-32b';
  // garante 32 bytes
  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptToken(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // formato: iv:tag:encrypted (todos hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptToken(payload: string): string {
  const [ivHex, tagHex, encryptedHex] = payload.split(':');
  if (!ivHex || !tagHex || !encryptedHex) throw new Error('Payload encriptado invalido');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}
