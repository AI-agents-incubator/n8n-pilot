/**
 * n8n Pilot — Workflow Validator & Normalizer
 * Validates and fixes n8n workflow JSON structure.
 * Based on reverse-engineering of n8n Copilot's fixGeminiWorkflowStructure
 * and convertNumericObjectsToArrays functions.
 */

import { uuid } from './utils.js';
import { actualizeNode } from './model-actualizer.js';

// Known trigger node type prefixes
const TRIGGER_TYPES = [
  'n8n-nodes-base.webhook',
  'n8n-nodes-base.scheduleTrigger',
  'n8n-nodes-base.manualTrigger',
  'n8n-nodes-base.cronTrigger',
  'n8n-nodes-base.emailTrigger',
  'n8n-nodes-base.errorTrigger',
  'n8n-nodes-base.workflowTrigger',
  'n8n-nodes-base.formTrigger',
  'n8n-nodes-base.chatTrigger',
  'n8n-nodes-base.rssFeedReadTrigger',
];

// Common AI-generated wrong type strings → correct n8n type
const TYPE_CORRECTIONS = {
  '@n8n/n8n-nodes-langchain.lmChatGoogleGemini': '@n8n/n8n-nodes-langchain.googleGemini',
  '@n8n/n8n-nodes-langchain.lmChatOpenAi': '@n8n/n8n-nodes-langchain.openAi',
  'n8n-nodes-base.openAi': '@n8n/n8n-nodes-langchain.openAi',
  'n8n-nodes-base.googleGemini': '@n8n/n8n-nodes-langchain.googleGemini',
};

// Correct typeVersions for common nodes (n8n v2.1+)
const CORRECT_TYPE_VERSIONS = {
  'n8n-nodes-base.webhook': 2.1,
  'n8n-nodes-base.scheduleTrigger': 1.2,
  'n8n-nodes-base.manualTrigger': 1,
  'n8n-nodes-base.formTrigger': 2.2,
  'n8n-nodes-base.rssFeedReadTrigger': 1,
  'n8n-nodes-base.httpRequest': 4.3,
  'n8n-nodes-base.code': 2,
  'n8n-nodes-base.if': 2.3,
  'n8n-nodes-base.filter': 2.2,
  'n8n-nodes-base.switch': 3.2,
  'n8n-nodes-base.set': 3.4,
  'n8n-nodes-base.merge': 3,
  'n8n-nodes-base.splitOut': 1,
  'n8n-nodes-base.splitInBatches': 3,
  'n8n-nodes-base.wait': 1.1,
  'n8n-nodes-base.noOp': 1,
  'n8n-nodes-base.html': 1.2,
  'n8n-nodes-base.convertToFile': 1.1,
  'n8n-nodes-base.telegram': 1.2,
  'n8n-nodes-base.gmail': 2.2,
  'n8n-nodes-base.airtable': 2.1,
  'n8n-nodes-base.getResponse': 1,
  '@n8n/n8n-nodes-langchain.openAi': 1.8,
  '@n8n/n8n-nodes-langchain.googleGemini': 1.1,
};

/**
 * Validate a workflow object.
 * Returns { valid, errors, warnings }.
 */
