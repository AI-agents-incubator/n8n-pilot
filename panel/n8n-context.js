/**
 * n8n Pilot — n8n Context Awareness
 * Detects current workflow, selected nodes, and SPA navigation.
 */

/**
 * Get current n8n context from the page.
 * @returns {{ workflowId: string|null, workflowName: string|null, url: string }}
 */
export function getCurrentContext() {
  return {
    workflowId: extractWorkflowIdFromUrl(),
    workflowName: extractWorkflowName(),
    url: window.location.href,
  };
}

/**
 * Extract workflow ID from URL.
 * Patterns: /workflow/abc123, /workflow/abc-def-123, /workflow/abc123/edit
 */
export function extractWorkflowIdFromUrl() {
  const url = window.location.href;
  const match = url.match(/\/workflow\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

/**
 * Extract workflow name from the n8n editor.
 */
export function extractWorkflowName() {
  // Try data-test-id first (most reliable)
  const nameInput = document.querySelector('[data-test-id="workflow-name-input"]');
  if (nameInput) return nameInput.value || nameInput.textContent || null;

  // Try common selectors
  const nameEl = document.querySelector('.workflow-name-input input')
    || document.querySelector('[class*="workflowName"]');
  if (nameEl) return nameEl.value || nameEl.textContent || null;

  // Fallback to title
  const title = document.title;
  if (title && title !== 'n8n') {
    const match = title.match(/^(.+?)(?:\s*[-–|]|$)/);
    return match ? match[1].trim() : null;
  }

  return null;
}

/**
 * Watch for SPA navigation (URL changes without page reload).
 * Calls callback when the workflow context changes.
 * @param {Function} onChange - callback({ workflowId, workflowName, url })
 * @returns {Function} cleanup function
 */
export function watchContext(onChange) {
  let lastWorkflowId = extractWorkflowIdFromUrl();

  // Watch URL changes via popstate
  const onPopState = () => {
    const newId = extractWorkflowIdFromUrl();
    if (newId !== lastWorkflowId) {
      lastWorkflowId = newId;
      onChange(getCurrentContext());
    }
  };
  window.addEventListener('popstate', onPopState);

  // Intercept pushState/replaceState
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = function (...args) {
    originalPushState(...args);
    setTimeout(() => {
      const newId = extractWorkflowIdFromUrl();
      if (newId !== lastWorkflowId) {
        lastWorkflowId = newId;
        onChange(getCurrentContext());
      }
    }, 50);
  };

  history.replaceState = function (...args) {
    originalReplaceState(...args);
    setTimeout(() => {
      const newId = extractWorkflowIdFromUrl();
      if (newId !== lastWorkflowId) {
        lastWorkflowId = newId;
        onChange(getCurrentContext());
      }
    }, 50);
  };

  // Watch title changes (MutationObserver on <title>)
  const titleObserver = new MutationObserver(() => {
    const newId = extractWorkflowIdFromUrl();
    if (newId !== lastWorkflowId) {
      lastWorkflowId = newId;
      onChange(getCurrentContext());
    }
  });

  const titleEl = document.querySelector('title');
  if (titleEl) {
    titleObserver.observe(titleEl, { childList: true, characterData: true, subtree: true });
  }

  // Cleanup function
  return () => {
    window.removeEventListener('popstate', onPopState);
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
    titleObserver.disconnect();
  };
}

// Expose for content.js
if (typeof window !== 'undefined') {
  window.__n8nPilotContext = { getCurrentContext, extractWorkflowIdFromUrl, extractWorkflowName, watchContext };
}
