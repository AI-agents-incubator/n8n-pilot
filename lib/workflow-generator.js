/**
 * n8n Pilot — Workflow Generator
 * AI-powered n8n workflow generation using Claude.
 */

import * as claude from './claude-client.js';
import { validate, normalize } from './workflow-validator.js';
import { extractJson } from './utils.js';

const SYSTEM_PROMPT = `You are an expert n8n workflow builder. Your task is to generate valid n8n workflow JSON based on user descriptions.

CRITICAL RULES:
1. Return ONLY valid JSON. No markdown, no explanations, no code blocks, no comments.
2. The JSON must be a complete n8n workflow object.

REQUIRED TOP-LEVEL FIELDS:
{
  "name": "Descriptive Workflow Name",
  "nodes": [...],
  "connections": {...},
  "settings": { "executionOrder": "v1" }
}

NODE STRUCTURE — each node must have:
{
  "id": "unique-uuid-string",
  "name": "Unique Descriptive Name",
  "type": "n8n-nodes-base.nodeType",
  "typeVersion": <see version table below>,
  "position": [x, y],
  "parameters": {}
}

CORRECT typeVersion FOR EACH NODE TYPE:
- webhook: 2.1, scheduleTrigger: 1.2, manualTrigger: 1, formTrigger: 2.2, rssFeedReadTrigger: 1
- httpRequest: 4.3, code: 2, if: 2.3, filter: 2.2, switch: 3.2
- set: 3.4, merge: 3, splitOut: 1, splitInBatches: 3, wait: 1.1, noOp: 1
- html: 1.2, convertToFile: 1.1, telegram: 1.2, gmail: 2.2
- airtable: 2.1, getResponse: 1
- openAi (@n8n/n8n-nodes-langchain.openAi): 1.8
- googleGemini (@n8n/n8n-nodes-langchain.googleGemini): 1.1

POSITIONING RULES:
- First node (trigger) at [250, 300]
- Each subsequent node +300 on x-axis
- Parallel branches offset on y-axis by ±200

CONNECTION STRUCTURE:
{
  "Source Node Name": {
    "main": [[{ "node": "Target Node Name", "type": "main", "index": 0 }]]
  }
}

For nodes with multiple outputs (IF, Switch):
{
  "IF Node": {
    "main": [
      [{ "node": "True Branch", "type": "main", "index": 0 }],
      [{ "node": "False Branch", "type": "main", "index": 0 }]
    ]
  }
}

COMMON NODE TYPES (use EXACTLY these type strings):
- Triggers: n8n-nodes-base.webhook, n8n-nodes-base.scheduleTrigger, n8n-nodes-base.manualTrigger, n8n-nodes-base.formTrigger, n8n-nodes-base.rssFeedReadTrigger
- HTTP: n8n-nodes-base.httpRequest
- Code: n8n-nodes-base.code (parameter: "jsCode" for JavaScript)
- IF: n8n-nodes-base.if (v2 conditions format)
- Filter: n8n-nodes-base.filter (same conditions format as IF)
- Switch: n8n-nodes-base.switch
- Set: n8n-nodes-base.set (v3.4 assignments format)
- Merge: n8n-nodes-base.merge
- Split Out: n8n-nodes-base.splitOut
- Loop: n8n-nodes-base.splitInBatches
- Wait: n8n-nodes-base.wait
- No Operation: n8n-nodes-base.noOp
- HTML Extract: n8n-nodes-base.html
- Convert to File: n8n-nodes-base.convertToFile
- Telegram: n8n-nodes-base.telegram
- Gmail: n8n-nodes-base.gmail
- Airtable: n8n-nodes-base.airtable
- GetResponse: n8n-nodes-base.getResponse
- Google Gemini: @n8n/n8n-nodes-langchain.googleGemini (NOT lmChatGoogleGemini)
- OpenAI: @n8n/n8n-nodes-langchain.openAi

FILTER NODE (v2.2) PARAMETER FORMAT:
{
  "conditions": {
    "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "strict", "version": 2 },
    "conditions": [
      {
        "id": "uuid",
        "leftValue": "={{ $json.fieldName }}",
        "rightValue": "expectedValue",
        "operator": { "type": "string", "operation": "contains" }
      }
    ],
    "combinator": "and"
  },
  "options": {}
}

SET NODE (v3.4) PARAMETER FORMAT:
{
  "mode": "manual",
  "assignments": {
    "assignments": [
      { "id": "uuid", "name": "fieldName", "value": "fieldValue", "type": "string" }
    ]
  },
  "options": {}
}

IF NODE (v2.3) PARAMETER FORMAT:
{
  "conditions": {
    "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "strict", "version": 3 },
    "conditions": [
      {
        "id": "uuid",
        "leftValue": "={{ $json.fieldName }}",
        "rightValue": "expectedValue",
        "operator": { "type": "string", "operation": "equals" }
      }
    ],
    "combinator": "and"
  },
  "options": {}
}

OPENAI NODE (@n8n/n8n-nodes-langchain.openAi v1.8) PARAMETER FORMAT:
CRITICAL: Use "modelId" (NOT "model"), use "messages" (NOT "prompt" + "options.systemMessage")
{
  "modelId": { "__rl": true, "value": "gpt-4.1-nano", "mode": "list", "cachedResultName": "gpt-4.1-nano" },
  "messages": {
    "values": [
      { "content": "System instructions here", "role": "system" },
      { "content": "={{ $json.inputField }}" }
    ]
  },
  "options": {},
  "simplify": false
}

GOOGLE GEMINI NODE (@n8n/n8n-nodes-langchain.googleGemini v1.1) PARAMETER FORMAT:
CRITICAL: Use "modelId" (NOT "model"), use "messages" (NOT "prompt" + "options.systemMessage")
{
  "modelId": { "__rl": true, "value": "models/gemini-2.5-flash", "mode": "list", "cachedResultName": "gemini-2.5-flash" },
  "messages": {
    "values": [
      { "content": "System instructions here" },
      { "content": "={{ $json.inputField }}" }
    ]
  },
  "options": {},
  "builtInTools": {}
}

IMPORTANT:
- Every workflow MUST have exactly one trigger node as the first node
- All node names must be unique within the workflow
- Use expression syntax {{ $json.field }} for referencing data from previous nodes
- Generate proper UUIDs for all id fields
- Keep the workflow practical and complete
- Use current models: OpenAI default "gpt-4.1-nano", Gemini default "models/gemini-2.5-flash". Do NOT use deprecated models (gpt-4, gpt-4o, chatgpt-4o-latest, gemini-2.0-flash, gemini-1.5-flash)`;

