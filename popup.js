// popup.js - n8n Pilot Chrome Extension Popup Logic
// ES Module - communicates with background.js via chrome.runtime.sendMessage

// ============================================================================
// MESSAGING & HELPERS
// ============================================================================

function msg(action, data = {}) {
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

function formatJson(obj) {
  return JSON.stringify(obj, null, 2);
}

function timeAgo(isoString) {
  if (!isoString) return 'Unknown';
  const date = new Date(isoString);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

function showLoading(element) {
  element.classList.add('loading');
  const spinner = document.createElement('span');
  spinner.className = 'spinner';
  element.textContent = '';
  element.appendChild(spinner);
}

function hideLoading(element) {
  element.classList.remove('loading');
  const spinner = element.querySelector('.spinner');
  if (spinner) spinner.remove();
}

function $(id) {
  return document.getElementById(id);
}

// ============================================================================
// TAB SYSTEM
// ============================================================================

function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.dataset.tab;

      // Remove active from all
      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      // Add active to clicked
      button.classList.add('active');
      // Tab content divs use id matching the data-tab value
      const tabContent = $(tabName);
      if (tabContent) {
        tabContent.classList.add('active');

        // Load content on tab switch
        if (tabName === 'workflows') loadWorkflows();
        if (tabName === 'executions') loadExecutions();
        if (tabName === 'history') loadHistory();
      }
    });
  });
}

// ============================================================================
// STATUS BAR
// ============================================================================

async function updateStatusBar() {
  const indicator = $('statusIndicator');
  if (!indicator) return;
  const statusDot = indicator.querySelector('.status-dot');
  const statusText = indicator.querySelector('.status-text');
  if (!statusDot || !statusText) return;

  try {
    const settingsData = await msg('getSettings');
    const hasN8n = !!(settingsData && settingsData.n8nBaseUrl);
    const hasClaude = !!(settingsData && (await msg('getApiKeyStatus', { provider: 'claude' })).hasKey);

    let n8nOk = false;
    let claudeOk = false;

    if (hasN8n) {
      try {
        const n8nResult = await msg('testN8nConnection');
        n8nOk = n8nResult && n8nResult.connected;
      } catch (_) { }
    }

    if (hasClaude) {
      try {
        const claudeResult = await msg('testClaudeConnection');
        claudeOk = claudeResult && claudeResult.connected;
      } catch (_) { }
    }

    if (n8nOk && claudeOk) {
      statusDot.className = 'status-dot status-ok';
      statusText.textContent = 'Connected';
    } else if (n8nOk || claudeOk) {
      statusDot.className = 'status-dot status-partial';
      statusText.textContent = n8nOk ? 'n8n OK / Claude not set' : 'Claude OK / n8n not set';
    } else if (hasN8n || hasClaude) {
      statusDot.className = 'status-dot status-error';
      statusText.textContent = 'Connection failed';
    } else {
      statusDot.className = 'status-dot status-error';
      statusText.textContent = 'Not configured';
    }
  } catch (error) {
    console.error('Status check error:', error);
    if (statusDot) statusDot.className = 'status-dot status-error';
    if (statusText) statusText.textContent = 'Error';
  }
}

// ============================================================================
// SETTINGS MODAL
// ============================================================================

function initSettings() {
  const settingsBtn = $('btnSettings');
  const settingsModal = $('settingsModal');
  const settingsClose = $('btnCloseSettings');
  const settingsSave = $('btnSaveSettings');
  const settingsReset = $('btnResetSettings');

  if (!settingsBtn || !settingsModal) {
    console.error('Settings elements not found');
    return;
  }

  settingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
    loadSettings();
  });

  if (settingsClose) {
    settingsClose.addEventListener('click', () => {
      settingsModal.classList.add('hidden');
    });
  }

  // Click overlay to close
  const overlay = settingsModal.querySelector('.modal-overlay');
  if (overlay) {
    overlay.addEventListener('click', () => {
      settingsModal.classList.add('hidden');
    });
  }

  if (settingsSave) {
    settingsSave.addEventListener('click', saveSettings);
  }

  if (settingsReset) {
    settingsReset.addEventListener('click', clearData);
  }
}

