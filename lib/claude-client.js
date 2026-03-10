/**
 * n8n Pilot — Claude API Client
 * Direct calls to Anthropic Messages API. No proxy server.
 */

import { sleep } from './utils.js';
import * as settings from './settings.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const MAX_RETRIES = 3;
const GENERATION_TIMEOUT_MS = 180_000; // 3 minutes

/**
 * Send a message to Claude and get a response.
 * @param {Object} params
 * @param {string} params.systemPrompt - System prompt
 * @param {string} params.userPrompt - User message
 * @param {string} [params.model] - Model override
 * @param {number} [params.maxTokens] - Max tokens override
 * @param {number} [params.temperature] - Temperature override
 * @param {AbortSignal} [params.abortSignal] - Abort signal
 * @returns {Promise<ClaudeResponse>}
 */
export async function sendMessage({
  systemPrompt,
  userPrompt,
  model,
  maxTokens,
  temperature,
  abortSignal,
}) {
  const apiKey = await settings.getApiKey('claude');
  if (!apiKey) {
    return {
      success: false,
      content: null,
      rawResponse: '',
      tokensUsed: { input: 0, output: 0 },
      duration: 0,
      error: 'Claude API key not configured',
    };
  }

  const settingsData = await settings.getAll();
  const selectedModel = model || settingsData.claudeModel;
  const selectedMaxTokens = maxTokens || settingsData.claudeMaxTokens;
  const selectedTemperature = temperature ?? settingsData.claudeTemperature;

  const body = {
    model: selectedModel,
    max_tokens: selectedMaxTokens,
    temperature: selectedTemperature,
    system: systemPrompt,
    messages: [
      { role: 'user', content: userPrompt },
    ],
  };

  const startTime = Date.now();
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(apiKey, body, abortSignal);

      if (response.ok) {
        const data = await response.json();
        const textContent = data.content
          ?.filter(block => block.type === 'text')
          .map(block => block.text)
          .join('') || '';

        return {
          success: true,
          content: textContent,
          rawResponse: JSON.stringify(data),
          tokensUsed: {
            input: data.usage?.input_tokens || 0,
            output: data.usage?.output_tokens || 0,
          },
          duration: Date.now() - startTime,
          model: data.model || selectedModel,
          stopReason: data.stop_reason || '',
          error: null,
        };
      }

      // Handle retryable errors
      const status = response.status;

      if (status === 401) {
        return {
          success: false,
          content: null,
          rawResponse: '',
          tokensUsed: { input: 0, output: 0 },
          duration: Date.now() - startTime,
          error: 'Invalid Claude API key (401 Unauthorized)',
        };
      }

      if (status === 400) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          content: null,
          rawResponse: JSON.stringify(errorData),
          tokensUsed: { input: 0, output: 0 },
          duration: Date.now() - startTime,
          error: `Bad request: ${errorData.error?.message || 'Unknown error'}`,
        };
      }

      // Retryable: 429 (rate limit), 529 (overloaded), 5xx
      if (status === 429 || status === 529 || status >= 500) {
        lastError = `HTTP ${status}`;
        if (attempt < MAX_RETRIES) {
          const delay = Math.min(2000 * Math.pow(2, attempt), 10000);
          await sleep(delay);
          continue;
        }
      }

      // Non-retryable error
      const errorText = await response.text().catch(() => '');
      return {
        success: false,
        content: null,
        rawResponse: errorText,
        tokensUsed: { input: 0, output: 0 },
        duration: Date.now() - startTime,
        error: `HTTP ${status}: ${errorText.substring(0, 200)}`,
      };

    } catch (err) {
      if (err.name === 'AbortError') {
        return {
          success: false,
          content: null,
          rawResponse: '',
          tokensUsed: { input: 0, output: 0 },
          duration: Date.now() - startTime,
          error: 'Request cancelled',
        };
      }

      lastError = err.message;
      if (attempt < MAX_RETRIES) {
        const delay = Math.min(2000 * Math.pow(2, attempt), 10000);
        await sleep(delay);
        continue;
      }
    }
  }

  return {
    success: false,
    content: null,
    rawResponse: '',
    tokensUsed: { input: 0, output: 0 },
    duration: Date.now() - startTime,
    error: `Failed after ${MAX_RETRIES + 1} attempts: ${lastError}`,
  };
}

/**
 * Test connection to Claude API.
 * Sends a minimal request to verify the API key works.
 */
