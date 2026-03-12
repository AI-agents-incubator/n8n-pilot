import { describe, it, expect } from 'vitest';
import { validate } from '../../lib/preflight.js';

describe('preflight', () => {

  describe('question generation', () => {
    it('generates chatId question for Telegram node', () => {
      const blueprint = {
        trigger: { type: 'n8n-nodes-base.manualTrigger', name: 'Manual Trigger' },
        nodes: [{ type: 'n8n-nodes-base.telegram', name: 'Telegram', role: 'action' }],
        complexity: 'simple',
      };
      const result = validate(blueprint, 'Send a message via Telegram');

      expect(result.complete).toBe(false);
      expect(result.questions.length).toBe(1);
      expect(result.questions[0].field).toBe('chatId');
      expect(result.questions[0].nodeType).toBe('n8n-nodes-base.telegram');
      expect(result.questions[0].nodeName).toBe('Telegram');
    });

    it('generates url question for HTTP Request node', () => {
      const blueprint = {
        trigger: { type: 'n8n-nodes-base.scheduleTrigger', name: 'Schedule Trigger' },
        nodes: [{ type: 'n8n-nodes-base.httpRequest', name: 'HTTP Request', role: 'action' }],
        complexity: 'simple',
      };
      const result = validate(blueprint, 'Fetch data periodically');

      expect(result.complete).toBe(false);
      expect(result.questions.some(q => q.field === 'url')).toBe(true);
    });

    it('generates recipient question for Gmail node', () => {
      const blueprint = {
        trigger: { type: 'n8n-nodes-base.manualTrigger', name: 'Manual Trigger' },
        nodes: [{ type: 'n8n-nodes-base.gmail', name: 'Gmail', role: 'action' }],
        complexity: 'simple',
      };
      const result = validate(blueprint, 'Send an email notification');

      expect(result.complete).toBe(false);
      expect(result.questions.some(q => q.field === 'sendTo')).toBe(true);
    });

    it('generates interval question for Schedule Trigger', () => {
      const blueprint = {
        trigger: { type: 'n8n-nodes-base.scheduleTrigger', name: 'Schedule Trigger' },
        nodes: [{ type: 'n8n-nodes-base.code', name: 'Code' }],
        complexity: 'simple',
      };
      const result = validate(blueprint, 'Run some code on schedule');

      expect(result.complete).toBe(false);
      expect(result.questions.some(q => q.field === 'interval')).toBe(true);
    });

    it('generates channel question for Slack node', () => {
      const blueprint = {
        trigger: { type: 'n8n-nodes-base.manualTrigger', name: 'Manual Trigger' },
        nodes: [{ type: 'n8n-nodes-base.slack', name: 'Slack', role: 'action' }],
        complexity: 'simple',
      };
      const result = validate(blueprint, 'Post a message to Slack');

      expect(result.complete).toBe(false);
      expect(result.questions.some(q => q.field === 'channel')).toBe(true);
    });

    it('generates multiple questions for multi-node workflow', () => {
      const blueprint = {
        trigger: { type: 'n8n-nodes-base.scheduleTrigger', name: 'Schedule Trigger' },
        nodes: [
          { type: 'n8n-nodes-base.httpRequest', name: 'HTTP Request', role: 'action' },
          { type: 'n8n-nodes-base.telegram', name: 'Telegram', role: 'action' },
        ],
        complexity: 'moderate',
      };
      const result = validate(blueprint, 'Fetch data and send to Telegram');

      expect(result.complete).toBe(false);
      // At least: interval, url, chatId
      expect(result.questions.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('prompt scanning (info already provided)', () => {
    it('skips chatId question when chat ID present in prompt', () => {
      const blueprint = {
        trigger: { type: 'n8n-nodes-base.manualTrigger', name: 'Manual Trigger' },
        nodes: [{ type: 'n8n-nodes-base.telegram', name: 'Telegram', role: 'action' }],
        complexity: 'simple',
      };
      const result = validate(blueprint, 'Send message to chat_id -1001234567890 via Telegram');

      expect(result.complete).toBe(true);
      expect(result.questions.length).toBe(0);
    });

    it('detects @channel as Telegram chat ID', () => {
      const blueprint = {
        trigger: { type: 'n8n-nodes-base.manualTrigger', name: 'Manual Trigger' },
        nodes: [{ type: 'n8n-nodes-base.telegram', name: 'Telegram', role: 'action' }],
        complexity: 'simple',
      };
      const result = validate(blueprint, 'Send message to @mychannel via Telegram');

      expect(result.complete).toBe(true);
    });

    it('skips url question when URL present in prompt', () => {
      const blueprint = {
        trigger: { type: 'n8n-nodes-base.manualTrigger', name: 'Manual Trigger' },
        nodes: [{ type: 'n8n-nodes-base.httpRequest', name: 'HTTP Request', role: 'action' }],
        complexity: 'simple',
      };
      const result = validate(blueprint, 'Fetch data from https://api.example.com/users');

      expect(result.complete).toBe(true);
      expect(result.questions.length).toBe(0);
    });

    it('skips email question when email present in prompt', () => {
      const blueprint = {
        trigger: { type: 'n8n-nodes-base.manualTrigger', name: 'Manual Trigger' },
        nodes: [{ type: 'n8n-nodes-base.gmail', name: 'Gmail', role: 'action' }],
        complexity: 'simple',
      };
      const result = validate(blueprint, 'Send email to admin@company.com about the report');

      expect(result.complete).toBe(true);
    });

    it('skips schedule question when interval present in prompt', () => {
      const blueprint = {
        trigger: { type: 'n8n-nodes-base.scheduleTrigger', name: 'Schedule Trigger' },
        nodes: [],
        complexity: 'simple',
      };
      const result = validate(blueprint, 'Run every 5 minutes to check status');

      expect(result.complete).toBe(true);
    });

    it('skips schedule question for "daily" keyword', () => {
      const blueprint = {
        trigger: { type: 'n8n-nodes-base.scheduleTrigger', name: 'Schedule Trigger' },
        nodes: [],
        complexity: 'simple',
      };
      const result = validate(blueprint, 'Run daily report generation');

      expect(result.complete).toBe(true);
    });

    it('partial match: URL provided but chatId missing', () => {
      const blueprint = {
        trigger: { type: 'n8n-nodes-base.scheduleTrigger', name: 'Schedule Trigger' },
        nodes: [
          { type: 'n8n-nodes-base.httpRequest', name: 'HTTP Request' },
          { type: 'n8n-nodes-base.telegram', name: 'Telegram' },
        ],
        complexity: 'moderate',
      };
      const result = validate(
        blueprint,
        'Every 5 minutes fetch https://api.example.com and send to Telegram'
      );

      expect(result.complete).toBe(false);
      // Only chatId should be missing (interval + url already in prompt)
      expect(result.questions.length).toBe(1);
      expect(result.questions[0].field).toBe('chatId');
    });

    it('detects Slack channel with # prefix', () => {
      const blueprint = {
        trigger: { type: 'n8n-nodes-base.manualTrigger', name: 'Manual Trigger' },
        nodes: [{ type: 'n8n-nodes-base.slack', name: 'Slack' }],
        complexity: 'simple',
      };
      const result = validate(blueprint, 'Post alert to #devops channel');

      expect(result.complete).toBe(true);
    });
  });

  describe('summary generation', () => {
    it('generates summary with trigger and nodes', () => {
      const blueprint = {
        trigger: { type: 'n8n-nodes-base.webhook', name: 'Webhook' },
        nodes: [
          { type: 'n8n-nodes-base.httpRequest', name: 'HTTP Request' },
          { type: 'n8n-nodes-base.telegram', name: 'Telegram' },
        ],
        complexity: 'moderate',
      };
      const result = validate(blueprint, 'test prompt');

      expect(result.summary).toBe('Webhook → HTTP Request → Telegram');
    });

    it('generates summary with trigger only', () => {
      const blueprint = {
        trigger: { type: 'n8n-nodes-base.manualTrigger', name: 'Manual Trigger' },
        nodes: [],
        complexity: 'simple',
      };
      const result = validate(blueprint, 'test');

      expect(result.summary).toBe('Manual Trigger');
    });
  });

  describe('edge cases', () => {
    it('returns complete=true for empty nodes list', () => {
      const blueprint = {
        trigger: { type: 'n8n-nodes-base.manualTrigger', name: 'Manual Trigger' },
        nodes: [],
        complexity: 'simple',
      };
      const result = validate(blueprint, 'Just trigger something');

      expect(result.complete).toBe(true);
      expect(result.questions.length).toBe(0);
    });

    it('handles nodes not in context map gracefully', () => {
      const blueprint = {
        trigger: { type: 'n8n-nodes-base.manualTrigger', name: 'Manual Trigger' },
        nodes: [{ type: 'n8n-nodes-base.code', name: 'Code' }],
        complexity: 'simple',
      };
      const result = validate(blueprint, 'Run some code');

      expect(result.complete).toBe(true);
      expect(result.questions.length).toBe(0);
    });

    it('handles null blueprint gracefully', () => {
      const result = validate(null, 'some prompt');

      expect(result.complete).toBe(true);
      expect(result.questions.length).toBe(0);
    });

    it('handles null prompt gracefully', () => {
      const result = validate({}, null);

      expect(result.complete).toBe(true);
    });

    it('handles null trigger gracefully', () => {
      const blueprint = {
        trigger: null,
        nodes: [{ type: 'n8n-nodes-base.telegram', name: 'Telegram' }],
        complexity: 'simple',
      };
      const result = validate(blueprint, 'Send telegram');

      expect(result.complete).toBe(false);
      expect(result.questions.length).toBe(1);
    });

    it('does not duplicate questions for same node type', () => {
      const blueprint = {
        trigger: { type: 'n8n-nodes-base.telegramTrigger', name: 'Telegram Trigger' },
        nodes: [{ type: 'n8n-nodes-base.telegram', name: 'Telegram' }],
        complexity: 'simple',
      };
      const result = validate(blueprint, 'Telegram bot echo');

      // telegramTrigger has empty fields[], telegram has chatId
      const chatIdQuestions = result.questions.filter(q => q.field === 'chatId');
      expect(chatIdQuestions.length).toBeLessThanOrEqual(1);
    });

    it('question includes placeholder and label', () => {
      const blueprint = {
        trigger: { type: 'n8n-nodes-base.manualTrigger', name: 'Manual Trigger' },
        nodes: [{ type: 'n8n-nodes-base.telegram', name: 'Telegram' }],
        complexity: 'simple',
      };
      const result = validate(blueprint, 'Send Telegram message');

      expect(result.questions[0].label).toBe('Telegram Chat ID');
      expect(result.questions[0].placeholder).toContain('-100');
    });
  });
});