async function loadSettings() {
  try {
    const result = await msg('getSettings');
    if (result) {
      const n8nUrlEl = $('n8nUrl');
      const claudeModelEl = $('claudeModel');
      const autoInjectEl = $('autoInject');
      const saveHistoryEl = $('saveHistory');
      const notificationsEl = $('enableNotifications');

      if (n8nUrlEl) n8nUrlEl.value = result.n8nBaseUrl || '';
      if (claudeModelEl) claudeModelEl.value = result.claudeModel || 'claude-sonnet-4-5-20250929';
      if (autoInjectEl) autoInjectEl.checked = result.autoInject || false;
      if (saveHistoryEl) saveHistoryEl.checked = result.saveHistory !== false;
      if (notificationsEl) notificationsEl.checked = result.notifications !== false;
    }

    // Load API key status (don't show actual keys)
    const n8nKeyEl = $('n8nApiKey');
    const claudeKeyEl = $('claudeApiKey');
    if (n8nKeyEl) n8nKeyEl.value = '';
    if (claudeKeyEl) claudeKeyEl.value = '';

    // Show placeholder if key is set
    try {
      const n8nStatus = await msg('getApiKeyStatus', { provider: 'n8n' });
      if (n8nKeyEl && n8nStatus && n8nStatus.hasKey) {
        n8nKeyEl.placeholder = '••••••• (key saved)';
      }
    } catch (_) { }

    try {
      const claudeStatus = await msg('getApiKeyStatus', { provider: 'claude' });
      if (claudeKeyEl && claudeStatus && claudeStatus.hasKey) {
        claudeKeyEl.placeholder = '••••••• (key saved)';
      }
    } catch (_) { }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

async function saveSettings() {
  const n8nUrl = ($('n8nUrl') || {}).value || '';
  const n8nApiKey = ($('n8nApiKey') || {}).value || '';
  const claudeApiKey = ($('claudeApiKey') || {}).value || '';
  const claudeModel = ($('claudeModel') || {}).value || 'claude-sonnet-4-5-20250929';
  const autoInject = ($('autoInject') || {}).checked || false;
  const saveHistoryPref = ($('saveHistory') || {}).checked !== false;
  const notifications = ($('enableNotifications') || {}).checked !== false;

  try {
    // Save general settings
    await msg('updateSettings', {
      settings: {
        n8nBaseUrl: n8nUrl,
        claudeModel,
        autoInject,
        saveHistory: saveHistoryPref,
        notifications
      }
    });

    // Save API keys if provided (only overwrite if user typed something)
    if (n8nApiKey) {
      await msg('setApiKey', { provider: 'n8n', apiKey: n8nApiKey });
    }
    if (claudeApiKey) {
      await msg('setApiKey', { provider: 'claude', apiKey: claudeApiKey });
    }

    // Request host permission for n8n URL if needed
    if (n8nUrl) {
      try {
        await msg('requestN8nPermission', { url: n8nUrl });
      } catch (_) {
        console.warn('Could not request n8n host permission');
      }
    }

    const modal = $('settingsModal');
    if (modal) modal.classList.add('hidden');

    updateStatusBar();
  } catch (error) {
    alert('Error saving settings: ' + error.message);
  }
}

async function clearData() {
  if (!confirm('Are you sure you want to reset all settings? This cannot be undone.')) {
    return;
  }

  try {
    await msg('resetSettings');
    await msg('clearHistory');
    loadSettings();
    alert('All data cleared!');
  } catch (error) {
    alert('Error clearing data: ' + error.message);
  }
}

// ============================================================================
// GENERATE TAB
// ============================================================================

let currentWorkflow = null;

function initGenerate() {
  const generateBtn = $('btnGenerate');
  const copyBtn = $('btnCopyOutput');
  const saveBtn = $('btnSaveOutput');
  const injectBtn = $('btnInjectOutput');
  const downloadBtn = $('btnDownloadOutput');

  if (generateBtn) generateBtn.addEventListener('click', generateWorkflow);
  if (copyBtn) copyBtn.addEventListener('click', copyOutput);
  if (saveBtn) saveBtn.addEventListener('click', saveToN8n);
  if (injectBtn) injectBtn.addEventListener('click', injectWorkflow);
  if (downloadBtn) downloadBtn.addEventListener('click', downloadOutput);
}

async function generateWorkflow() {
  const promptEl = $('prompt');
  const modelEl = $('model');
  const generateBtn = $('btnGenerate');
  const outputSection = $('output-section');
  const jsonOutput = $('json-output');

  const promptText = promptEl ? promptEl.value.trim() : '';
  const model = modelEl ? modelEl.value : undefined;

  if (!promptText) {
    alert('Please enter a prompt');
    return;
  }

  if (generateBtn) {
    generateBtn.disabled = true;
    const btnText = generateBtn.querySelector('.btn-text');
    const btnLoader = generateBtn.querySelector('.btn-loader');
    if (btnText) btnText.textContent = 'Generating...';
    if (btnLoader) btnLoader.classList.remove('hidden');
  }

  try {
    const result = await msg('generateWorkflow', { prompt: promptText, model });

    if (result && result.workflow) {
      currentWorkflow = result.workflow;
      if (jsonOutput) jsonOutput.textContent = formatJson(result.workflow);
      if (outputSection) outputSection.classList.remove('hidden');
    } else if (result && result.error) {
      if (jsonOutput) jsonOutput.textContent = 'Error: ' + result.error;
      if (outputSection) outputSection.classList.remove('hidden');
    } else {
      if (jsonOutput) jsonOutput.textContent = 'Error: No workflow generated';
      if (outputSection) outputSection.classList.remove('hidden');
    }
  } catch (error) {
    if (jsonOutput) jsonOutput.textContent = 'Error: ' + error.message;
    if (outputSection) outputSection.classList.remove('hidden');
  }

  if (generateBtn) {
    generateBtn.disabled = false;
    const btnText = generateBtn.querySelector('.btn-text');
    const btnLoader = generateBtn.querySelector('.btn-loader');
    if (btnText) btnText.textContent = 'Generate Workflow';
    if (btnLoader) btnLoader.classList.add('hidden');
  }
}

function copyOutput() {
  const jsonOutput = $('json-output');
  if (!jsonOutput) return;

  navigator.clipboard.writeText(jsonOutput.textContent).then(() => {
    const btn = $('btnCopyOutput');
    if (btn) {
      const original = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = original; }, 2000);
    }
  });
}

