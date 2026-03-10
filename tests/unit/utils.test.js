/**
 * Tests for utils.js
 * Tests shared utility functions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  uuid,
  now,
  sleep,
  safeJsonParse,
  extractJson,
  truncate,
  timeAgo,
  formatTokens,
  debounce,
  sanitize,
} from '../../lib/utils.js';

describe('utils', () => {
  describe('uuid', () => {
    it('generates a valid UUID v4', () => {
      const id = uuid();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('generates different UUIDs on each call', () => {
      const id1 = uuid();
      const id2 = uuid();
      expect(id1).not.toBe(id2);
    });

    it('generates multiple unique UUIDs', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(uuid());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('now', () => {
    it('returns current ISO timestamp', () => {
      const timestamp = now();
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('returns timestamp close to current time', () => {
      const before = Date.now();
      const timestamp = now();
      const after = Date.now();

      const time = new Date(timestamp).getTime();
      expect(time).toBeGreaterThanOrEqual(before - 100);
      expect(time).toBeLessThanOrEqual(after + 100);
    });
  });

  describe('sleep', () => {
    it('resolves after specified milliseconds', async () => {
      const before = Date.now();
      await sleep(100);
      const after = Date.now();

      expect(after - before).toBeGreaterThanOrEqual(90);
    });

    it('can be awaited in async function', async () => {
      const result = await Promise.resolve()
        .then(() => sleep(50))
        .then(() => 'done');

      expect(result).toBe('done');
    });
  });

  describe('safeJsonParse', () => {
    it('parses valid JSON', () => {
      const result = safeJsonParse('{"key": "value"}');
      expect(result).toEqual({ key: 'value' });
    });

    it('parses JSON array', () => {
      const result = safeJsonParse('[1, 2, 3]');
      expect(result).toEqual([1, 2, 3]);
    });

    it('parses JSON with numbers', () => {
      const result = safeJsonParse('{"count": 42}');
      expect(result).toEqual({ count: 42 });
    });

    it('parses JSON with booleans', () => {
      const result = safeJsonParse('{"active": true, "deleted": false}');
      expect(result).toEqual({ active: true, deleted: false });
    });

    it('parses JSON with null', () => {
      const result = safeJsonParse('{"value": null}');
      expect(result).toEqual({ value: null });
    });

    it('returns null for invalid JSON', () => {
      const result = safeJsonParse('not json');
      expect(result).toBeNull();
    });

    it('returns null for malformed JSON', () => {
      const result = safeJsonParse('{"key": "value"');
      expect(result).toBeNull();
    });

    it('returns null for empty string', () => {
      const result = safeJsonParse('');
      expect(result).toBeNull();
    });

    it('trims whitespace before parsing', () => {
      const result = safeJsonParse('  {"key": "value"}  ');
      expect(result).toEqual({ key: 'value' });
    });
  });

  describe('extractJson', () => {
    it('extracts plain JSON object', () => {
      const result = extractJson('{"name": "test"}');
      expect(result).toEqual({ name: 'test' });
    });

    it('extracts plain JSON array', () => {
      const result = extractJson('[1, 2, 3]');
      expect(result).toEqual([1, 2, 3]);
    });

    it('extracts JSON from markdown code block', () => {
      const text = 'Here is the JSON:\n```json\n{"id": 123}\n```\nEnd';
      const result = extractJson(text);
      expect(result).toEqual({ id: 123 });
    });

    it('extracts JSON from markdown code block without json label', () => {
      const text = 'Here is the result:\n```\n{"status": "ok"}\n```';
      const result = extractJson(text);
      expect(result).toEqual({ status: 'ok' });
    });

    it('extracts JSON from text with extra content', () => {
      const text = 'Some explanation text\n{"name": "value"}\nMore text after';
      const result = extractJson(text);
      expect(result).toEqual({ name: 'value' });
    });

    it('extracts first JSON object when multiple present', () => {
      const text = '{"first": 1}\nsome text\n{"second": 2}';
      const result = extractJson(text);
      expect(result).toEqual({ first: 1 });
    });

    it('extracts array when it appears first', () => {
      const text = '[1, 2, 3]\nsome text\n{"object": true}';
      const result = extractJson(text);
      expect(result).toEqual([1, 2, 3]);
    });

    it('handles nested JSON structures', () => {
      const text = 'Result: {"data": {"nested": {"deep": "value"}}}';
      const result = extractJson(text);
      expect(result).toEqual({ data: { nested: { deep: 'value' } } });
    });

    it('handles JSON with escaped quotes', () => {
      const text = '{"message": "He said \\"hello\\""}';
      const result = extractJson(text);
      expect(result).toEqual({ message: 'He said "hello"' });
    });

    it('returns null for non-JSON text', () => {
      const result = extractJson('No JSON here at all');
      expect(result).toBeNull();
    });

    it('returns null for empty string', () => {
      const result = extractJson('');
      expect(result).toBeNull();
    });

    it('returns null for null input', () => {
      const result = extractJson(null);
      expect(result).toBeNull();
    });

    it('returns null for non-string input', () => {
      const result = extractJson(123);
      expect(result).toBeNull();
    });

    it('handles JSON with nested arrays', () => {
      const text = '{"items": [{"id": 1}, {"id": 2}]}';
      const result = extractJson(text);
      expect(result).toEqual({ items: [{ id: 1 }, { id: 2 }] });
    });

    it('handles mixed markdown code block with explanation', () => {
      const text = 'Generated workflow:\n```json\n{"nodes": []}\n```\nReady to use';
      const result = extractJson(text);
      expect(result).toEqual({ nodes: [] });
    });
  });

  describe('truncate', () => {
    it('does not truncate short strings', () => {
      const text = 'Hello World';
      const result = truncate(text, 50);
      expect(result).toBe('Hello World');
    });

    it('truncates long strings with ellipsis', () => {
      const text = 'a'.repeat(150);
      const result = truncate(text, 50);
      expect(result).toBe('a'.repeat(47) + '...');
      expect(result.length).toBe(50);
    });

    it('uses default max length of 100', () => {
      const text = 'a'.repeat(150);
      const result = truncate(text);
      expect(result.length).toBe(100);
      expect(result.endsWith('...')).toBe(true);
    });

    it('handles exact length strings', () => {
      const text = 'a'.repeat(100);
      const result = truncate(text, 100);
      expect(result).toBe(text);
    });

    it('handles null input', () => {
      const result = truncate(null, 50);
      expect(result).toBeNull();
    });

    it('handles empty string', () => {
      const result = truncate('', 50);
      expect(result).toBe('');
    });

    it('preserves meaningful content before ellipsis', () => {
      const text = 'This is important content that we want to keep';
      const result = truncate(text, 20);
      expect(result).toBe('This is important...');
    });
  });

  describe('timeAgo', () => {
    it('shows "just now" for recent timestamps', () => {
      const recent = new Date(Date.now() - 30 * 1000).toISOString();
      const result = timeAgo(recent);
      expect(result).toBe('just now');
    });

    it('shows minutes ago', () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const result = timeAgo(fiveMinutesAgo);
      expect(result).toBe('5m ago');
    });

    it('shows hours ago', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
      const result = timeAgo(twoHoursAgo);
      expect(result).toBe('2h ago');
    });

    it('shows days ago', () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 86400 * 1000).toISOString();
      const result = timeAgo(threeDaysAgo);
      expect(result).toBe('3d ago');
    });

    it('shows date for older timestamps', () => {
      const twoWeeksAgo = new Date(Date.now() - 14 * 86400 * 1000).toISOString();
      const result = timeAgo(twoWeeksAgo);
      expect(result).toMatch(/\d+\/\d+\/\d+/);
    });

    it('handles different timezone timestamps', () => {
      const timestamp = '2025-01-15T10:30:00Z';
      const result = timeAgo(timestamp);
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  describe('formatTokens', () => {
    it('returns string for counts under 1000', () => {
      expect(formatTokens(100)).toBe('100');
      expect(formatTokens(999)).toBe('999');
    });

    it('formats thousands with k', () => {
      expect(formatTokens(1000)).toBe('1.0k');
      expect(formatTokens(1500)).toBe('1.5k');
    });

    it('formats large numbers correctly', () => {
      expect(formatTokens(5000)).toBe('5.0k');
      expect(formatTokens(12340)).toBe('12.3k');
    });

    it('handles zero', () => {
      expect(formatTokens(0)).toBe('0');
    });

    it('handles edge case 999 vs 1000', () => {
      expect(formatTokens(999)).toBe('999');
      expect(formatTokens(1000)).toBe('1.0k');
    });
  });

  describe('debounce', () => {
    it('delays function execution', async () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 50);

      debounced('arg1');
      expect(fn).not.toHaveBeenCalled();

      await sleep(60);
      expect(fn).toHaveBeenCalledWith('arg1');
    });

    it('cancels previous execution on new call', async () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 50);

      debounced('arg1');
      await sleep(30);
      debounced('arg2');

      await sleep(60);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('arg2');
    });

    it('uses default delay of 300ms', async () => {
      const fn = vi.fn();
      const debounced = debounce(fn);

      debounced('test');
      await sleep(100);
      expect(fn).not.toHaveBeenCalled();

      await sleep(250);
      expect(fn).toHaveBeenCalled();
    });

    it('handles multiple arguments', async () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 50);

      debounced('arg1', 'arg2', 'arg3');
      await sleep(60);

      expect(fn).toHaveBeenCalledWith('arg1', 'arg2', 'arg3');
    });
  });

  describe('sanitize', () => {
    it('removes control characters', () => {
      const text = 'Hello\x00World\x01Test';
      const result = sanitize(text);
      expect(result).toBe('HelloWorldTest');
    });

    it('preserves newlines', () => {
      const text = 'Line 1\nLine 2\nLine 3';
      const result = sanitize(text);
      expect(result).toBe('Line 1\nLine 2\nLine 3');
    });

    it('preserves tabs', () => {
      const text = 'Start\tMiddle\tEnd';
      const result = sanitize(text);
      expect(result).toBe('Start\tMiddle\tEnd');
    });

    it('removes high control characters', () => {
      const text = 'Valid\x7FInvalid';
      const result = sanitize(text);
      expect(result).toBe('ValidInvalid');
    });

    it('preserves regular text', () => {
      const text = 'This is regular text with numbers 123 and symbols !@#$';
      const result = sanitize(text);
      expect(result).toBe(text);
    });

    it('preserves unicode characters', () => {
      const text = 'Hello 世界 مرحبا';
      const result = sanitize(text);
      expect(result).toBe(text);
    });

    it('handles empty string', () => {
      const result = sanitize('');
      expect(result).toBe('');
    });

    it('handles non-string input', () => {
      expect(sanitize(null)).toBe('');
      expect(sanitize(undefined)).toBe('');
      expect(sanitize(123)).toBe('');
    });

    it('removes DEL character', () => {
      const text = 'Before\x7FAfter';
      const result = sanitize(text);
      expect(result).toBe('BeforeAfter');
    });

    it('removes escape sequence control chars', () => {
      const text = 'Text\x1B[31mRed\x1B[0m';
      const result = sanitize(text);
      // \x1B (ESC) is removed but [31m and [0m are printable chars
      expect(result).toBe('Text[31mRed[0m');
    });
  });
});
