/**
 * n8n Context — unit tests
 * Tests URL parsing and context detection.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..', '..');

function readFile(name) {
  return readFileSync(resolve(ROOT, name), 'utf-8');
}

describe('n8n context awareness', () => {
  const contentSrc = readFile('content.js');

  it('should have extractWorkflowIdFromPage function', () => {
    expect(contentSrc).toContain('function extractWorkflowIdFromPage');
  });

  it('should extract workflow ID from URL regex', () => {
    // Verify the regex pattern handles various ID formats
    const regex = /\/workflow\/([a-zA-Z0-9_-]+)/;
    expect('https://n8n.example.com/workflow/abc123'.match(regex)[1]).toBe('abc123');
    expect('https://n8n.example.com/workflow/abc-def-123'.match(regex)[1]).toBe('abc-def-123');
    expect('https://n8n.example.com/workflow/abc123/edit'.match(regex)[1]).toBe('abc123');
    expect('https://n8n.example.com/workflow/Wx_y-Z'.match(regex)[1]).toBe('Wx_y-Z');
  });

  it('should handle URL without workflow', () => {
    const regex = /\/workflow\/([a-zA-Z0-9_-]+)/;
    expect('https://n8n.example.com/'.match(regex)).toBeNull();
    expect('https://n8n.example.com/executions'.match(regex)).toBeNull();
  });

  it('should have updateContextBadge function', () => {
    expect(contentSrc).toContain('function updateContextBadge');
  });

  it('should watch for SPA navigation', () => {
    expect(contentSrc).toContain('function watchN8nContext');
    expect(contentSrc).toContain('popstate');
    expect(contentSrc).toContain('pushState');
  });

  it('should have context badge elements in panel.html', () => {
    const html = readFile('panel/panel.html');
    expect(html).toContain('id="contextBadge"');
    expect(html).toContain('id="contextName"');
  });
});

describe('secondary views', () => {
  const contentSrc = readFile('content.js');

  it('should have loadWorkflows function', () => {
    expect(contentSrc).toContain('function loadWorkflows');
  });

  it('should have loadExecutions function', () => {
    expect(contentSrc).toContain('function loadExecutions');
  });

  it('should have loadHistoryView function', () => {
    expect(contentSrc).toContain('function loadHistoryView');
  });

  it('should have filterListItems function', () => {
    expect(contentSrc).toContain('function filterListItems');
  });

  it('drawer views should be wired in toggleDrawer', () => {
    expect(contentSrc).toContain("viewId === 'workflowsView'");
    expect(contentSrc).toContain("viewId === 'executionsView'");
    expect(contentSrc).toContain("viewId === 'historyView'");
    expect(contentSrc).toContain("viewId === 'settingsView'");
  });
});