const MODIFY_SYSTEM_PROMPT = `You are an expert n8n workflow editor. You will receive an existing n8n workflow JSON and instructions for modification.

RULES:
1. Return ONLY the complete modified workflow as valid JSON
2. No markdown, no explanations, no code blocks
3. Preserve all existing nodes and connections unless the user asks to remove them
4. Keep all IDs, positions, and settings unless they need to change
5. When adding nodes, position them logically relative to existing nodes
6. When modifying connections, ensure all nodes remain properly connected
7. Preserve the existing workflow name unless asked to rename it`;

const EXPLAIN_SYSTEM_PROMPT = `You are an expert at explaining n8n workflows. You will receive a workflow JSON and should provide a clear, concise explanation of what it does.

Explain:
1. What triggers the workflow
2. What each node does, step by step
3. How data flows between nodes
4. Any conditional logic or branching
5. The overall purpose of the workflow

Keep the explanation concise but complete. Use plain language.`;

/**
 * Generate a new workflow from a natural language prompt.
 */
export async function generate({ prompt, model, abortSignal, onProgress }) {
  if (onProgress) onProgress('Sending request to Claude...');

  const response = await claude.sendMessage({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: prompt,
    model,
    abortSignal,
  });

  if (!response.success) {
    return {
      success: false,
      workflow: null,
      prompt,
      model: response.model || '',
      tokensUsed: response.tokensUsed,
      duration: response.duration,
      validationErrors: [],
      error: response.error,
    };
  }

  if (onProgress) onProgress('Parsing response...');

  // Extract JSON from response
  const workflow = extractJson(response.content);

  if (!workflow) {
    return {
      success: false,
      workflow: null,
      prompt,
      model: response.model || '',
      tokensUsed: response.tokensUsed,
      duration: response.duration,
      validationErrors: ['Failed to extract valid JSON from Claude response'],
      error: 'Invalid JSON in response',
    };
  }

  if (onProgress) onProgress('Validating and normalizing...');

  // Validate
  const validation = validate(workflow);

  // Normalize (fix common issues)
  const normalized = normalize(workflow);

  // Re-validate after normalization
  const postValidation = validate(normalized);

  const hasErrors = postValidation.errors && postValidation.errors.length > 0;

  return {
    success: !hasErrors,
    workflow: normalized,
    prompt,
    model: response.model || '',
    tokensUsed: response.tokensUsed,
    duration: response.duration,
    validationErrors: postValidation.errors,
    validationWarnings: postValidation.warnings,
    error: hasErrors ? `Workflow has ${postValidation.errors.length} validation error(s): ${postValidation.errors[0]}` : null,
  };
}

