/**
 * E2E tests — Workflows and Executions views
 */

import {
  test,
  expect,
  configureExtension,
  setApiKey,
  shadowClick,
  shadowType,
  shadowText,
} from './extension-fixture.js';

test.describe('Workflows View', () => {
  test.beforeEach(async ({ serviceWorker }) => {
    await configureExtension(serviceWorker, {
      n8nBaseUrl: 'http://localhost:5678',
    });
    await setApiKey(serviceWorker, 'n8n', 'test-api-key');
  });

  test('workflows drawer opens and loads data', async ({ n8nPage }) => {
    await shadowClick(n8nPage, '[data-view="workflowsView"]');
    await n8nPage.waitForTimeout(2000);

    const isOpen = await n8nPage.evaluate(() => {
      const host = document.querySelector('#n8n-pilot-host');
      return !host?.shadowRoot?.getElementById('workflowsView')?.classList.contains('hidden');
    });
    expect(isOpen).toBe(true);

    const itemCount = await n8nPage.evaluate(() => {
      const host = document.querySelector('#n8n-pilot-host');
      return host?.shadowRoot?.querySelectorAll('#workflowsList .list-item')?.length || 0;
    });
    expect(itemCount).toBe(3);
  });

  test('workflow items show name and status badge', async ({ n8nPage }) => {
    await shadowClick(n8nPage, '[data-view="workflowsView"]');
    await n8nPage.waitForTimeout(2000);

    const firstItem = await n8nPage.evaluate(() => {
      const host = document.querySelector('#n8n-pilot-host');
      const item = host?.shadowRoot?.querySelector('#workflowsList .list-item');
      if (!item) return null;
      return {
        name: item.querySelector('.list-item-title')?.textContent,
        badge: item.querySelector('.badge')?.textContent,
        hasMeta: !!item.querySelector('.list-item-meta'),
      };
    });

    expect(firstItem).toBeTruthy();
    expect(firstItem.name).toBe('Email Notification');
    expect(firstItem.badge).toBe('Active');
    expect(firstItem.hasMeta).toBe(true);
  });

  test('workflow search filters items', async ({ n8nPage }) => {
    await shadowClick(n8nPage, '[data-view="workflowsView"]');
    await n8nPage.waitForTimeout(2000);

    await shadowType(n8nPage, '#workflowSearch', 'Email');
    await n8nPage.waitForTimeout(300);

    const visibleCount = await n8nPage.evaluate(() => {
      const host = document.querySelector('#n8n-pilot-host');
      const items = host?.shadowRoot?.querySelectorAll('#workflowsList .list-item');
      let count = 0;
      items?.forEach(item => {
        if (item.style.display !== 'none') count++;
      });
      return count;
    });

    expect(visibleCount).toBe(1);
  });

  test('workflow filter by active/inactive', async ({ n8nPage }) => {
    await shadowClick(n8nPage, '[data-view="workflowsView"]');
    await n8nPage.waitForTimeout(2000);

    await n8nPage.evaluate(() => {
      const host = document.querySelector('#n8n-pilot-host');
      const select = host?.shadowRoot?.getElementById('workflowFilter');
      if (select) {
        select.value = 'inactive';
        select.dispatchEvent(new Event('change'));
      }
    });
    await n8nPage.waitForTimeout(300);

    const visibleCount = await n8nPage.evaluate(() => {
      const host = document.querySelector('#n8n-pilot-host');
      const items = host?.shadowRoot?.querySelectorAll('#workflowsList .list-item');
      let count = 0;
      items?.forEach(item => {
        if (item.style.display !== 'none') count++;
      });
      return count;
    });

    expect(visibleCount).toBe(1);
  });

  test('workflow has activate/deactivate button', async ({ n8nPage }) => {
    await shadowClick(n8nPage, '[data-view="workflowsView"]');
    await n8nPage.waitForTimeout(2000);

    const toggleBtnText = await n8nPage.evaluate(() => {
      const host = document.querySelector('#n8n-pilot-host');
      const btn = host?.shadowRoot?.querySelector('#workflowsList .list-item .btn-toggle-wf');
      return btn?.textContent;
    });

    expect(toggleBtnText).toBe('Deactivate');
  });
});

test.describe('Executions View', () => {
  test.beforeEach(async ({ serviceWorker }) => {
    await configureExtension(serviceWorker, {
      n8nBaseUrl: 'http://localhost:5678',
    });
    await setApiKey(serviceWorker, 'n8n', 'test-api-key');
  });

  test('executions drawer opens and loads data', async ({ n8nPage }) => {
    await shadowClick(n8nPage, '[data-view="executionsView"]');
    await n8nPage.waitForTimeout(2000);

    const isOpen = await n8nPage.evaluate(() => {
      const host = document.querySelector('#n8n-pilot-host');
      return !host?.shadowRoot?.getElementById('executionsView')?.classList.contains('hidden');
    });
    expect(isOpen).toBe(true);

    const itemCount = await n8nPage.evaluate(() => {
      const host = document.querySelector('#n8n-pilot-host');
      return host?.shadowRoot?.querySelectorAll('#executionsList .list-item')?.length || 0;
    });
    expect(itemCount).toBe(3);
  });

  test('execution items show status badges', async ({ n8nPage }) => {
    await shadowClick(n8nPage, '[data-view="executionsView"]');
    await n8nPage.waitForTimeout(2000);

    const badges = await n8nPage.evaluate(() => {
      const host = document.querySelector('#n8n-pilot-host');
      const badgeEls = host?.shadowRoot?.querySelectorAll('#executionsList .badge');
      return badgeEls ? Array.from(badgeEls).map(b => b.textContent) : [];
    });

    expect(badges).toContain('success');
    expect(badges).toContain('error');
  });

  test('execution status filter works', async ({ n8nPage }) => {
    await shadowClick(n8nPage, '[data-view="executionsView"]');
    await n8nPage.waitForTimeout(2000);

    await n8nPage.evaluate(() => {
      const host = document.querySelector('#n8n-pilot-host');
      const select = host?.shadowRoot?.getElementById('executionStatusFilter');
      if (select) {
        select.value = 'error';
        select.dispatchEvent(new Event('change'));
      }
    });
    await n8nPage.waitForTimeout(2000);

    const itemCount = await n8nPage.evaluate(() => {
      const host = document.querySelector('#n8n-pilot-host');
      return host?.shadowRoot?.querySelectorAll('#executionsList .list-item')?.length || 0;
    });

    expect(itemCount).toBe(1);
  });
});

test.describe('History View', () => {
  test('history drawer opens with empty state', async ({ n8nPage }) => {
    await shadowClick(n8nPage, '[data-view="historyView"]');
    await n8nPage.waitForTimeout(1000);

    const isOpen = await n8nPage.evaluate(() => {
      const host = document.querySelector('#n8n-pilot-host');
      return !host?.shadowRoot?.getElementById('historyView')?.classList.contains('hidden');
    });
    expect(isOpen).toBe(true);

    const emptyText = await n8nPage.evaluate(() => {
      const host = document.querySelector('#n8n-pilot-host');
      const el = host?.shadowRoot?.querySelector('#historyList .list-empty');
      return el?.textContent;
    });
    expect(emptyText).toContain('No history');
  });

  test('history search input exists', async ({ n8nPage }) => {
    await shadowClick(n8nPage, '[data-view="historyView"]');
    await n8nPage.waitForTimeout(300);

    const hasSearch = await n8nPage.evaluate(() => {
      const host = document.querySelector('#n8n-pilot-host');
      return !!host?.shadowRoot?.getElementById('historySearch');
    });
    expect(hasSearch).toBe(true);
  });
});
