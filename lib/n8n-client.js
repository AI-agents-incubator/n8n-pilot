/**
 * n8n Pilot — n8n REST API Client
 * Direct calls to self-hosted n8n instance.
 */

import * as settings from './settings.js';

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Generic request to n8n API.
 */
async function request(method, path, body = null) {
  const baseUrl = await settings.get('n8nBaseUrl');
  const apiKey = await settings.getApiKey('n8n');

  if (!baseUrl) throw new Error('n8n base URL not configured');
  if (!apiKey) throw new Error('n8n API key not configured');

  const url = `${baseUrl.replace(/\/+$/, '')}/api/v1${path}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const options = {
      method,
      headers: {
        'X-N8N-API-KEY': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      signal: controller.signal,
    };

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`n8n API error ${response.status}: ${errorText.substring(0, 200)}`);
    }

    // DELETE may return no content
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return null;
    }

    return response.json();

  } finally {
    clearTimeout(timeoutId);
  }
}

// === Workflows ===

export async function listWorkflows(params = {}) {
  const query = new URLSearchParams();
  if (params.limit) query.set('limit', params.limit);
  if (params.cursor) query.set('cursor', params.cursor);
  if (params.active !== undefined) query.set('active', params.active);
  if (params.tags) query.set('tags', params.tags);
  if (params.name) query.set('name', params.name);

  const qs = query.toString();
  return request('GET', `/workflows${qs ? '?' + qs : ''}`);
}

export async function getWorkflow(id) {
  return request('GET', `/workflows/${id}`);
}

export async function createWorkflow(data) {
  return request('POST', '/workflows', data);
}

export async function updateWorkflow(id, data) {
  return request('PUT', `/workflows/${id}`, data);
}

export async function deleteWorkflow(id) {
  return request('DELETE', `/workflows/${id}`);
}

export async function activateWorkflow(id) {
  return request('POST', `/workflows/${id}/activate`);
}

export async function deactivateWorkflow(id) {
  return request('POST', `/workflows/${id}/deactivate`);
}

// === Executions ===

export async function listExecutions(params = {}) {
  const query = new URLSearchParams();
  if (params.workflowId) query.set('workflowId', params.workflowId);
  if (params.status) query.set('status', params.status);
  if (params.limit) query.set('limit', params.limit);
  if (params.cursor) query.set('cursor', params.cursor);

  const qs = query.toString();
  return request('GET', `/executions${qs ? '?' + qs : ''}`);
}

export async function getExecution(id) {
  return request('GET', `/executions/${id}`);
}

export async function deleteExecution(id) {
  return request('DELETE', `/executions/${id}`);
}

// === Variables ===

export async function listVariables() {
  return request('GET', '/variables');
}

export async function createVariable(data) {
  return request('POST', '/variables', data);
}

export async function updateVariable(id, data) {
  return request('PATCH', `/variables/${id}`, data);
}

export async function deleteVariable(id) {
  return request('DELETE', `/variables/${id}`);
}

// === Tags ===

export async function listTags() {
  return request('GET', '/tags');
}

export async function createTag(name) {
  return request('POST', '/tags', { name });
}

// === Credentials ===

export async function listCredentials() {
  return request('GET', '/credentials');
}

// === Connection Test ===

export async function testConnection() {
  try {
    const baseUrl = await settings.get('n8nBaseUrl');
    const apiKey = await settings.getApiKey('n8n');

    if (!baseUrl) return { connected: false, error: 'URL not configured' };
    if (!apiKey) return { connected: false, error: 'API key not configured' };

    const url = `${baseUrl.replace(/\/+$/, '')}/api/v1/workflows?limit=1`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-N8N-API-KEY': apiKey,
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      if (response.ok) {
        return { connected: true, error: null };
      }

      if (response.status === 401) {
        return { connected: false, error: 'Invalid API key' };
      }

      return { connected: false, error: `HTTP ${response.status}` };

    } finally {
      clearTimeout(timeoutId);
    }

  } catch (err) {
    if (err.name === 'AbortError') {
      return { connected: false, error: 'Connection timeout' };
    }
    return { connected: false, error: err.message };
  }
}
