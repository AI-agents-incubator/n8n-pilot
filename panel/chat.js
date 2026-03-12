/**
 * n8n Pilot — Chat Controller
 * Handles chat UI: message rendering, streaming, workflow cards.
 * Loaded inline by content.js (no ES modules in content scripts).
 */

/**
 * Initialize chat functionality within the panel.
 * Called from content.js initPanelController().
 * @param {Function} $ - getElementById scoped to shadow root
 * @param {Function} _msg - message sender to background.js
 * @param {Object} options - { startKeepAlive, stopKeepAlive }
 */
function initChat($, _msg, options = {}) {
  const chatMessages = $('chatMessages');
  const chatInput = $('chatInput');
  const sendBtn = $('btnSend');
  const abortBtn = $('btnAbortGeneration');
  const tokenCount = $('tokenCount');

  let isStreaming = false;
  let currentAssistantBubble = null;
  let streamFullText = '';

  if (!chatMessages || !chatInput || !sendBtn) return;

  // --- Event Listeners ---

  sendBtn.addEventListener('click', () => sendMessage());

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Auto-resize textarea
  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
  });

  if (abortBtn) {
    abortBtn.addEventListener('click', () => {
      _msg('cancelGeneration').catch(() => {});
      finishStreaming('Generation cancelled.');
    });
  }

  // Copy Dialog button
  const copyDialogBtn = $('btnCopyDialog');
  if (copyDialogBtn) {
    copyDialogBtn.addEventListener('click', async () => {
      const bubbles = chatMessages.querySelectorAll('.chat-bubble');
      if (!bubbles.length) return;
      let dialogText = '';
      bubbles.forEach(b => {
        const role = b.classList.contains('user') ? 'User' : 'Assistant';
        dialogText += `${role}:\n${b.textContent.trim()}\n\n`;
      });
      try {
        await navigator.clipboard.writeText(dialogText.trim());
        copyDialogBtn.classList.add('copied');
        copyDialogBtn.title = 'Copied!';
        setTimeout(() => {
          copyDialogBtn.classList.remove('copied');
          copyDialogBtn.title = 'Copy conversation';
        }, 2000);
      } catch (_) {
        copyDialogBtn.title = 'Failed to copy';
        setTimeout(() => { copyDialogBtn.title = 'Copy conversation'; }, 2000);
      }
    });
  }

  // --- Send Message ---

  async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text || isStreaming) return;

    // Add user message
    appendMessage('user', text);
    chatInput.value = '';
    chatInput.style.height = 'auto';

    // Start streaming
    startStreaming();

    try {
      await _msg('generateWorkflowStream', {
        prompt: text,
      });
    } catch (err) {
      finishStreaming(`Error: ${err.message}`);
    }
  }

  // --- Message Rendering ---

  function appendMessage(role, content) {
    // Remove welcome message if present
    const welcome = chatMessages.querySelector('.chat-welcome');
    if (welcome) welcome.remove();

    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${role}`;
    bubble.innerHTML = formatContent(content);

    chatMessages.appendChild(bubble);
    scrollToBottom();

    return bubble;
  }

  function formatContent(text) {
    // Basic markdown-like formatting
    let html = _escapeHtml(text);

    // Code blocks
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      return `<pre class="code-block"><code>${code}</code></pre>`;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Newlines
    html = html.replace(/\n/g, '<br>');

    return html;
  }

  function _escapeHtml(str) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(str).replace(/[&<>"']/g, m => map[m]);
  }

  // --- Streaming ---

  function startStreaming() {
    isStreaming = true;
    streamFullText = '';

    // Show abort button
    if (abortBtn) abortBtn.classList.remove('hidden');

    // Create assistant bubble with streaming cursor
    currentAssistantBubble = document.createElement('div');
    currentAssistantBubble.className = 'chat-bubble assistant';
    currentAssistantBubble.innerHTML = '<span class="streaming-cursor"></span>';
    chatMessages.appendChild(currentAssistantBubble);
    scrollToBottom();

    // Start keep-alive ping
    options.startKeepAlive?.();
  }

  function handleChunk(text) {
    if (!currentAssistantBubble) return;

    streamFullText += text;
    currentAssistantBubble.innerHTML = formatContent(streamFullText) +
      '<span class="streaming-cursor"></span>';
    scrollToBottom();
  }

  function finishStreaming(errorMsg) {
    isStreaming = false;

    // Hide abort button
    if (abortBtn) abortBtn.classList.add('hidden');

    // Stop keep-alive
    options.stopKeepAlive?.();

    if (errorMsg && currentAssistantBubble) {
      if (errorMsg.includes('API key not configured') || errorMsg.includes('401')) {
        currentAssistantBubble.innerHTML = `
          <div class="error-action-card">
            <div class="error-action-text">${_escapeHtml(errorMsg)}</div>
            <button class="btn btn-primary btn-sm btn-open-settings">Open Settings</button>
          </div>`;
        currentAssistantBubble.querySelector('.btn-open-settings')
          ?.addEventListener('click', () => $('btnViewSettings')?.click());
      } else {
        currentAssistantBubble.innerHTML = `<span class="error-text">${_escapeHtml(errorMsg)}</span>`;
      }
      currentAssistantBubble = null;
      return;
    }

    if (currentAssistantBubble && streamFullText) {
      // Remove streaming cursor, render final content
      currentAssistantBubble.innerHTML = formatContent(streamFullText);

      // Try to detect and extract workflow JSON
      const workflowJson = extractWorkflowJson(streamFullText);
      if (workflowJson) {
        appendWorkflowCard(workflowJson);
      }
    }

    currentAssistantBubble = null;
    streamFullText = '';
  }

  function handleStreamDone(data) {
    // Update token count
    if (tokenCount && data?.usage) {
      const total = (data.usage.input || 0) + (data.usage.output || 0);
      tokenCount.textContent = `${total} tokens`;
    }

    finishStreaming();

    // Save to history
    if (data?.content) {
      _msg('saveChatMessage', {
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

  function extractWorkflowJson(text) {
    // Try to find JSON block in markdown code fence
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      try {
        const parsed = JSON.parse(codeBlockMatch[1]);
        if (parsed.nodes && Array.isArray(parsed.nodes)) {
          return parsed;
        }
      } catch (_) { /* not valid JSON */ }
    }

    // Try to find raw JSON with nodes array
    const jsonMatch = text.match(/\{[\s\S]*"nodes"\s*:\s*\[[\s\S]*\][\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.nodes && Array.isArray(parsed.nodes)) {
          return parsed;
        }
      } catch (_) { /* not valid JSON */ }
    }

    return null;
  }

  // --- Workflow Card ---

  function appendWorkflowCard(workflow) {
    const card = document.createElement('div');
    card.className = 'workflow-card';

    const nodeCount = workflow.nodes?.length || 0;
    const connectionCount = workflow.connections
      ? Object.keys(workflow.connections).length : 0;
    const name = workflow.name || 'Generated Workflow';

    card.innerHTML = `
      <div class="workflow-card-header">
        <span class="workflow-card-icon">⚡</span>
        <span class="workflow-card-title">${_escapeHtml(name)}</span>
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

    // Button handlers
    const copyBtn = card.querySelector('.btn-copy-workflow');
    const injectBtn = card.querySelector('.btn-inject-workflow');

    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(JSON.stringify(workflow, null, 2));
          copyBtn.textContent = 'Copied!';
          setTimeout(() => { copyBtn.textContent = 'Copy JSON'; }, 2000);
        } catch (err) {
          copyBtn.textContent = 'Failed';
          setTimeout(() => { copyBtn.textContent = 'Copy JSON'; }, 2000);
        }
      });
    }

    if (injectBtn) {
      injectBtn.addEventListener('click', async () => {
        try {
          await _msg('injectWorkflow', { workflow });
          injectBtn.textContent = 'Injected!';
          setTimeout(() => { injectBtn.textContent = 'Inject'; }, 2000);
        } catch (err) {
          injectBtn.textContent = 'Failed';
          setTimeout(() => { injectBtn.textContent = 'Inject'; }, 2000);
        }
      });
    }

    chatMessages.appendChild(card);
    scrollToBottom();
  }

  // --- Scroll ---

  function scrollToBottom() {
    requestAnimationFrame(() => {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    });
  }

  // --- Preflight Q&A Card ---

  function handlePreflightQuestions(data) {
    isStreaming = false;
    if (abortBtn) abortBtn.classList.add('hidden');
    options.stopKeepAlive?.();

    if (currentAssistantBubble) {
      currentAssistantBubble.remove();
      currentAssistantBubble = null;
    }
    streamFullText = '';

    const { questions, blueprint } = data;

    const card = document.createElement('div');
    card.className = 'preflight-card';

    const nodeChain = blueprint.nodes.length > 0
      ? `${_escapeHtml(blueprint.trigger)} \u2192 ${blueprint.nodes.map(n => _escapeHtml(n)).join(' \u2192 ')}`
      : _escapeHtml(blueprint.trigger);

    let questionsHtml = '';
    questions.forEach((q, i) => {
      questionsHtml += `
        <div class="form-group preflight-field">
          <label for="preflight-input-${i}">${_escapeHtml(q.label)} <span class="preflight-node-hint">(${_escapeHtml(q.nodeName)})</span></label>
          <input type="text" id="preflight-input-${i}" class="form-input preflight-input"
            placeholder="${_escapeHtml(q.placeholder)}"
            data-field-label="${_escapeHtml(q.label)}"
            data-field-name="${_escapeHtml(q.field)}">
        </div>`;
    });

    card.innerHTML = `
      <div class="preflight-header">
        <span class="preflight-icon">\ud83d\udccb</span>
        <span class="preflight-title">Workflow Plan</span>
      </div>
      <div class="preflight-summary">
        <div class="preflight-row">
          <span class="preflight-label">Trigger:</span>
          <span class="preflight-value">${_escapeHtml(blueprint.trigger)}</span>
        </div>
        <div class="preflight-row">
          <span class="preflight-label">Nodes:</span>
          <span class="preflight-value">${nodeChain}</span>
        </div>
        <div class="preflight-row">
          <span class="preflight-label">Complexity:</span>
          <span class="preflight-value">${_escapeHtml(blueprint.complexity)}</span>
        </div>
        ${blueprint.templateCount > 0 ? `
        <div class="preflight-row">
          <span class="preflight-label">Templates:</span>
          <span class="preflight-value">${blueprint.templateCount} found</span>
        </div>` : ''}
      </div>
      <div class="preflight-questions-header">Missing details:</div>
      ${questionsHtml}
      <div class="preflight-actions">
        <button class="btn btn-secondary btn-sm btn-preflight-skip">Skip &amp; Generate</button>
        <button class="btn btn-primary btn-sm btn-preflight-submit">Generate</button>
      </div>
    `;

    const skipBtn = card.querySelector('.btn-preflight-skip');
    const submitBtn = card.querySelector('.btn-preflight-submit');

    function collectAnswers() {
      const answers = {};
      card.querySelectorAll('.preflight-input').forEach(input => {
        const label = input.dataset.fieldLabel;
        const value = input.value.trim();
        if (label && value) {
          answers[label] = value;
        }
      });
      return answers;
    }

    function submitPreflight(answers) {
      if (skipBtn) skipBtn.disabled = true;
      if (submitBtn) submitBtn.disabled = true;

      const userBubbles = chatMessages.querySelectorAll('.chat-bubble.user');
      const lastUserText = userBubbles.length > 0
        ? userBubbles[userBubbles.length - 1].textContent.trim()
        : '';

      startStreaming();

      _msg('generateWithPreflight', {
        prompt: lastUserText,
        answers,
      }).catch(err => {
        finishStreaming(`Error: ${err.message}`);
      });
    }

    if (skipBtn) {
      skipBtn.addEventListener('click', () => submitPreflight({}));
    }
    if (submitBtn) {
      submitBtn.addEventListener('click', () => submitPreflight(collectAnswers()));
    }

    const inputs = card.querySelectorAll('.preflight-input');
    if (inputs.length > 0) {
      inputs[inputs.length - 1].addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitBtn?.click();
        }
      });
    }

    chatMessages.appendChild(card);
    scrollToBottom();

    const firstInput = card.querySelector('.preflight-input');
    if (firstInput) {
      requestAnimationFrame(() => firstInput.focus());
    }
  }

  // Return handlers for stream events (called by content.js message listener)
  return {
    handleChunk,
    handleStreamDone,
    handleStreamError,
    appendMessage,
    handlePreflightQuestions,
  };
}

// Expose for content.js
if (typeof window !== 'undefined') {
  window.__n8nPilotChat = { initChat };
}
