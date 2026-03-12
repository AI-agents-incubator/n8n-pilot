/**
 * n8n Pilot — Background Service Worker
 * Central message router and orchestrator.
 */

import * as settings from './lib/settings.js';
import * as claudeClient from './lib/claude-client.js';
import * as n8nClient from './lib/n8n-client.js';
import * as generator from './lib/workflow-generator.js';
import * as promptAnalyzer from './lib/prompt-analyzer.js';
import * as history from './lib/history.js';
import * as versions from './lib/versions.js';
import * as templateSearch from './lib/template-search.js';
import * as preflight from './lib/preflight.js';

// Active generation abort controller
let generationController = null;

// Active streaming tab ID for routing stream events
let activeStreamTabId = null;

// --- Extension Lifecycle ---

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    console.log('n8n Pilot installed');
  }

  // Register context menu items
  chrome.contextMenus.create({
    id: 'n8n-pilot-explain',
    title: 'Explain with n8n Pilot',
    contexts: ['page', 'selection'],
    documentUrlPatterns: ['http://localhost:*/*', 'http://127.0.0.1:*/*', 'https://*/*'],
  });

  chrome.contextMenus.create({
    id: 'n8n-pilot-generate-code',
    title: 'Generate Code Node',
    contexts: ['selection'],
    documentUrlPatterns: ['http://localhost:*/*', 'http://127.0.0.1:*/*', 'https://*/*'],
  });

  chrome.contextMenus.create({
    id: 'n8n-pilot-optimize',
    title: 'Optimize with AI',
    contexts: ['page'],
    documentUrlPatterns: ['http://localhost:*/*', 'http://127.0.0.1:*/*', 'https://*/*'],
  });
});

// --- Context Menu Handler ---

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  // Ensure content script is injected
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js'],
    });
  } catch (_) { /* ignore */ }

  let prompt = '';
  switch (info.menuItemId) {
    case 'n8n-pilot-explain':
      prompt = info.selectionText
        ? `Explain this n8n workflow element: ${info.selectionText}`
        : 'Explain the current n8n workflow';
      break;
    case 'n8n-pilot-generate-code':
      prompt = `Generate a Code node that does: ${info.selectionText || 'process data'}`;
      break;
    case 'n8n-pilot-optimize':
      prompt = 'Analyze and optimize the current workflow for performance';
      break;
    default:
      return;
  }

  // Show panel and send prompt
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_PANEL' });
    await chrome.tabs.sendMessage(tab.id, { type: 'CONTEXT_MENU_PROMPT', prompt });
  } catch (err) {
    console.warn('Context menu action failed:', err.message);
  }
});

// --- Icon Click: toggle panel in active n8n tab ---

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) return;

  try {
    // Ensure content script is injected
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js'],
    });
  } catch (err) {
    // May already be injected or page not accessible
    if (!err.message.includes('Cannot access')) {
      console.warn('Content script injection on click failed:', err.message);
    }
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PANEL' });
  } catch (err) {
    console.warn('Toggle panel failed:', err.message);
  }
});

// --- Tab monitoring: inject content script on n8n pages ---

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return;

  try {
    const n8nUrl = await settings.get('n8nBaseUrl');
    if (!n8nUrl) return;

    if (tab.url.startsWith(n8nUrl)) {
      // Check if we have scripting permission for this URL
      const hasPermission = await chrome.permissions.contains({
        origins: [new URL(n8nUrl).origin + '/*'],
      });

      if (hasPermission) {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js'],
        });
      }
    }
  } catch (err) {
    // Silently ignore — tab may have navigated away
    if (!err.message.includes('Cannot access')) {
      console.warn('Content script injection failed:', err.message);
    }
  }
});

// --- Message Router ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch(err => sendResponse({ error: err.message }));
  return true; // Keep channel open for async response
});

