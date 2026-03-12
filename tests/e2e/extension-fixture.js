/**
 * Playwright fixture for Chrome extension E2E tests.
 * Creates a temporary extension copy with localhost permissions
 * granted by default (moved from optional to required).
 */

import { test as base, chromium, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../..');

/**
 * Create a temporary copy of the extension with localhost
 * in host_permissions (not optional) for testing.
 */
function createTestExtension() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-pilot-e2e-'));

  // Files and dirs to copy (exclude node_modules, .git, tests)
  const entries = fs.readdirSync(EXTENSION_PATH);
  for (const entry of entries) {
    if (['node_modules', '.git', 'tests', '.claude', 'dialog', 'reports', '.env'].includes(entry)) continue;

    const src = path.join(EXTENSION_PATH, entry);
    const dest = path.join(tmpDir, entry);
    const stat = fs.statSync(src);

    if (stat.isDirectory()) {
      fs.cpSync(src, dest, { recursive: true });
    } else {
      fs.copyFileSync(src, dest);
    }
  }

  // Modify manifest: move localhost permissions from optional to required
  const manifestPath = path.join(tmpDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  // Add localhost to host_permissions
  if (!manifest.host_permissions) manifest.host_permissions = [];
  if (!manifest.host_permissions.includes('http://localhost:*/*')) {
    manifest.host_permissions.push('http://localhost:*/*');
  }
  if (!manifest.host_permissions.includes('http://127.0.0.1:*/*')) {
    manifest.host_permissions.push('http://127.0.0.1:*/*');
  }

  // Remove localhost from optional_host_permissions
  if (manifest.optional_host_permissions) {
    manifest.optional_host_permissions = manifest.optional_host_permissions.filter(
      p => !p.includes('localhost') && !p.includes('127.0.0.1')
    );
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  return tmpDir;
}

// Shared temp extension path (created once per test suite)
let _testExtPath = null;

function getTestExtensionPath() {
  if (!_testExtPath) {
    _testExtPath = createTestExtension();
  }
  return _testExtPath;
}

export const test = base.extend({
  // Persistent browser context with extension
  context: async ({}, use) => {
    const extPath = getTestExtensionPath();
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${extPath}`,
        `--load-extension=${extPath}`,
        '--no-first-run',
        '--disable-default-apps',
        '--window-position=-32000,-32000',  // Off-screen: no focus stealing
        '--no-focus-on-navigate',
      ],
      viewport: { width: 1280, height: 800 },
    });

    await use(context);
    await context.close();
  },

  // Extension ID (derived from service worker URL)
  extensionId: async ({ context }, use) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 10_000 });
    }
    const extId = sw.url().split('/')[2];
    await use(extId);
  },

  // Service worker handle
  serviceWorker: async ({ context }, use) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 10_000 });
    }
    await use(sw);
  },

  // Page navigated to mock n8n with panel injected
  n8nPage: async ({ context, serviceWorker }, use) => {
    const page = await context.newPage();

    // Pre-configure settings — MERGE with existing to preserve API keys
    // set by beforeEach (which runs before this lazy fixture resolves)
    await serviceWorker.evaluate(async () => {
      const KEY = 'n8nPilotSettings';
      const existing = (await chrome.storage.local.get(KEY))[KEY] || {};
      await chrome.storage.local.set({
        [KEY]: {
          ...existing,
          n8nBaseUrl: 'http://localhost:5678',
          claudeModel: 'claude-sonnet-4-5-20250929',
          autoInject: true,
          saveHistory: true,
          notifications: true,
        },
      });
    });

    // Navigate to mock n8n — the extension's tabs.onUpdated listener
    // should auto-inject content.js because n8nBaseUrl matches
    await page.goto('http://localhost:5678/home/workflows', { waitUntil: 'load' });

    // Wait for panel host to appear (auto-injected by content.js)
    try {
      await page.waitForSelector('#n8n-pilot-host', { timeout: 5_000 });
    } catch {
      // If auto-inject didn't fire, manually inject via service worker
      await serviceWorker.evaluate(async () => {
        const tabs = await chrome.tabs.query({ url: 'http://localhost:5678/*' });
        for (const tab of tabs) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['content.js'],
            });
          } catch (e) {
            console.warn('Manual inject failed:', e.message);
          }
        }
      });

      await page.waitForSelector('#n8n-pilot-host', { timeout: 5_000 });
    }

    await use(page);
  },
});

export { expect };

/**
 * Helper: configure extension settings via chrome.storage
 * Uses the correct storage key 'n8nPilotSettings' matching lib/settings.js
 */
export async function configureExtension(serviceWorker, updates = {}) {
  const defaults = {
    n8nBaseUrl: 'http://localhost:5678',
    claudeModel: 'claude-sonnet-4-5-20250929',
    autoInject: true,
    saveHistory: true,
    notifications: true,
    ...updates,
  };

  await serviceWorker.evaluate(async (s) => {
    const SETTINGS_KEY = 'n8nPilotSettings';
    const existing = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] || {};
    await chrome.storage.local.set({ [SETTINGS_KEY]: { ...existing, ...s } });
  }, defaults);
}

/**
 * Helper: set API key in extension storage with AES-256-GCM encryption
 * Mirrors the exact logic from lib/crypto.js + lib/settings.js
 */
export async function setApiKey(serviceWorker, provider, apiKey) {
  await serviceWorker.evaluate(async ({ provider, apiKey }) => {
    const ENC_STORAGE_KEY = '__n8nPilotEncryptionKey';
    const SETTINGS_KEY = 'n8nPilotSettings';

    // Get or create encryption key (mirrors crypto.js getOrCreateKey)
    const stored = await chrome.storage.local.get(ENC_STORAGE_KEY);
    let key;

    if (stored[ENC_STORAGE_KEY]) {
      key = await crypto.subtle.importKey('jwk', stored[ENC_STORAGE_KEY],
        { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    } else {
      key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
      const jwk = await crypto.subtle.exportKey('jwk', key);
      await chrome.storage.local.set({ [ENC_STORAGE_KEY]: jwk });
    }

    // Encrypt the API key (mirrors crypto.js encrypt)
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new TextEncoder().encode(apiKey);
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);

    // Convert to base64 (mirrors crypto.js arrayBufferToBase64)
    const toBase64 = (buf) => {
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      return btoa(binary);
    };

    const ciphertext = toBase64(encrypted);
    const ivBase64 = toBase64(iv.buffer);

    // Store in n8nPilotSettings under the correct field names
    const result = await chrome.storage.local.get(SETTINGS_KEY);
    const settings = result[SETTINGS_KEY] || {};
    settings[`${provider}ApiKeyCipher`] = ciphertext;
    settings[`${provider}ApiKeyIv`] = ivBase64;
    await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  }, { provider, apiKey });
}

/**
 * Helper: inject content script and show panel
 */
export async function injectAndShowPanel(page, serviceWorker) {
  await serviceWorker.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: 'http://localhost:5678/*' });
    for (const tab of tabs) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js'],
        });
      } catch (e) {
        // May already be injected
      }
      await new Promise(r => setTimeout(r, 500));
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_PANEL' });
      } catch (e) {
        // Ignore
      }
    }
  });

  await page.waitForSelector('#n8n-pilot-host', { timeout: 5_000 });
}

/**
 * Helper: query text content inside Shadow DOM
 */
export async function shadowText(page, selector) {
  return page.evaluate((sel) => {
    const host = document.querySelector('#n8n-pilot-host');
    if (!host || !host.shadowRoot) return null;
    const el = host.shadowRoot.querySelector(sel);
    return el ? el.textContent : null;
  }, selector);
}

/**
 * Helper: click element inside Shadow DOM
 */
export async function shadowClick(page, selector) {
  await page.evaluate((sel) => {
    const host = document.querySelector('#n8n-pilot-host');
    if (!host || !host.shadowRoot) throw new Error('Shadow root not found');
    const el = host.shadowRoot.querySelector(sel);
    if (!el) throw new Error(`Element not found: ${sel}`);
    el.click();
  }, selector);
}

/**
 * Helper: type into an element inside Shadow DOM
 */
export async function shadowType(page, selector, text) {
  await page.evaluate(({ sel, text }) => {
    const host = document.querySelector('#n8n-pilot-host');
    if (!host || !host.shadowRoot) throw new Error('Shadow root not found');
    const el = host.shadowRoot.querySelector(sel);
    if (!el) throw new Error(`Element not found: ${sel}`);
    el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, { sel: selector, text });
}

/**
 * Helper: check if element exists and is visible in Shadow DOM
 */
export async function shadowVisible(page, selector) {
  return page.evaluate((sel) => {
    const host = document.querySelector('#n8n-pilot-host');
    if (!host || !host.shadowRoot) return false;
    const el = host.shadowRoot.querySelector(sel);
    if (!el) return false;
    return !el.classList.contains('hidden') && el.offsetParent !== null;
  }, selector);
}
