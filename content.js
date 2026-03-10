/**
 * n8n Pilot — Content Script
 * Injected programmatically ONLY on n8n pages.
 * Handles: Shadow DOM panel injection, workflow injection,
 * notifications, save detection, stream forwarding.
 */

(function () {
  // Prevent double injection
  if (window.__n8nPilotInjected) return;
  window.__n8nPilotInjected = true;

  let _shadowRoot = null;
  let _panelHost = null;
  let _keepAliveInterval = null;
  let _chatHandlers = null;
  let _contextCleanup = null;

  // --- Panel Creation ---

  async function createPanel() {
    if (_panelHost) return; // Already created

    // Create host element
    _panelHost = document.createElement('div');
    _panelHost.id = 'n8n-pilot-host';
    _panelHost.style.cssText = `
      position: fixed;
      top: 0;
      right: 0;
      width: 380px;
      height: 100vh;
      z-index: 99999;
      border: none;
      margin: 0;
      padding: 0;
    `;

    // Attach Shadow DOM — use open mode in test mode for E2E access
    const shadowMode = window.__N8N_PILOT_TEST_MODE__ ? 'open' : 'closed';
    _shadowRoot = _panelHost.attachShadow({ mode: shadowMode });

    // Load CSS
    try {
      const cssUrl = chrome.runtime.getURL('panel/panel.css');
      const cssResp = await fetch(cssUrl);
      const cssText = await cssResp.text();

      const style = document.createElement('style');
      style.textContent = cssText;
      _shadowRoot.appendChild(style);
    } catch (err) {
      console.error('[n8n Pilot] Failed to load panel CSS:', err);
    }

    // Load HTML
    try {
      const htmlUrl = chrome.runtime.getURL('panel/panel.html');
      const htmlResp = await fetch(htmlUrl);
      const htmlText = await htmlResp.text();

      const wrapper = document.createElement('div');
      wrapper.innerHTML = htmlText;
      // Move all children into shadow root
      while (wrapper.firstChild) {
        _shadowRoot.appendChild(wrapper.firstChild);
      }
    } catch (err) {
      console.error('[n8n Pilot] Failed to load panel HTML:', err);
    }

    // Append to page
    document.body.appendChild(_panelHost);

    // Push n8n canvas
    pushCanvas(true);

    // Load panel scripts
    await loadPanelScripts();
  }

  async function loadPanelScripts() {
    // Content scripts can't use ES modules, so all panel logic is inlined
    initPanelController();
  }

  /**
   * Inline panel controller — replaces panel.js module loading.
   * Since content scripts can't use ES modules, we inline the core logic.
   */
  function initPanelController() {
    if (!_shadowRoot) return;

    const $ = (id) => _shadowRoot.getElementById(id);
    const $q = (sel) => _shadowRoot.querySelector(sel);
    const $qa = (sel) => _shadowRoot.querySelectorAll(sel);

    // --- View Routing ---
    $qa('.header-btn[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        const viewId = btn.dataset.view;
        toggleDrawer(viewId, btn);
      });
    });

    $qa('.btn-close-drawer').forEach(btn => {
      btn.addEventListener('click', () => {
        closeDrawer(btn.dataset.close);
      });
    });

    function toggleDrawer(viewId, triggerBtn) {
      const drawer = $(viewId);
      if (!drawer) return;

      const isOpen = !drawer.classList.contains('hidden');

      // Close all drawers
      $qa('.view-container.drawer').forEach(d => d.classList.add('hidden'));
      $qa('.header-btn[data-view]').forEach(b => b.classList.remove('active'));

      if (!isOpen) {
        drawer.classList.remove('hidden');
        if (triggerBtn) triggerBtn.classList.add('active');

        // Load data on open
        if (viewId === 'settingsView') loadSettingsData();
        if (viewId === 'workflowsView') loadWorkflows($, _msg);
        if (viewId === 'executionsView') loadExecutions($, _msg);
        if (viewId === 'historyView') loadHistoryView($, _msg);
      }
    }

    function closeDrawer(viewId) {
      const drawer = $(viewId);
      if (drawer) drawer.classList.add('hidden');
      $qa('.header-btn[data-view]').forEach(b => b.classList.remove('active'));
    }

    // --- Collapse Toggle ---
    const collapseBtn = $('btnCollapsePanel');
    if (collapseBtn) {
      collapseBtn.addEventListener('click', () => {
        const container = $('panelContainer');
        if (!container) return;

        const isCollapsed = container.classList.toggle('collapsed');
        _panelHost.style.width = isCollapsed ? '48px' : '380px';
        pushCanvas(!isCollapsed);
      });
    }

    // --- Settings View ---
    initSettingsController($, $q, $qa);

    // --- Chat ---
    _chatHandlers = initChatController($, _msg, {
      startKeepAlive,
      stopKeepAlive,
    });

    // --- Context Badge ---
    updateContextBadge($);

    // Watch for SPA navigation changes
    _contextCleanup = watchN8nContext(() => {
      updateContextBadge($);
    });

    // --- Search/Filter listeners for drawers ---
    const workflowSearch = $('workflowSearch');
    const workflowFilter = $('workflowFilter');
    if (workflowSearch) workflowSearch.addEventListener('input', () => filterListItems($, 'workflowsList', workflowSearch.value, workflowFilter?.value));
    if (workflowFilter) workflowFilter.addEventListener('change', () => filterListItems($, 'workflowsList', workflowSearch?.value, workflowFilter.value));

    const execStatusFilter = $('executionStatusFilter');
    if (execStatusFilter) execStatusFilter.addEventListener('change', () => loadExecutions($, _msg));

    const historySearch = $('historySearch');
    if (historySearch) historySearch.addEventListener('input', () => filterListItems($, 'historyList', historySearch.value));

    // --- Status Bar ---
    updateStatusBar($);
    updateModelIndicator($);

    // Expose update function for settings view
    window.__n8nPilotPanel = {
      updateStatusBar: () => updateStatusBar($),
      $,
      $q,
      $qa,
    };
  }

  // --- Chat Controller (inlined from chat.js) ---

  function initChatController($, msgFn, options = {}) {
    const chatMessages = $('chatMessages');
    const chatInput = $('chatInput');
    const sendBtn = $('btnSend');
    const abortBtn = $('btnAbortGeneration');
    const tokenCount = $('tokenCount');

    let isStreaming = false;
    let currentAssistantBubble = null;
    let streamFullText = '';

    if (!chatMessages || !chatInput || !sendBtn) return null;

    // --- Event Listeners ---
    sendBtn.addEventListener('click', () => sendMessage());

    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    chatInput.addEventListener('input', () => {
      chatInput.style.height = 'auto';
      chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
    });

    if (abortBtn) {
      abortBtn.addEventListener('click', () => {
        msgFn('cancelGeneration').catch(() => {});
        finishStreaming('Generation cancelled.');
      });
    }

    // --- Send Message ---
    async function sendMessage() {
      const text = chatInput.value.trim();
      if (!text || isStreaming) return;

      appendMessage('user', text);
      chatInput.value = '';
      chatInput.style.height = 'auto';

      // Save user message
      msgFn('saveChatMessage', { role: 'user', content: text }).catch(() => {});

      startStreaming();

      try {
        await msgFn('generateWorkflowStream', { prompt: text });
      } catch (err) {
        finishStreaming(`Error: ${err.message}`);
      }
    }

    // --- Message Rendering ---
    function appendMessage(role, content) {
      const welcome = chatMessages.querySelector('.chat-welcome');
      if (welcome) welcome.remove();

      const bubble = document.createElement('div');
      bubble.className = `chat-bubble ${role}`;
      bubble.innerHTML = _formatContent(content);
      chatMessages.appendChild(bubble);
      scrollToBottom();
      return bubble;
    }

    function _formatContent(text) {
      let html = _chatEscapeHtml(text);
      html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, _lang, code) =>
        `<pre class="code-block"><code>${code}</code></pre>`);
      html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
      html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      html = html.replace(/\n/g, '<br>');
      return html;
    }

    function _chatEscapeHtml(str) {
      const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
      return String(str).replace(/[&<>"']/g, m => map[m]);
    }

    // --- Streaming ---
    function startStreaming() {
      isStreaming = true;
      streamFullText = '';
      if (abortBtn) abortBtn.classList.remove('hidden');

      currentAssistantBubble = document.createElement('div');
      currentAssistantBubble.className = 'chat-bubble assistant';
      currentAssistantBubble.innerHTML = '<span class="streaming-cursor"></span>';
      chatMessages.appendChild(currentAssistantBubble);
      scrollToBottom();
      options.startKeepAlive?.();
    }

    function handleChunk(text) {
      if (!currentAssistantBubble) return;
      streamFullText += text;
      currentAssistantBubble.innerHTML = _formatContent(streamFullText) +
        '<span class="streaming-cursor"></span>';
      scrollToBottom();
    }

    function finishStreaming(errorMsg) {
      isStreaming = false;
      if (abortBtn) abortBtn.classList.add('hidden');
      options.stopKeepAlive?.();

      if (errorMsg && currentAssistantBubble) {
        currentAssistantBubble.innerHTML = `<span class="error-text">${_chatEscapeHtml(errorMsg)}</span>`;
        currentAssistantBubble = null;
        return;
      }

      if (currentAssistantBubble && streamFullText) {
        currentAssistantBubble.innerHTML = _formatContent(streamFullText);
        const workflowJson = _extractWorkflowJson(streamFullText);
        if (workflowJson) {
          _appendWorkflowCard(workflowJson);
        }
      }

      currentAssistantBubble = null;
      streamFullText = '';
    }

    function handleStreamDone(data) {
      if (tokenCount && data?.usage) {
        const total = (data.usage.input || 0) + (data.usage.output || 0);
        tokenCount.textContent = `${total} tokens`;
      }
      finishStreaming();

      if (data?.content) {
        msgFn('saveChatMessage', {
          role: 'assistant',
          content: data.content,
          metadata: { tokensUsed: data.tokensUsed, model: data.model },
        }).catch(() => {});
      }
    }

    function handleStreamError(error) {
      finishStreaming(error || 'Stream error');
    }

    // --- Workflow JSON Detection ---
    function _extractWorkflowJson(text) {
      const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (codeBlockMatch) {
        try {
          const parsed = JSON.parse(codeBlockMatch[1]);
          if (parsed.nodes && Array.isArray(parsed.nodes)) return parsed;
        } catch (_) { /* not valid JSON */ }
      }

      const jsonMatch = text.match(/\{[\s\S]*"nodes"\s*:\s*\[[\s\S]*\][\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.nodes && Array.isArray(parsed.nodes)) return parsed;
        } catch (_) { /* not valid JSON */ }
      }
      return null;
    }

    // --- Workflow Card ---
    function _appendWorkflowCard(workflow) {
      const card = document.createElement('div');
      card.className = 'workflow-card';

      const nodeCount = workflow.nodes?.length || 0;
      const connectionCount = workflow.connections ? Object.keys(workflow.connections).length : 0;
      const name = workflow.name || 'Generated Workflow';

      card.innerHTML = `
        <div class="workflow-card-header">
          <span class="workflow-card-icon">\u26a1</span>
          <span class="workflow-card-title">${_chatEscapeHtml(name)}</span>
        </div>
        <div class="workflow-card-meta">
          <span>${nodeCount} nodes</span>
          <span>${connectionCount} connections</span>
        </div>
        <div class="workflow-card-actions">
          <button class="btn btn-primary btn-sm btn-copy-workflow">Copy JSON</button>
          <button class="btn btn-secondary btn-sm btn-inject-workflow">Inject</button>
        </div>
      `;

      const copyBtn = card.querySelector('.btn-copy-workflow');
      const injectBtn = card.querySelector('.btn-inject-workflow');

      if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(JSON.stringify(workflow, null, 2));
            copyBtn.textContent = 'Copied!';
            setTimeout(() => { copyBtn.textContent = 'Copy JSON'; }, 2000);
          } catch (_) {
            copyBtn.textContent = 'Failed';
            setTimeout(() => { copyBtn.textContent = 'Copy JSON'; }, 2000);
          }
        });
      }

      if (injectBtn) {
        injectBtn.addEventListener('click', async () => {
          try {
            await msgFn('injectWorkflow', { workflow });
            injectBtn.textContent = 'Injected!';
            setTimeout(() => { injectBtn.textContent = 'Inject'; }, 2000);
          } catch (_) {
            injectBtn.textContent = 'Failed';
            setTimeout(() => { injectBtn.textContent = 'Inject'; }, 2000);
          }
        });
      }

      chatMessages.appendChild(card);
      scrollToBottom();
    }

    function scrollToBottom() {
      requestAnimationFrame(() => {
        chatMessages.scrollTop = chatMessages.scrollHeight;
      });
    }

    return { handleChunk, handleStreamDone, handleStreamError, appendMessage };
  }

  // --- Settings Controller (inlined from settings-view.js) ---

  function initSettingsController($) {
    const saveBtn = $('btnSaveSettings');
    const resetBtn = $('btnResetSettings');
    const testN8nBtn = $('btnTestN8n');
    const testClaudeBtn = $('btnTestClaude');

    if (saveBtn) saveBtn.addEventListener('click', () => saveSettings($));
    if (resetBtn) resetBtn.addEventListener('click', () => resetAllData($));
    if (testN8nBtn) testN8nBtn.addEventListener('click', () => testN8nConnection($));
    if (testClaudeBtn) testClaudeBtn.addEventListener('click', () => testClaudeConnection($));
  }

  function loadSettingsData() {
    if (!_shadowRoot) return;
    const $ = (id) => _shadowRoot.getElementById(id);

    _msg('getSettings').then(result => {
      if (result) {
        const urlEl = $('settingsN8nUrl');
        const modelEl = $('settingsClaudeModel');
        const autoInjectEl = $('settingsAutoInject');
        const saveHistoryEl = $('settingsSaveHistory');
        const notificationsEl = $('settingsNotifications');

        if (urlEl) urlEl.value = result.n8nBaseUrl || '';
        if (modelEl) modelEl.value = result.claudeModel || 'claude-sonnet-4-5-20250929';
        if (autoInjectEl) autoInjectEl.checked = result.autoInject !== false;
        if (saveHistoryEl) saveHistoryEl.checked = result.saveHistory !== false;
        if (notificationsEl) notificationsEl.checked = result.notifications !== false;
      }

      // Show placeholder if key is set
      const n8nKeyEl = $('settingsN8nApiKey');
      const claudeKeyEl = $('settingsClaudeApiKey');
      if (n8nKeyEl) n8nKeyEl.value = '';
      if (claudeKeyEl) claudeKeyEl.value = '';

      _msg('getApiKeyStatus', { provider: 'n8n' }).then(status => {
        if (n8nKeyEl && status?.hasKey) {
          n8nKeyEl.placeholder = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022 (key saved)';
        } else if (n8nKeyEl) {
          n8nKeyEl.placeholder = 'Enter n8n API key';
        }
      }).catch(() => {});

      _msg('getApiKeyStatus', { provider: 'claude' }).then(status => {
        if (claudeKeyEl && status?.hasKey) {
          claudeKeyEl.placeholder = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022 (key saved)';
        } else if (claudeKeyEl) {
          claudeKeyEl.placeholder = 'Enter Claude API key';
        }
      }).catch(() => {});
    }).catch(error => {
      console.error('[n8n Pilot] Error loading settings:', error);
    });
  }

  async function saveSettings($) {
    const n8nUrl = ($('settingsN8nUrl') || {}).value || '';
    const n8nApiKey = ($('settingsN8nApiKey') || {}).value || '';
    const claudeApiKey = ($('settingsClaudeApiKey') || {}).value || '';
    const claudeModel = ($('settingsClaudeModel') || {}).value || 'claude-sonnet-4-5-20250929';
    const autoInject = ($('settingsAutoInject') || {}).checked !== false;
    const saveHistory = ($('settingsSaveHistory') || {}).checked !== false;
    const notifications = ($('settingsNotifications') || {}).checked !== false;

    try {
      await _msg('updateSettings', {
        settings: { n8nBaseUrl: n8nUrl, claudeModel, autoInject, saveHistory, notifications }
      });

      if (n8nApiKey) await _msg('setApiKey', { provider: 'n8n', apiKey: n8nApiKey });
      if (claudeApiKey) await _msg('setApiKey', { provider: 'claude', apiKey: claudeApiKey });

      if (n8nUrl) {
        try { await _msg('requestN8nPermission', { url: n8nUrl }); } catch (_) { /* ignore */ }
      }

      showTestResult($, 'n8nTestResult', true, 'Settings saved');
      updateStatusBar($);
    } catch (error) {
      showTestResult($, 'n8nTestResult', false, 'Error: ' + error.message);
    }
  }

  async function resetAllData($) {
    const resetBtn = $('btnResetSettings');
    if (!resetBtn) return;

    if (resetBtn.dataset.confirming === 'true') {
      try {
        await _msg('resetSettings');
        await _msg('clearHistory');
        resetBtn.dataset.confirming = 'false';
        resetBtn.textContent = 'Reset All Data';
        loadSettingsData();
        showTestResult($, 'n8nTestResult', true, 'All data cleared');
      } catch (error) {
        showTestResult($, 'n8nTestResult', false, 'Error: ' + error.message);
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

  async function testN8nConnection($) {
    const btn = $('btnTestN8n');
    if (btn) btn.disabled = true;

    try {
      const url = ($('settingsN8nUrl') || {}).value;
      const apiKey = ($('settingsN8nApiKey') || {}).value;
      if (url) await _msg('updateSettings', { settings: { n8nBaseUrl: url } });
      if (apiKey) await _msg('setApiKey', { provider: 'n8n', apiKey });
      if (url) {
        try { await _msg('requestN8nPermission', { url }); } catch (_) { /* ignore */ }
      }

      const result = await _msg('testN8nConnection');
      if (result?.connected) {
        showTestResult($, 'n8nTestResult', true, `Connected (v${result.version || '?'})`);
      } else {
        showTestResult($, 'n8nTestResult', false, result?.error || 'Connection failed');
      }
    } catch (error) {
      showTestResult($, 'n8nTestResult', false, error.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function testClaudeConnection($) {
    const btn = $('btnTestClaude');
    if (btn) btn.disabled = true;

    try {
      const apiKey = ($('settingsClaudeApiKey') || {}).value;
      if (apiKey) await _msg('setApiKey', { provider: 'claude', apiKey });

      const result = await _msg('testClaudeConnection');
      if (result?.connected) {
        showTestResult($, 'claudeTestResult', true, 'Connected');
      } else {
        showTestResult($, 'claudeTestResult', false, result?.error || 'Connection failed');
      }
    } catch (error) {
      showTestResult($, 'claudeTestResult', false, error.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function showTestResult($, elementId, success, message) {
    const el = $(elementId);
    if (!el) return;
    el.classList.remove('hidden', 'success', 'error');
    el.classList.add(success ? 'success' : 'error');
    el.textContent = message;
    setTimeout(() => el.classList.add('hidden'), 5000);
  }

  // --- Status Bar ---

  async function updateStatusBar($) {
    const dot = $('statusDot');
    const text = $('statusText');
    if (!dot || !text) return;

    try {
      const settingsData = await _msg('getSettings');
      const hasN8n = !!(settingsData && settingsData.n8nBaseUrl);
      let hasClaude = false;
      try {
        const claudeStatus = await _msg('getApiKeyStatus', { provider: 'claude' });
        hasClaude = !!(claudeStatus && claudeStatus.hasKey);
      } catch (_) { /* ignore */ }

      let n8nOk = false;
      let claudeOk = false;

      if (hasN8n) {
        try {
          const r = await _msg('testN8nConnection');
          n8nOk = r && r.connected;
        } catch (_) { /* ignore */ }
      }

      if (hasClaude) {
        try {
          const r = await _msg('testClaudeConnection');
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

  async function updateModelIndicator($) {
    const indicator = $('modelIndicator');
    if (!indicator) return;

    try {
      const settings = await _msg('getSettings');
      const model = settings?.claudeModel || 'claude-sonnet-4-5-20250929';
      const short = model.replace(/^claude-/, '').replace(/-\d{8}$/, '');
      indicator.textContent = short;
    } catch (_) {
      indicator.textContent = 'claude-sonnet';
    }
  }

  // --- Canvas Push ---

  function pushCanvas(panelOpen) {
    const appEl = document.querySelector('#app')
      || document.querySelector('.main-content')
      || document.querySelector('[class*="container"]');
    if (appEl) {
      appEl.style.marginRight = panelOpen ? '380px' : '0';
    }
  }

  // --- Panel Toggle ---

  function togglePanel() {
    if (!_panelHost) {
      createPanel();
      return;
    }

    const isVisible = _panelHost.style.display !== 'none';
    _panelHost.style.display = isVisible ? 'none' : 'block';
    pushCanvas(!isVisible);
  }

  function showPanel() {
    if (!_panelHost) {
      createPanel();
    } else {
      _panelHost.style.display = 'block';
      pushCanvas(true);
    }
  }

  function hidePanel() {
    if (_panelHost) {
      _panelHost.style.display = 'none';
      pushCanvas(false);
    }
  }

  // --- Keep-Alive for MV3 Service Worker ---

  function startKeepAlive() {
    if (_keepAliveInterval) return;
    _keepAliveInterval = setInterval(() => {
      _msg('keepAlive').catch(() => {});
    }, 25000);
  }

  function stopKeepAlive() {
    if (_keepAliveInterval) {
      clearInterval(_keepAliveInterval);
      _keepAliveInterval = null;
    }
  }

  // --- Messaging ---

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

  // --- Message Listener ---

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg.type) {
      case 'TOGGLE_PANEL':
        togglePanel();
        sendResponse({ success: true });
        break;

      case 'SHOW_PANEL':
        showPanel();
        sendResponse({ success: true });
        break;

      case 'HIDE_PANEL':
        hidePanel();
        sendResponse({ success: true });
        break;

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

      case 'STREAM_CHUNK':
        handleStreamChunk(msg);
        sendResponse({ success: true });
        break;

      case 'STREAM_DONE':
        handleStreamDone(msg);
        sendResponse({ success: true });
        break;

      case 'STREAM_ERROR':
        handleStreamError(msg);
        sendResponse({ success: true });
        break;

      default:
        sendResponse({ error: 'Unknown message type' });
    }
  });

  // --- Stream Handlers ---

  function handleStreamChunk(msg) {
    if (_chatHandlers) {
      _chatHandlers.handleChunk(msg.text);
    }
  }

  function handleStreamDone(msg) {
    stopKeepAlive();
    if (_chatHandlers) {
      _chatHandlers.handleStreamDone({
        content: msg.fullText,
        usage: msg.usage,
        model: msg.model,
        tokensUsed: msg.usage,
      });
    }
  }

  function handleStreamError(msg) {
    stopKeepAlive();
    if (_chatHandlers) {
      _chatHandlers.handleStreamError(msg.error);
    }
  }

  // --- Workflow Injection ---

  async function injectWorkflow(workflow) {
    try {
      const json = typeof workflow === 'string' ? workflow : JSON.stringify(workflow);

      // Step 1: Copy to clipboard
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(json);
        } else {
          const textarea = document.createElement('textarea');
          textarea.value = json;
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.select();
          const ok = document.execCommand('copy');
          document.body.removeChild(textarea);
          if (!ok) throw new Error('Fallback copy command failed');
        }
      } catch (clipErr) {
        showNotification(false, `Clipboard failed: ${clipErr.message}. Copy JSON manually.`);
        return { success: false, error: `Clipboard failed: ${clipErr.message}` };
      }

      // Step 2: Try to find n8n canvas and simulate paste
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

        showNotification(true, 'Workflow copied to clipboard and paste attempted. If nodes did not appear, press Ctrl+V on the canvas.');
        return { success: true, method: 'clipboard+paste', verified: false };
      } else {
        showNotification(true, 'Workflow copied to clipboard. Open a workflow in n8n and press Ctrl+V to paste.');
        return { success: true, method: 'clipboard-only', verified: false };
      }
    } catch (err) {
      showNotification(false, `Injection failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  // --- Get Current Workflow ---

  async function getCurrentWorkflow() {
    try {
      const workflowId = extractWorkflowIdFromUrl();
      return { workflowId, url: window.location.href };
    } catch (err) {
      return { error: err.message };
    }
  }

  function extractWorkflowIdFromUrl() {
    const url = window.location.href;
    const match = url.match(/\/workflow\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  }

  // --- Save Detection ---

  document.addEventListener('click', (event) => {
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
        setTimeout(async () => {
          const workflowId = extractWorkflowIdFromUrl();
          if (workflowId) {
            let workflowData = null;
            try {
              const storeData = window.__n8n_store?.workflow
                || document.querySelector('[data-test-id="workflow-data"]')?.textContent;
              if (storeData) {
                workflowData = typeof storeData === 'string' ? JSON.parse(storeData) : storeData;
              }
            } catch (_) { /* ignore */ }

            chrome.runtime.sendMessage({
              action: 'workflowSaved',
              workflowId,
              workflow: workflowData,
              fetchFromApi: !workflowData,
            });
          }
        }, 1500);
        break;
      }
    }
  }, true);

  // --- Notification UI ---

  function showNotification(isSuccess, message) {
    const existing = document.getElementById('n8n-pilot-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.id = 'n8n-pilot-notification';

    const borderColor = isSuccess ? '#4caf50' : '#f44336';
    const icon = isSuccess ? '\u2713' : '\u2717';

    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 400px;
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
      <span style="flex: 1;">${_escapeHtml(message)}</span>
      <span style="cursor: pointer; opacity: 0.5; font-size: 16px;" id="n8n-pilot-notif-close">\u00d7</span>
    `;

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

    document.getElementById('n8n-pilot-notif-close')?.addEventListener('click', () => {
      notification.remove();
    });

    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.transition = 'opacity 0.3s, transform 0.3s';
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => notification.remove(), 300);
      }
    }, 6000);
  }

  function _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Context Awareness ---

  function extractWorkflowIdFromPage() {
    const url = window.location.href;
    const match = url.match(/\/workflow\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  }

  function updateContextBadge($) {
    const contextName = $('contextName');
    if (!contextName) return;

    const workflowId = extractWorkflowIdFromPage();
    if (workflowId) {
      // Try to get workflow name from DOM
      const nameInput = document.querySelector('[data-test-id="workflow-name-input"]');
      const name = nameInput?.value || nameInput?.textContent || `Workflow ${workflowId}`;
      contextName.textContent = name;
      contextName.title = `ID: ${workflowId}`;
    } else {
      contextName.textContent = 'No workflow';
      contextName.title = '';
    }
  }

  function watchN8nContext(onChange) {
    let lastId = extractWorkflowIdFromPage();

    const check = () => {
      const newId = extractWorkflowIdFromPage();
      if (newId !== lastId) {
        lastId = newId;
        onChange();
      }
    };

    // Watch popstate
    window.addEventListener('popstate', check);

    // Intercept pushState
    const origPush = history.pushState.bind(history);
    const origReplace = history.replaceState.bind(history);

    history.pushState = function (...args) {
      origPush(...args);
      setTimeout(check, 50);
    };
    history.replaceState = function (...args) {
      origReplace(...args);
      setTimeout(check, 50);
    };

    // Watch title
    const obs = new MutationObserver(check);
    const titleEl = document.querySelector('title');
    if (titleEl) obs.observe(titleEl, { childList: true, characterData: true, subtree: true });

    return () => {
      window.removeEventListener('popstate', check);
      history.pushState = origPush;
      history.replaceState = origReplace;
      obs.disconnect();
    };
  }

  // --- Workflows View ---

  async function loadWorkflows($, msgFn) {
    const list = $('workflowsList');
    if (!list) return;
    list.innerHTML = '<div class="list-empty">Loading...</div>';

    try {
      const result = await msgFn('listWorkflows');
      const workflows = result?.data || (Array.isArray(result) ? result : []);
      list.innerHTML = '';

      if (workflows.length === 0) {
        list.innerHTML = '<div class="list-empty">No workflows found</div>';
        return;
      }

      workflows.forEach(wf => {
        const item = document.createElement('div');
        item.className = 'list-item';
        item.dataset.name = (wf.name || '').toLowerCase();
        item.dataset.active = wf.active ? 'true' : 'false';

        const statusClass = wf.active ? 'active' : 'inactive';
        const updatedText = _timeAgo(wf.updatedAt);
        const nodeCount = wf.nodes?.length || '?';

        item.innerHTML = `
          <div class="list-item-header">
            <span class="list-item-title">${_escapeHtml(wf.name || 'Untitled')}</span>
            <span class="badge ${statusClass}">${wf.active ? 'Active' : 'Inactive'}</span>
          </div>
          <div class="list-item-meta">${nodeCount} nodes \u00b7 ${updatedText}</div>
          <div class="list-item-actions">
            <button class="btn btn-secondary btn-sm btn-toggle-wf">${wf.active ? 'Deactivate' : 'Activate'}</button>
          </div>
        `;

        item.querySelector('.btn-toggle-wf')?.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            await msgFn(wf.active ? 'deactivateWorkflow' : 'activateWorkflow', { id: wf.id });
            loadWorkflows($, msgFn);
          } catch (err) {
            console.error('[n8n Pilot] Toggle workflow error:', err);
          }
        });

        list.appendChild(item);
      });
    } catch (err) {
      list.innerHTML = `<div class="list-empty">Error: ${_escapeHtml(err.message)}</div>`;
    }
  }

  // --- Executions View ---

  async function loadExecutions($, msgFn) {
    const list = $('executionsList');
    if (!list) return;
    list.innerHTML = '<div class="list-empty">Loading...</div>';

    try {
      const statusFilter = $('executionStatusFilter');
      const params = {};
      if (statusFilter && statusFilter.value !== 'all') {
        params.status = statusFilter.value;
      }

      const result = await msgFn('listExecutions', { params });
      const executions = result?.data || (Array.isArray(result) ? result : []);
      list.innerHTML = '';

      if (executions.length === 0) {
        list.innerHTML = '<div class="list-empty">No executions found</div>';
        return;
      }

      executions.forEach(exec => {
        const item = document.createElement('div');
        item.className = 'list-item';

        const statusClass = exec.status === 'success' ? 'success' :
          exec.status === 'error' ? 'error' : 'warning';
        const wfName = exec.workflowData?.name || `Workflow #${exec.workflowId || '?'}`;
        const startedText = _timeAgo(exec.startedAt);
        let duration = '';
        if (exec.stoppedAt && exec.startedAt) {
          const ms = new Date(exec.stoppedAt) - new Date(exec.startedAt);
          duration = `${Math.round(ms / 1000)}s`;
        } else {
          duration = 'Running...';
        }

        item.innerHTML = `
          <div class="list-item-header">
            <span class="list-item-title">${_escapeHtml(wfName)}</span>
            <span class="badge ${statusClass}">${exec.status || 'unknown'}</span>
          </div>
          <div class="list-item-meta">${startedText} \u00b7 ${duration}</div>
        `;

        list.appendChild(item);
      });
    } catch (err) {
      list.innerHTML = `<div class="list-empty">Error: ${_escapeHtml(err.message)}</div>`;
    }
  }

  // --- History View ---

  async function loadHistoryView($, msgFn) {
    const list = $('historyList');
    if (!list) return;
    list.innerHTML = '<div class="list-empty">Loading...</div>';

    try {
      const result = await msgFn('getHistory');
      const items = result?.items || (Array.isArray(result) ? result : []);
      list.innerHTML = '';

      if (items.length === 0) {
        list.innerHTML = '<div class="list-empty">No history yet</div>';
        return;
      }

      items.forEach(entry => {
        const item = document.createElement('div');
        item.className = 'list-item';

        const promptExcerpt = (entry.prompt || '').substring(0, 60) +
          ((entry.prompt || '').length > 60 ? '...' : '');
        const model = entry.model || 'unknown';
        const tokens = entry.tokensUsed || 0;
        const timeText = _timeAgo(entry.timestamp);

        item.innerHTML = `
          <div class="list-item-header">
            <span class="list-item-title">${_escapeHtml(promptExcerpt)}</span>
          </div>
          <div class="list-item-meta">${model} \u00b7 ${tokens} tokens \u00b7 ${timeText}</div>
          <div class="list-item-actions">
            <button class="btn btn-secondary btn-sm btn-delete-history">Delete</button>
          </div>
        `;

        item.querySelector('.btn-delete-history')?.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            await msgFn('deleteHistoryEntry', { id: entry.id });
            loadHistoryView($, msgFn);
          } catch (err) {
            console.error('[n8n Pilot] Delete history error:', err);
          }
        });

        list.appendChild(item);
      });
    } catch (err) {
      list.innerHTML = `<div class="list-empty">Error: ${_escapeHtml(err.message)}</div>`;
    }
  }

  // --- List Filtering ---

  function filterListItems($, listId, searchTerm, statusFilter) {
    const list = $(listId);
    if (!list) return;
    const term = (searchTerm || '').toLowerCase();
    const filter = statusFilter || 'all';

    list.querySelectorAll('.list-item').forEach(item => {
      const name = item.dataset.name || item.textContent.toLowerCase();
      const isActive = item.dataset.active;

      const matchesSearch = !term || name.includes(term);
      const matchesFilter = filter === 'all' ||
        (filter === 'active' && isActive === 'true') ||
        (filter === 'inactive' && isActive === 'false');

      item.style.display = matchesSearch && matchesFilter ? '' : 'none';
    });
  }

  // --- Utility ---

  function _timeAgo(isoString) {
    if (!isoString) return 'Unknown';
    const date = new Date(isoString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  // --- Auto-create panel on load ---
  createPanel();
})();
