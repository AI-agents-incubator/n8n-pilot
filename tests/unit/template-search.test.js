/**
 * Tests for template-search.js
 * Tests template API client with mocked fetch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  searchTemplates,
  getTemplate,
  getIntegrations,
  isTemplateServerAvailable,
  buildSearchQuery,
  findTemplates,
  getDiagram,
  getCategories,
  getStats,
} from '../../lib/template-search.js';

// Mock fetch globally
const originalFetch = globalThis.fetch;

function mockFetch(response, options = {}) {
  globalThis.fetch = vi.fn().mockImplementation(() => {
    if (options.fail) return Promise.reject(new Error('Connection refused'));
    if (options.status) {
      return Promise.resolve({
        ok: options.status >= 200 && options.status < 300,
        json: () => Promise.resolve(response),
      });
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(response),
    });
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('template-search', () => {
  describe('searchTemplates', () => {
    it('sends search query to API', async () => {
      mockFetch({ workflows: [{ name: 'Test', filename: 'test.json' }], total: 1 });

      const result = await searchTemplates({ query: 'telegram rss', baseUrl: 'http://test:8000' });

      expect(result.workflows).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('q=telegram+rss'),
        expect.any(Object),
      );
    });

    it('passes trigger and complexity filters', async () => {
      mockFetch({ workflows: [], total: 0 });

      await searchTemplates({
        query: 'email',
        trigger: 'Webhook',
        complexity: 'simple',
        baseUrl: 'http://test:8000',
      });

      const calledUrl = globalThis.fetch.mock.calls[0][0];
      expect(calledUrl).toContain('trigger=Webhook');
      expect(calledUrl).toContain('complexity=simple');
    });

    it('returns empty on server failure', async () => {
      mockFetch(null, { fail: true });

      const result = await searchTemplates({ query: 'test', baseUrl: 'http://test:8000' });

      expect(result.workflows).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('returns empty on non-200 response', async () => {
      mockFetch({}, { status: 500 });

      const result = await searchTemplates({ query: 'test', baseUrl: 'http://test:8000' });

      expect(result.workflows).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('respects limit parameter', async () => {
      mockFetch({ workflows: [], total: 0 });

      await searchTemplates({ query: 'test', limit: 10, baseUrl: 'http://test:8000' });

      const calledUrl = globalThis.fetch.mock.calls[0][0];
      expect(calledUrl).toContain('per_page=10');
    });
  });

  describe('getTemplate', () => {
    it('fetches template by filename', async () => {
      const template = { filename: 'test.json', name: 'Test', content: { nodes: [] } };
      mockFetch(template);

      const result = await getTemplate('test.json', 'http://test:8000');

      expect(result).toEqual(template);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/workflows/test.json'),
        expect.any(Object),
      );
    });

    it('returns null for missing filename', async () => {
      const result = await getTemplate('', 'http://test:8000');
      expect(result).toBeNull();
    });

    it('returns null on failure', async () => {
      mockFetch(null, { fail: true });

      const result = await getTemplate('test.json', 'http://test:8000');
      expect(result).toBeNull();
    });
  });

  describe('getIntegrations', () => {
    it('returns integration list', async () => {
      mockFetch(['telegram', 'gmail', 'slack']);

      const result = await getIntegrations('http://test:8000');
      expect(result).toEqual(['telegram', 'gmail', 'slack']);
    });

    it('returns empty array on failure', async () => {
      mockFetch(null, { fail: true });

      const result = await getIntegrations('http://test:8000');
      expect(result).toEqual([]);
    });
  });

  describe('isTemplateServerAvailable', () => {
    it('returns true when server responds', async () => {
      mockFetch({ total_workflows: 2053 });

      const result = await isTemplateServerAvailable('http://test:8000');
      expect(result).toBe(true);
    });

    it('returns false when server is down', async () => {
      mockFetch(null, { fail: true });

      const result = await isTemplateServerAvailable('http://test:8000');
      expect(result).toBe(false);
    });
  });

  describe('buildSearchQuery', () => {
    it('builds query from blueprint nodes', () => {
      const blueprint = {
        trigger: { type: 'n8n-nodes-base.webhook', name: 'Webhook' },
        nodes: [
          { type: 'n8n-nodes-base.telegram', name: 'Telegram' },
          { type: '@n8n/n8n-nodes-langchain.openAi', name: 'OpenAI' },
        ],
        credentialsNeeded: ['telegram', 'openai'],
      };

      const query = buildSearchQuery(blueprint);
      expect(query).toContain('telegram');
      expect(query).toContain('openAi');
      expect(query).toContain('webhook');
    });

    it('strips n8n prefixes from type names', () => {
      const blueprint = {
        trigger: { type: 'n8n-nodes-base.scheduleTrigger' },
        nodes: [{ type: 'n8n-nodes-base.httpRequest' }],
        credentialsNeeded: [],
      };

      const query = buildSearchQuery(blueprint);
      expect(query).not.toContain('n8n-nodes-base.');
      expect(query).toContain('httpRequest');
      expect(query).toContain('scheduleTrigger');
    });

    it('deduplicates keywords', () => {
      const blueprint = {
        trigger: { type: 'n8n-nodes-base.webhook' },
        nodes: [],
        credentialsNeeded: ['webhook'],
      };

      const query = buildSearchQuery(blueprint);
      const words = query.split(' ');
      expect(new Set(words).size).toBe(words.length);
    });

    it('returns empty string for null blueprint', () => {
      expect(buildSearchQuery(null)).toBe('');
      expect(buildSearchQuery(undefined)).toBe('');
    });
  });

  describe('findTemplates', () => {
    it('searches using blueprint data', async () => {
      mockFetch({ workflows: [{ name: 'Match', filename: 'match.json' }], total: 1 });

      const blueprint = {
        trigger: { type: 'n8n-nodes-base.webhook' },
        nodes: [{ type: 'n8n-nodes-base.telegram' }],
        credentialsNeeded: ['telegram'],
        complexity: 'simple',
      };

      const results = await findTemplates(blueprint, { baseUrl: 'http://test:8000' });

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Match');
    });

    it('returns empty array on failure', async () => {
      mockFetch(null, { fail: true });

      const blueprint = {
        trigger: { type: 'n8n-nodes-base.webhook' },
        nodes: [{ type: 'n8n-nodes-base.code' }],
        credentialsNeeded: [],
      };

      const results = await findTemplates(blueprint, { baseUrl: 'http://test:8000' });
      expect(results).toEqual([]);
    });

    it('maps webhook trigger to Webhook filter', async () => {
      mockFetch({ workflows: [], total: 0 });

      const blueprint = {
        trigger: { type: 'n8n-nodes-base.webhook' },
        nodes: [],
        credentialsNeeded: [],
      };

      await findTemplates(blueprint, { baseUrl: 'http://test:8000' });

      const calledUrl = globalThis.fetch.mock.calls[0][0];
      expect(calledUrl).toContain('trigger=Webhook');
    });
  });

  describe('getDiagram', () => {
    it('fetches Mermaid diagram by filename', async () => {
      mockFetch({ diagram: 'graph LR\nA-->B' });

      const result = await getDiagram('test.json', 'http://test:8000');
      expect(result).toBe('graph LR\nA-->B');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/workflows/test.json/diagram'),
        expect.any(Object),
      );
    });

    it('handles mermaid key in response', async () => {
      mockFetch({ mermaid: 'flowchart TD\nX-->Y' });

      const result = await getDiagram('test.json', 'http://test:8000');
      expect(result).toBe('flowchart TD\nX-->Y');
    });

    it('returns null for missing filename', async () => {
      const result = await getDiagram('', 'http://test:8000');
      expect(result).toBeNull();
    });

    it('returns null on failure', async () => {
      mockFetch(null, { fail: true });

      const result = await getDiagram('test.json', 'http://test:8000');
      expect(result).toBeNull();
    });
  });

  describe('getCategories', () => {
    it('returns category list', async () => {
      const categories = [
        { name: 'messaging', count: 45 },
        { name: 'databases', count: 32 },
      ];
      mockFetch(categories);

      const result = await getCategories('http://test:8000');
      expect(result).toEqual(categories);
      expect(result).toHaveLength(2);
    });

    it('returns empty array on failure', async () => {
      mockFetch(null, { fail: true });

      const result = await getCategories('http://test:8000');
      expect(result).toEqual([]);
    });
  });

  describe('getStats', () => {
    it('returns server statistics', async () => {
      const stats = {
        total_workflows: 2053,
        triggers: { Webhook: 450, Scheduled: 320 },
        complexity: { simple: 800, moderate: 900, complex: 353 },
      };
      mockFetch(stats);

      const result = await getStats('http://test:8000');
      expect(result.total_workflows).toBe(2053);
      expect(result.triggers.Webhook).toBe(450);
    });

    it('returns null on failure', async () => {
      mockFetch(null, { fail: true });

      const result = await getStats('http://test:8000');
      expect(result).toBeNull();
    });
  });
});
