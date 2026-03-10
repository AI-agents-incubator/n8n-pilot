/**
 * Regression tests for bugs found by Kodex code review.
 * These tests verify that specific cross-module issues don't recur.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..', '..');

function readFile(name) {
  return readFileSync(resolve(ROOT, name), 'utf-8');
}

// ============================================================================
// [P1] Invalid workflows must NOT be returned as success
// ============================================================================

describe('[P1] workflow-generator.js: validation errors → success: false', () => {
  const src = readFile('lib/workflow-generator.js');

  it('generate() should check validationErrors before setting success', () => {
    const generateBlock = src.slice(
      src.indexOf('export async function generate('),
      src.indexOf('export async function modify(')
    );

    const afterValidate = generateBlock.slice(generateBlock.lastIndexOf('validate('));
    expect(afterValidate).not.toMatch(/success:\s*true\b/);
    expect(afterValidate).toMatch(/hasErrors|errors\.length|errors\s*&&/);
  });

  it('modify() should check validationErrors before setting success', () => {
    const modifyBlock = src.slice(
      src.indexOf('export async function modify('),
      src.indexOf('export async function explain(')
    );

    const afterValidate = modifyBlock.slice(modifyBlock.lastIndexOf('validate('));
    expect(afterValidate).not.toMatch(/success:\s*true\b/);
    expect(afterValidate).toMatch(/hasErrors|errors\.length|errors\s*&&/);
  });
});

// ============================================================================
// [P1] Injection must return async result, not fire-and-forget
// ============================================================================

describe('[P1] content.js: injection is async, not fire-and-forget', () => {
  const src = readFile('content.js');

  it('INJECT_WORKFLOW handler should use async response (return true)', () => {
    const injectCase = src.slice(
      src.indexOf("case 'INJECT_WORKFLOW'"),
      src.indexOf("case 'SHOW_NOTIFICATION'")
    );

    expect(injectCase).not.toMatch(/sendResponse\(\s*\{\s*success:\s*true\s*\}\s*\)\s*;\s*\n\s*break/);
    expect(injectCase).toContain('return true');
  });

  it('injectWorkflow function should be async', () => {
    expect(src).toMatch(/async\s+function\s+injectWorkflow/);
  });

  it('injectWorkflow should return a result object (not void)', () => {
    const fnBody = src.slice(
      src.indexOf('async function injectWorkflow'),
      src.indexOf('// --- Get Current Workflow')
    );

    expect(fnBody).toMatch(/return\s*\{/);
  });
});

// ============================================================================
// [P1] Versioning: content.js must try to get workflow data
// ============================================================================

describe('[P1] content.js + background.js: versioning workflow data', () => {
  const contentSrc = readFile('content.js');
  const bgSrc = readFile('background.js');

  it('content.js should try to extract workflow data (not just send null)', () => {
    const saveSection = contentSrc.slice(
      contentSrc.indexOf('isSaveButton'),
      contentSrc.indexOf('}, true); // Capture phase')
    );

    expect(saveSection).toMatch(/workflowData|workflow.*=|storeData|fetchFromApi/);

    const hasOnlyNull = /workflow:\s*null\s*[,}]/.test(saveSection) &&
      !saveSection.includes('fetchFromApi');
    expect(hasOnlyNull).toBe(false);
  });

  it('content.js URL parser should handle dashed IDs', () => {
    const regex = contentSrc.match(/url\.match\(([^)]+)\)/);
    expect(regex).not.toBeNull();

    const pattern = regex[1];
    expect(pattern).toMatch(/\[.*-.*\]/);
  });

  it('background.js workflowSaved handler should have API fallback', () => {
    const handler = bgSrc.slice(
      bgSrc.indexOf("case 'workflowSaved'"),
      bgSrc.indexOf("// === Keep-Alive")
    );

    expect(handler).toMatch(/getWorkflow|fetchFromApi/);
  });
});

// ============================================================================
// [P1] Privacy: saveHistory must be checked before persisting
// ============================================================================

describe('[P1] background.js: saveHistory preference enforced', () => {
  const src = readFile('background.js');

  it('generateWorkflow handler should check saveHistory before history.add', () => {
    const genHandler = src.slice(
      src.indexOf("case 'generateWorkflow'"),
      src.indexOf("case 'modifyWorkflow'")
    );

    expect(genHandler).toMatch(/saveHistory|currentSettings/);
    expect(genHandler).toContain('history.add');
  });
});

// ============================================================================
// [P1] Settings field names consistency
// ============================================================================

describe('[P1] settings.js ↔ content.js field name consistency', () => {
  const settingsSrc = readFile('lib/settings.js');
  const contentSrc = readFile('content.js');

  it('settings DEFAULTS should have saveHistory field', () => {
    expect(settingsSrc).toMatch(/saveHistory:\s*(true|false)/);
  });

  it('settings DEFAULTS should have notifications field (not showNotifications)', () => {
    expect(settingsSrc).toMatch(/notifications:\s*(true|false)/);
    expect(settingsSrc).not.toMatch(/showNotifications/);
  });

  it('content.js should reference the same settings field names', () => {
    if (contentSrc.includes('saveHistory')) {
      expect(settingsSrc).toContain('saveHistory');
    }
    if (contentSrc.includes('notifications') && !contentSrc.includes('showNotifications')) {
      expect(settingsSrc).toContain('notifications');
      expect(settingsSrc).not.toContain('showNotifications');
    }
  });
});

// ============================================================================
// [P2] Model selector must be forwarded through the stack
// ============================================================================

describe('[P2] model passthrough: panel → background → generator → claude', () => {
  const bgSrc = readFile('background.js');
  const genSrc = readFile('lib/workflow-generator.js');

  it('background.js generateWorkflow should pass msg.model to generator', () => {
    const handler = bgSrc.slice(
      bgSrc.indexOf("case 'generateWorkflow'"),
      bgSrc.indexOf("case 'modifyWorkflow'")
    );
    expect(handler).toContain('model:');
    expect(handler).toMatch(/model:\s*msg\.model/);
  });

  it('background.js modifyWorkflow should pass msg.model to generator', () => {
    const handler = bgSrc.slice(
      bgSrc.indexOf("case 'modifyWorkflow'"),
      bgSrc.indexOf("case 'explainWorkflow'")
    );
    expect(handler).toContain('model:');
    expect(handler).toMatch(/model:\s*msg\.model/);
  });

  it('workflow-generator.js generate() should accept and forward model', () => {
    const fnSignature = genSrc.slice(
      genSrc.indexOf('export async function generate('),
      genSrc.indexOf(') {', genSrc.indexOf('export async function generate('))
    );
    expect(fnSignature).toContain('model');
  });

  it('workflow-generator.js modify() should accept and forward model', () => {
    const fnSignature = genSrc.slice(
      genSrc.indexOf('export async function modify('),
      genSrc.indexOf(') {', genSrc.indexOf('export async function modify('))
    );
    expect(fnSignature).toContain('model');
  });
});

// ============================================================================
// [P2] CSS status classes must match JS class assignments
// ============================================================================

describe('[P2] panel.css ↔ content.js status dot classes', () => {
  const cssSrc = readFile('panel/panel.css');
  const jsSrc = readFile('content.js');

  it('CSS should define styles for all JS status classes', () => {
    // Extract class names set by JS: dot.className = 'status-dot XXX'
    const classAssignments = jsSrc.match(/status-dot\s+(\w+)/g) || [];
    const jsClasses = [...new Set(classAssignments.map(m => m.split(/\s+/)[1]))];

    expect(jsClasses.length).toBeGreaterThan(0);

    jsClasses.forEach(cls => {
      expect(cssSrc).toContain(`.${cls}`);
    });
  });
});

// ============================================================================
// [P2] Panel architecture: content.js should create Shadow DOM
// ============================================================================

describe('[P2] content.js panel architecture', () => {
  const src = readFile('content.js');

  it('should create a Shadow DOM host element', () => {
    expect(src).toContain('attachShadow');
  });

  it('should support test mode with open shadow DOM', () => {
    expect(src).toContain('__N8N_PILOT_TEST_MODE__');
    expect(src).toMatch(/mode.*open|open.*mode/);
  });

  it('should load panel.html and panel.css from extension resources', () => {
    expect(src).toContain("panel/panel.html");
    expect(src).toContain("panel/panel.css");
  });

  it('should handle panel toggle messages', () => {
    expect(src).toContain("TOGGLE_PANEL");
  });

  it('should handle stream messages', () => {
    expect(src).toContain("STREAM_CHUNK");
    expect(src).toContain("STREAM_DONE");
    expect(src).toContain("STREAM_ERROR");
  });

  it('should push n8n canvas when panel opens', () => {
    expect(src).toContain('marginRight');
  });
});
