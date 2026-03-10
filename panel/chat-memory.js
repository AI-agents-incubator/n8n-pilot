/**
 * n8n Pilot — Chat Memory
 * Persistent per-workflow chat history using chrome.storage.local.
 */

/* global chrome */

const STORAGE_KEY = 'n8nPilotChatMemory';
const MAX_MESSAGES_PER_WORKFLOW = 100;
const DEFAULT_CONTEXT = 'default';

/**
 * Add a message to chat history for a workflow.
 * @param {string} workflowId - Workflow ID or 'default'
 * @param {Object} message - { role: 'user'|'assistant', content: string, metadata?: Object }
 */
export async function addMessage(workflowId, message) {
  const contextId = workflowId || DEFAULT_CONTEXT;
  const data = await _load();

  if (!data[contextId]) {
    data[contextId] = { messages: [], lastUpdated: null };
  }

  data[contextId].messages.push({
    role: message.role,
    content: message.content,
    metadata: message.metadata || {},
    timestamp: new Date().toISOString(),
  });

  // FIFO eviction
  if (data[contextId].messages.length > MAX_MESSAGES_PER_WORKFLOW) {
    data[contextId].messages = data[contextId].messages.slice(-MAX_MESSAGES_PER_WORKFLOW);
  }

  data[contextId].lastUpdated = new Date().toISOString();
  await _save(data);
}

/**
 * Get all messages for a workflow.
 * @param {string} workflowId
 * @returns {Promise<Array>}
 */
export async function getMessages(workflowId) {
  const contextId = workflowId || DEFAULT_CONTEXT;
  const data = await _load();
  return data[contextId]?.messages || [];
}

/**
 * Clear messages for a workflow.
 * @param {string} workflowId
 */
export async function clearMessages(workflowId) {
  const contextId = workflowId || DEFAULT_CONTEXT;
  const data = await _load();
  delete data[contextId];
  await _save(data);
}

/**
 * Clear all chat memory.
 */
export async function clearAll() {
  await chrome.storage.local.remove(STORAGE_KEY);
}

/**
 * List all workflow IDs with chat history.
 * @returns {Promise<string[]>}
 */
export async function listContexts() {
  const data = await _load();
  return Object.keys(data);
}

// --- Internal ---

async function _load() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || {};
}

async function _save(data) {
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
}
