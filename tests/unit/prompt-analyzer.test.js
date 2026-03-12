/**
 * Prompt Analyzer — unit tests
 * Tests blueprint generation from natural language prompts.
 */

import { describe, it, expect } from 'vitest';
import * as analyzer from '../../lib/prompt-analyzer.js';

describe('prompt-analyzer', () => {
  describe('trigger detection', () => {
    it('should detect webhook trigger', () => {
      const bp = analyzer.analyze('When a webhook receives a POST request, process the data');
      expect(bp.trigger.type).toBe('n8n-nodes-base.webhook');
    });

    it('should detect schedule trigger', () => {
      const bp = analyzer.analyze('Every 5 minutes, check for new data');
      expect(bp.trigger.type).toBe('n8n-nodes-base.scheduleTrigger');
    });

    it('should detect schedule trigger with "daily"', () => {
      const bp = analyzer.analyze('Run daily report generation');
      expect(bp.trigger.type).toBe('n8n-nodes-base.scheduleTrigger');
    });

    it('should detect form trigger', () => {
      const bp = analyzer.analyze('Create a form where users can submit their details');
      expect(bp.trigger.type).toBe('n8n-nodes-base.formTrigger');
    });

    it('should detect RSS trigger', () => {
      const bp = analyzer.analyze('Monitor this RSS feed for new blog posts');
      expect(bp.trigger.type).toBe('n8n-nodes-base.rssFeedReadTrigger');
    });

    it('should detect Telegram trigger', () => {
      const bp = analyzer.analyze('When a Telegram message arrives, process it');
      expect(bp.trigger.type).toBe('n8n-nodes-base.telegramTrigger');
    });

    it('should default to manual trigger', () => {
      const bp = analyzer.analyze('Process some data and save results');
      expect(bp.trigger.type).toBe('n8n-nodes-base.manualTrigger');
    });
  });

  describe('node detection', () => {
    it('should detect HTTP request', () => {
      const bp = analyzer.analyze('Fetch data from an API endpoint');
      expect(bp.nodes.some(n => n.type === 'n8n-nodes-base.httpRequest')).toBe(true);
    });

    it('should detect code node', () => {
      const bp = analyzer.analyze('Use JavaScript to transform the data');
      expect(bp.nodes.some(n => n.type === 'n8n-nodes-base.code')).toBe(true);
    });

    it('should detect IF condition', () => {
      const bp = analyzer.analyze('If the status is active, send a notification');
      expect(bp.nodes.some(n => n.type === 'n8n-nodes-base.if')).toBe(true);
    });

    it('should detect Telegram', () => {
      const bp = analyzer.analyze('Send a message via Telegram bot');
      expect(bp.nodes.some(n => n.type === 'n8n-nodes-base.telegram')).toBe(true);
    });

    it('should detect Gmail', () => {
      const bp = analyzer.analyze('Send an email notification via Gmail');
      expect(bp.nodes.some(n => n.type === 'n8n-nodes-base.gmail')).toBe(true);
    });

    it('should detect Google Sheets', () => {
      const bp = analyzer.analyze('Read data from a Google Sheets spreadsheet');
      expect(bp.nodes.some(n => n.type === 'n8n-nodes-base.googleSheets')).toBe(true);
    });

    it('should detect OpenAI', () => {
      const bp = analyzer.analyze('Use OpenAI GPT to summarize the text');
      expect(bp.nodes.some(n => n.type === '@n8n/n8n-nodes-langchain.openAi')).toBe(true);
    });

    it('should detect multiple nodes', () => {
      const bp = analyzer.analyze('Fetch data from API, filter results, send via Telegram');
      expect(bp.nodes.length).toBeGreaterThanOrEqual(3);
    });

    // --- Additional platform detection tests ---

    it('should detect Slack', () => {
      const bp = analyzer.analyze('Send a Slack message to the team channel');
      expect(bp.nodes.some(n => n.type === 'n8n-nodes-base.slack')).toBe(true);
    });

    it('should detect Discord', () => {
      const bp = analyzer.analyze('Post a notification to Discord');
      expect(bp.nodes.some(n => n.type === 'n8n-nodes-base.discord')).toBe(true);
    });

    it('should detect HubSpot', () => {
      const bp = analyzer.analyze('Update contacts in HubSpot CRM');
      expect(bp.nodes.some(n => n.type === 'n8n-nodes-base.hubspot')).toBe(true);
    });

    it('should detect Trello', () => {
      const bp = analyzer.analyze('Create a card in Trello board');
      expect(bp.nodes.some(n => n.type === 'n8n-nodes-base.trello')).toBe(true);
    });

    it('should detect Supabase', () => {
      const bp = analyzer.analyze('Insert data into Supabase table');
      expect(bp.nodes.some(n => n.type === 'n8n-nodes-base.supabase')).toBe(true);
    });

    it('should detect Stripe', () => {
      const bp = analyzer.analyze('Process a Stripe payment webhook');
      expect(bp.nodes.some(n => n.type === 'n8n-nodes-base.stripe')).toBe(true);
    });

    it('should detect Twitter', () => {
      const bp = analyzer.analyze('Post a tweet on Twitter');
      expect(bp.nodes.some(n => n.type === 'n8n-nodes-base.twitter')).toBe(true);
    });

    it('should detect WhatsApp', () => {
      const bp = analyzer.analyze('Send a WhatsApp notification');
      expect(bp.nodes.some(n => n.type === 'n8n-nodes-base.whatsApp')).toBe(true);
    });

    it('should detect Shopify', () => {
      const bp = analyzer.analyze('Get new Shopify orders');
      expect(bp.nodes.some(n => n.type === 'n8n-nodes-base.shopify')).toBe(true);
    });

    it('should detect Ollama', () => {
      const bp = analyzer.analyze('Use Ollama local LLM for text generation');
      expect(bp.nodes.some(n => n.type === '@n8n/n8n-nodes-langchain.ollama')).toBe(true);
    });

    it('should detect AWS S3', () => {
      const bp = analyzer.analyze('Upload file to AWS S3 bucket');
      expect(bp.nodes.some(n => n.type === 'n8n-nodes-base.awsS3')).toBe(true);
    });

    it('should detect Google Calendar', () => {
      const bp = analyzer.analyze('Create an event in Google Calendar');
      expect(bp.nodes.some(n => n.type === 'n8n-nodes-base.googleCalendar')).toBe(true);
    });

    it('should detect Postgres', () => {
      const bp = analyzer.analyze('Query data from PostgreSQL database');
      expect(bp.nodes.some(n => n.type === 'n8n-nodes-base.postgres')).toBe(true);
    });

    it('should detect Redis', () => {
      const bp = analyzer.analyze('Cache results in Redis');
      expect(bp.nodes.some(n => n.type === 'n8n-nodes-base.redis')).toBe(true);
    });
  });

  describe('blueprint metadata', () => {
    it('should detect credentials needed', () => {
      const bp = analyzer.analyze('Send a Telegram message when webhook receives data');
      expect(bp.credentialsNeeded).toContain('telegramApi');
    });

    it('should calculate complexity', () => {
      const simple = analyzer.analyze('Manual trigger');
      expect(simple.complexity).toBe('simple');

      const complex = analyzer.analyze('Fetch API, filter, branch if condition, send Telegram, save to Airtable, email notification');
      expect(complex.complexity).toBe('complex');
    });

    it('should generate summary', () => {
      const bp = analyzer.analyze('Every hour, fetch data from API');
      expect(bp.summary).toBeTruthy();
      expect(bp.summary.length).toBeGreaterThan(0);
    });
  });

  describe('buildEnhancedPrompt', () => {
    it('should include relevant node schemas', () => {
      const bp = analyzer.analyze('Webhook trigger, filter data, send HTTP request');
      const enhanced = analyzer.buildEnhancedPrompt(bp, 'Base prompt here.');

      expect(enhanced).toContain('Base prompt here.');
      expect(enhanced).toContain('DETAILED PARAMETER SCHEMAS');
      expect(enhanced).toContain('n8n-nodes-base.webhook');
    });

    it('should not include schemas for non-core nodes', () => {
      const bp = analyzer.analyze('Read from Google Sheets');
      const enhanced = analyzer.buildEnhancedPrompt(bp, 'Base.');

      // Google Sheets is in index but not core
      expect(enhanced).toContain('Additional nodes referenced');
    });

    it('should work with empty blueprint', () => {
      const bp = { trigger: null, nodes: [], credentialsNeeded: [] };
      const enhanced = analyzer.buildEnhancedPrompt(bp, 'Base.');
      expect(enhanced).toContain('Base.');
    });
  });
});