/**
 * Modify an existing workflow based on instructions.
 */
export async function modify({ workflow, instruction, model, abortSignal }) {
  const userPrompt = `Here is the existing workflow:\n\n${JSON.stringify(workflow, null, 2)}\n\nModification instructions: ${instruction}`;

  const response = await claude.sendMessage({
    systemPrompt: MODIFY_SYSTEM_PROMPT,
    userPrompt,
    model,
    abortSignal,
  });

  if (!response.success) {
    return {
      success: false,
      workflow: null,
      prompt: instruction,
      model: response.model || '',
      tokensUsed: response.tokensUsed,
      duration: response.duration,
      validationErrors: [],
      error: response.error,
    };
  }

  const modified = extractJson(response.content);

  if (!modified) {
    return {
      success: false,
      workflow: null,
      prompt: instruction,
      model: response.model || '',
      tokensUsed: response.tokensUsed,
      duration: response.duration,
      validationErrors: ['Failed to extract valid JSON'],
      error: 'Invalid JSON in response',
    };
  }

  const normalized = normalize(modified);
  const validation = validate(normalized);

  const hasErrors = validation.errors && validation.errors.length > 0;

  return {
    success: !hasErrors,
    workflow: normalized,
    prompt: instruction,
    model: response.model || '',
    tokensUsed: response.tokensUsed,
    duration: response.duration,
    validationErrors: validation.errors,
    validationWarnings: validation.warnings,
    error: hasErrors ? `Workflow has ${validation.errors.length} validation error(s): ${validation.errors[0]}` : null,
  };
}

/**
 * Explain a workflow in natural language.
 */
export async function explain(workflow) {
  const response = await claude.sendMessage({
    systemPrompt: EXPLAIN_SYSTEM_PROMPT,
    userPrompt: JSON.stringify(workflow, null, 2),
  });

  if (!response.success) {
    return { success: false, explanation: null, error: response.error };
  }

  return { success: true, explanation: response.content, error: null };
}

/**
 * Get the system prompt for workflow generation.
 */
export function getSystemPrompt() {
  return SYSTEM_PROMPT;
}

/**
 * Build an enhanced system prompt for streaming generation.
 * Integrates blueprint node schemas + template hints.
 * @param {object} blueprint - from promptAnalyzer.analyze()
 * @param {object[]} templates - matched templates from template search
 * @param {Function} buildEnhancedPrompt - from prompt-analyzer.js (passed to avoid circular import)
 */
export function buildStreamingPrompt(blueprint, templates, buildEnhancedPrompt) {
  let prompt = SYSTEM_PROMPT;

  if (blueprint && buildEnhancedPrompt) {
    prompt = buildEnhancedPrompt(blueprint, SYSTEM_PROMPT);
  }

  if (templates && templates.length > 0) {
    prompt += buildTemplateHint(templates);
  }

  return prompt;
}

/**
 * Post-process streamed result: extract and normalize workflow JSON.
 * Returns the full text with normalized workflow JSON replaced in place.
 */