async function saveToN8n() {
  if (!currentWorkflow) {
    alert('Please generate a workflow first');
    return;
  }

  try {
    const result = await msg('createWorkflow', { workflow: currentWorkflow });
    if (result && result.error) {
      alert('Error saving workflow: ' + result.error);
    } else {
      alert('Workflow saved! ID: ' + (result.id || 'unknown'));
    }
  } catch (error) {
    alert('Error saving workflow: ' + error.message);
  }
}

async function injectWorkflow() {
  if (!currentWorkflow) {
    alert('Please generate a workflow first');
    return;
  }

  try {
    const result = await msg('injectWorkflow', { workflow: currentWorkflow });
    if (result && result.success) {
      alert('Workflow injected into n8n!');
    } else {
      alert('Error: ' + (result?.error || 'Failed to inject'));
    }
  } catch (error) {
    alert('Error injecting workflow: ' + error.message);
  }
}

function downloadOutput() {
  const jsonOutput = $('json-output');
  const data = jsonOutput ? jsonOutput.textContent : '';

  if (!data) {
    alert('Please generate a workflow first');
    return;
  }

  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'workflow.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================================
// WORKFLOWS TAB
// ============================================================================

function initWorkflows() {
  const searchInput = $('workflowSearch');
  if (searchInput) {
    searchInput.addEventListener('input', filterWorkflows);
  }

  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filterWorkflows();
    });
  });
}

