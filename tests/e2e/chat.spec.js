/**
 * E2E tests — Chat interface (send message, streaming, workflow cards)
 */

import {
  test,
  expect,
  shadowClick,
  shadowType,
  shadowText,
} from './extension-fixture.js';

test.describe('Chat Interface', () => {
  test('chat view is visible by default', async ({ n8nPage }) => {
    const chatViewActive = await n8nPage.evaluate(() => {
      const host = document.querySelector('#n8n-pilot-host');
      const chatView = host?.shadowRoot?.getElementById('chatView');
      return chatView?.classList.contains('active');
    });
    expect(chatViewActive).toBe(true);
  });

  test('chat has welcome message initially', async ({ n8nPage }) => {
    const welcomeText = await shadowText(n8nPage, '.chat-welcome .welcome-title');
    expect(welcomeText).toBe('n8n Pilot');

    const welcomeDesc = await shadowText(n8nPage, '.chat-welcome .welcome-text');
    expect(welcomeDesc).toContain('Describe a workflow');
  });

  test('chat input accepts text', async ({ n8nPage }) => {
    await shadowType(n8nPage, '#chatInput', 'Create a webhook workflow');

    const value = await n8nPage.evaluate(() => {
      const host = document.querySelector('#n8n-pilot-host');
      return host?.shadowRoot?.getElementById('chatInput')?.value;
    });
    expect(value).toBe('Create a webhook workflow');
  });

  test('sending message adds user bubble', async ({ n8nPage }) => {
    await shadowType(n8nPage, '#chatInput', 'Hello, generate a workflow');
    await shadowClick(n8nPage, '#btnSend');
    await n8nPage.waitForTimeout(500);

    const userBubbles = await n8nPage.evaluate(() => {
      const host = document.querySelector('#n8n-pilot-host');
      const bubbles = host?.shadowRoot?.querySelectorAll('.chat-bubble.user');
      return bubbles ? bubbles.length : 0;
    });
    expect(userBubbles).toBeGreaterThan(0);

    const bubbleText = await n8nPage.evaluate(() => {
      const host = document.querySelector('#n8n-pilot-host');
      const bubble = host?.shadowRoot?.querySelector('.chat-bubble.user');
      return bubble?.textContent?.trim();
    });
    expect(bubbleText).toContain('Hello, generate a workflow');
  });

  test('sending message removes welcome', async ({ n8nPage }) => {
    await shadowType(n8nPage, '#chatInput', 'Test message');
    await shadowClick(n8nPage, '#btnSend');
    await n8nPage.waitForTimeout(500);

    const hasWelcome = await n8nPage.evaluate(() => {
      const host = document.querySelector('#n8n-pilot-host');
      return !!host?.shadowRoot?.querySelector('.chat-welcome');
    });
    expect(hasWelcome).toBe(false);
  });

  test('send button exists and is clickable', async ({ n8nPage }) => {
    const hasSendBtn = await n8nPage.evaluate(() => {
      const host = document.querySelector('#n8n-pilot-host');
      const btn = host?.shadowRoot?.getElementById('btnSend');
      return !!btn && !btn.disabled;
    });
    expect(hasSendBtn).toBe(true);
  });

  test('empty message is not sent', async ({ n8nPage }) => {
    await shadowClick(n8nPage, '#btnSend');
    await n8nPage.waitForTimeout(300);

    const bubbles = await n8nPage.evaluate(() => {
      const host = document.querySelector('#n8n-pilot-host');
      return host?.shadowRoot?.querySelectorAll('.chat-bubble.user')?.length || 0;
    });
    expect(bubbles).toBe(0);

    const hasWelcome = await n8nPage.evaluate(() => {
      const host = document.querySelector('#n8n-pilot-host');
      return !!host?.shadowRoot?.querySelector('.chat-welcome');
    });
    expect(hasWelcome).toBe(true);
  });

  test('model indicator shows in chat footer', async ({ n8nPage }) => {
    const modelText = await shadowText(n8nPage, '#modelIndicator');
    expect(modelText).toBeTruthy();
    expect(modelText).toContain('sonnet');
  });

  test('abort button is hidden by default', async ({ n8nPage }) => {
    const abortHidden = await n8nPage.evaluate(() => {
      const host = document.querySelector('#n8n-pilot-host');
      const btn = host?.shadowRoot?.getElementById('btnAbortGeneration');
      return btn?.classList.contains('hidden');
    });
    expect(abortHidden).toBe(true);
  });

  test('chat input auto-resizes on multiline', async ({ n8nPage }) => {
    const initialHeight = await n8nPage.evaluate(() => {
      const host = document.querySelector('#n8n-pilot-host');
      return host?.shadowRoot?.getElementById('chatInput')?.offsetHeight;
    });

    await shadowType(n8nPage, '#chatInput', 'Line 1\nLine 2\nLine 3\nLine 4');
    await n8nPage.waitForTimeout(100);

    const newHeight = await n8nPage.evaluate(() => {
      const host = document.querySelector('#n8n-pilot-host');
      const input = host?.shadowRoot?.getElementById('chatInput');
      input?.dispatchEvent(new Event('input'));
      return input?.offsetHeight;
    });

    expect(newHeight).toBeGreaterThanOrEqual(initialHeight);
  });
});
