/**
 * n8n Pilot — Settings Module
 * Manages all extension settings with encrypted API key storage.
 */

import { encryptString, decryptString } from './crypto.js';

const SETTINGS_KEY = 'n8nPilotSettings';

const DEFAULTS = {
  // n8n instance
  n8nBaseUrl: '',
  n8nApiKeyCipher: '',
  n8nApiKeyIv: '',

  // Claude API
  claudeApiKeyCipher: '',
  claudeApiKeyIv: '',
  claudeModel: 'claude-sonnet-4-5-20250929',
  claudeMaxTokens: 4096,
  claudeTemperature: 0.3,

  // UI preferences
  theme: 'dark',
  language: 'en',

  // Feature settings
  autoInject: true,
  saveHistory: true,
  notifications: true,
  historyLimit: 50,
  versionLimit: 30,

  // Template server
  templateServerUrl: 'http://localhost:8000',
};

/**
 * Get all settings, merged with defaults.
 */
export async function getAll() {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  const stored = result[SETTINGS_KEY] || {};
  return { ...DEFAULTS, ...stored };
}

/**
 * Get a single setting value.
 */
export async function get(key) {
  const all = await getAll();
  return all[key];
}

/**
 * Set one or more settings.
 */
export async function set(updates) {
  const current = await getAll();
  const merged = { ...current, ...updates };
  await chrome.storage.local.set({ [SETTINGS_KEY]: merged });
  return merged;
}

/**
 * Reset all settings to defaults.
 */
export async function reset() {
  await chrome.storage.local.set({ [SETTINGS_KEY]: { ...DEFAULTS } });
  return { ...DEFAULTS };
}

/**
 * Store an API key (encrypted).
 * @param {'claude' | 'n8n'} provider
 * @param {string} apiKey - plaintext key
 */
export async function setApiKey(provider, apiKey) {
  if (!apiKey) {
    // Clear the key
    const cipherField = `${provider}ApiKeyCipher`;
    const ivField = `${provider}ApiKeyIv`;
    await set({ [cipherField]: '', [ivField]: '' });
    return;
  }

  const { ciphertext, iv } = await encryptString(apiKey);
  const cipherField = `${provider}ApiKeyCipher`;
  const ivField = `${provider}ApiKeyIv`;
  await set({ [cipherField]: ciphertext, [ivField]: iv });
}

/**
 * Retrieve a decrypted API key.
 * @param {'claude' | 'n8n'} provider
 * @returns {Promise<string>} plaintext key or empty string
 */
export async function getApiKey(provider) {
  const settings = await getAll();
  const cipherField = `${provider}ApiKeyCipher`;
  const ivField = `${provider}ApiKeyIv`;
  const ciphertext = settings[cipherField];
  const iv = settings[ivField];

  if (!ciphertext || !iv) return '';

  try {
    return await decryptString(ciphertext, iv);
  } catch (err) {
    console.error(`Failed to decrypt ${provider} API key:`, err.message);
    return '';
  }
}

/**
 * Check if a provider API key is configured.
 */
export async function hasApiKey(provider) {
  const settings = await getAll();
  const cipherField = `${provider}ApiKeyCipher`;
  return !!settings[cipherField];
}

/**
 * Export settings (without encrypted keys) for backup.
 */
export async function exportSettings() {
  const settings = await getAll();
  // Strip encrypted fields
  const { claudeApiKeyCipher, claudeApiKeyIv, n8nApiKeyCipher, n8nApiKeyIv, ...safe } = settings;
  return safe;
}

/**
 * Import settings from backup (does not import API keys).
 */
export async function importSettings(data) {
  // Prevent importing encrypted fields from external source
  const { claudeApiKeyCipher, claudeApiKeyIv, n8nApiKeyCipher, n8nApiKeyIv, ...safe } = data;
  await set(safe);
}