async function loadWorkflows() {
  const list = $('workflows-list');
  if (!list) return;
  showLoading(list);

  try {
    const result = await msg('listWorkflows');
    const workflows = result && result.data ? result.data : (Array.isArray(result) ? result : []);

    list.innerHTML = '';

    if (workflows.length === 0) {
      list.textContent = 'No workflows found. Configure n8n in Settings.';
      hideLoading(list);
      return;
    }

    workflows.forEach(workflow => {
      const card = createWorkflowCard(workflow);
      list.appendChild(card);
    });

    hideLoading(list);
  } catch (error) {
    list.innerHTML = '';
    list.textContent = 'Error: ' + error.message;
    hideLoading(list);
  }
}

function createWorkflowCard(workflow) {
  const card = document.createElement('div');
  card.className = 'workflow-card';
  card.dataset.name = (workflow.name || '').toLowerCase();
  card.dataset.active = workflow.active ? 'true' : 'false';

  card.innerHTML = `
    <div class="card-header">
      <h3></h3>
      ${workflow.active ? '<span class="badge active">Active</span>' : '<span class="badge">Inactive</span>'}
    </div>
    <div class="card-body">
      <p class="text-muted"></p>
    </div>
    <div class="card-actions">
      <button class="btn btn-secondary btn-small btn-toggle"></button>
      <button class="btn btn-secondary btn-small btn-delete">Delete</button>
    </div>
  `;

  const h3 = card.querySelector('h3');
  h3.textContent = workflow.name;

  const p = card.querySelector('.text-muted');
  p.textContent = `Updated ${timeAgo(workflow.updatedAt)}`;

  const toggleBtn = card.querySelector('.btn-toggle');
  toggleBtn.textContent = workflow.active ? 'Deactivate' : 'Activate';
  toggleBtn.addEventListener('click', () => toggleWorkflow(workflow.id, !workflow.active));

  const deleteBtn = card.querySelector('.btn-delete');
  deleteBtn.addEventListener('click', () => deleteWorkflow(workflow.id));

  return card;
}

function filterWorkflows() {
  const searchEl = $('workflowSearch');
  const searchTerm = searchEl ? searchEl.value.toLowerCase() : '';
  const activeFilter = document.querySelector('.filter-btn.active');
  const filterValue = activeFilter ? activeFilter.dataset.filter : 'all';
  const cards = document.querySelectorAll('.workflow-card');

  cards.forEach(card => {
    const name = card.dataset.name || '';
    const isActive = card.dataset.active === 'true';

    const matchesSearch = name.includes(searchTerm);
    const matchesFilter = filterValue === 'all' ||
      (filterValue === 'active' && isActive) ||
      (filterValue === 'inactive' && !isActive);

    card.style.display = matchesSearch && matchesFilter ? '' : 'none';
  });
}

async function toggleWorkflow(id, activate) {
  try {
    const action = activate ? 'activateWorkflow' : 'deactivateWorkflow';
    await msg(action, { id });
    loadWorkflows();
  } catch (error) {
    alert('Error toggling workflow: ' + error.message);
  }
}

async function deleteWorkflow(id) {
  if (!confirm('Are you sure you want to delete this workflow?')) {
    return;
  }

  try {
    await msg('deleteWorkflow', { id });
    loadWorkflows();
  } catch (error) {
    alert('Error deleting workflow: ' + error.message);
  }
}

// ============================================================================
// EXECUTIONS TAB
// ============================================================================

function initExecutions() {
  const workflowFilter = $('executionWorkflowFilter');
  const statusFilter = $('executionStatusFilter');

  if (workflowFilter) workflowFilter.addEventListener('change', loadExecutions);
  if (statusFilter) statusFilter.addEventListener('change', loadExecutions);
}

