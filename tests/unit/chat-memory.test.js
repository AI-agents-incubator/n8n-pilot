/**
 * Chat Memory — unit tests
 * Tests CRUD operations, FIFO eviction, workflow isolation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setStorageData, getStorageData } from './setup.js';

// Import chat-memory module
import * as chatMemory from '../../panel/chat-memory.js';

describe('chat-memory', () => {
  beforeEach(() => {
    setStorageData({});
  });

  describe('addMessage', () => {
    it('should add a message to default context', async () => {
      await chatMemory.addMessage(null, { role: 'user', content: 'hello' });
      const messages = await chatMemory.getMessages(null);
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('hello');
    });

    it('should add a message to specific workflow context', async () => {
      await chatMemory.addMessage('wf-123', { role: 'user', content: 'test' });
      const messages = await chatMemory.getMessages('wf-123');
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('test');
    });

    it('should include timestamp', async () => {
      await chatMemory.addMessage('wf-1', { role: 'user', content: 'hi' });
      const messages = await chatMemory.getMessages('wf-1');
      expect(messages[0].timestamp).toBeTruthy();
      expect(() => new Date(messages[0].timestamp)).not.toThrow();
    });

    it('should preserve metadata', async () => {
      await chatMemory.addMessage('wf-1', {
        role: 'assistant',
        content: 'response',
        metadata: { tokensUsed: 100, model: 'claude-sonnet' },
      });
      const messages = await chatMemory.getMessages('wf-1');
      expect(messages[0].metadata.tokensUsed).toBe(100);
      expect(messages[0].metadata.model).toBe('claude-sonnet');
    });
  });

  describe('getMessages', () => {
    it('should return empty array for unknown context', async () => {
      const messages = await chatMemory.getMessages('unknown');
      expect(messages).toEqual([]);
    });

    it('should return messages in order', async () => {
      await chatMemory.addMessage('wf-1', { role: 'user', content: 'first' });
      await chatMemory.addMessage('wf-1', { role: 'assistant', content: 'second' });
      await chatMemory.addMessage('wf-1', { role: 'user', content: 'third' });

      const messages = await chatMemory.getMessages('wf-1');
      expect(messages).toHaveLength(3);
      expect(messages[0].content).toBe('first');
      expect(messages[1].content).toBe('second');
      expect(messages[2].content).toBe('third');
    });
  });

  describe('clearMessages', () => {
    it('should clear messages for a specific context', async () => {
      await chatMemory.addMessage('wf-1', { role: 'user', content: 'hello' });
      await chatMemory.addMessage('wf-2', { role: 'user', content: 'world' });

      await chatMemory.clearMessages('wf-1');

      const wf1 = await chatMemory.getMessages('wf-1');
      const wf2 = await chatMemory.getMessages('wf-2');
      expect(wf1).toEqual([]);
      expect(wf2).toHaveLength(1);
    });
  });

  describe('clearAll', () => {
    it('should clear all chat memory', async () => {
      await chatMemory.addMessage('wf-1', { role: 'user', content: 'a' });
      await chatMemory.addMessage('wf-2', { role: 'user', content: 'b' });

      await chatMemory.clearAll();

      const wf1 = await chatMemory.getMessages('wf-1');
      const wf2 = await chatMemory.getMessages('wf-2');
      expect(wf1).toEqual([]);
      expect(wf2).toEqual([]);
    });
  });

  describe('listContexts', () => {
    it('should list all workflow contexts', async () => {
      await chatMemory.addMessage('wf-1', { role: 'user', content: 'a' });
      await chatMemory.addMessage('wf-2', { role: 'user', content: 'b' });
      await chatMemory.addMessage(null, { role: 'user', content: 'c' });

      const contexts = await chatMemory.listContexts();
      expect(contexts).toContain('wf-1');
      expect(contexts).toContain('wf-2');
      expect(contexts).toContain('default');
    });
  });

  describe('FIFO eviction', () => {
    it('should keep only last 100 messages', async () => {
      // Add 105 messages
      for (let i = 0; i < 105; i++) {
        await chatMemory.addMessage('wf-1', { role: 'user', content: `msg-${i}` });
      }

      const messages = await chatMemory.getMessages('wf-1');
      expect(messages).toHaveLength(100);
      // First message should be msg-5 (first 5 evicted)
      expect(messages[0].content).toBe('msg-5');
      expect(messages[99].content).toBe('msg-104');
    });
  });

  describe('workflow isolation', () => {
    it('should isolate messages between workflows', async () => {
      await chatMemory.addMessage('wf-A', { role: 'user', content: 'alpha' });
      await chatMemory.addMessage('wf-B', { role: 'user', content: 'beta' });

      const a = await chatMemory.getMessages('wf-A');
      const b = await chatMemory.getMessages('wf-B');

      expect(a).toHaveLength(1);
      expect(a[0].content).toBe('alpha');
      expect(b).toHaveLength(1);
      expect(b[0].content).toBe('beta');
    });
  });
});
