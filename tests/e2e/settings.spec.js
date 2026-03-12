/**
 * E2E tests — Settings view (save, load, connection tests)
 */

import {
  test,
  expect,
  configureExtension,
  setApiKey,
  shadowClick,
  shadowType,
  shadowText,
  shadowVisible,
} from './extension-fixture.js';

test.describe('Settings View', () => {
  test('settings drawer opens and closes', async ({ n8nPage }) => {
    // Settings view should be hidden initially
    let isVisible = await shadowVisible(n8nPage, '#settingsView');
    expect(isVisible).toBe(false);

    // Click settings button
    await shadowClick(n8nPage, '[data-view="settingsView"]');
    await n8nPage.waitForTimeout(300);

    isVisible = await n8nPage.evaluate(() => {
      const host = document.querySelector('#n8n-pilot-host');
      const el = host?.shadowRoot?.getElementById('settingsView');
      return el ? !el.classList.contains('hidden') : false;
    });
    expect(isVisible).toBe(true);

    // Close via X button
    await shadowClick(n8nPage, '[data-close="settingsView"]');
    await n8nPage.waitForTimeout(300);

    isVisible = await n8nPage.evaluate(() => {
      const host = document.querySelector('#n8n-pilot-host');
      const el = host?.shadowRoot?.getElementById('settingsView');
      return el ? !el.classList.contains('hidden') : false;
    });
    expect(isVisible).toBe(false);
  });

  test('settings form has required fields', async ({ n8nPage }) => {
    await shadowClick(n8nPage, '[data-view="settingsView"]');
    await n8nPage.waitForTimeout(300);

    const fieldIds = await n8nPage.evaluate(() => {
      const host = document.querySelector('#n8n-pilot-host');
      const sr = host?.shadowRoot;
      if (!sr) return [];
      return [
        'settingsN8nUrl',
        'settingsN8nApiKey',
        'settingsClaudeApiKey',
        'settingsClaudeModel',
        'settingsAutoInject',
        'settingsSaveHistory',
        'settingsNotifications',
      ].filter(id => !!sr.getElementById(id));
    });

    expect(fieldIds).toHaveLength(7);
  });

  test('settings save button triggers save', async ({ n8nPage }) => {
    await shadowClick(n8nPage, '[data-view="settingsView"]');
    await n8nPage.waitForTimeout(500);

    await shadowType(n8nPage, '#settingsN8nUrl', 'http://localhost:5678');
    await shadowClick(n8nPage, '#btnSaveSettings');
    await n8nPage.waitForTimeout(1000);

    const resultText = await shadowText(n8nPage, '#n8nTestResult');
    expect(resultText).toContain('Settings saved');
  });

  test('n8n connection test against mock server', async ({ n8nPage, serviceWorker }) => {
    await configureExtension(serviceWorker, { n8nBaseUrl: 'http://localhost:5678' });
    await setApiKey(serviceWorker, 'n8n', 'test-api-key');

    await shadowClick(n8nPage, '[data-view="settingsView"]');
    await n8nPage.waitForTimeout(500);

    await shadowType(n8nPage, '#settingsN8nUrl', 'http://localhost:5678');
    await shadowType(n8nPage, '#settingsN8nApiKey', 'test-api-key');

    await shadowClick(n8nPage, '#btnTestN8n');
    await n8nPage.waitForTimeout(2000);

    const resultText = await shadowText(n8nPage, '#n8nTestResult');
    expect(resultText).toBeTruthy();
  });

  test('claude model selector has correct options', async ({ n8nPage }) => {
    await shadowClick(n8nPage, '[data-view="settingsView"]');
    await n8nPage.waitForTimeout(300);

    const options = await n8nPage.evaluate(() => {
      const host = document.querySelector('#n8n-pilot-host');
      const select = host?.shadowRoot?.getElementById('settingsClaudeModel');
      if (!select) return [];
      return Array.from(select.options).map(o => o.value);
    });

    expect(options).toContain('claude-sonnet-4-5-20250929');
    expect(options).toContain('claude-haiku-4-5-20251001');
    expect(options).toContain('claude-opus-4-6');
  });

  test('reset button requires double-click confirmation', async ({ n8nPage }) => {
    await shadowClick(n8nPage, '[data-view="settingsView"]');
    await n8nPage.waitForTimeout(300);

    await shadowClick(n8nPage, '#btnResetSettings');
    await n8nPage.waitForTimeout(100);

    const confirmText = await shadowText(n8nPage, '#btnResetSettings');
    expect(confirmText).toContain('Click again to confirm');
  });

  test('drawer toggle — clicking another view closes current', async ({ n8nPage }) => {
    await shadowClick(n8nPage, '[data-view="settingsView"]');
    await n8nPage.waitForTimeout(300);

    let settingsOpen = await n8nPage.evaluate(() => {
      const host = document.querySelector('#n8n-pilot-host');
      return !host?.shadowRoot?.getElementById('settingsView')?.classList.contains('hidden');
    });
    expect(settingsOpen).toBe(true);

    await shadowClick(n8nPage, '[data-view="workflowsView"]');
    await n8nPage.waitForTimeout(300);

    settingsOpen = await n8nPage.evaluate(() => {
      const host = document.querySelector('#n8n-pilot-host');
      return !host?.shadowRoot?.getElementById('settingsView')?.classList.contains('hidden');
    });
    expect(settingsOpen).toBe(false);

    const workflowsOpen = await n8nPage.evaluate(() => {
      const host = document.querySelector('#n8n-pilot-host');
      return !host?.shadowRoot?.getElementById('workflowsView')?.classList.contains('hidden');
    });
    expect(workflowsOpen).toBe(true);
  });
});
