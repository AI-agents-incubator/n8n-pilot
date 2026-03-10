/**
 * n8n Pilot — Crypto Module
 * AES-256-GCM encryption for API keys and sensitive data.
 * Uses Web Crypto API (available in service workers and extension pages).
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits recommended for AES-GCM
const STORAGE_KEY = '__n8nPilotEncryptionKey';

/**
 * Generate a new AES-256-GCM encryption key.
 * Called once on first extension launch.
 */
export async function generateEncryptionKey() {
  return crypto.subtle.generateKey(
    { name: ALGORITHM, length: KEY_LENGTH },
    true, // extractable — needed for export/import
    ['encrypt', 'decrypt']
  );
}

/**
 * Export CryptoKey to JWK format for storage.
 */
export async function exportKey(key) {
  return crypto.subtle.exportKey('jwk', key);
}

/**
 * Import CryptoKey from JWK format.
 */
export async function importKey(jwk) {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt a plaintext string.
 * Returns { ciphertext: base64, iv: base64 }
 */
export async function encrypt(plaintext, key) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    data
  );

  return {
    ciphertext: arrayBufferToBase64(encrypted),
    iv: arrayBufferToBase64(iv.buffer),
  };
}

/**
 * Decrypt a ciphertext string.
 * Returns the original plaintext.
 */
export async function decrypt(ciphertext, iv, key) {
  const encryptedData = base64ToArrayBuffer(ciphertext);
  const ivData = base64ToArrayBuffer(iv);

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: new Uint8Array(ivData) },
    key,
    encryptedData
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/**
 * Get or create the encryption key.
 * On first call, generates a new key and stores it.
 * On subsequent calls, loads the stored key.
 */
export async function getOrCreateKey() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);

  if (stored[STORAGE_KEY]) {
    return importKey(stored[STORAGE_KEY]);
  }

  const key = await generateEncryptionKey();
  const jwk = await exportKey(key);
  await chrome.storage.local.set({ [STORAGE_KEY]: jwk });
  return key;
}

/**
 * Convenience: encrypt a string using the stored key.
 */
export async function encryptString(plaintext) {
  if (!plaintext) return { ciphertext: '', iv: '' };
  const key = await getOrCreateKey();
  return encrypt(plaintext, key);
}

/**
 * Convenience: decrypt a string using the stored key.
 */
export async function decryptString(ciphertext, iv) {
  if (!ciphertext || !iv) return '';
  try {
    const key = await getOrCreateKey();
    return await decrypt(ciphertext, iv, key);
  } catch {
    return '';
  }
}

// --- Helpers ---

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
