/**
 * n8n Pilot — Preflight Validation
 * Analyzes blueprint + user prompt to detect missing critical parameters.
 * Returns structured questions for interactive Q&A before generation.
 */

/**
 * Required context definitions for common n8n nodes.
 * Each entry maps a node type to its critical fields with detection regex.
 * If the regex matches the user prompt, the field is considered provided.
 */
const NODE_REQUIRED_CONTEXT = {
  'n8n-nodes-base.telegram': {
    fields: [
      {
        field: 'chatId',
        label: 'Telegram Chat ID',
        placeholder: '-100123456 or @channel',
        detect: /chat.?id|@\w{3,}|-\d{8,}/i,
      },
    ],
  },
  'n8n-nodes-base.httpRequest': {
    fields: [
      {
        field: 'url',
        label: 'API URL',
        placeholder: 'https://api.example.com/endpoint',
        detect: /https?:\/\/\S+/i,
      },
    ],
  },
  'n8n-nodes-base.gmail': {
    fields: [
      {
        field: 'sendTo',
        label: 'Recipient email',
        placeholder: 'user@example.com',
        detect: /[\w.+-]+@[\w.-]+\.\w{2,}/i,
      },
    ],
  },
  'n8n-nodes-base.scheduleTrigger': {
    fields: [
      {
        field: 'interval',
        label: 'Schedule interval',
        placeholder: 'e.g. every 5 minutes, daily at 9am',
        detect: /every\s+\d+\s*(min|hour|day|second|week)|daily|hourly|weekly|\d+\s*:\s*\d+|cron/i,
      },
    ],
  },
  'n8n-nodes-base.webhook': {
    fields: [
      {
        field: 'path',
        label: 'Webhook path',
        placeholder: '/my-webhook',
        detect: /\/[\w-]+|endpoint|route/i,
      },
    ],
  },
  'n8n-nodes-base.rssFeedReadTrigger': {
    fields: [
      {
        field: 'feedUrl',
        label: 'RSS Feed URL',
        placeholder: 'https://example.com/feed.xml',
        detect: /https?:\/\/\S+/i,
      },
    ],
  },
  'n8n-nodes-base.slack': {
    fields: [
      {
        field: 'channel',
        label: 'Slack channel',
        placeholder: '#general or channel ID',
        detect: /#[\w-]+|channel\s*[:=]/i,
      },
    ],
  },
  'n8n-nodes-base.airtable': {
    fields: [
      {
        field: 'baseId',
        label: 'Airtable Base ID',
        placeholder: 'appXXXXXXXXXXXX',
        detect: /app[a-zA-Z0-9]{10,}/i,
      },
    ],
  },
  'n8n-nodes-base.googleSheets': {
    fields: [
      {
        field: 'spreadsheetId',
        label: 'Spreadsheet ID or URL',
        placeholder: 'Paste Google Sheets URL or ID',
        detect: /docs\.google\.com\/spreadsheets|[a-zA-Z0-9_-]{20,}/i,
      },
    ],
  },
  'n8n-nodes-base.postgres': {
    fields: [
      {
        field: 'table',
        label: 'Table name',
        placeholder: 'users, orders, etc.',
        detect: /table\s*[:=]\s*\w+|from\s+\w+/i,
      },
    ],
  },
  'n8n-nodes-base.notion': {
    fields: [
      {
        field: 'databaseId',
        label: 'Notion Database ID or URL',
        placeholder: 'notion.so/... or database ID',
        detect: /notion\.so\/|[a-f0-9]{32}/i,
      },
    ],
  },
  'n8n-nodes-base.discord': {
    fields: [
      {
        field: 'webhookUrl',
        label: 'Discord Webhook URL',
        placeholder: 'https://discord.com/api/webhooks/...',
        detect: /discord\.com\/api\/webhooks/i,
      },
    ],
  },
  // Triggers that need no user input (credentials handled separately)
  'n8n-nodes-base.telegramTrigger': { fields: [] },
  'n8n-nodes-base.gmailTrigger': { fields: [] },
  'n8n-nodes-base.githubTrigger': { fields: [] },
  'n8n-nodes-base.slackTrigger': { fields: [] },
  'n8n-nodes-base.manualTrigger': { fields: [] },
  'n8n-nodes-base.formTrigger': { fields: [] },
};

/**
 * Validate a workflow blueprint against the user prompt.
 * Detects missing critical parameters and returns questions.
 *
 * @param {Object} blueprint - from promptAnalyzer.analyze()
 * @param {string} prompt - the original user prompt text
 * @returns {{ questions: Question[], summary: string, complete: boolean }}
 */
export function validate(blueprint, prompt) {
  if (!blueprint || !prompt) {
    return { questions: [], summary: '', complete: true };
  }

  const questions = [];
  const seenFields = new Set();

  // Collect all node types to check: trigger + action nodes
  const allNodes = [];
  if (blueprint.trigger?.type) {
    allNodes.push(blueprint.trigger);
  }
  if (Array.isArray(blueprint.nodes)) {
    allNodes.push(...blueprint.nodes);
  }

  // Check each node type for missing required context
  for (const node of allNodes) {
    const ctx = NODE_REQUIRED_CONTEXT[node.type];
    if (!ctx || !ctx.fields || ctx.fields.length === 0) continue;

    for (const fieldDef of ctx.fields) {
      // Avoid duplicate questions for the same field
      const key = `${node.type}:${fieldDef.field}`;
      if (seenFields.has(key)) continue;
      seenFields.add(key);

      // Test if the user already provided this info in the prompt
      if (fieldDef.detect && fieldDef.detect.test(prompt)) continue;

      questions.push({
        nodeType: node.type,
        nodeName: node.name || node.type.split('.').pop(),
        field: fieldDef.field,
        label: fieldDef.label,
        placeholder: fieldDef.placeholder || '',
        required: true,
      });
    }
  }

  // Build human-readable summary
  const triggerName = blueprint.trigger?.name || 'Manual Trigger';
  const nodeNames = (blueprint.nodes || []).map(n => n.name || n.type.split('.').pop());
  const summary = nodeNames.length > 0
    ? `${triggerName} → ${nodeNames.join(' → ')}`
    : triggerName;

  return {
    questions,
    summary,
    complete: questions.length === 0,
  };
}
