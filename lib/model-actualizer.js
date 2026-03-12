/**
 * n8n Pilot — Model Actualizer
 * Maps deprecated AI model references to current equivalents.
 * Integrated into the normalize pipeline so every generated/imported
 * workflow automatically gets up-to-date model references.
 */

// Deprecated OpenAI models → current cheapest capable default
const OPENAI_MODEL_MAP = {
  'gpt-3.5-turbo': 'gpt-4.1-nano',
  'gpt-4': 'gpt-4.1-nano',
  'gpt-4-turbo': 'gpt-4.1-nano',
  'gpt-4-turbo-preview': 'gpt-4.1-nano',
  'gpt-4o': 'gpt-4.1-nano',
  'gpt-4o-mini': 'gpt-4.1-nano',
  'chatgpt-4o-latest': 'gpt-4.1-nano',
  'gpt-4-0613': 'gpt-4.1-nano',
  'gpt-4-1106-preview': 'gpt-4.1-nano',
  'gpt-4-0125-preview': 'gpt-4.1-nano',
};

// Deprecated Google Gemini models → current default
const GEMINI_MODEL_MAP = {
  'gemini-pro': 'models/gemini-2.5-flash',
  'gemini-1.0-pro': 'models/gemini-2.5-flash',
  'gemini-1.5-flash': 'models/gemini-2.5-flash',
  'gemini-1.5-pro': 'models/gemini-2.5-flash',
  'gemini-2.0-flash': 'models/gemini-2.5-flash',
  'gemini-2.0-flash-exp': 'models/gemini-2.5-flash',
  'models/gemini-pro': 'models/gemini-2.5-flash',
  'models/gemini-1.0-pro': 'models/gemini-2.5-flash',
  'models/gemini-1.5-flash': 'models/gemini-2.5-flash',
  'models/gemini-1.5-pro': 'models/gemini-2.5-flash',
  'models/gemini-2.0-flash': 'models/gemini-2.5-flash',
  'models/gemini-2.0-flash-exp': 'models/gemini-2.5-flash',
};

// Current recommended models (for UI display and prompt hints)
const CURRENT_MODELS = {
  openai: [
    { id: 'gpt-4.1-nano', label: 'GPT-4.1 Nano', tier: 'economy' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini', tier: 'standard' },
    { id: 'gpt-4.1', label: 'GPT-4.1', tier: 'premium' },
  ],
  gemini: [
    { id: 'models/gemini-2.5-flash', label: 'Gemini 2.5 Flash', tier: 'economy' },
    { id: 'models/gemini-2.5-pro', label: 'Gemini 2.5 Pro', tier: 'premium' },
    { id: 'models/gemini-3-flash-preview', label: 'Gemini 3 Flash (Preview)', tier: 'preview' },
  ],
};

/**
 * Normalize a model ID string — strip "models/" prefix for lookup if needed.
 */
function normalizeModelKey(value) {
  if (!value || typeof value !== 'string') return '';
  return value.trim();
}

/**
 * Look up the current replacement for a deprecated model.
 * Returns the replacement model ID, or null if already current.
 */
export function actualizeModelId(modelValue, nodeType) {
  const key = normalizeModelKey(modelValue);
  if (!key) return null;

  if (nodeType === '@n8n/n8n-nodes-langchain.openAi') {
    return OPENAI_MODEL_MAP[key] || null;
  }
  if (nodeType === '@n8n/n8n-nodes-langchain.googleGemini') {
    return GEMINI_MODEL_MAP[key] || null;
  }
  return null;
}

/**
 * Check if a model ID is deprecated.
 */
export function isDeprecatedModel(modelValue, nodeType) {
  return actualizeModelId(modelValue, nodeType) !== null;
}

/**
 * Actualize model references in a workflow node.
 * Handles the __rl Resource Locator pattern used by n8n.
 * Mutates the node in place and returns it.
 */
export function actualizeNode(node) {
  if (!node || !node.parameters) return node;
  if (node.type !== '@n8n/n8n-nodes-langchain.openAi' &&
      node.type !== '@n8n/n8n-nodes-langchain.googleGemini') {
    return node;
  }

  const modelField = node.parameters.modelId || node.parameters.model;
  if (!modelField) return node;

  // Handle __rl Resource Locator pattern: { __rl: true, value: "model-id", ... }
  if (modelField.__rl && modelField.value) {
    const replacement = actualizeModelId(modelField.value, node.type);
    if (replacement) {
      modelField.value = replacement;
      modelField.cachedResultName = replacement;
    }
  }
  // Handle bare string value
  else if (typeof modelField === 'string') {
    const replacement = actualizeModelId(modelField, node.type);
    if (replacement) {
      const key = node.parameters.modelId ? 'modelId' : 'model';
      node.parameters[key] = replacement;
    }
  }

  return node;
}

/**
 * Get list of current recommended models for each provider.
 */
export function getCurrentModels() {
  return structuredClone(CURRENT_MODELS);
}

/**
 * Get the default (cheapest) model for a node type.
 */
export function getDefaultModel(nodeType) {
  if (nodeType === '@n8n/n8n-nodes-langchain.openAi') {
    return CURRENT_MODELS.openai[0].id;
  }
  if (nodeType === '@n8n/n8n-nodes-langchain.googleGemini') {
    return CURRENT_MODELS.gemini[0].id;
  }
  return null;
}
