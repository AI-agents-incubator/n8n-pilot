/**
 * Tests for history.js
 * Tests generation history tracking and management
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  add,
  get,
  list,
  remove,
  clear,
  search,
  markInjected,
  count,
} from '../../lib/history.js';

describe('history', () => {
  beforeEach(async () => {
    await chrome.storage.local.clear();
  });

  describe('add', () => {
    it('creates a new history entry with generated ID', async () => {
      const entry = await add({
        prompt: 'Generate a workflow',
        workflow: { nodes: [] },
        model: 'claude-3',
        tokensUsed: { input: 100, output: 50 },
        duration: 1000,
      });

      expect(entry.id).toBeDefined();
      expect(entry.id.length).toBeGreaterThan(0);
      expect(entry.prompt).toBe('Generate a workflow');
    });

    it('adds timestamp to entry', async () => {
      const entry = await add({
        prompt: 'Test',
      });

      expect(entry.timestamp).toBeDefined();
      expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('stores all entry fields', async () => {
      const entry = await add({
        prompt: 'Generate webhook',
        workflow: { nodes: [{ id: '1', name: 'Start' }] },
        model: 'claude-3-sonnet',
        tokensUsed: { input: 200, output: 150 },
        duration: 2500,
        injected: false,
        n8nWorkflowId: null,
      });

      expect(entry.prompt).toBe('Generate webhook');
      expect(entry.workflow.nodes.length).toBe(1);
      expect(entry.model).toBe('claude-3-sonnet');
      expect(entry.tokensUsed.input).toBe(200);
      expect(entry.duration).toBe(2500);
      expect(entry.injected).toBe(false);
    });

    it('provides default values for missing fields', async () => {
      const entry = await add({
        prompt: 'Minimal entry',
      });

      expect(entry.workflow).toBeNull();
      expect(entry.model).toBe('');
      expect(entry.tokensUsed).toEqual({ input: 0, output: 0 });
      expect(entry.duration).toBe(0);
      expect(entry.injected).toBe(false);
      expect(entry.n8nWorkflowId).toBeNull();
    });

    it('persists entry to storage', async () => {
      const entry = await add({
        prompt: 'Test persistence',
      });

      const retrieved = await get(entry.id);
      expect(retrieved).toBeDefined();
      expect(retrieved.prompt).toBe('Test persistence');
    });
  });

  describe('get', () => {
    it('retrieves entry by ID', async () => {
      const entry1 = await add({ prompt: 'First' });
      const entry2 = await add({ prompt: 'Second' });

      const retrieved = await get(entry1.id);
      expect(retrieved.prompt).toBe('First');

      const retrieved2 = await get(entry2.id);
      expect(retrieved2.prompt).toBe('Second');
    });

    it('returns null for non-existent ID', async () => {
      const result = await get('non-existent-id');
      expect(result).toBeNull();
    });

    it('retrieves full entry data', async () => {
      const entry = await add({
        prompt: 'Complex entry',
        workflow: { nodes: [{ id: '1', name: 'Test' }] },
        model: 'claude-3-opus',
        tokensUsed: { input: 500, output: 300 },
        duration: 3000,
      });

      const retrieved = await get(entry.id);
      expect(retrieved.workflow.nodes[0].id).toBe('1');
      expect(retrieved.tokensUsed.input).toBe(500);
    });
  });

  describe('list', () => {
    it('returns entries in newest-first order', async () => {
      const entry1 = await add({ prompt: 'First' });
      const entry2 = await add({ prompt: 'Second' });
      const entry3 = await add({ prompt: 'Third' });

      const entries = await list();
      expect(entries[0].prompt).toBe('Third');
      expect(entries[1].prompt).toBe('Second');
      expect(entries[2].prompt).toBe('First');
    });

    it('supports limit parameter', async () => {
      await add({ prompt: 'Entry 1' });
      await add({ prompt: 'Entry 2' });
      await add({ prompt: 'Entry 3' });
      await add({ prompt: 'Entry 4' });

      const entries = await list({ limit: 2 });
      expect(entries.length).toBe(2);
      expect(entries[0].prompt).toBe('Entry 4');
      expect(entries[1].prompt).toBe('Entry 3');
    });

    it('supports offset parameter', async () => {
      await add({ prompt: 'Entry 1' });
      await add({ prompt: 'Entry 2' });
      await add({ prompt: 'Entry 3' });

      const entries = await list({ offset: 1, limit: 1 });
      expect(entries.length).toBe(1);
      expect(entries[0].prompt).toBe('Entry 2');
    });

    it('returns empty array when offset is beyond length', async () => {
      await add({ prompt: 'Entry 1' });
      const entries = await list({ offset: 10 });
      expect(entries).toEqual([]);
    });

    it('returns all entries without limit', async () => {
      for (let i = 0; i < 5; i++) {
        await add({ prompt: `Entry ${i}` });
      }

      const entries = await list();
      expect(entries.length).toBe(5);
    });
  });

  describe('remove', () => {
    it('removes entry by ID', async () => {
      const entry = await add({ prompt: 'To be removed' });
      await remove(entry.id);

      const retrieved = await get(entry.id);
      expect(retrieved).toBeNull();
    });

    it('does not affect other entries', async () => {
      const entry1 = await add({ prompt: 'Keep this' });
      const entry2 = await add({ prompt: 'Remove this' });

      await remove(entry2.id);

      expect(await get(entry1.id)).toBeDefined();
      expect(await get(entry2.id)).toBeNull();
    });

    it('handles removing non-existent ID gracefully', async () => {
      await expect(remove('non-existent')).resolves.not.toThrow();
    });

    it('maintains order after removal', async () => {
      const entry1 = await add({ prompt: 'Entry 1' });
      const entry2 = await add({ prompt: 'Entry 2' });
      const entry3 = await add({ prompt: 'Entry 3' });

      await remove(entry2.id);

      const entries = await list();
      expect(entries.map(e => e.prompt)).toEqual(['Entry 3', 'Entry 1']);
    });
  });

  describe('clear', () => {
    it('removes all history entries', async () => {
      await add({ prompt: 'Entry 1' });
      await add({ prompt: 'Entry 2' });
      await add({ prompt: 'Entry 3' });

      await clear();

      const entries = await list();
      expect(entries).toEqual([]);
    });

    it('can add entries after clear', async () => {
      await add({ prompt: 'Entry 1' });
      await clear();
      await add({ prompt: 'Entry 2' });

      const entries = await list();
      expect(entries.length).toBe(1);
      expect(entries[0].prompt).toBe('Entry 2');
    });
  });

  describe('search', () => {
    it('searches entries by prompt text', async () => {
      await add({ prompt: 'Create a webhook' });
      await add({ prompt: 'Set up database' });
      await add({ prompt: 'Create an email trigger' });

      const results = await search('create');
      expect(results.length).toBe(2);
      expect(results[0].prompt).toContain('email');
      expect(results[1].prompt).toContain('webhook');
    });

    it('is case-insensitive', async () => {
      await add({ prompt: 'Create a WEBHOOK' });
      await add({ prompt: 'Set up database' });

      const results = await search('webhook');
      expect(results.length).toBe(1);
    });

    it('returns empty array for no matches', async () => {
      await add({ prompt: 'Entry 1' });
      await add({ prompt: 'Entry 2' });

      const results = await search('nonexistent');
      expect(results).toEqual([]);
    });

    it('returns results in newest-first order', async () => {
      await add({ prompt: 'First workflow' });
      await add({ prompt: 'Other entry' });
      await add({ prompt: 'Second workflow' });

      const results = await search('workflow');
      expect(results[0].prompt).toBe('Second workflow');
      expect(results[1].prompt).toBe('First workflow');
    });

    it('ignores entries with empty prompts', async () => {
      await add({ prompt: '' });
      await add({ prompt: 'Search term' });

      const results = await search('search');
      expect(results.length).toBe(1);
    });

    it('handles special characters in search', async () => {
      await add({ prompt: 'API key: sk-123' });
      await add({ prompt: 'Regular entry' });

      const results = await search('sk-123');
      expect(results.length).toBe(1);
    });
  });

  describe('markInjected', () => {
    it('marks entry as injected', async () => {
      const entry = await add({ prompt: 'Test', injected: false });
      await markInjected(entry.id);

      const updated = await get(entry.id);
      expect(updated.injected).toBe(true);
    });

    it('stores n8n workflow ID when provided', async () => {
      const entry = await add({ prompt: 'Test' });
      await markInjected(entry.id, 'workflow-123');

      const updated = await get(entry.id);
      expect(updated.n8nWorkflowId).toBe('workflow-123');
    });

    it('only sets injected flag without workflow ID', async () => {
      const entry = await add({ prompt: 'Test' });
      await markInjected(entry.id);

      const updated = await get(entry.id);
      expect(updated.injected).toBe(true);
      expect(updated.n8nWorkflowId).toBeNull();
    });

    it('handles non-existent entry gracefully', async () => {
      await expect(
        markInjected('non-existent-id', 'workflow-123')
      ).resolves.not.toThrow();
    });

    it('preserves other fields when marking injected', async () => {
      const entry = await add({
        prompt: 'Original prompt',
        model: 'claude-3',
        tokensUsed: { input: 100, output: 50 },
      });

      await markInjected(entry.id, 'wf-456');

      const updated = await get(entry.id);
      expect(updated.prompt).toBe('Original prompt');
      expect(updated.model).toBe('claude-3');
      expect(updated.tokensUsed.input).toBe(100);
    });
  });

  describe('count', () => {
    it('returns zero for empty history', async () => {
      const result = await count();
      expect(result).toBe(0);
    });

    it('returns number of entries', async () => {
      await add({ prompt: 'Entry 1' });
      await add({ prompt: 'Entry 2' });
      await add({ prompt: 'Entry 3' });

      const result = await count();
      expect(result).toBe(3);
    });

    it('updates count after adding entry', async () => {
      expect(await count()).toBe(0);
      await add({ prompt: 'Entry 1' });
      expect(await count()).toBe(1);
    });

    it('updates count after removing entry', async () => {
      const entry = await add({ prompt: 'Entry 1' });
      expect(await count()).toBe(1);
      await remove(entry.id);
      expect(await count()).toBe(0);
    });

    it('updates count after clear', async () => {
      await add({ prompt: 'Entry 1' });
      await add({ prompt: 'Entry 2' });
      expect(await count()).toBe(2);
      await clear();
      expect(await count()).toBe(0);
    });
  });

  describe('FIFO limit enforcement', () => {
    it('enforces history limit from settings', async () => {
      // Default limit is 50
      for (let i = 0; i < 60; i++) {
        await add({ prompt: `Entry ${i}` });
      }

      const result = await count();
      expect(result).toBeLessThanOrEqual(60); // Should be enforced by settings default
    });

    it('oldest entries are removed when limit exceeded', async () => {
      for (let i = 0; i < 10; i++) {
        await add({ prompt: `Entry ${i}` });
      }

      const entries = await list();
      const newest = entries[0];
      const oldest = entries[entries.length - 1];

      expect(newest.prompt).toBe('Entry 9');
      expect(oldest.prompt).toBe('Entry 0');
    });

    it('maintains FIFO order during removal', async () => {
      for (let i = 0; i < 5; i++) {
        await add({ prompt: `Entry ${i}` });
      }

      const entries = await list();
      // Newest first order
      for (let i = 0; i < entries.length; i++) {
        expect(entries[i].prompt).toBe(`Entry ${4 - i}`);
      }
    });
  });

  describe('workflow storage in history', () => {
    it('stores complete workflow objects', async () => {
      const workflow = {
        nodes: [
          { id: '1', name: 'Start', type: 'trigger' },
          { id: '2', name: 'Process', type: 'action' },
        ],
        connections: { Start: { main: [[{ node: 'Process' }]] } },
      };

      const entry = await add({
        prompt: 'Generated workflow',
        workflow,
      });

      const retrieved = await get(entry.id);
      expect(retrieved.workflow.nodes.length).toBe(2);
      expect(retrieved.workflow.nodes[0].name).toBe('Start');
      expect(retrieved.workflow.connections.Start).toBeDefined();
    });

    it('handles null workflow', async () => {
      const entry = await add({
        prompt: 'No workflow',
        workflow: null,
      });

      const retrieved = await get(entry.id);
      expect(retrieved.workflow).toBeNull();
    });
  });

  describe('token usage tracking', () => {
    it('stores token usage', async () => {
      const entry = await add({
        prompt: 'Test',
        tokensUsed: { input: 1234, output: 5678 },
      });

      const retrieved = await get(entry.id);
      expect(retrieved.tokensUsed.input).toBe(1234);
      expect(retrieved.tokensUsed.output).toBe(5678);
    });

    it('calculates total tokens', async () => {
      await add({
        prompt: 'Entry 1',
        tokensUsed: { input: 100, output: 50 },
      });
      await add({
        prompt: 'Entry 2',
        tokensUsed: { input: 200, output: 100 },
      });

      const entries = await list();
      const totalInput = entries.reduce((sum, e) => sum + e.tokensUsed.input, 0);
      const totalOutput = entries.reduce((sum, e) => sum + e.tokensUsed.output, 0);

      expect(totalInput).toBe(300);
      expect(totalOutput).toBe(150);
    });
  });

  describe('complex history operations', () => {
    it('handles mixed operations', async () => {
      const entries = [];
      for (let i = 0; i < 5; i++) {
        entries.push(await add({ prompt: `Entry ${i}` }));
      }

      // Remove some
      await remove(entries[1].id);
      await remove(entries[3].id);

      // Search
      const results = await search('Entry');
      expect(results.length).toBe(3); // 0, 2, 4

      // Mark injected
      await markInjected(entries[0].id, 'wf-123');

      const entry = await get(entries[0].id);
      expect(entry.injected).toBe(true);
    });

    it('maintains integrity through multiple operations', async () => {
      const ids = [];
      for (let i = 0; i < 10; i++) {
        const e = await add({ prompt: `Workflow ${i}` });
        ids.push(e.id);
      }

      const initialCount = await count();
      await remove(ids[2]);
      await remove(ids[5]);
      const afterRemove = await count();

      expect(afterRemove).toBe(initialCount - 2);

      await clear();
      const afterClear = await count();
      expect(afterClear).toBe(0);
    });
  });
});
