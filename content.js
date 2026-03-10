/**
 * n8n Pilot — Content Script
 * Injected programmatically ONLY on n8n pages.
 * Handles: workflow injection, notifications, save detection.
 */

(function () {
  // Prevent double injection
  if (window.__n8nPilotInjected) return;
  window.__n8nPilotInjected = true;

  // --- Message listener from background ---
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg.type) {
      case 'INJECT_WORKFLOW':
        injectWorkflow(msg.workflow).then(sendResponse);
        return true; // async

      case 'SHOW_NOTIFICATION':
        showNotification(msg.success, msg.message);
        sendResponse({ success: true });
        break;

      case 'GET_CURRENT_WORKFLOW':
        getCurrentWorkflow().then(sendResponse);
        return true; // async

      default:
        sendResponse({ error: 'Unknown message type' });
    }
  });

  // --- Workflow Injection ---

  async function injectWorkflow(workflow) {
    try {
      const json = typeof workflow === 'string' ? workflow : JSON.stringify(workflow);

      // Step 1: Copy to clipboard
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(json);
        } else {
          // Fallback for non-secure contexts (HTTP)
          const textarea = document.createElement('textarea');
          textarea.value = json;
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.select();
          const ok = document.execCommand('copy');
          document.body.removeChild(textarea);
          if (!ok) throw new Error("Fallback copy command failed");
        }
      } catch (clipErr) {
        showNotification(false, `Clipboard failed: ${clipErr.message}. Copy JSON manually.`);
        return { success: false, error: `Clipboard failed: ${clipErr.message}` };
      }

      // Step 2: Try to find the n8n canvas and simulate paste
      const canvas = document.querySelector('.jtk-surface-nopan')
        || document.querySelector('[data-test-id="canvas"]')
        || document.querySelector('.workflow-canvas')
        || document.querySelector('.vue-flow')
        || document.querySelector('#canvas');

      if (canvas) {
        canvas.focus();
        document.execCommand('paste');

        const pasteEvent = new KeyboardEvent('keydown', {
          key: 'v',
          code: 'KeyV',
          ctrlKey: true,
          metaKey: true,
          bubbles: true,
        });
        canvas.dispatchEvent(pasteEvent);

        // Honest message: we copied and attempted paste, but can't verify
        showNotification(true, 'Workflow copied to clipboard and paste attempted. If nodes did not appear, press Ctrl+V on the canvas.');
        return { success: true, method: 'clipboard+paste', verified: false };
      } else {
        // No canvas found — just clipboard
        showNotification(true, 'Workflow copied to clipboard. Open a workflow in n8n and press Ctrl+V to paste.');
        return { success: true, method: 'clipboard-only', verified: false };
      }

    } catch (err) {
      showNotification(false, `Injection failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  // --- Get current workflow from n8n page ---

  async function getCurrentWorkflow() {
    try {
      // Try to extract from n8n's Vue/Pinia store
      const workflowId = extractWorkflowIdFromUrl();
      return { workflowId, url: window.location.href };
    } catch (err) {
      return { error: err.message };
    }
  }

  function extractWorkflowIdFromUrl() {
    const url = window.location.href;
    // n8n URL patterns: /workflow/abc123, /workflow/abc-def-123, /workflow/abc123/edit
    const match = url.match(/\/workflow\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  }

  // --- Save Detection ---

  document.addEventListener('click', (event) => {
    // Look for save button clicks in n8n
    const path = event.composedPath ? event.composedPath() : [];

    for (const el of path) {
      if (!el.tagName) continue;

      const isButton = el.tagName === 'BUTTON' || el.role === 'button';
      if (!isButton) continue;

      const text = (el.textContent || '').trim().toLowerCase();
      const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
      const testId = el.getAttribute('data-test-id') || el.getAttribute('data-testid') || '';

      const isSaveButton = (
        (text === 'save' || text === 'save workflow') &&
        !text.includes('save as')
      ) || ariaLabel === 'save' || testId.includes('save');

      if (isSaveButton) {
        // Wait briefly for n8n to process the save, then try to capture workflow data
        setTimeout(async () => {
          const workflowId = extractWorkflowIdFromUrl();
          if (workflowId) {
            // Try to extract workflow JSON from n8n's internal store
            let workflowData = null;
            try {
              // n8n stores workflow data in window.__n8n_store or Pinia/Vuex
              // Try multiple approaches to extract it
              const storeData = window.__n8n_store?.workflow
                || document.querySelector('[data-test-id="workflow-data"]')?.textContent;
              if (storeData) {
                workflowData = typeof storeData === 'string' ? JSON.parse(storeData) : storeData;
              }
            } catch (_) {
              // Extraction failed — that's ok, we'll send what we have
            }

            // Fetch the workflow via the API as a fallback (background.js will handle the API call)
            chrome.runtime.sendMessage({
              action: 'workflowSaved',
              workflowId,
              workflow: workflowData, // May still be null, but now we try
              fetchFromApi: !workflowData, // Signal background.js to fetch from n8n API
            });
          }
        }, 1500);
        break;
      }
    }
  }, true); // Capture phase

  // --- Notification UI ---

  function showNotification(isSuccess, message) {
    // Remove existing notification
    const existing = document.getElementById('n8n-pilot-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.id = 'n8n-pilot-notification';

    const borderColor = isSuccess ? '#4caf50' : '#f44336';
    const icon = isSuccess ? '✓' : '✗';

    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 999999;
      background: #1a1a1a;
      border: 1px solid #333;
      border-left: 4px solid ${borderColor};
      border-radius: 8px;
      padding: 12px 16px;
      min-width: 300px;
      max-width: 420px;
      color: #e0e0e0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      line-height: 1.4;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      backdrop-filter: blur(10px);
      animation: n8nPilotSlideIn 0.3s ease-out;
      display: flex;
      align-items: center;
      gap: 10px;
    `;

    notification.innerHTML = `
      <span style="font-size: 18px; color: ${borderColor};">${icon}</span>
      <span style="flex: 1;">${escapeHtml(message)}</span>
      <span style="cursor: pointer; opacity: 0.5; font-size: 16px;" id="n8n-pilot-notif-close">×</span>
    `;

    // Add animation keyframes
    if (!document.getElementById('n8n-pilot-styles')) {
      const style = document.createElement('style');
      style.id = 'n8n-pilot-styles';
      style.textContent = `
        @keyframes n8nPilotSlideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(notification);

    // Close button
    document.getElementById('n8n-pilot-notif-close')?.addEventListener('click', () => {
      notification.remove();
    });

    // Auto-dismiss
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.transition = 'opacity 0.3s, transform 0.3s';
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => notification.remove(), 300);
      }
    }, 6000);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
})();
