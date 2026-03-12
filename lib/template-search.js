/**
 * n8n Pilot — Template Search
 * HTTP client for the local n8n workflow templates API server.
 * Server: github.com/Danitilahun/n8n-workflow-templates
 * Runs at http://localhost:8000 by default.
 */

const DEFAULT_BASE_URL = 'http://localhost:8000';
const REQUEST_TIMEOUT = 3000; // 3s — don't block generation if server is down

/**
 * Internal fetch with timeout and error handling.
 * Returns null on any failure (graceful degradation).
 */
async function fetchApi(path, baseUrl) {
  const url = `${baseUrl || DEFAULT_BASE_URL}${path}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Search templates by query, trigger type, complexity.
 * Returns { workflows: [...], total } or { workflows: [], total: 0 } on failure.
 */
export async function searchTemplates({ query, trigger, complexity, limit = 5, baseUrl } = {}) {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (trigger) params.set('trigger', trigger);
  if (complexity) params.set('complexity', complexity);
  params.set('per_page', String(limit));

  const result = await fetchApi(`/api/workflows?${params}`, baseUrl);
  if (!result) return { workflows: [], total: 0 };

  return {
    workflows: result.workflows || [],
    total: result.total || 0,
  };
}

/**
 * Get a single template by filename (includes full workflow JSON).
 */
export async function getTemplate(filename, baseUrl) {
  if (!filename) return null;
  return fetchApi(`/api/workflows/${encodeURIComponent(filename)}`, baseUrl);
}

/**
 * Get all available integrations from the template library.
 */
export async function getIntegrations(baseUrl) {
  const result = await fetchApi('/api/integrations', baseUrl);
  return result || [];
}

/**
 * Check if the template server is running and reachable.
 */
export async function isTemplateServerAvailable(baseUrl) {
  const result = await fetchApi('/api/stats', baseUrl);
  return result !== null;
}

/**
 * Get Mermaid diagram for a workflow template.
 * Returns Mermaid flowchart string or null on failure.
 */
export async function getDiagram(filename, baseUrl) {
  if (!filename) return null;
  const result = await fetchApi(`/api/workflows/${encodeURIComponent(filename)}/diagram`, baseUrl);
  return result?.diagram || result?.mermaid || (typeof result === 'string' ? result : null);
}

/**
 * Get service categories from the template library.
 * Returns array of category objects or [].
 */
export async function getCategories(baseUrl) {
  const result = await fetchApi('/api/categories', baseUrl);
  return result || [];
}

/**
 * Get template library statistics.
 * Returns { total_workflows, triggers, complexity, ... } or null.
 */
export async function getStats(baseUrl) {
  return fetchApi('/api/stats', baseUrl);
}

/**
 * Build a search query from a WorkflowBlueprint.
 * Extracts relevant keywords for template matching.
 */
export function buildSearchQuery(blueprint) {
  if (!blueprint) return '';

  const parts = [];

  // Add node type names (strip n8n prefix)
  if (blueprint.nodes) {
    for (const node of blueprint.nodes) {
      const shortName = (node.type || node.name || '')
        .replace('n8n-nodes-base.', '')
        .replace('@n8n/n8n-nodes-langchain.', '');
      if (shortName) parts.push(shortName);
    }
  }

  // Add trigger type
  if (blueprint.trigger?.type) {
    const triggerShort = blueprint.trigger.type
      .replace('n8n-nodes-base.', '')
      .replace('@n8n/n8n-nodes-langchain.', '');
    parts.push(triggerShort);
  }

  // Add credentials as keywords (they map to service names)
  if (blueprint.credentialsNeeded) {
    parts.push(...blueprint.credentialsNeeded);
  }

  return [...new Set(parts)].join(' ');
}

/**
 * Find matching templates for a blueprint.
 * Convenience function: builds query from blueprint + searches.
 */
export async function findTemplates(blueprint, options = {}) {
  const query = buildSearchQuery(blueprint);
  if (!query) return [];

  // Map blueprint trigger type to template API trigger filter
  const triggerMap = {
    'n8n-nodes-base.webhook': 'Webhook',
    'n8n-nodes-base.scheduleTrigger': 'Scheduled',
    'n8n-nodes-base.manualTrigger': 'Manual',
    'n8n-nodes-base.formTrigger': 'Webhook',
  };
  const trigger = triggerMap[blueprint.trigger?.type] || undefined;

  const result = await searchTemplates({
    query,
    trigger,
    complexity: blueprint.complexity,
    limit: options.limit || 3,
    baseUrl: options.baseUrl,
  });

  return result.workflows;
}
