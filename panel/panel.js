/**
 * n8n Pilot — Panel Controller
 * Main controller for the injected side panel.
 * Loaded into Shadow DOM context via content.js.
 */

/* global chrome */

// Shadow DOM root reference — set by content.js after injection
let _shadowRoot = null;

/**
 * Initialize the panel with its Shadow DOM root.
 * Called by content.js after all panel scripts are loaded.
 */
export function initPanel(shadowRoot) {
  _shadowRoot = shadowRoot;
  setupViewRouting();
  setupCollapseToggle();
  updateStatusBar();
  updateModelIndicator();

  // Initialize settings view
  if (typeof initSettingsView === 'function') {
    initSettingsView(shadowRoot);
  }
}

// ============================================================================
// MESSAGING & HELPERS
// ============================================================================

/**
 * Send message to background.js via chrome.runtime.sendMessage.
 * Same pattern as popup.js but works from content script context.
 */
export function msg(action, data = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action, ...data }, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });
}

/** getElementById scoped to Shadow DOM */
export function $(id) {
  if (!_shadowRoot) return null;
  return _shadowRoot.getElementById(id);
}

/** querySelector scoped to Shadow DOM */
export function $q(selector) {
  if (!_shadowRoot) return null;
  return _shadowRoot.querySelector(selector);
}

/** querySelectorAll scoped to Shadow DOM */
export function $qa(selector) {
  if (!_shadowRoot) return [];
  return _shadowRoot.querySelectorAll(selector);
}

export function formatJson(obj) {
  return JSON.stringify(obj, null, 2);
}

export function timeAgo(isoString) {
  if (!isoString) return 'Unknown';
  const date = new Date(isoString);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

// ============================================================================
// VIEW ROUTING — drawers open/close over chat
// ============================================================================

function setupViewRouting() {
  // Header buttons open drawers
  const viewButtons = $qa('.header-btn[data-view]');
  viewButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const viewId = btn.dataset.view;
      toggleDrawer(viewId, btn);
    });
  });

  // Close buttons in drawers
  const closeButtons = $qa('.btn-close-drawer');
  closeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const viewId = btn.dataset.close;
      closeDrawer(viewId);
    });
  });
}

function toggleDrawer(viewId, triggerBtn) {
  const drawer = $(viewId);
  if (!drawer) return;

  const isOpen = !drawer.classList.contains('hidden');

  // Close all drawers first
  $qa('.view-container.drawer').forEach(d => d.classList.add('hidden'));
  $qa('.header-btn[data-view]').forEach(b => b.classList.remove('active'));

  if (!isOpen) {
    drawer.classList.remove('hidden');
    if (triggerBtn) triggerBtn.classList.add('active');

    // Load data on open
    if (viewId === 'workflowsView' && typeof loadWorkflows === 'function') loadWorkflows();
    if (viewId === 'executionsView' && typeof loadExecutions === 'function') loadExecutions();
    if (viewId === 'historyView' && typeof loadHistory === 'function') loadHistory();
    if (viewId === 'settingsView' && typeof loadSettingsData === 'function') loadSettingsData();
  }
}

function closeDrawer(viewId) {
  const drawer = $(viewId);
  if (drawer) drawer.classList.add('hidden');
  $qa('.header-btn[data-view]').forEach(b => b.classList.remove('active'));
}

// ============================================================================
// COLLAPSE / EXPAND
// ============================================================================

function setupCollapseToggle() {
  const collapseBtn = $('btnCollapsePanel');
  if (!collapseBtn) return;

  collapseBtn.addEventListener('click', () => {
    const container = $('panelContainer');
    if (!container) return;

    const isCollapsed = container.classList.toggle('collapsed');

    // Adjust n8n canvas margin
    const appEl = document.querySelector('#app') ||
                  document.querySelector('.main-content') ||
                  document.querySelector('[class*="container"]');
    if (appEl) {
      appEl.style.marginRight = isCollapsed ? '48px' : '380px';
    }
  });
}

// ============================================================================
// STATUS BAR
// ============================================================================

export async function updateStatusBar() {
  const dot = $('statusDot');
  const text = $('statusText');
  if (!dot || !text) return;

  try {
    const settingsData = await msg('getSettings');
    const hasN8n = !!(settingsData && settingsData.n8nBaseUrl);
    const hasClaude = !!(settingsData && (await msg('getApiKeyStatus', { provider: 'claude' })).hasKey);

    let n8nOk = false;
    let claudeOk = false;

    if (hasN8n) {
      try {
        const r = await msg('testN8nConnection');
        n8nOk = r && r.connected;
      } catch (_) { /* ignore */ }
    }

    if (hasClaude) {
      try {
        const r = await msg('testClaudeConnection');
        claudeOk = r && r.connected;
      } catch (_) { /* ignore */ }
    }

    if (n8nOk && claudeOk) {
      dot.className = 'status-dot connected';
      text.textContent = 'Connected';
    } else if (n8nOk || claudeOk) {
      dot.className = 'status-dot partial';
      text.textContent = n8nOk ? 'n8n OK' : 'Claude OK';
    } else if (hasN8n || hasClaude) {
      dot.className = 'status-dot';
      text.textContent = 'Connection failed';
    } else {
      dot.className = 'status-dot';
      text.textContent = 'Not configured';
    }
  } catch (error) {
    console.error('[n8n Pilot] Status check error:', error);
    if (dot) dot.className = 'status-dot';
    if (text) text.textContent = 'Error';
  }
}

async function updateModelIndicator() {
  const indicator = $('modelIndicator');
  if (!indicator) return;

  try {
    const settings = await msg('getSettings');
    const model = settings?.claudeModel || 'claude-sonnet-4-5-20250929';
    // Show short name
    const short = model.replace(/^claude-/, '').replace(/-\d{8}$/, '');
    indicator.textContent = short;
  } catch (_) {
    indicator.textContent = 'claude-sonnet';
  }
}

// Export for content.js
if (typeof window !== 'undefined') {
  window.__n8nPilotPanel = { initPanel, msg, $, $q, $qa, formatJson, timeAgo, escapeHtml, updateStatusBar };
}
