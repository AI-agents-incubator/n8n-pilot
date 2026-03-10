/**
 * n8n Pilot — Workflow Validator & Normalizer
 * Validates and fixes n8n workflow JSON structure.
 * Based on reverse-engineering of n8n Copilot's fixGeminiWorkflowStructure
 * and convertNumericObjectsToArrays functions.
 */

import { uuid } from './utils.js';

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
];

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

  // Default typeVersion
  if (node.typeVersion === undefined) {
    node.typeVersion = 1;
  }

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
 * Ensures conditions follow v2+ structure.
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
      params.conditions.options = { caseSensitive: true, leftValue: '' };
    }
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
          options: { caseSensitive: true, leftValue: '' },
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
