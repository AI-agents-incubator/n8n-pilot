/**
 * E2E tests — Panel lifecycle (inject, toggle, collapse, context badge)
 */

import {
  test,
  expect,
  shadowText,
  shadowClick,
  injectAndShowPanel,
} from './extension-fixture.js';

test.describe('Panel Lifecycle', () => {
  test('panel injects into page with Shadow DOM', async ({ n8nPage }) => {
    const hostExists = await n8nPage.evaluate(() => {
      return !!document.querySelector('#n8n-pilot-host');
    });
    expect(hostExists).toBe(true);

    const hasShadowRoot = await n8nPage.evaluate(() => {
      const host = document.querySelector('#n8n-pilot-host');
      return !!host?.shadowRoot;
    });
    expect(hasShadowRoot).toBe(true);
  });

  test('panel has correct structure', async ({ n8nPage }) => {
    const hasContainer = await n8nPage.evaluate(() => {
      const host = document.querySelector('#n8n-pilot-host');
      return !!host?.shadowRoot?.getElementById('panelContainer');
    });
    expect(hasContainer).toBe(true);

    const title = await shadowText(n8nPage, '.panel-title');
    expect(title).toBe('n8n Pilot');

    const hasChatInput = await n8nPage.evaluate(() => {
      const host = document.querySelector('#n8n-pilot-host');
      return !!host?.shadowRoot?.getElementById('chatInput');
    });
    expect(hasChatInput).toBe(true);
  });

  test('panel has header action buttons', async ({ n8nPage }) => {
    const buttons = await n8nPage.evaluate(() => {
      const host = document.querySelector('#n8n-pilot-host');
      const btns = host?.shadowRoot?.querySelectorAll('.header-btn[data-view]');
      return btns ? Array.from(btns).map(b => b.getAttribute('data-view')) : [];
    });

    expect(buttons).toContain('workflowsView');
    expect(buttons).toContain('executionsView');
    expect(buttons).toContain('historyView');
    expect(buttons).toContain('settingsView');
  });

  test('panel collapse toggles width', async ({ n8nPage }) => {
    const initialWidth = await n8nPage.evaluate(() => {
      return document.querySelector('#n8n-pilot-host')?.style.width;
    });
    expect(initialWidth).toBe('380px');

    await shadowClick(n8nPage, '#btnCollapsePanel');
    await n8nPage.waitForTimeout(300);

    const collapsedWidth = await n8nPage.evaluate(() => {
      return document.querySelector('#n8n-pilot-host')?.style.width;
    });
    expect(collapsedWidth).toBe('48px');

    await shadowClick(n8nPage, '#btnCollapsePanel');
    await n8nPage.waitForTimeout(300);

    const expandedWidth = await n8nPage.evaluate(() => {
      return document.querySelector('#n8n-pilot-host')?.style.width;
    });
    expect(expandedWidth).toBe('380px');
  });

  test('panel toggle show/hide', async ({ n8nPage, serviceWorker }) => {
    let display = await n8nPage.evaluate(() => {
      return document.querySelector('#n8n-pilot-host')?.style.display;
    });
    expect(display).not.toBe('none');

    await serviceWorker.evaluate(async () => {
      const tabs = await chrome.tabs.query({ url: 'http://localhost:5678/*' });
      if (tabs[0]) await chrome.tabs.sendMessage(tabs[0].id, { type: 'HIDE_PANEL' });
    });
    await n8nPage.waitForTimeout(300);

    display = await n8nPage.evaluate(() => {
      return document.querySelector('#n8n-pilot-host')?.style.display;
    });
    expect(display).toBe('none');

    await serviceWorker.evaluate(async () => {
      const tabs = await chrome.tabs.query({ url: 'http://localhost:5678/*' });
      if (tabs[0]) await chrome.tabs.sendMessage(tabs[0].id, { type: 'SHOW_PANEL' });
    });
    await n8nPage.waitForTimeout(300);

    display = await n8nPage.evaluate(() => {
      return document.querySelector('#n8n-pilot-host')?.style.display;
    });
    expect(display).toBe('block');
  });

  test('context badge shows "No workflow" on home page', async ({ n8nPage }) => {
    const contextText = await shadowText(n8nPage, '#contextName');
    expect(contextText).toBe('No workflow');
  });

  test('context badge updates on workflow page', async ({ context, serviceWorker }) => {
    const page = await context.newPage();

    await serviceWorker.evaluate(async () => {
      await chrome.storage.local.set({
        settings: { n8nBaseUrl: 'http://localhost:5678' },
      });
    });

    await page.goto('http://localhost:5678/workflow/wf-001', { waitUntil: 'load' });
    await injectAndShowPanel(page, serviceWorker);

    const contextText = await shadowText(page, '#contextName');
    expect(contextText).toContain('Test Workflow');
  });

  test('CSS isolation via Shadow DOM', async ({ n8nPage }) => {
    const mainBg = await n8nPage.evaluate(() => {
      return getComputedStyle(document.body).backgroundColor;
    });
    expect(mainBg).toBeTruthy();

    const panelBg = await n8nPage.evaluate(() => {
      const host = document.querySelector('#n8n-pilot-host');
      const container = host?.shadowRoot?.getElementById('panelContainer');
      return container ? getComputedStyle(container).backgroundColor : null;
    });
    expect(panelBg).toBeTruthy();
  });
});
