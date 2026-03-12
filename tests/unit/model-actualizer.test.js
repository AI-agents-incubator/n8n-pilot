/**
 * Tests for model-actualizer.js
 * Tests AI model deprecation mapping and actualization.
 */

import { describe, it, expect } from 'vitest';
import {
  actualizeModelId,
  isDeprecatedModel,
  actualizeNode,
  getCurrentModels,
  getDefaultModel,
} from '../../lib/model-actualizer.js';

describe('model-actualizer', () => {
  describe('actualizeModelId', () => {
    it('maps deprecated OpenAI models to gpt-4.1-nano', () => {
      const deprecated = ['gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini', 'chatgpt-4o-latest'];
      for (const model of deprecated) {
        expect(actualizeModelId(model, '@n8n/n8n-nodes-langchain.openAi')).toBe('gpt-4.1-nano');
      }
    });

    it('maps deprecated Gemini models to models/gemini-2.5-flash', () => {
      const deprecated = [
        'gemini-pro', 'gemini-1.5-flash', 'gemini-1.5-pro',
        'gemini-2.0-flash', 'gemini-2.0-flash-exp',
        'models/gemini-2.0-flash', 'models/gemini-2.0-flash-exp',
      ];
      for (const model of deprecated) {
        expect(actualizeModelId(model, '@n8n/n8n-nodes-langchain.googleGemini')).toBe('models/gemini-2.5-flash');
      }
    });

    it('returns null for already-current models', () => {
      expect(actualizeModelId('gpt-4.1-nano', '@n8n/n8n-nodes-langchain.openAi')).toBeNull();
      expect(actualizeModelId('gpt-4.1-mini', '@n8n/n8n-nodes-langchain.openAi')).toBeNull();
      expect(actualizeModelId('models/gemini-2.5-flash', '@n8n/n8n-nodes-langchain.googleGemini')).toBeNull();
    });

    it('returns null for unknown node types', () => {
      expect(actualizeModelId('gpt-4', 'n8n-nodes-base.code')).toBeNull();
    });

    it('returns null for empty/null values', () => {
      expect(actualizeModelId('', '@n8n/n8n-nodes-langchain.openAi')).toBeNull();
      expect(actualizeModelId(null, '@n8n/n8n-nodes-langchain.openAi')).toBeNull();
    });
  });

  describe('isDeprecatedModel', () => {
    it('returns true for deprecated models', () => {
      expect(isDeprecatedModel('gpt-4o', '@n8n/n8n-nodes-langchain.openAi')).toBe(true);
      expect(isDeprecatedModel('gemini-2.0-flash-exp', '@n8n/n8n-nodes-langchain.googleGemini')).toBe(true);
    });

    it('returns false for current models', () => {
      expect(isDeprecatedModel('gpt-4.1-nano', '@n8n/n8n-nodes-langchain.openAi')).toBe(false);
      expect(isDeprecatedModel('models/gemini-2.5-flash', '@n8n/n8n-nodes-langchain.googleGemini')).toBe(false);
    });
  });

  describe('actualizeNode', () => {
    it('fixes __rl Resource Locator pattern for OpenAI', () => {
      const node = {
        type: '@n8n/n8n-nodes-langchain.openAi',
        parameters: {
          modelId: {
            __rl: true,
            value: 'gpt-4o',
            mode: 'list',
            cachedResultName: 'GPT-4O',
          },
        },
      };
      actualizeNode(node);
      expect(node.parameters.modelId.value).toBe('gpt-4.1-nano');
      expect(node.parameters.modelId.cachedResultName).toBe('gpt-4.1-nano');
    });

    it('fixes __rl Resource Locator pattern for Gemini', () => {
      const node = {
        type: '@n8n/n8n-nodes-langchain.googleGemini',
        parameters: {
          modelId: {
            __rl: true,
            value: 'gemini-2.0-flash-exp',
            mode: 'list',
            cachedResultName: 'gemini-2.0-flash-exp',
          },
        },
      };
      actualizeNode(node);
      expect(node.parameters.modelId.value).toBe('models/gemini-2.5-flash');
      expect(node.parameters.modelId.cachedResultName).toBe('models/gemini-2.5-flash');
    });

    it('handles bare string model values', () => {
      const node = {
        type: '@n8n/n8n-nodes-langchain.openAi',
        parameters: {
          modelId: 'chatgpt-4o-latest',
        },
      };
      actualizeNode(node);
      expect(node.parameters.modelId).toBe('gpt-4.1-nano');
    });

    it('leaves current models unchanged', () => {
      const node = {
        type: '@n8n/n8n-nodes-langchain.openAi',
        parameters: {
          modelId: {
            __rl: true,
            value: 'gpt-4.1-nano',
            mode: 'list',
            cachedResultName: 'gpt-4.1-nano',
          },
        },
      };
      actualizeNode(node);
      expect(node.parameters.modelId.value).toBe('gpt-4.1-nano');
    });

    it('skips non-AI nodes', () => {
      const node = {
        type: 'n8n-nodes-base.code',
        parameters: { jsCode: 'console.log("hello")' },
      };
      actualizeNode(node);
      expect(node.parameters.jsCode).toBe('console.log("hello")');
    });

    it('handles nodes without parameters', () => {
      const node = { type: '@n8n/n8n-nodes-langchain.openAi' };
      expect(() => actualizeNode(node)).not.toThrow();
    });

    it('handles model field on "model" key (pre-normalization)', () => {
      const node = {
        type: '@n8n/n8n-nodes-langchain.openAi',
        parameters: {
          model: {
            __rl: true,
            value: 'gpt-4-turbo',
            mode: 'list',
            cachedResultName: 'GPT-4-TURBO',
          },
        },
      };
      actualizeNode(node);
      expect(node.parameters.model.value).toBe('gpt-4.1-nano');
    });
  });

  describe('getCurrentModels', () => {
    it('returns models for openai and gemini', () => {
      const models = getCurrentModels();
      expect(models.openai).toBeInstanceOf(Array);
      expect(models.gemini).toBeInstanceOf(Array);
      expect(models.openai.length).toBeGreaterThan(0);
      expect(models.gemini.length).toBeGreaterThan(0);
    });

    it('each model has id, label, and tier', () => {
      const models = getCurrentModels();
      for (const model of [...models.openai, ...models.gemini]) {
        expect(model).toHaveProperty('id');
        expect(model).toHaveProperty('label');
        expect(model).toHaveProperty('tier');
      }
    });

    it('returns a clone (mutations do not affect source)', () => {
      const m1 = getCurrentModels();
      m1.openai.push({ id: 'test', label: 'test', tier: 'test' });
      const m2 = getCurrentModels();
      expect(m2.openai.length).toBeLessThan(m1.openai.length);
    });
  });

  describe('getDefaultModel', () => {
    it('returns gpt-4.1-nano for OpenAI', () => {
      expect(getDefaultModel('@n8n/n8n-nodes-langchain.openAi')).toBe('gpt-4.1-nano');
    });

    it('returns models/gemini-2.5-flash for Gemini', () => {
      expect(getDefaultModel('@n8n/n8n-nodes-langchain.googleGemini')).toBe('models/gemini-2.5-flash');
    });

    it('returns null for unknown node type', () => {
      expect(getDefaultModel('n8n-nodes-base.code')).toBeNull();
    });
  });
});
