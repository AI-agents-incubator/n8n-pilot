/**
 * Tests for settings.js
 * Tests settings management with encrypted API key storage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getAll,
  get,
  set,
  reset,
  setApiKey,
  getApiKey,
  hasApiKey,
  exportSettings,
  importSettings,
} from '../../lib/settings.js';

describe('settings', () => {
  beforeEach(async () => {
    await chrome.storage.local.clear();
  });

  describe('getAll', () => {
    it('returns default settings on first call', async () => {
      const all = await getAll();

      expect(all.n8nBaseUrl).toBe('');
      expect(all.claudeModel).toBe('claude-sonnet-4-5-20250929');
      expect(all.claudeMaxTokens).toBe(4096);
      expect(all.claudeTemperature).toBe(0.3);
      expect(all.theme).toBe('dark');
      expect(all.language).toBe('en');
      expect(all.autoInject).toBe(true);
      expect(all.saveHistory).toBe(true);
      expect(all.notifications).toBe(true);
      expect(all.historyLimit).toBe(50);
      expect(all.versionLimit).toBe(30);
    });

    it('returns defaults merged with stored values', async () => {
      await set({ n8nBaseUrl: 'https://n8n.example.com' });

      const all = await getAll();
      expect(all.n8nBaseUrl).toBe('https://n8n.example.com');
      expect(all.theme).toBe('dark'); // default
    });

    it('includes encrypted key fields', async () => {
      const all = await getAll();

      expect(all).toHaveProperty('n8nApiKeyCipher');
      expect(all).toHaveProperty('n8nApiKeyIv');
      expect(all).toHaveProperty('claudeApiKeyCipher');
      expect(all).toHaveProperty('claudeApiKeyIv');
    });
  });

  describe('get', () => {
    it('returns a single setting value', async () => {
      const theme = await get('theme');
      expect(theme).toBe('dark');
    });

    it('returns updated value after set', async () => {
      await set({ language: 'fr' });
      const lang = await get('language');
      expect(lang).toBe('fr');
    });

    it('returns undefined for non-existent key', async () => {
      const val = await get('nonExistentKey');
      expect(val).toBeUndefined();
    });
  });

  describe('set', () => {
    it('persists a single setting', async () => {
      await set({ theme: 'light' });
      const theme = await get('theme');
      expect(theme).toBe('light');
    });

    it('persists multiple settings at once', async () => {
      await set({
        theme: 'light',
        language: 'es',
        autoInject: false,
      });

      const all = await getAll();
      expect(all.theme).toBe('light');
      expect(all.language).toBe('es');
      expect(all.autoInject).toBe(false);
    });

    it('merges with existing settings', async () => {
      await set({ theme: 'light' });
      await set({ language: 'de' });

      const all = await getAll();
      expect(all.theme).toBe('light');
      expect(all.language).toBe('de');
    });

    it('returns merged settings object', async () => {
      const result = await set({ theme: 'light' });

      expect(result).toHaveProperty('theme', 'light');
      expect(result).toHaveProperty('language', 'en'); // default
    });
  });

  describe('reset', () => {
    it('restores all settings to defaults', async () => {
      await set({
        theme: 'light',
        language: 'ja',
        historyLimit: 100,
      });

      await reset();

      const all = await getAll();
      expect(all.theme).toBe('dark');
      expect(all.language).toBe('en');
      expect(all.historyLimit).toBe(50);
    });

    it('clears encrypted API key fields', async () => {
      await setApiKey('claude', 'sk-test-key');
      await reset();

      const all = await getAll();
      expect(all.claudeApiKeyCipher).toBe('');
      expect(all.claudeApiKeyIv).toBe('');
    });

    it('returns default settings', async () => {
      const result = await reset();

      expect(result.theme).toBe('dark');
      expect(result.language).toBe('en');
      expect(result.autoInject).toBe(true);
    });
  });

  describe('setApiKey and getApiKey', () => {
    it('encrypts and stores Claude API key', async () => {
      const apiKey = 'sk-proj-abc123def456ghi789jkl';
      await setApiKey('claude', apiKey);

      const retrieved = await getApiKey('claude');
      expect(retrieved).toBe(apiKey);
    });

    it('encrypts and stores n8n API key', async () => {
      const apiKey = 'n8n-key-xyz789abc123def456';
      await setApiKey('n8n', apiKey);

      const retrieved = await getApiKey('n8n');
      expect(retrieved).toBe(apiKey);
    });

    it('stores encrypted ciphertext and IV separately', async () => {
      await setApiKey('claude', 'test-key');

      const all = await getAll();
      expect(all.claudeApiKeyCipher).toBeDefined();
      expect(all.claudeApiKeyCipher).not.toBe('');
      expect(all.claudeApiKeyIv).toBeDefined();
      expect(all.claudeApiKeyIv).not.toBe('');
    });

    it('does not store plaintext key', async () => {
      const plaintext = 'super-secret-key-12345';
      await setApiKey('claude', plaintext);

      const all = await getAll();
      expect(all.claudeApiKeyCipher).not.toBe(plaintext);
      expect(all.claudeApiKeyIv).not.toBe(plaintext);
    });

    it('clears API key when given empty string', async () => {
      await setApiKey('claude', 'initial-key');
      await setApiKey('claude', '');

      const retrieved = await getApiKey('claude');
      expect(retrieved).toBe('');

      const all = await getAll();
      expect(all.claudeApiKeyCipher).toBe('');
      expect(all.claudeApiKeyIv).toBe('');
    });

    it('clears API key when given null', async () => {
      await setApiKey('n8n', 'some-key');
      await setApiKey('n8n', null);

      const retrieved = await getApiKey('n8n');
      expect(retrieved).toBe('');
    });

    it('supports special characters in API key', async () => {
      const apiKey = 'key!@#$%^&*()_+-=[]{}|;:\'",.<>?/~`';
      await setApiKey('claude', apiKey);

      const retrieved = await getApiKey('claude');
      expect(retrieved).toBe(apiKey);
    });

    it('supports long API keys', async () => {
      const apiKey = 'sk-' + 'a'.repeat(1000);
      await setApiKey('claude', apiKey);

      const retrieved = await getApiKey('claude');
      expect(retrieved).toBe(apiKey);
    });

    it('returns empty string for missing API key', async () => {
      const retrieved = await getApiKey('claude');
      expect(retrieved).toBe('');
    });
  });

  describe('hasApiKey', () => {
    it('returns true when API key is set', async () => {
      await setApiKey('claude', 'test-key-123');
      const has = await hasApiKey('claude');
      expect(has).toBe(true);
    });

    it('returns false when API key is not set', async () => {
      const has = await hasApiKey('claude');
      expect(has).toBe(false);
    });

    it('returns false after API key is cleared', async () => {
      await setApiKey('claude', 'test-key');
      await setApiKey('claude', '');

      const has = await hasApiKey('claude');
      expect(has).toBe(false);
    });

    it('distinguishes between different providers', async () => {
      await setApiKey('claude', 'claude-key');

      expect(await hasApiKey('claude')).toBe(true);
      expect(await hasApiKey('n8n')).toBe(false);
    });
  });

  describe('exportSettings', () => {
    it('returns settings without encrypted key fields', async () => {
      await set({ theme: 'light' });
      await setApiKey('claude', 'secret-key');

      const exported = await exportSettings();

      expect(exported).toHaveProperty('theme', 'light');
      expect(exported).not.toHaveProperty('claudeApiKeyCipher');
      expect(exported).not.toHaveProperty('claudeApiKeyIv');
      expect(exported).not.toHaveProperty('n8nApiKeyCipher');
      expect(exported).not.toHaveProperty('n8nApiKeyIv');
    });

    it('includes all non-encrypted settings', async () => {
      const exported = await exportSettings();

      expect(exported).toHaveProperty('n8nBaseUrl');
      expect(exported).toHaveProperty('claudeModel');
      expect(exported).toHaveProperty('claudeMaxTokens');
      expect(exported).toHaveProperty('claudeTemperature');
      expect(exported).toHaveProperty('theme');
      expect(exported).toHaveProperty('language');
      expect(exported).toHaveProperty('autoInject');
      expect(exported).toHaveProperty('notifications');
      expect(exported).toHaveProperty('historyLimit');
      expect(exported).toHaveProperty('versionLimit');
    });

    it('returns clean backup suitable for sharing', async () => {
      await set({
        n8nBaseUrl: 'https://n8n.example.com',
        claudeModel: 'claude-opus-4',
        theme: 'dark',
      });
      await setApiKey('claude', 'super-secret-key');

      const exported = await exportSettings();

      // Check that no encrypted data is present
      const exported_json = JSON.stringify(exported);
      expect(exported_json).not.toContain('secret');
      expect(exported_json).not.toContain('key');
      // But normal settings are there
      expect(exported.n8nBaseUrl).toBe('https://n8n.example.com');
    });
  });

  describe('importSettings', () => {
    it('imports safe settings from backup', async () => {
      const backup = {
        theme: 'light',
        language: 'es',
        historyLimit: 100,
      };

      await importSettings(backup);

      const all = await getAll();
      expect(all.theme).toBe('light');
      expect(all.language).toBe('es');
      expect(all.historyLimit).toBe(100);
    });

    it('ignores encrypted fields in imported data', async () => {
      const backup = {
        theme: 'light',
        claudeApiKeyCipher: 'malicious-cipher-data',
        claudeApiKeyIv: 'malicious-iv-data',
        n8nApiKeyCipher: 'more-malicious-data',
      };

      await importSettings(backup);

      const all = await getAll();
      expect(all.theme).toBe('light');
      expect(all.claudeApiKeyCipher).toBe('');
      expect(all.claudeApiKeyIv).toBe('');
      expect(all.n8nApiKeyCipher).toBe('');
    });

    it('preserves existing keys when importing', async () => {
      await setApiKey('claude', 'original-key');

      const backup = {
        theme: 'light',
        claudeApiKeyCipher: 'malicious-data',
      };

      await importSettings(backup);

      // Original key should be preserved (import ignores encrypted fields)
      const retrieved = await getApiKey('claude');
      expect(retrieved).toBe('original-key');
    });

    it('can round-trip settings through export and import', async () => {
      const original = {
        theme: 'light',
        language: 'de',
        autoInject: false,
        historyLimit: 75,
        versionLimit: 20,
      };

      await set(original);
      const exported = await exportSettings();

      // Reset to defaults
      await reset();

      // Import the exported settings
      await importSettings(exported);

      const final = await getAll();
      expect(final.theme).toBe(original.theme);
      expect(final.language).toBe(original.language);
      expect(final.autoInject).toBe(original.autoInject);
      expect(final.historyLimit).toBe(original.historyLimit);
    });

    it('merges imported settings with existing ones', async () => {
      await set({ theme: 'dark' });

      const backup = {
        language: 'fr',
        historyLimit: 100,
      };

      await importSettings(backup);

      const all = await getAll();
      expect(all.theme).toBe('dark'); // preserved
      expect(all.language).toBe('fr'); // updated
      expect(all.historyLimit).toBe(100); // updated
    });
  });

  describe('settings isolation', () => {
    it('keeps API keys separate for different providers', async () => {
      await setApiKey('claude', 'claude-secret');
      await setApiKey('n8n', 'n8n-secret');

      const claudeKey = await getApiKey('claude');
      const n8nKey = await getApiKey('n8n');

      expect(claudeKey).toBe('claude-secret');
      expect(n8nKey).toBe('n8n-secret');
    });

    it('updating one provider key does not affect the other', async () => {
      await setApiKey('claude', 'claude-key');
      await setApiKey('n8n', 'n8n-key');

      await setApiKey('claude', 'claude-key-updated');

      expect(await getApiKey('claude')).toBe('claude-key-updated');
      expect(await getApiKey('n8n')).toBe('n8n-key');
    });
  });
});
