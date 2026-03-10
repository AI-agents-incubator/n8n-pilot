/**
 * Tests for crypto.js
 * Tests AES-256-GCM encryption functionality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateEncryptionKey,
  exportKey,
  importKey,
  encrypt,
  decrypt,
  getOrCreateKey,
  encryptString,
  decryptString,
} from '../../lib/crypto.js';

describe('crypto', () => {
  beforeEach(async () => {
    // Clear any stored key before each test
    await chrome.storage.local.clear();
  });

  describe('generateEncryptionKey', () => {
    it('generates a valid AES-256-GCM key', async () => {
      const key = await generateEncryptionKey();
      expect(key).toBeDefined();
      expect(key.type).toBe('secret');
      expect(key.algorithm.name).toBe('AES-GCM');
      expect(key.algorithm.length).toBe(256);
    });

    it('generates different keys on each call', async () => {
      const key1 = await generateEncryptionKey();
      const key2 = await generateEncryptionKey();

      const jwk1 = await exportKey(key1);
      const jwk2 = await exportKey(key2);

      expect(jwk1.k).not.toBe(jwk2.k);
    });
  });

  describe('exportKey', () => {
    it('exports key to JWK format', async () => {
      const key = await generateEncryptionKey();
      const jwk = await exportKey(key);

      expect(jwk).toBeDefined();
      expect(jwk.kty).toBe('oct');
      expect(jwk.k).toBeDefined();
      expect(typeof jwk.k).toBe('string');
    });
  });

  describe('importKey', () => {
    it('imports a JWK back to CryptoKey', async () => {
      const key = await generateEncryptionKey();
      const jwk = await exportKey(key);
      const importedKey = await importKey(jwk);

      expect(importedKey).toBeDefined();
      expect(importedKey.type).toBe('secret');
      expect(importedKey.algorithm.name).toBe('AES-GCM');
    });
  });

  describe('encrypt and decrypt round-trip', () => {
    it('encrypts and decrypts a plaintext string', async () => {
      const key = await generateEncryptionKey();
      const plaintext = 'Hello, World!';

      const encrypted = await encrypt(plaintext, key);
      expect(encrypted.ciphertext).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(typeof encrypted.ciphertext).toBe('string');
      expect(typeof encrypted.iv).toBe('string');

      const decrypted = await decrypt(encrypted.ciphertext, encrypted.iv, key);
      expect(decrypted).toBe(plaintext);
    });

    it('encrypts and decrypts JSON data', async () => {
      const key = await generateEncryptionKey();
      const data = JSON.stringify({ apiKey: 'sk-test-123', secret: true });

      const encrypted = await encrypt(data, key);
      const decrypted = await decrypt(encrypted.ciphertext, encrypted.iv, key);
      const parsed = JSON.parse(decrypted);

      expect(parsed.apiKey).toBe('sk-test-123');
      expect(parsed.secret).toBe(true);
    });

    it('encrypts and decrypts empty string', async () => {
      const key = await generateEncryptionKey();
      const plaintext = '';

      const encrypted = await encrypt(plaintext, key);
      const decrypted = await decrypt(encrypted.ciphertext, encrypted.iv, key);

      expect(decrypted).toBe('');
    });

    it('encrypts and decrypts long text', async () => {
      const key = await generateEncryptionKey();
      const plaintext = 'a'.repeat(10000);

      const encrypted = await encrypt(plaintext, key);
      const decrypted = await decrypt(encrypted.ciphertext, encrypted.iv, key);

      expect(decrypted).toBe(plaintext);
    });

    it('encrypts and decrypts special characters', async () => {
      const key = await generateEncryptionKey();
      const plaintext = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/~`';

      const encrypted = await encrypt(plaintext, key);
      const decrypted = await decrypt(encrypted.ciphertext, encrypted.iv, key);

      expect(decrypted).toBe(plaintext);
    });

    it('encrypts and decrypts unicode characters', async () => {
      const key = await generateEncryptionKey();
      const plaintext = 'Hello 世界 مرحبا мир';

      const encrypted = await encrypt(plaintext, key);
      const decrypted = await decrypt(encrypted.ciphertext, encrypted.iv, key);

      expect(decrypted).toBe(plaintext);
    });
  });

  describe('different IVs for same input', () => {
    it('generates different ciphertexts for same plaintext due to random IV', async () => {
      const key = await generateEncryptionKey();
      const plaintext = 'Same plaintext';

      const encrypted1 = await encrypt(plaintext, key);
      const encrypted2 = await encrypt(plaintext, key);

      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
    });

    it('decrypts both ciphertexts to the same plaintext', async () => {
      const key = await generateEncryptionKey();
      const plaintext = 'Test message';

      const encrypted1 = await encrypt(plaintext, key);
      const encrypted2 = await encrypt(plaintext, key);

      const decrypted1 = await decrypt(encrypted1.ciphertext, encrypted1.iv, key);
      const decrypted2 = await decrypt(encrypted2.ciphertext, encrypted2.iv, key);

      expect(decrypted1).toBe(plaintext);
      expect(decrypted2).toBe(plaintext);
    });
  });

  describe('decrypt with wrong key fails', () => {
    it('throws when decrypting with different key', async () => {
      const key1 = await generateEncryptionKey();
      const key2 = await generateEncryptionKey();
      const plaintext = 'Secret message';

      const encrypted = await encrypt(plaintext, key1);

      await expect(
        decrypt(encrypted.ciphertext, encrypted.iv, key2)
      ).rejects.toThrow();
    });

    it('throws when using corrupted ciphertext', async () => {
      const key = await generateEncryptionKey();
      const plaintext = 'Test';

      const encrypted = await encrypt(plaintext, key);
      const corruptedCiphertext = encrypted.ciphertext.slice(0, -5) + 'xxxxx';

      await expect(
        decrypt(corruptedCiphertext, encrypted.iv, key)
      ).rejects.toThrow();
    });

    it('throws when using wrong IV', async () => {
      const key = await generateEncryptionKey();
      const plaintext = 'Test';

      const encrypted = await encrypt(plaintext, key);
      const wrongEncrypted = await encrypt('dummy', key);

      await expect(
        decrypt(encrypted.ciphertext, wrongEncrypted.iv, key)
      ).rejects.toThrow();
    });
  });

  describe('getOrCreateKey', () => {
    it('generates and stores key on first call', async () => {
      const key = await getOrCreateKey();

      expect(key).toBeDefined();
      expect(key.type).toBe('secret');

      const stored = await chrome.storage.local.get('__n8nPilotEncryptionKey');
      expect(stored['__n8nPilotEncryptionKey']).toBeDefined();
    });

    it('retrieves the same key on subsequent calls', async () => {
      const key1 = await getOrCreateKey();
      const jwk1 = await exportKey(key1);

      const key2 = await getOrCreateKey();
      const jwk2 = await exportKey(key2);

      expect(jwk1.k).toBe(jwk2.k);
    });

    it('persists key across separate calls', async () => {
      const key1 = await getOrCreateKey();
      const jwk1 = await exportKey(key1);

      // Simulate a new instance loading the same key
      const stored = await chrome.storage.local.get('__n8nPilotEncryptionKey');
      const loadedKey = await importKey(stored['__n8nPilotEncryptionKey']);
      const jwk2 = await exportKey(loadedKey);

      expect(jwk1.k).toBe(jwk2.k);
    });
  });

  describe('encryptString', () => {
    it('encrypts a plaintext string using stored key', async () => {
      const plaintext = 'API Key: sk-12345';
      const result = await encryptString(plaintext);

      expect(result.ciphertext).toBeDefined();
      expect(result.iv).toBeDefined();
      expect(result.ciphertext).not.toBe('');
      expect(result.iv).not.toBe('');
    });

    it('returns empty ciphertext and iv for empty string', async () => {
      const result = await encryptString('');

      expect(result.ciphertext).toBe('');
      expect(result.iv).toBe('');
    });

    it('returns empty ciphertext and iv for null', async () => {
      const result = await encryptString(null);

      expect(result.ciphertext).toBe('');
      expect(result.iv).toBe('');
    });

    it('returns empty ciphertext and iv for undefined', async () => {
      const result = await encryptString(undefined);

      expect(result.ciphertext).toBe('');
      expect(result.iv).toBe('');
    });

    it('generates different ciphertexts for same input', async () => {
      const plaintext = 'Test';

      const result1 = await encryptString(plaintext);
      const result2 = await encryptString(plaintext);

      expect(result1.ciphertext).not.toBe(result2.ciphertext);
      expect(result1.iv).not.toBe(result2.iv);
    });
  });

  describe('decryptString', () => {
    it('decrypts a previously encrypted string', async () => {
      const plaintext = 'Secret API Key';
      const encrypted = await encryptString(plaintext);
      const decrypted = await decryptString(encrypted.ciphertext, encrypted.iv);

      expect(decrypted).toBe(plaintext);
    });

    it('returns empty string if ciphertext is empty', async () => {
      const result = await decryptString('', 'someiv');

      expect(result).toBe('');
    });

    it('returns empty string if iv is empty', async () => {
      const result = await decryptString('someciphertext', '');

      expect(result).toBe('');
    });

    it('returns empty string if both are empty', async () => {
      const result = await decryptString('', '');

      expect(result).toBe('');
    });

    it('catches decryption errors gracefully', async () => {
      const result = await decryptString('invalididciphertext', 'invalidiv');

      // Should not throw, but return empty string
      expect(result).toBe('');
    });
  });

  describe('encryptString and decryptString integration', () => {
    it('round-trip encrypt and decrypt with stored key', async () => {
      const plaintext = 'My secure API key: sk-abc123def456';

      const encrypted = await encryptString(plaintext);
      const decrypted = await decryptString(encrypted.ciphertext, encrypted.iv);

      expect(decrypted).toBe(plaintext);
    });

    it('handles multiple encrypt/decrypt cycles', async () => {
      const texts = ['key1', 'key2', 'key3'];
      const pairs = [];

      for (const text of texts) {
        const encrypted = await encryptString(text);
        pairs.push({ text, ...encrypted });
      }

      for (const pair of pairs) {
        const decrypted = await decryptString(pair.ciphertext, pair.iv);
        expect(decrypted).toBe(pair.text);
      }
    });
  });
});
