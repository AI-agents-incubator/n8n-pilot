/**
 * Integration test: popup.js ↔ popup.html ID consistency
 *
 * This test ensures that every getElementById() call in popup.js
 * references an element that actually exists in popup.html,
 * and that every message action sent from popup.js is handled
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
// Extract IDs referenced in popup.js via getElementById / $()
// ============================================================================

function extractJsElementIds(jsSource) {
  const ids = new Set();

  // Match getElementById('xxx') and getElementById("xxx")
  const regex1 = /getElementById\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = regex1.exec(jsSource)) !== null) {
    ids.add(m[1]);
  }

  // Match $('xxx') — our helper is: function $(id) { return document.getElementById(id); }
  // Be careful to only match our $ helper, not jQuery or template literals
  const regex2 = /\$\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = regex2.exec(jsSource)) !== null) {
    ids.add(m[1]);
  }

  return ids;
}

// ============================================================================
// Extract IDs defined in popup.html via id="xxx"
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
// Extract message actions sent from popup.js via msg('action', ...)
// ============================================================================

function extractPopupActions(jsSource) {
  const actions = new Set();
  // Match msg('actionName' and msg("actionName"
  const regex = /\bmsg\(\s*['"]([^'"]+)['"]/g;
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
// Extract querySelector calls that reference IDs
// ============================================================================

function extractQuerySelectorIds(jsSource) {
  const ids = new Set();
  // Match querySelector('#id') and querySelectorAll('#id')
  const regex = /querySelector(?:All)?\(\s*['"]([^'"]*#[^'"]+)['"]\s*\)/g;
  let m;
  while ((m = regex.exec(jsSource)) !== null) {
    const selectorStr = m[1];
    // Extract ID from selector like '#myId' or '.class #myId'
    const idRegex = /#([\w-]+)/g;
    let idMatch;
    while ((idMatch = idRegex.exec(selectorStr)) !== null) {
      ids.add(idMatch[1]);
    }
  }
  return ids;
}

// ============================================================================
// Tests
// ============================================================================

describe('popup.js ↔ popup.html integration', () => {
  const popupJs = readFile('popup.js');
  const popupHtml = readFile('popup.html');

  const jsIds = extractJsElementIds(popupJs);
  const htmlIds = extractHtmlIds(popupHtml);
  const querySelectorIds = extractQuerySelectorIds(popupJs);

  it('should have at least some IDs in popup.js', () => {
    expect(jsIds.size).toBeGreaterThan(0);
  });

  it('should have at least some IDs in popup.html', () => {
    expect(htmlIds.size).toBeGreaterThan(0);
  });

  it('every getElementById/$() in popup.js should reference an existing HTML id', () => {
    const missing = [];
    for (const id of jsIds) {
      if (!htmlIds.has(id)) {
        missing.push(id);
      }
    }

    if (missing.length > 0) {
      console.error('\n❌ IDs in popup.js NOT found in popup.html:');
      missing.forEach(id => console.error(`   - "${id}"`));
    }

    expect(missing).toEqual([]);
  });

  it('every querySelector with #id in popup.js should reference an existing HTML id', () => {
    const missing = [];
    for (const id of querySelectorIds) {
      if (!htmlIds.has(id)) {
        missing.push(id);
      }
    }

    if (missing.length > 0) {
      console.error('\n❌ querySelector IDs in popup.js NOT found in popup.html:');
      missing.forEach(id => console.error(`   - "#${id}"`));
    }

    expect(missing).toEqual([]);
  });
});

describe('popup.js ↔ background.js message routing', () => {
  const popupJs = readFile('popup.js');
  const backgroundJs = readFile('background.js');

  const popupActions = extractPopupActions(popupJs);
  const bgActions = extractBackgroundActions(backgroundJs);

  it('should have at least some actions in popup.js', () => {
    expect(popupActions.size).toBeGreaterThan(0);
  });

  it('should have at least some actions in background.js', () => {
    expect(bgActions.size).toBeGreaterThan(0);
  });

  it('every msg() action in popup.js should have a case in background.js', () => {
    const unhandled = [];
    for (const action of popupActions) {
      if (!bgActions.has(action)) {
        unhandled.push(action);
      }
    }

    if (unhandled.length > 0) {
      console.error('\n❌ Actions sent from popup.js with NO handler in background.js:');
      unhandled.forEach(a => console.error(`   - "${a}"`));
    }

    expect(unhandled).toEqual([]);
  });
});

describe('popup.html completeness', () => {
  const popupHtml = readFile('popup.html');

  it('should reference popup.css stylesheet', () => {
    expect(popupHtml).toContain('href="popup.css"');
  });

  it('should reference popup.js script with type="module"', () => {
    expect(popupHtml).toMatch(/src=["']popup\.js["'].*type=["']module["']/s);
  });

  it('should have tab buttons with data-tab attributes', () => {
    const tabs = ['generate', 'workflows', 'executions', 'history', 'debug'];
    tabs.forEach(tab => {
      expect(popupHtml).toContain(`data-tab="${tab}"`);
    });
  });

  it('should have tab content divs matching tab buttons', () => {
    const tabs = ['generate', 'workflows', 'executions', 'history', 'debug'];
    tabs.forEach(tab => {
      expect(popupHtml).toContain(`id="${tab}"`);
    });
  });
});
