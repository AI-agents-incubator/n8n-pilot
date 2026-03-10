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
  "typeVersion": 1,
  "position": [x, y],
  "parameters": {}
}

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

COMMON NODE TYPES:
- Triggers: n8n-nodes-base.webhook, n8n-nodes-base.scheduleTrigger, n8n-nodes-base.manualTrigger, n8n-nodes-base.formTrigger
- HTTP: n8n-nodes-base.httpRequest
- Code: n8n-nodes-base.code (parameter: "jsCode" for JavaScript)
- IF: n8n-nodes-base.if (v2 conditions format)
- Switch: n8n-nodes-base.switch
- Set: n8n-nodes-base.set (v3.4 assignments format)
- Merge: n8n-nodes-base.merge
- Split Out: n8n-nodes-base.splitOut
- Loop: n8n-nodes-base.splitInBatches
- Wait: n8n-nodes-base.wait
- No Operation: n8n-nodes-base.noOp

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

IF NODE (v2) PARAMETER FORMAT:
{
  "conditions": {
    "options": { "caseSensitive": true, "leftValue": "" },
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

IMPORTANT:
- Every workflow MUST have exactly one trigger node as the first node
- All node names must be unique within the workflow
- Use expression syntax {{ $json.field }} for referencing data from previous nodes
- Generate proper UUIDs for all id fields
- Keep the workflow practical and complete`;

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
 * Used by background.js for streaming generation.
 */
export function getSystemPrompt() {
  return SYSTEM_PROMPT;
}