export async function testConnection(apiKey) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });

    if (response.ok) {
      return { connected: true, error: null };
    }

    if (response.status === 401) {
      return { connected: false, error: 'Invalid API key' };
    }

    return { connected: false, error: `HTTP ${response.status}` };

  } catch (err) {
    return { connected: false, error: err.message };
  }
}

/**
 * Get list of available Claude models.
 */
export function getAvailableModels() {
  return [
    { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', description: 'Best balance of speed and intelligence' },
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4 (latest)', description: 'Latest Sonnet, fast and capable' },
    { id: 'claude-opus-4-6', name: 'Claude Opus 4 (latest)', description: 'Most capable, slower' },
    { id: 'claude-haiku-3-5-20241022', name: 'Claude Haiku 3.5', description: 'Fastest, most affordable' },
  ];
}

/**
 * Send a streaming message to Claude.
 * Returns chunks via callbacks for real-time display.
 * @param {Object} params
 * @param {string} params.systemPrompt - System prompt
 * @param {string} params.userPrompt - User message
 * @param {Array} [params.messages] - Multi-turn messages array
 * @param {string} [params.model] - Model override
 * @param {number} [params.maxTokens] - Max tokens override
 * @param {number} [params.temperature] - Temperature override
 * @param {AbortSignal} [params.abortSignal] - Abort signal
 * @param {function} params.onChunk - Called with each text chunk
 * @param {function} params.onDone - Called with final result
 * @param {function} params.onError - Called on error
 */
export async function sendMessageStream({
  systemPrompt,
  userPrompt,
  messages: inputMessages,
  model,
  maxTokens,
  temperature,
  abortSignal,
  onChunk,
  onDone,
  onError,
}) {
  const apiKey = await settings.getApiKey('claude');
  if (!apiKey) {
    onError?.('Claude API key not configured');
    return;
  }

  const settingsData = await settings.getAll();
  const selectedModel = model || settingsData.claudeModel;
  const selectedMaxTokens = maxTokens || settingsData.claudeMaxTokens;
  const selectedTemperature = temperature ?? settingsData.claudeTemperature;

  // Support either single userPrompt or multi-turn messages array
  const messagesList = inputMessages || [{ role: 'user', content: userPrompt }];

  const body = {
    model: selectedModel,
    max_tokens: selectedMaxTokens,
    temperature: selectedTemperature,
    system: systemPrompt,
    messages: messagesList,
    stream: true,
  };

  const startTime = Date.now();
  let fullText = '';
  let usage = { input: 0, output: 0 };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);

  if (abortSignal) {
    abortSignal.addEventListener('abort', () => controller.abort());
  }

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      clearTimeout(timeoutId);
      const errorText = await response.text().catch(() => '');
      if (response.status === 401) {
        onError?.('Invalid Claude API key (401 Unauthorized)');
      } else {
        onError?.(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
      }
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process SSE events
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const event = JSON.parse(data);

          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            const text = event.delta.text;
            fullText += text;
            onChunk?.(text, fullText.length);
          } else if (event.type === 'message_delta' && event.usage) {
            usage.output = event.usage.output_tokens || 0;
          } else if (event.type === 'message_start' && event.message?.usage) {
            usage.input = event.message.usage.input_tokens || 0;
          }
        } catch (_) {
          // Skip malformed JSON
        }
      }
    }

    clearTimeout(timeoutId);
    onDone?.({
      success: true,
      content: fullText,
      tokensUsed: usage,
      duration: Date.now() - startTime,
      model: selectedModel,
    });

  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      onError?.('Request cancelled');
    } else {
      onError?.(err.message);
    }
  }
}

/**
 * Send a multi-turn conversation to Claude (non-streaming).
 * @param {Object} params
 * @param {string} params.systemPrompt - System prompt
 * @param {Array} params.messages - Messages array [{role, content}]
 * @param {string} [params.model] - Model override
 * @param {AbortSignal} [params.abortSignal] - Abort signal
 */
export async function sendConversation({ systemPrompt, messages, model, abortSignal }) {
  return sendMessage({
    systemPrompt,
    userPrompt: '', // Not used when messages override is present
    model,
    abortSignal,
    _messages: messages,
  });
}

// --- Internal helpers ---

function buildHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': API_VERSION,
    'anthropic-dangerous-direct-browser-access': 'true',
  };
}

async function fetchWithTimeout(apiKey, body, abortSignal) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);

  // If external abort signal fires, also abort our controller
  if (abortSignal) {
    abortSignal.addEventListener('abort', () => controller.abort());
  }

  try {
    return await fetch(API_URL, {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