export function validate(workflow) {
  const errors = [];
  const warnings = [];

  if (!workflow || typeof workflow !== 'object') {
    errors.push('Workflow is not a valid object');
    return { valid: false, errors, warnings };
  }

  // Check nodes
  if (!workflow.nodes) {
    errors.push('Missing "nodes" field');
  } else if (!Array.isArray(workflow.nodes)) {
    if (typeof workflow.nodes === 'object') {
      warnings.push('"nodes" is an object, will be converted to array');
    } else {
      errors.push('"nodes" must be an array');
    }
  } else {
    if (workflow.nodes.length === 0) {
      errors.push('Workflow has no nodes');
    }

    // Check for trigger node
    const hasTrigger = workflow.nodes.some(node =>
      TRIGGER_TYPES.some(t => node.type && node.type.startsWith(t.replace('n8n-nodes-base.', '')))
      || TRIGGER_TYPES.includes(node.type)
      || (node.type && node.type.toLowerCase().includes('trigger'))
    );

    if (!hasTrigger) {
      warnings.push('No trigger node found — workflow may not start automatically');
    }

    // Check individual nodes
    const nodeNames = new Set();
    for (const node of workflow.nodes) {
      if (!node.name) warnings.push(`Node missing "name" field`);
      if (!node.type) errors.push(`Node "${node.name || 'unnamed'}" missing "type" field`);
      if (!node.position) warnings.push(`Node "${node.name || 'unnamed'}" missing "position"`);

      if (node.name && nodeNames.has(node.name)) {
        warnings.push(`Duplicate node name: "${node.name}"`);
      }
      nodeNames.add(node.name);
    }
  }

  // Check connections
  if (!workflow.connections) {
    warnings.push('Missing "connections" field — nodes will be disconnected');
  } else if (typeof workflow.connections !== 'object') {
    errors.push('"connections" must be an object');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Normalize a workflow object — fix common issues from AI generation.
 * Returns a new, cleaned-up workflow object.
 */
export function normalize(workflow) {
  if (!workflow || typeof workflow !== 'object') return workflow;

  let w = structuredClone(workflow);

  // 1. Convert numeric-keyed objects to arrays (common AI hallucination)
  w.nodes = convertNumericObjectToArray(w.nodes);

  if (!Array.isArray(w.nodes)) {
    w.nodes = [];
  }

  // 2. Fix each node
  w.nodes = w.nodes.map(node => fixNode(node));

  // 3. Fix connections
  w.connections = fixConnections(w.connections || {});

  // 4. Ensure settings
  if (!w.settings) {
    w.settings = {};
  }
  if (!w.settings.executionOrder) {
    w.settings.executionOrder = 'v1';
  }

  // 5. Ensure name
  if (!w.name) {
    w.name = 'Generated Workflow';
  }

  return w;
}

// --- Internal fix functions ---

/**
 * Convert objects with numeric keys to arrays.
 * { "0": nodeA, "1": nodeB } → [nodeA, nodeB]
 */
function convertNumericObjectToArray(obj) {
  if (Array.isArray(obj)) return obj;
  if (!obj || typeof obj !== 'object') return obj;

  const keys = Object.keys(obj);
  if (keys.length === 0) return [];

  // Check if all keys are numeric
  const allNumeric = keys.every(k => /^\d+$/.test(k));
  if (allNumeric) {
    return keys
      .sort((a, b) => parseInt(a) - parseInt(b))
      .map(k => obj[k]);
  }

  return obj;
}

/**
 * Fix a single node object.
 */
function fixNode(node) {
  if (!node || typeof node !== 'object') return node;

  // Fix incorrect node types from AI hallucination
  if (node.type && TYPE_CORRECTIONS[node.type]) {
    node.type = TYPE_CORRECTIONS[node.type];
  }

  // Fix typeVersion to match current n8n versions
  const correctVersion = CORRECT_TYPE_VERSIONS[node.type];
  if (correctVersion !== undefined) {
    node.typeVersion = correctVersion;
  } else if (node.typeVersion === undefined) {
    node.typeVersion = 1;
  }

  // Generate ID if missing
  if (!node.id) {
    node.id = uuid();
  }

  // Default position
  if (!node.position || !Array.isArray(node.position) || node.position.length < 2) {
    node.position = [800, 300];
  }

  // Ensure position values are numbers
  node.position = node.position.map(v => typeof v === 'number' ? v : parseInt(v) || 0);

  // Default parameters
  if (!node.parameters) {
    node.parameters = {};
  }

  // Fix Set node parameters (v3.4+)
  if (node.type === 'n8n-nodes-base.set') {
    node.parameters = fixSetNodeParameters(node.parameters);
  }

  // Fix IF node conditions (v2+)
  if (node.type === 'n8n-nodes-base.if') {
    node.parameters = fixIfNodeParameters(node.parameters);
  }

  // Fix Filter node conditions (v2+)
  if (node.type === 'n8n-nodes-base.filter') {
    node.parameters = fixFilterNodeParameters(node.parameters);
  }

  // Fix OpenAI langchain node parameters (v1.8)
  if (node.type === '@n8n/n8n-nodes-langchain.openAi') {
    node.parameters = fixOpenAiNodeParameters(node.parameters);
  }

  // Fix Google Gemini langchain node parameters (v1.1)
  if (node.type === '@n8n/n8n-nodes-langchain.googleGemini') {
    node.parameters = fixGeminiNodeParameters(node.parameters);
  }

  // Actualize deprecated AI model references
  actualizeNode(node);

  return node;
}

/**
 * Fix Set node parameter format.
 * Old format: values: [{ name, value }]
 * New format (v3.4+): assignments: { assignments: [{ id, name, value, type }] }
 */
function fixSetNodeParameters(params) {
  // Already correct format
  if (params.assignments && params.assignments.assignments) {
    // Ensure each assignment has an id
    params.assignments.assignments = params.assignments.assignments.map(a => ({
      id: a.id || uuid(),
      name: a.name || '',
      value: a.value ?? '',
      type: a.type || 'string',
    }));
    return params;
  }

  // Old format: values array
  if (params.values && Array.isArray(params.values)) {
    return {
      mode: 'manual',
      assignments: {
        assignments: params.values.map(v => ({
          id: uuid(),
          name: v.name || '',
          value: v.value ?? '',
          type: v.type || 'string',
        })),
      },
      options: params.options || {},
    };
  }

  // Old format: values object with typed arrays
  if (params.values && typeof params.values === 'object' && !Array.isArray(params.values)) {
    const allValues = [
      ...(params.values.string || []),
      ...(params.values.number || []),
      ...(params.values.boolean || []),
    ];
    if (allValues.length > 0) {
      return {
        mode: 'manual',
        assignments: {
          assignments: allValues.map(v => ({
            id: uuid(),
            name: v.name || '',
            value: v.value ?? '',
            type: v.type || 'string',
          })),
        },
        options: params.options || {},
      };
    }
  }

  return params;
}

/**
 * Fix IF node condition format.
 * Ensures conditions follow v2.3 structure with typeValidation and version.
 */
function fixIfNodeParameters(params) {
  if (params.conditions && params.conditions.conditions) {
    // Ensure each condition has an id
    params.conditions.conditions = params.conditions.conditions.map(c => ({
      id: c.id || uuid(),
      leftValue: c.leftValue || '',
      rightValue: c.rightValue || '',
      operator: c.operator || { type: 'string', operation: 'equals' },
    }));

    if (!params.conditions.options) {
      params.conditions.options = {};
    }
    // v2.3 requires typeValidation and version
    params.conditions.options = {
      caseSensitive: params.conditions.options.caseSensitive ?? true,
      leftValue: params.conditions.options.leftValue ?? '',
      typeValidation: params.conditions.options.typeValidation || 'strict',
      version: params.conditions.options.version || 3,
    };
    if (!params.conditions.combinator) {
      params.conditions.combinator = 'and';
    }
    return params;
  }

  // Legacy format: conditions.string / conditions.number / conditions.boolean
  if (params.conditions && typeof params.conditions === 'object') {
    const legacy = [
      ...(params.conditions.string || []).map(c => ({ ...c, opType: 'string' })),
      ...(params.conditions.number || []).map(c => ({ ...c, opType: 'number' })),
      ...(params.conditions.boolean || []).map(c => ({ ...c, opType: 'boolean' })),
    ];

    if (legacy.length > 0) {
      return {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 3 },
          conditions: legacy.map(c => ({
            id: uuid(),
            leftValue: c.value1 || '',
            rightValue: c.value2 || '',
            operator: {
              type: c.opType || 'string',
              operation: c.operation || 'equals',
            },
          })),
          combinator: 'and',
        },
        options: params.options || {},
      };
    }
  }

  return params;
}

