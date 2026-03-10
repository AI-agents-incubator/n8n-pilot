/**
 * n8n Pilot — Generation History
 * Stores past AI generation results locally.
 */

import { uuid, now } from './utils.js';
import * as settings from './settings.js';

const STORAGE_KEY = 'n8nPilotHistory';

/**
 * Add a new history entry.
 */
export async function add(entry) {
  const limit = await settings.get('historyLimit');
  const history = await loadHistory();

  const newEntry = {
    id: uuid(),
    timestamp: now(),
    prompt: entry.prompt || '',
    workflow: entry.workflow || null,
    model: entry.model || '',
    tokensUsed: entry.tokensUsed || { input: 0, output: 0 },
    duration: entry.duration || 0,
    injected: entry.injected || false,
    n8nWorkflowId: entry.n8nWorkflowId || null,
  };

  history.unshift(newEntry);

  // Enforce limit (FIFO)
  while (history.length > limit) {
    history.pop();
  }

  await saveHistory(history);
  return newEntry;
}

/**
 * Get a single entry by ID.
 */
export async function get(id) {
  const history = await loadHistory();
  return history.find(e => e.id === id) || null;
}

/**
 * List entries (newest first).
 */
export async function list({ limit, offset } = {}) {
  const history = await loadHistory();
  const start = offset || 0;
  const end = limit ? start + limit : undefined;
  return history.slice(start, end);
}

/**
 * Delete an entry by ID.
 */
export async function remove(id) {
  let history = await loadHistory();
  history = history.filter(e => e.id !== id);
  await saveHistory(history);
}

/**
 * Clear all history.
 */
export async function clear() {
  await saveHistory([]);
}

/**
 * Search entries by prompt text.
 */
export async function search(query) {
  const history = await loadHistory();
  const q = query.toLowerCase();
  return history.filter(e =>
    e.prompt && e.prompt.toLowerCase().includes(q)
  );
}

/**
 * Mark an entry as injected into n8n.
 */
export async function markInjected(id, n8nWorkflowId) {
  const history = await loadHistory();
  const entry = history.find(e => e.id === id);
  if (entry) {
    entry.injected = true;
    if (n8nWorkflowId) entry.n8nWorkflowId = n8nWorkflowId;
    await saveHistory(history);
  }
}

/**
 * Get total count.
 */
export async function count() {
  const history = await loadHistory();
  return history.length;
}

// --- Internal ---

async function loadHistory() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || [];
}

async function saveHistory(history) {
  await chrome.storage.local.set({ [STORAGE_KEY]: history });
}
