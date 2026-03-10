/**
 * n8n Pilot — Settings View
 * Settings drawer inside the injected side panel.
 * Migrated from popup.js settings logic.
 */

/* global chrome */

let _root = null;

function _$(id) {
  return _root ? _root.getElementById(id) : null;
}

function _msg(action, data = {}) {
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

/**
 * Initialize settings view event listeners.
 * Called from panel.js initPanel().
 */
function initSettingsView(shadowRoot) {
  _root = shadowRoot;

  const saveBtn = _$('btnSaveSettings');
  const resetBtn = _$('btnResetSettings');
  const testN8nBtn = _$('btnTestN8n');
  const testClaudeBtn = _$('btnTestClaude');

  if (saveBtn) saveBtn.addEventListener('click', saveSettings);
  if (resetBtn) resetBtn.addEventListener('click', resetAllData);
  if (testN8nBtn) testN8nBtn.addEventListener('click', testN8nConnection);
  if (testClaudeBtn) testClaudeBtn.addEventListener('click', testClaudeConnection);
}

/**
 * Load current settings into form fields.
 * Called when settings drawer opens.
 */
async function loadSettingsData() {
  try {
    const result = await _msg('getSettings');
    if (result) {
      const urlEl = _$('settingsN8nUrl');
      const modelEl = _$('settingsClaudeModel');
      const autoInjectEl = _$('settingsAutoInject');
      const saveHistoryEl = _$('settingsSaveHistory');
      const notificationsEl = _$('settingsNotifications');

      if (urlEl) urlEl.value = result.n8nBaseUrl || '';
      if (modelEl) modelEl.value = result.claudeModel || 'claude-sonnet-4-5-20250929';
      if (autoInjectEl) autoInjectEl.checked = result.autoInject !== false;
      if (saveHistoryEl) saveHistoryEl.checked = result.saveHistory !== false;
      if (notificationsEl) notificationsEl.checked = result.notifications !== false;
    }

    // Show placeholder if key is set (don't display actual keys)
    const n8nKeyEl = _$('settingsN8nApiKey');
    const claudeKeyEl = _$('settingsClaudeApiKey');
    if (n8nKeyEl) n8nKeyEl.value = '';
    if (claudeKeyEl) claudeKeyEl.value = '';

    try {
      const n8nStatus = await _msg('getApiKeyStatus', { provider: 'n8n' });
      if (n8nKeyEl && n8nStatus?.hasKey) {
        n8nKeyEl.placeholder = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022 (key saved)';
      } else if (n8nKeyEl) {
        n8nKeyEl.placeholder = 'Enter n8n API key';
      }
    } catch (_) { /* ignore */ }

    try {
      const claudeStatus = await _msg('getApiKeyStatus', { provider: 'claude' });
      if (claudeKeyEl && claudeStatus?.hasKey) {
        claudeKeyEl.placeholder = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022 (key saved)';
      } else if (claudeKeyEl) {
        claudeKeyEl.placeholder = 'Enter Claude API key';
      }
    } catch (_) { /* ignore */ }
  } catch (error) {
    console.error('[n8n Pilot] Error loading settings:', error);
  }
}

async function saveSettings() {
  const n8nUrl = (_$('settingsN8nUrl') || {}).value || '';
  const n8nApiKey = (_$('settingsN8nApiKey') || {}).value || '';
  const claudeApiKey = (_$('settingsClaudeApiKey') || {}).value || '';
  const claudeModel = (_$('settingsClaudeModel') || {}).value || 'claude-sonnet-4-5-20250929';
  const autoInject = (_$('settingsAutoInject') || {}).checked !== false;
  const saveHistory = (_$('settingsSaveHistory') || {}).checked !== false;
  const notifications = (_$('settingsNotifications') || {}).checked !== false;

  try {
    await _msg('updateSettings', {
      settings: {
        n8nBaseUrl: n8nUrl,
        claudeModel,
        autoInject,
        saveHistory,
        notifications,
      }
    });

    if (n8nApiKey) {
      await _msg('setApiKey', { provider: 'n8n', apiKey: n8nApiKey });
    }
    if (claudeApiKey) {
      await _msg('setApiKey', { provider: 'claude', apiKey: claudeApiKey });
    }

    // Request host permission for n8n URL
    if (n8nUrl) {
      try {
        await _msg('requestN8nPermission', { url: n8nUrl });
      } catch (_) { /* ignore */ }
    }

    showTestResult('n8nTestResult', true, 'Settings saved');

    // Update status bar
    if (typeof window.__n8nPilotPanel?.updateStatusBar === 'function') {
      window.__n8nPilotPanel.updateStatusBar();
    }
  } catch (error) {
    showTestResult('n8nTestResult', false, 'Error: ' + error.message);
  }
}

async function resetAllData() {
  // Simple confirmation via custom inline prompt (no alert() in content script context)
  const resetBtn = _$('btnResetSettings');
  if (!resetBtn) return;

  if (resetBtn.dataset.confirming === 'true') {
    try {
      await _msg('resetSettings');
      await _msg('clearHistory');
      resetBtn.dataset.confirming = 'false';
      resetBtn.textContent = 'Reset All Data';
      loadSettingsData();
      showTestResult('n8nTestResult', true, 'All data cleared');
    } catch (error) {
      showTestResult('n8nTestResult', false, 'Error: ' + error.message);
    }
  } else {
    resetBtn.dataset.confirming = 'true';
    resetBtn.textContent = 'Click again to confirm';
    setTimeout(() => {
      if (resetBtn.dataset.confirming === 'true') {
        resetBtn.dataset.confirming = 'false';
        resetBtn.textContent = 'Reset All Data';
      }
    }, 3000);
  }
}

async function testN8nConnection() {
  const btn = _$('btnTestN8n');
  if (btn) btn.disabled = true;

  try {
    // Save URL first if changed
    const url = (_$('settingsN8nUrl') || {}).value;
    const apiKey = (_$('settingsN8nApiKey') || {}).value;
    if (url) await _msg('updateSettings', { settings: { n8nBaseUrl: url } });
    if (apiKey) await _msg('setApiKey', { provider: 'n8n', apiKey });
    if (url) {
      try { await _msg('requestN8nPermission', { url }); } catch (_) { /* ignore */ }
    }

    const result = await _msg('testN8nConnection');
    if (result?.connected) {
      showTestResult('n8nTestResult', true, `Connected (v${result.version || '?'})`);
    } else {
      showTestResult('n8nTestResult', false, result?.error || 'Connection failed');
    }
  } catch (error) {
    showTestResult('n8nTestResult', false, error.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function testClaudeConnection() {
  const btn = _$('btnTestClaude');
  if (btn) btn.disabled = true;

  try {
    // Save key first if changed
    const apiKey = (_$('settingsClaudeApiKey') || {}).value;
    if (apiKey) await _msg('setApiKey', { provider: 'claude', apiKey });

    const result = await _msg('testClaudeConnection');
    if (result?.connected) {
      showTestResult('claudeTestResult', true, 'Connected');
    } else {
      showTestResult('claudeTestResult', false, result?.error || 'Connection failed');
    }
  } catch (error) {
    showTestResult('claudeTestResult', false, error.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function showTestResult(elementId, success, message) {
  const el = _$(elementId);
  if (!el) return;

  el.classList.remove('hidden', 'success', 'error');
  el.classList.add(success ? 'success' : 'error');
  el.textContent = message;

  // Auto-hide after 5s
  setTimeout(() => el.classList.add('hidden'), 5000);
}

// Expose for panel.js
if (typeof window !== 'undefined') {
  window.initSettingsView = initSettingsView;
  window.loadSettingsData = loadSettingsData;
}