/**
 * Fix Filter node condition format.
 * Ensures conditions follow v2.2 structure with typeValidation and version.
 */
function fixFilterNodeParameters(params) {
  if (params.conditions && params.conditions.conditions) {
    // Ensure each condition has an id
    params.conditions.conditions = params.conditions.conditions.map(c => ({
      id: c.id || uuid(),
      leftValue: c.leftValue || '',
      rightValue: c.rightValue || '',
      operator: c.operator || { type: 'string', operation: 'equals' },
    }));

    if (!params.conditions.options) {
      params.conditions.options = {};
    }
    // v2.2 requires typeValidation and version
    params.conditions.options = {
      caseSensitive: params.conditions.options.caseSensitive ?? true,
      leftValue: params.conditions.options.leftValue ?? '',
      typeValidation: params.conditions.options.typeValidation || 'strict',
      version: params.conditions.options.version || 2,
    };
    if (!params.conditions.combinator) {
      params.conditions.combinator = 'and';
    }
  }
  return params;
}

/**
 * Fix OpenAI langchain node parameters (v1.8).
 * AI often generates: { model, prompt, options.systemMessage }
 * Correct format:     { modelId, messages.values[], simplify }
 */
function fixOpenAiNodeParameters(params) {
  // If already has modelId + messages, it's correct format
  if (params.modelId && params.messages) return params;

  // Fix model → modelId (with __rl Resource Locator pattern)
  if (params.model && !params.modelId) {
    params.modelId = params.model;
    delete params.model;
  }

  // Fix prompt + options.systemMessage → messages.values[]
  if (params.prompt && !params.messages) {
    const messagesValues = [];

    // System message from options
    const systemMsg = params.options?.systemMessage;
    if (systemMsg) {
      messagesValues.push({ content: systemMsg, role: 'system' });
      delete params.options.systemMessage;
    }

    // User prompt
    messagesValues.push({ content: params.prompt });

    params.messages = { values: messagesValues };
    delete params.prompt;
  }

  // Ensure simplify is set (original nodes have this)
  if (params.simplify === undefined) {
    params.simplify = false;
  }

  // Ensure options exists and is clean
  if (!params.options) {
    params.options = {};
  }

  return params;
}