async function loadExecutions() {
  const list = $('executions-list');
  if (!list) return;

  const workflowFilterEl = $('executionWorkflowFilter');
  const statusFilterEl = $('executionStatusFilter');
  const workflowId = workflowFilterEl ? workflowFilterEl.value : '';
  const status = statusFilterEl ? statusFilterEl.value : '';

  showLoading(list);

  try {
    const params = {};
    if (workflowId) params.workflowId = workflowId;
    if (status) params.status = status;

    const result = await msg('listExecutions', { params });
    const executions = result && result.data ? result.data : (Array.isArray(result) ? result : []);

    list.innerHTML = '';

    if (executions.length === 0) {
      list.textContent = 'No executions found.';
      hideLoading(list);
      return;
    }

    executions.forEach(execution => {
      const card = createExecutionCard(execution);
      list.appendChild(card);
    });

    // Populate workflow filter if it only has default option
    if (workflowFilterEl && workflowFilterEl.options.length <= 1) {
      await populateWorkflowFilter();
    }

    hideLoading(list);
  } catch (error) {
    list.innerHTML = '';
    list.textContent = 'Error: ' + error.message;
    hideLoading(list);
  }
}

async function populateWorkflowFilter() {
  try {
    const result = await msg('listWorkflows');
    const workflows = result && result.data ? result.data : (Array.isArray(result) ? result : []);
    const select = $('executionWorkflowFilter');
    if (!select) return;

    workflows.forEach(workflow => {
      const option = document.createElement('option');
      option.value = workflow.id;
      option.textContent = workflow.name;
      select.appendChild(option);
    });
  } catch (error) {
    console.error('Error populating workflow filter:', error);
  }
}

function createExecutionCard(execution) {
  const card = document.createElement('div');
  card.className = 'execution-card';

  const statusClass = execution.status === 'success' ? 'success' :
    execution.status === 'error' ? 'error' : 'waiting';

  card.innerHTML = `
    <div class="card-header">
      <h4></h4>
      <span class="badge ${statusClass}">${execution.status || 'unknown'}</span>
    </div>
    <div class="card-body">
      <p class="text-muted"></p>
      <p class="text-muted"></p>
    </div>
  `;

  const h4 = card.querySelector('h4');
  h4.textContent = execution.workflowData?.name || `Workflow #${execution.workflowId || '?'}`;

  const times = card.querySelectorAll('.text-muted');
  times[0].textContent = `Started ${timeAgo(execution.startedAt)}`;
  times[1].textContent = execution.stoppedAt ?
    `Duration: ${Math.round((new Date(execution.stoppedAt) - new Date(execution.startedAt)) / 1000)}s` :
    'Running...';

  return card;
}

// ============================================================================
// HISTORY TAB
// ============================================================================

function initHistory() {
  const searchInput = $('historySearch');
  if (searchInput) {
    searchInput.addEventListener('input', filterHistory);
  }
}

async function loadHistory() {
  const list = $('history-list');
  if (!list) return;
  showLoading(list);

  try {
    const result = await msg('getHistory');
    const items = result && result.items ? result.items :
      (Array.isArray(result) ? result : []);

    list.innerHTML = '';

    if (items.length === 0) {
      list.textContent = 'No history yet. Generate a workflow to get started.';
      hideLoading(list);
      return;
    }

    items.forEach(item => {
      const card = createHistoryCard(item);
      list.appendChild(card);
    });

    hideLoading(list);
  } catch (error) {
    list.innerHTML = '';
    list.textContent = 'Error: ' + error.message;
    hideLoading(list);
  }
}