export function postProcessStreamResult(content) {
  if (!content) return content;

  const workflow = extractJson(content);
  if (!workflow || typeof workflow !== 'object') return content;

  try {
    const normalized = normalize(workflow);
    const normalizedJson = JSON.stringify(normalized, null, 2);

    // Replace JSON in ```json...``` code blocks
    const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeBlockMatch) {
      return content.replace(codeBlockMatch[0], '```json\n' + normalizedJson + '\n```');
    }

    // Replace bare JSON with "nodes" array
    const jsonMatch = content.match(/\{[\s\S]*"nodes"\s*:\s*\[[\s\S]*\]\s*[\s\S]*\}/);
    if (jsonMatch) {
      return content.replace(jsonMatch[0], normalizedJson);
    }
  } catch (_) {
    // If normalization fails, return original content
  }

  return content;
}

/**
 * Generate a workflow from a pre-analyzed blueprint.
 * Uses enhanced system prompt with only relevant node schemas.
 */
export async function generateFromBlueprint({ blueprint, prompt, model, abortSignal, templates }) {
  const { buildEnhancedPrompt } = await import('./prompt-analyzer.js');

  let enhancedSystemPrompt = buildEnhancedPrompt(blueprint, SYSTEM_PROMPT);

  // Inject matching templates as reference examples
  if (templates && templates.length > 0) {
    enhancedSystemPrompt += buildTemplateHint(templates);
  }

  const blueprintHint = `
BLUEPRINT (follow this structure):
- Trigger: ${blueprint.trigger?.name || 'Manual Trigger'} (${blueprint.trigger?.type || 'n8n-nodes-base.manualTrigger'})
- Nodes: ${blueprint.nodes.map(n => `${n.name} (${n.type})`).join(', ') || 'none specified'}
- Credentials needed: ${blueprint.credentialsNeeded.join(', ') || 'none'}
${templates?.length ? `- Reference templates found: ${templates.length} (see REFERENCE TEMPLATES section above)` : ''}

USER REQUEST: ${prompt}`;

  const response = await claude.sendMessage({
    systemPrompt: enhancedSystemPrompt,
    userPrompt: blueprintHint,
    model,
    abortSignal,
  });

  if (!response.success) {
    return { success: false, workflow: null, error: response.error };
  }

  // extractJson returns a parsed object (not a string)
  const parsed = extractJson(response.content);
  if (!parsed) {
    return {
      success: false,
      workflow: null,
      error: 'No valid workflow JSON found in response',
      rawResponse: response.content,
    };
  }

  let workflow = typeof parsed === 'string' ? JSON.parse(parsed) : parsed;

  workflow = normalize(workflow);
  const validation = validate(workflow);
  const hasErrors = validation.errors && validation.errors.length > 0;

  return {
    success: !hasErrors,
    workflow,
    prompt,
    model: response.model,
    tokensUsed: response.tokensUsed,
    duration: response.duration,
    validationErrors: validation.errors,
    validationWarnings: validation.warnings,
    blueprint,
    error: hasErrors ? `Workflow has ${validation.errors.length} validation error(s): ${validation.errors[0]}` : null,
  };
}

/**
 * Build a prompt section with reference templates.
 * Includes only nodes + connections structure to save tokens.
 */
function buildTemplateHint(templates) {
  if (!templates || templates.length === 0) return '';

  let hint = '\n\nREFERENCE TEMPLATES (use as structural examples — adapt node names, parameters, and connections to match the user request):\n';

  for (let i = 0; i < Math.min(templates.length, 3); i++) {
    const t = templates[i];
    hint += `\n--- Template ${i + 1}: "${t.name || t.filename}" ---\n`;
    hint += `Trigger: ${t.trigger_type || 'unknown'} | Nodes: ${t.node_count || '?'} | Integrations: ${(t.integrations || []).join(', ')}\n`;

    // Include full workflow JSON if available (from getTemplate), otherwise just metadata
    if (t.content && t.content.nodes) {
      const compactNodes = t.content.nodes
        .filter(n => n.type !== 'n8n-nodes-base.stickyNote')
        .map(n => ({
          type: n.type,
          typeVersion: n.typeVersion,
          parameters: n.parameters,
        }));
      hint += `Nodes: ${JSON.stringify(compactNodes)}\n`;
      hint += `Connections: ${JSON.stringify(t.content.connections)}\n`;
    }
  }

  return hint;
}
