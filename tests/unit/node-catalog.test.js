/**
 * Node Catalog — unit tests
 * Tests schema completeness and lookups.
 */

import { describe, it, expect } from 'vitest';
import * as core from '../../lib/node-catalog-core.js';
import * as index from '../../lib/node-catalog-index.js';

describe('node-catalog-core', () => {
  it('should have at least 20 core nodes', () => {
    const types = core.listCoreTypes();
    expect(types.length).toBeGreaterThanOrEqual(20);
  });

  it('should return a node by type', () => {
    const node = core.getCoreNode('n8n-nodes-base.httpRequest');
    expect(node).not.toBeNull();
    expect(node.type).toBe('n8n-nodes-base.httpRequest');
    expect(node.category).toBe('http');
  });

  it('should return null for unknown type', () => {
    expect(core.getCoreNode('n8n-nodes-base.nonExistent')).toBeNull();
  });

  it('each core node should have required fields', () => {
    const all = core.getAllCoreNodes();
    for (const [type, node] of Object.entries(all)) {
      expect(node.type).toBe(type);
      expect(node.typeVersion).toBeTruthy();
      expect(node.category).toBeTruthy();
      expect(node.description).toBeTruthy();
      expect(node.defaultParameters).toBeDefined();
    }
  });

  it('should check if a type is core', () => {
    expect(core.isCoreNode('n8n-nodes-base.webhook')).toBe(true);
    expect(core.isCoreNode('n8n-nodes-base.unknownNode')).toBe(false);
  });

  it('should filter by category', () => {
    const triggers = core.getCoreNodesByCategory('trigger');
    expect(triggers.length).toBeGreaterThan(0);
    triggers.forEach(n => expect(n.category).toBe('trigger'));
  });

  it('should include key trigger nodes', () => {
    expect(core.isCoreNode('n8n-nodes-base.manualTrigger')).toBe(true);
    expect(core.isCoreNode('n8n-nodes-base.webhook')).toBe(true);
    expect(core.isCoreNode('n8n-nodes-base.scheduleTrigger')).toBe(true);
  });

  it('should include key data transformation nodes', () => {
    expect(core.isCoreNode('n8n-nodes-base.set')).toBe(true);
    expect(core.isCoreNode('n8n-nodes-base.code')).toBe(true);
    expect(core.isCoreNode('n8n-nodes-base.merge')).toBe(true);
  });

  it('should include key flow control nodes', () => {
    expect(core.isCoreNode('n8n-nodes-base.if')).toBe(true);
    expect(core.isCoreNode('n8n-nodes-base.switch')).toBe(true);
    expect(core.isCoreNode('n8n-nodes-base.filter')).toBe(true);
  });
});

describe('node-catalog-index', () => {
  it('should have at least 50 nodes', () => {
    const all = index.getAllNodes();
    expect(all.length).toBeGreaterThanOrEqual(50);
  });

  it('should find nodes by query', () => {
    const results = index.findNodes('telegram');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(n => n.type.includes('telegram'))).toBe(true);
  });

  it('should find nodes by category', () => {
    const results = index.findNodes('trigger');
    expect(results.length).toBeGreaterThan(0);
  });

  it('should get node by type', () => {
    const node = index.getNodeByType('n8n-nodes-base.httpRequest');
    expect(node).not.toBeNull();
    expect(node.name).toBe('HTTP Request');
  });

  it('should return null for unknown type', () => {
    expect(index.getNodeByType('nonexistent')).toBeNull();
  });

  it('should list categories', () => {
    const cats = index.getCategories();
    expect(cats).toHaveProperty('trigger');
    expect(cats).toHaveProperty('data');
    expect(cats).toHaveProperty('flow');
    expect(cats).toHaveProperty('http');
    expect(cats).toHaveProperty('communication');
  });

  it('should get nodes by category', () => {
    const triggers = index.getNodesByCategory('trigger');
    expect(triggers.length).toBeGreaterThan(0);
    triggers.forEach(n => expect(n.category).toBe('trigger'));
  });

  it('should build catalog summary', () => {
    const summary = index.buildCatalogSummary();
    expect(summary).toContain('TRIGGER');
    expect(summary).toContain('DATA');
    expect(summary).toContain('FLOW');
    expect(summary).toContain('HTTP Request');
  });

  it('each indexed node should have required fields', () => {
    const all = index.getAllNodes();
    for (const node of all) {
      expect(node.type).toBeTruthy();
      expect(node.name).toBeTruthy();
      expect(node.category).toBeTruthy();
      expect(node.description).toBeTruthy();
    }
  });
});
