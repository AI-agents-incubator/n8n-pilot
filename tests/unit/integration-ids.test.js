/**
 * Integration test: panel ↔ content.js ID consistency
 *
 * This test ensures that every getElementById() call in content.js
 * references an element that actually exists in panel.html,
 * and that every message action sent from the panel is handled
 * in background.js.
 *
 * This catches the exact class of bug where different authors
 * (or subagents) use different naming conventions for the same elements.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..', '..');

function readFile(name) {
  return readFileSync(resolve(ROOT, name), 'utf-8');
}

// ============================================================================
// Extract IDs referenced in JS via getElementById / $() / _$()
// ============================================================================

function extractJsElementIds(jsSource) {
  const ids = new Set();

  // Match getElementById('xxx') and getElementById("xxx")
  const regex1 = /getElementById\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = regex1.exec(jsSource)) !== null) {
    ids.add(m[1]);
  }

  // Match $('xxx') or _$('xxx') — our helpers
  const regex2 = /\$\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = regex2.exec(jsSource)) !== null) {
    ids.add(m[1]);
  }

  return ids;
}

// ============================================================================
// Extract IDs defined in HTML via id="xxx"
// ============================================================================

function extractHtmlIds(htmlSource) {
  const ids = new Set();
  const regex = /\bid\s*=\s*["']([^"']+)["']/g;
  let m;
  while ((m = regex.exec(htmlSource)) !== null) {
    ids.add(m[1]);
  }
  return ids;
}

// ============================================================================
// Extract message actions sent via msg('action', ...) or _msg('action', ...)
// ============================================================================

function extractMsgActions(jsSource) {
  const actions = new Set();
  // Match msg('actionName', _msg('actionName'
  const regex = /\b_?msg\(\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = regex.exec(jsSource)) !== null) {
    actions.add(m[1]);
  }
  return actions;
}

// ============================================================================
// Extract handled actions in background.js via case 'action':
// ============================================================================

function extractBackgroundActions(jsSource) {
  const actions = new Set();
  const regex = /case\s+['"]([^'"]+)['"]\s*:/g;
  let m;
  while ((m = regex.exec(jsSource)) !== null) {
    actions.add(m[1]);
  }
  return actions;
}

// ============================================================================
// Tests
// ============================================================================

describe('content.js ↔ panel.html integration', () => {
  const contentJs = readFile('content.js');
  const panelHtml = readFile('panel/panel.html');

  const jsIds = extractJsElementIds(contentJs);
  const htmlIds = extractHtmlIds(panelHtml);

  it('should have at least some IDs in content.js', () => {
    expect(jsIds.size).toBeGreaterThan(0);
  });

  it('should have at least some IDs in panel.html', () => {
    expect(htmlIds.size).toBeGreaterThan(0);
  });

  it('every getElementById/$()/_$() in content.js should reference an existing panel.html id', () => {
    const missing = [];
    // Exclude IDs that are created dynamically (not in HTML template)
    const dynamicIds = new Set(['n8n-pilot-notification', 'n8n-pilot-notif-close', 'n8n-pilot-styles', 'n8n-pilot-host']);
    for (const id of jsIds) {
      if (!htmlIds.has(id) && !dynamicIds.has(id)) {
        missing.push(id);
      }
    }

    if (missing.length > 0) {
      console.error('\n❌ IDs in content.js NOT found in panel.html:');
      missing.forEach(id => console.error(`   - "${id}"`));
    }

    expect(missing).toEqual([]);
  });
});

describe('content.js ↔ background.js message routing', () => {
  const contentJs = readFile('content.js');
  const backgroundJs = readFile('background.js');

  const panelActions = extractMsgActions(contentJs);
  const bgActions = extractBackgroundActions(backgroundJs);

  it('should have at least some actions in content.js', () => {
    expect(panelActions.size).toBeGreaterThan(0);
  });

  it('should have at least some actions in background.js', () => {
    expect(bgActions.size).toBeGreaterThan(0);
  });

  it('every _msg() action in content.js should have a case in background.js', () => {
    const unhandled = [];
    for (const action of panelActions) {
      if (!bgActions.has(action)) {
        unhandled.push(action);
      }
    }

    if (unhandled.length > 0) {
      console.error('\n❌ Actions sent from content.js with NO handler in background.js:');
      unhandled.forEach(a => console.error(`   - "${a}"`));
    }

    expect(unhandled).toEqual([]);
  });
});

describe('panel.html completeness', () => {
  const panelHtml = readFile('panel/panel.html');

  it('should have header buttons with data-view attributes', () => {
    const views = ['workflowsView', 'executionsView', 'historyView', 'settingsView'];
    views.forEach(view => {
      expect(panelHtml).toContain(`data-view="${view}"`);
    });
  });

  it('should have drawer divs matching header buttons', () => {
    const views = ['workflowsView', 'executionsView', 'historyView', 'settingsView'];
    views.forEach(view => {
      expect(panelHtml).toContain(`id="${view}"`);
    });
  });

  it('should have chat input and send button', () => {
    expect(panelHtml).toContain('id="chatInput"');
    expect(panelHtml).toContain('id="btnSend"');
  });

  it('should have status bar elements', () => {
    expect(panelHtml).toContain('id="statusDot"');
    expect(panelHtml).toContain('id="statusText"');
  });
});