/**
 * Fix Google Gemini langchain node parameters (v1.1).
 * AI often generates: { model, prompt, options.systemMessage }
 * Correct format:     { modelId, messages.values[] }
 */
function fixGeminiNodeParameters(params) {
  // If already has modelId + messages, it's correct format
  if (params.modelId && params.messages) return params;

  // Fix model → modelId (with __rl Resource Locator pattern)
  if (params.model && !params.modelId) {
    params.modelId = params.model;
    delete params.model;
  }

  // Fix prompt + options.systemMessage → messages.values[]
  if (params.prompt && !params.messages) {
    const messagesValues = [];

    // System message from options
    const systemMsg = params.options?.systemMessage;
    if (systemMsg) {
      messagesValues.push({ content: systemMsg });
      delete params.options.systemMessage;
    }

    // User prompt
    messagesValues.push({ content: params.prompt });

    params.messages = { values: messagesValues };
    delete params.prompt;
  }

  // Ensure options exists and is clean
  if (!params.options) {
    params.options = {};
  }

  // Ensure builtInTools exists
  if (!params.builtInTools) {
    params.builtInTools = {};
  }

  return params;
}

/**
 * Fix connections structure.
 * Ensures format: { "NodeName": { "main": [[{ node, type, index }]] } }
 */
function fixConnections(connections) {
  if (!connections || typeof connections !== 'object') return {};

  const fixed = {};

  for (const [nodeName, nodeConns] of Object.entries(connections)) {
    if (!nodeConns || typeof nodeConns !== 'object') continue;

    fixed[nodeName] = {};

    // Handle main connections
    let main = nodeConns.main;

    if (!main) {
      fixed[nodeName] = nodeConns;
      continue;
    }

    // Convert numeric object to array
    main = convertNumericObjectToArray(main);

    if (!Array.isArray(main)) {
      fixed[nodeName].main = [[main]];
      continue;
    }

    // Ensure each output is an array of connections
    fixed[nodeName].main = main.map(output => {
      output = convertNumericObjectToArray(output);
      if (!Array.isArray(output)) return [output];
      return output.map(conn => ({
        node: conn.node || '',
        type: conn.type || 'main',
        index: conn.index ?? 0,
      }));
    });
  }

  return fixed;
}