async function handleMessage(msg, sender) {
  const { action } = msg;

  switch (action) {
    // === Settings ===
    case 'getSettings':
      return settings.getAll();

    case 'updateSettings':
      return settings.set(msg.settings || msg);

    case 'setApiKey':
      await settings.setApiKey(msg.provider, msg.apiKey);
      return { success: true };

    case 'getApiKeyStatus':
      return { hasKey: await settings.hasApiKey(msg.provider) };

    case 'exportSettings':
      return settings.exportSettings();

    case 'importSettings':
      await settings.importSettings(msg.settings || msg.data || msg);
      return { success: true };

    case 'resetSettings':
      return settings.reset();

    // === Connection Tests ===
    case 'testClaudeConnection': {
      const apiKey = msg.apiKey || await settings.getApiKey('claude');
      return claudeClient.testConnection(apiKey);
    }

    case 'testN8nConnection':
      return n8nClient.testConnection();

    // === Claude ===
    case 'getClaudeModels':
      return claudeClient.getAvailableModels();

    // === Generation ===
    case 'generateWorkflow': {
      generationController = new AbortController();
      const result = await generator.generate({
        prompt: msg.prompt,
        model: msg.model,
        abortSignal: generationController.signal,
      });
      generationController = null;

      if (result.success) {
        // Respect user's saveHistory preference
        const currentSettings = await settings.getAll();
        if (currentSettings.saveHistory !== false) {
          await history.add({
            prompt: result.prompt,
            workflow: result.workflow,
            model: result.model,
            tokensUsed: result.tokensUsed,
            duration: result.duration,
          });
        }
      }

      return result;
    }

    case 'modifyWorkflow': {
      generationController = new AbortController();
      const result = await generator.modify({
        workflow: msg.workflow,
        instruction: msg.instruction,
        model: msg.model,
        abortSignal: generationController.signal,
      });
      generationController = null;
      return result;
    }

    case 'explainWorkflow':
      return generator.explain(msg.workflow);

    case 'generateWorkflowStream': {
      generationController = new AbortController();
      activeStreamTabId = sender?.tab?.id || null;

      const streamSettings = await settings.getAll();

      // Load conversation history for multi-turn context
      const MAX_HISTORY = 20;
      const chatMemKey = 'n8nPilotChatMemory';
      const chatMem = (await chrome.storage.local.get(chatMemKey))[chatMemKey] || {};
      const ctxId = msg.workflowId || 'default';
      const stored = chatMem[ctxId]?.messages || [];
      const conversationMessages = stored.slice(-MAX_HISTORY)
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content }));

      // Smart pipeline: analyze prompt → find templates → preflight → build enhanced prompt
      const streamBlueprint = promptAnalyzer.analyze(msg.prompt);
      const streamTemplates = await templateSearch.findTemplates(streamBlueprint, {
        baseUrl: streamSettings.templateServerUrl,
        limit: 3,
      }).catch(() => []);

      // Notify UI about template search results
      if (activeStreamTabId) {
        chrome.tabs.sendMessage(activeStreamTabId, {
          type: 'TEMPLATE_SEARCH_RESULT',
          count: streamTemplates.length,
        }).catch(() => {});
      }

      // Preflight validation: check for missing critical parameters
      const preflightResult = preflight.validate(streamBlueprint, msg.prompt);

      if (!preflightResult.complete && !msg.preflightAnswers) {
        // Missing info — send questions to UI, DON'T generate yet
        if (activeStreamTabId) {
          chrome.tabs.sendMessage(activeStreamTabId, {
            type: 'PREFLIGHT_QUESTIONS',
            questions: preflightResult.questions,
            summary: preflightResult.summary,
            blueprint: {
              trigger: streamBlueprint.trigger?.name || 'Manual Trigger',
              nodes: streamBlueprint.nodes.map(n => n.name),
              complexity: streamBlueprint.complexity,
              templateCount: streamTemplates.length,
            },
          }).catch(() => {});
        }
        activeStreamTabId = null;
        return { success: true, preflight: true };
      }

      // Build effective prompt (with preflight answers if provided)
      const effectivePrompt = msg.preflightAnswers
        ? _buildPreflightPrompt(msg.prompt, msg.preflightAnswers)
        : msg.prompt;
      conversationMessages.push({ role: 'user', content: effectivePrompt });

      const streamSystemPrompt = generator.buildStreamingPrompt(
        streamBlueprint, streamTemplates, promptAnalyzer.buildEnhancedPrompt
      );

      await claudeClient.sendMessageStream({
        systemPrompt: streamSystemPrompt,
        messages: conversationMessages,
        model: msg.model || streamSettings.claudeModel,
        abortSignal: generationController.signal,
        onChunk: (text, totalLength) => {
          if (activeStreamTabId) {
            chrome.tabs.sendMessage(activeStreamTabId, {
              type: 'STREAM_CHUNK',
              text,
              index: totalLength,
            }).catch(() => {});
          }
        },
        onDone: async (result) => {
          generationController = null;

          // Post-process: normalize any workflow JSON in the streamed response
          const normalizedContent = generator.postProcessStreamResult(result.content);

          if (activeStreamTabId) {
            chrome.tabs.sendMessage(activeStreamTabId, {
              type: 'STREAM_DONE',
              fullText: normalizedContent,
              usage: result.tokensUsed,
              model: result.model,
            }).catch(() => {});
          }

          // Save to history if enabled
          if (result.success && streamSettings.saveHistory !== false) {
            try {
              await history.add({
                prompt: msg.prompt,
                workflow: normalizedContent,
                model: result.model,
                tokensUsed: result.tokensUsed,
                duration: result.duration,
              });
            } catch (_) { /* ignore */ }
          }

          activeStreamTabId = null;
        },
        onError: (error) => {
          generationController = null;
          if (activeStreamTabId) {
            chrome.tabs.sendMessage(activeStreamTabId, {
              type: 'STREAM_ERROR',
              error,
            }).catch(() => {});
          }
          activeStreamTabId = null;
        },
      });

      return { success: true, streaming: true };
    }

    case 'generateWithPreflight': {
      // Re-dispatch as generateWorkflowStream with preflight answers attached
      return handleMessage({
        action: 'generateWorkflowStream',
        prompt: msg.prompt,
        model: msg.model,
        preflightAnswers: msg.answers,
        workflowId: msg.workflowId,
      }, sender);
    }

    case 'cancelGeneration':
      if (generationController) {
        generationController.abort();
        generationController = null;
      }
      return { success: true };

    // === Debug ===
    case 'debugRequest':
      return claudeClient.sendMessage({
        systemPrompt: msg.systemPrompt,
        userPrompt: msg.userPrompt,
        model: msg.model,
      });

    // === n8n Workflows ===
    case 'listWorkflows':
      return n8nClient.listWorkflows(msg.params);

    case 'getWorkflow':
      return n8nClient.getWorkflow(msg.id);

    case 'createWorkflow':
      return n8nClient.createWorkflow(msg.workflow || msg.data);

    case 'updateWorkflow':
      return n8nClient.updateWorkflow(msg.id, msg.workflow || msg.data);

    case 'deleteWorkflow':
      return n8nClient.deleteWorkflow(msg.id);

    case 'activateWorkflow':
      return n8nClient.activateWorkflow(msg.id);

    case 'deactivateWorkflow':
      return n8nClient.deactivateWorkflow(msg.id);

    // === n8n Executions ===
    case 'listExecutions':
      return n8nClient.listExecutions(msg.params || {});

    case 'getExecution':
      return n8nClient.getExecution(msg.id);

    case 'deleteExecution':
      return n8nClient.deleteExecution(msg.id);

    // === n8n Variables ===
    case 'listVariables':
      return n8nClient.listVariables();

    case 'createVariable':
      return n8nClient.createVariable(msg.data);

    case 'updateVariable':
      return n8nClient.updateVariable(msg.id, msg.data);

    case 'deleteVariable':
      return n8nClient.deleteVariable(msg.id);

    // === n8n Tags & Credentials ===
    case 'listTags':
      return n8nClient.listTags();

    case 'createTag':
      return n8nClient.createTag(msg.name);

    case 'listCredentials':
      return n8nClient.listCredentials();

    // === History ===
    case 'getHistory':
      return history.list(msg.params);

    case 'getHistoryEntry':
      return history.get(msg.id);

    case 'deleteHistoryEntry':
      await history.remove(msg.id);
      return { success: true };

    case 'clearHistory':
      await history.clear();
      return { success: true };

    // === Chat Memory ===
    case 'saveChatMessage': {
      // Respect saveHistory preference for chat memory too
      const chatSettings = await settings.getAll();
      if (chatSettings.saveHistory === false) return { success: true };

      const chatKey = 'n8nPilotChatMemory';
      const chatData = (await chrome.storage.local.get(chatKey))[chatKey] || {};
      const contextId = msg.workflowId || 'default';
      if (!chatData[contextId]) chatData[contextId] = { messages: [], lastUpdated: null };
      chatData[contextId].messages.push({
        role: msg.role,
        content: msg.content,
        metadata: msg.metadata || {},
        timestamp: new Date().toISOString(),
      });
      // FIFO eviction at 100
      if (chatData[contextId].messages.length > 100) {
        chatData[contextId].messages = chatData[contextId].messages.slice(-100);
      }
      chatData[contextId].lastUpdated = new Date().toISOString();
      await chrome.storage.local.set({ [chatKey]: chatData });
      return { success: true };
    }

    case 'getChatHistory': {
      const chatKey2 = 'n8nPilotChatMemory';
      const chatData2 = (await chrome.storage.local.get(chatKey2))[chatKey2] || {};
      const ctx = msg.workflowId || 'default';
      return chatData2[ctx]?.messages || [];
    }

    case 'clearChatHistory': {
      const chatKey3 = 'n8nPilotChatMemory';
      const chatData3 = (await chrome.storage.local.get(chatKey3))[chatKey3] || {};
      const ctx3 = msg.workflowId || 'default';
      delete chatData3[ctx3];
      await chrome.storage.local.set({ [chatKey3]: chatData3 });
      return { success: true };
    }

    case 'searchHistory':
      return history.search(msg.query);

    case 'markHistoryInjected':
      await history.markInjected(msg.id, msg.n8nWorkflowId);
      return { success: true };

    // === Template Search ===
    case 'searchTemplates': {
      const tsSettings = await settings.getAll();
      return templateSearch.searchTemplates({ ...msg, baseUrl: tsSettings.templateServerUrl });
    }

    case 'getTemplate': {
      const tsSettings2 = await settings.getAll();
      return templateSearch.getTemplate(msg.filename, tsSettings2.templateServerUrl);
    }

    case 'checkTemplateServer': {
      const tsSettings3 = await settings.getAll();
      return { available: await templateSearch.isTemplateServerAvailable(tsSettings3.templateServerUrl) };
    }

    case 'getTemplateDiagram': {
      const tsSettings4 = await settings.getAll();
      return { diagram: await templateSearch.getDiagram(msg.filename, tsSettings4.templateServerUrl) };
    }

    case 'getTemplateCategories': {
      const tsSettings5 = await settings.getAll();
      return templateSearch.getCategories(tsSettings5.templateServerUrl);
    }

    case 'getTemplateStats': {
      const tsSettings6 = await settings.getAll();
      return templateSearch.getStats(tsSettings6.templateServerUrl);
    }

    case 'getIntegrations': {
      const tsSettings7 = await settings.getAll();
      return templateSearch.getIntegrations(tsSettings7.templateServerUrl);
    }

    // === Prompt Analysis ===
    case 'analyzePrompt':
      return promptAnalyzer.analyze(msg.prompt);

    case 'generateFromBlueprint': {
      // Search matching templates before generation (non-blocking)
      const currentSettingsForTemplates = await settings.getAll();
      const matchedTemplates = await templateSearch.findTemplates(msg.blueprint, {
        baseUrl: currentSettingsForTemplates.templateServerUrl,
        limit: 3,
      }).catch(() => []);

      generationController = new AbortController();
      const blueprintResult = await generator.generateFromBlueprint({
        blueprint: msg.blueprint,
        prompt: msg.prompt,
        model: msg.model,
        abortSignal: generationController.signal,
        templates: matchedTemplates,
      });
      generationController = null;

      if (blueprintResult.success) {
        const currentSettings = await settings.getAll();
        if (currentSettings.saveHistory !== false) {
          await history.add({
            prompt: blueprintResult.prompt,
            workflow: blueprintResult.workflow,
            model: blueprintResult.model,
            tokensUsed: blueprintResult.tokensUsed,
            duration: blueprintResult.duration,
          });
        }
      }

      return blueprintResult;
    }

    // === Versions ===
    case 'saveVersion':
      return { version: await versions.saveVersion(msg.workflowId, msg.workflow, msg.source) };

    case 'getVersions':
      return versions.getVersions(msg.workflowId);

    case 'getVersion':
      return versions.getVersion(msg.workflowId, msg.version);

    case 'deleteVersion':
      await versions.deleteVersion(msg.workflowId, msg.version);
      return { success: true };

    case 'diffVersions':
      return versions.diff(msg.workflowId, msg.v1, msg.v2);

    case 'listTrackedWorkflows':
      return versions.listTrackedWorkflows();

    // === Content Script Actions ===
    case 'injectWorkflow': {
      const n8nUrl = await settings.get('n8nBaseUrl');
      if (!n8nUrl) return { success: false, error: 'n8n URL not configured' };

      const tabs = await chrome.tabs.query({ url: n8nUrl + '/*' });
      if (tabs.length === 0) {
        return { success: false, error: 'No n8n tab found. Open n8n first.' };
      }

      const tabId = tabs[0].id;

      try {
        await chrome.tabs.sendMessage(tabId, {
          type: 'INJECT_WORKFLOW',
          workflow: msg.workflow,
        });
        return { success: true };
      } catch (err) {
        return { success: false, error: `Failed to inject: ${err.message}` };
      }
    }

    case 'showN8nNotification': {
      const n8nUrl = await settings.get('n8nBaseUrl');
      if (!n8nUrl) return;

      const tabs = await chrome.tabs.query({ url: n8nUrl + '/*' });
      if (tabs.length > 0) {
        await chrome.tabs.sendMessage(tabs[0].id, {
          type: 'SHOW_NOTIFICATION',
          success: msg.success,
          message: msg.message,
        });
      }
      return { success: true };
    }

    // Workflow saved from content script
    case 'workflowSaved': {
      if (!msg.workflowId) return { success: false, error: 'No workflow ID' };

      let workflowData = msg.workflow;

      // If content script couldn't extract workflow, fetch via n8n API
      if (!workflowData && msg.fetchFromApi) {
        try {
          workflowData = await n8nClient.getWorkflow(msg.workflowId);
        } catch (err) {
          console.warn('Failed to fetch workflow for versioning:', err.message);
        }
      }

      if (workflowData) {
        await versions.saveVersion(msg.workflowId, workflowData, 'saved');
        return { success: true, versioned: true };
      }

      return { success: true, versioned: false };
    }

    // === Keep-Alive (MV3 Service Worker) ===
    case 'keepAlive':
      return { alive: true };

    // === Permission request ===
    case 'requestN8nPermission': {
      const url = msg.url;
      try {
        const origin = new URL(url).origin;
        const granted = await chrome.permissions.request({
          origins: [origin + '/*'],
        });
        return { granted };
      } catch (err) {
        return { granted: false, error: err.message };
      }
    }

    default:
      return { error: `Unknown action: ${action}` };
  }
}

/**
 * Append preflight answers to original prompt as structured context.
 */
function _buildPreflightPrompt(originalPrompt, answers) {
  const details = Object.entries(answers)
    .filter(([, v]) => v && typeof v === 'string' && v.trim())
    .map(([label, value]) => `- ${label}: ${value.trim()}`)
    .join('\n');

  if (!details) return originalPrompt;

  return `${originalPrompt}\n\nUser-provided details:\n${details}`;
}