function createHistoryCard(item) {
  const card = document.createElement('div');
  card.className = 'history-card';

  const promptExcerpt = (item.prompt || '').substring(0, 60) + ((item.prompt || '').length > 60 ? '...' : '');

  card.innerHTML = `
    <div class="card-header">
      <h5></h5>
    </div>
    <div class="card-body">
      <p class="text-muted"></p>
      <p class="text-muted"></p>
    </div>
    <div class="card-actions">
      <button class="btn btn-secondary btn-small btn-view">View</button>
      <button class="btn btn-secondary btn-small btn-regen">Re-gen</button>
      <button class="btn btn-secondary btn-small btn-delete">Delete</button>
    </div>
  `;

  const h5 = card.querySelector('h5');
  h5.textContent = promptExcerpt;

  const muted = card.querySelectorAll('.text-muted');
  muted[0].textContent = `Model: ${item.model || 'unknown'}`;
  muted[1].textContent = `${timeAgo(item.timestamp)} • ${item.tokensUsed || 0} tokens`;

  card.querySelector('.btn-view').addEventListener('click', () => viewHistoryItem(item));
  card.querySelector('.btn-regen').addEventListener('click', () => regenHistoryItem(item));
  card.querySelector('.btn-delete').addEventListener('click', () => deleteHistoryItem(item.id));

  return card;
}

function filterHistory() {
  const searchEl = $('historySearch');
  const searchTerm = searchEl ? searchEl.value.toLowerCase() : '';
  const cards = document.querySelectorAll('.history-card');

  cards.forEach(card => {
    const text = card.textContent.toLowerCase();
    card.style.display = text.includes(searchTerm) ? '' : 'none';
  });
}

function viewHistoryItem(item) {
  // Switch to generate tab and show the workflow
  const jsonOutput = $('json-output');
  const outputSection = $('output-section');

  if (jsonOutput) {
    jsonOutput.textContent = formatJson(item.workflow || item.response || item);
    currentWorkflow = item.workflow || null;
  }
  if (outputSection) outputSection.classList.remove('hidden');

  document.querySelector('.tab-btn[data-tab="generate"]').click();
}

function regenHistoryItem(item) {
  const promptEl = $('prompt');
  const modelEl = $('model');
  if (promptEl) promptEl.value = item.prompt || '';
  if (modelEl && item.model) modelEl.value = item.model;
  document.querySelector('.tab-btn[data-tab="generate"]').click();
}

async function deleteHistoryItem(id) {
  try {
    await msg('deleteHistoryEntry', { id });
    loadHistory();
  } catch (error) {
    alert('Error deleting history entry: ' + error.message);
  }
}

// ============================================================================
// DEBUG TAB
// ============================================================================

function initDebug() {
  const sendBtn = $('btnDebugSend');
  if (sendBtn) sendBtn.addEventListener('click', sendDebugRequest);
}

async function sendDebugRequest() {
  const systemPromptEl = $('systemPrompt');
  const userPromptEl = $('userPrompt');
  const debugResponse = $('debug-response');
  const debugContent = $('debugResponseContent');

  const systemPrompt = systemPromptEl ? systemPromptEl.value : '';
  const userPrompt = userPromptEl ? userPromptEl.value : '';

  if (!userPrompt) {
    alert('Please enter a user prompt');
    return;
  }

  if (debugResponse) debugResponse.classList.remove('hidden');
  if (debugContent) showLoading(debugContent);

  try {
    const result = await msg('debugRequest', { systemPrompt, userPrompt });
    if (debugContent) {
      debugContent.innerHTML = '';
      if (result && result.error) {
        debugContent.textContent = 'Error: ' + result.error;
      } else if (result) {
        const formatted = formatJson({
          response: result.content,
          tokens: result.tokensUsed,
          duration: result.duration,
          stopReason: result.stopReason
        });
        debugContent.textContent = formatted;
      }
    }
  } catch (error) {
    if (debugContent) debugContent.textContent = 'Error: ' + error.message;
  }

  if (debugContent) hideLoading(debugContent);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('n8n Pilot popup loaded');
  try {
    initTabs();
    initSettings();
    initGenerate();
    initWorkflows();
    initExecutions();
    initHistory();
    initDebug();
    updateStatusBar();
    console.log('n8n Pilot popup initialized successfully');
  } catch (error) {
    console.error('n8n Pilot init error:', error);
  }
});
