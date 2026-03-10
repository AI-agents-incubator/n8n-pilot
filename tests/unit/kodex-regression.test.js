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
    // The function must NOT have a hardcoded `success: true` after validation
    // It should derive success from validation result
    const generateBlock = src.slice(
      src.indexOf('export async function generate('),
      src.indexOf('export async function modify(')
    );

    // Must NOT contain a bare `success: true` after validate()
    const afterValidate = generateBlock.slice(generateBlock.lastIndexOf('validate('));
    expect(afterValidate).not.toMatch(/success:\s*true\b/);

    // Must contain logic that checks errors
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
    // The handler must NOT call sendResponse synchronously before injection
    const injectCase = src.slice(
      src.indexOf("case 'INJECT_WORKFLOW'"),
      src.indexOf("case 'SHOW_NOTIFICATION'")
    );

    // Must NOT have a synchronous sendResponse({ success: true }) before injection
    expect(injectCase).not.toMatch(/sendResponse\(\s*\{\s*success:\s*true\s*\}\s*\)\s*;\s*\n\s*break/);

    // Must return true for async
    expect(injectCase).toContain('return true');
  });

  it('injectWorkflow function should be async', () => {
    expect(src).toMatch(/async\s+function\s+injectWorkflow/);
  });

  it('injectWorkflow should return a result object (not void)', () => {
    const fnBody = src.slice(
      src.indexOf('async function injectWorkflow'),
      src.indexOf('// --- Get current workflow')
    );

    // Must have return statements with objects
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

    // Must attempt to extract workflow data
    expect(saveSection).toMatch(/workflowData|workflow.*=|storeData|fetchFromApi/);

    // Must NOT have a bare `workflow: null` without alternatives
    const hasOnlyNull = /workflow:\s*null\s*[,}]/.test(saveSection) &&
      !saveSection.includes('fetchFromApi');
    expect(hasOnlyNull).toBe(false);
  });

  it('content.js URL parser should handle dashed IDs', () => {
    // The regex must match IDs like abc-def-123
    const regex = contentSrc.match(/url\.match\(([^)]+)\)/);
    expect(regex).not.toBeNull();

    const pattern = regex[1];
    // Must include - in character class
    expect(pattern).toMatch(/\[.*-.*\]/);
  });

  it('background.js workflowSaved handler should have API fallback', () => {
    const handler = bgSrc.slice(
      bgSrc.indexOf("case 'workflowSaved'"),
      bgSrc.indexOf("// === Permission request ===")
    );

    // Must attempt to fetch from API when workflow data is missing
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

    // Must check saveHistory or settings before calling history.add
    expect(genHandler).toMatch(/saveHistory|currentSettings/);
    expect(genHandler).toContain('history.add');
  });
});

// ============================================================================
// [P1] Settings field names consistency
// ============================================================================

describe('[P1] settings.js ↔ popup.js field name consistency', () => {
  const settingsSrc = readFile('lib/settings.js');
  const popupSrc = readFile('popup.js');

  it('settings DEFAULTS should have saveHistory field', () => {
    expect(settingsSrc).toMatch(/saveHistory:\s*(true|false)/);
  });

  it('settings DEFAULTS should have notifications field (not showNotifications)', () => {
    expect(settingsSrc).toMatch(/notifications:\s*(true|false)/);
    // Must NOT have the old field name
    expect(settingsSrc).not.toMatch(/showNotifications/);
  });

  it('popup.js should reference the same settings field names', () => {
    // If popup reads saveHistory, settings must define it
    if (popupSrc.includes('saveHistory')) {
      expect(settingsSrc).toContain('saveHistory');
    }
    if (popupSrc.includes('notifications') && !popupSrc.includes('showNotifications')) {
      expect(settingsSrc).toContain('notifications');
      expect(settingsSrc).not.toContain('showNotifications');
    }
  });
});

// ============================================================================
// [P2] Model selector must be forwarded through the stack
// ============================================================================

describe('[P2] model passthrough: popup → background → generator → claude', () => {
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

describe('[P2] popup.css ↔ popup.js status dot classes', () => {
  const cssSrc = readFile('popup.css');
  const jsSrc = readFile('popup.js');

  it('CSS should define styles for all JS status classes', () => {
    // Extract class names set by JS: statusDot.className = 'status-dot XXX'
    const classAssignments = jsSrc.match(/status-dot\s+(status-\w+)/g) || [];
    const jsClasses = [...new Set(classAssignments.map(m => m.split(/\s+/)[1]))];

    expect(jsClasses.length).toBeGreaterThan(0);

    jsClasses.forEach(cls => {
      expect(cssSrc).toContain(`.${cls}`);
    });
  });
});
