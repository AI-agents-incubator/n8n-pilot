/**
 * n8n Pilot — Node Catalog Index
 * Brief index of ~100 common n8n nodes for prompt analysis.
 * Full list at: https://github.com/n8n-io/n8n/tree/master/packages/nodes-base/nodes
 */

const NODE_INDEX = [
  // === Triggers ===
  { type: 'n8n-nodes-base.manualTrigger', name: 'Manual Trigger', category: 'trigger', description: 'Manually trigger workflow' },
  { type: 'n8n-nodes-base.scheduleTrigger', name: 'Schedule Trigger', category: 'trigger', description: 'Trigger on cron/interval' },
  { type: 'n8n-nodes-base.webhook', name: 'Webhook', category: 'trigger', description: 'Trigger via HTTP webhook' },
  { type: 'n8n-nodes-base.formTrigger', name: 'Form Trigger', category: 'trigger', description: 'Form submission trigger' },
  { type: 'n8n-nodes-base.rssFeedReadTrigger', name: 'RSS Feed Trigger', category: 'trigger', description: 'Poll RSS feed for new items' },
  { type: 'n8n-nodes-base.emailReadImapTrigger', name: 'Email Trigger (IMAP)', category: 'trigger', description: 'Trigger on new email' },
  { type: 'n8n-nodes-base.telegramTrigger', name: 'Telegram Trigger', category: 'trigger', description: 'Trigger on Telegram message' },
  { type: 'n8n-nodes-base.gmailTrigger', name: 'Gmail Trigger', category: 'trigger', description: 'Trigger on new Gmail email' },
  { type: 'n8n-nodes-base.githubTrigger', name: 'GitHub Trigger', category: 'trigger', description: 'Trigger on GitHub events' },
  { type: 'n8n-nodes-base.slackTrigger', name: 'Slack Trigger', category: 'trigger', description: 'Trigger on Slack events' },

  // === Data Transformation ===
  { type: 'n8n-nodes-base.set', name: 'Set', category: 'data', description: 'Set or modify data fields' },
  { type: 'n8n-nodes-base.code', name: 'Code', category: 'data', description: 'Run JavaScript or Python code' },
  { type: 'n8n-nodes-base.splitOut', name: 'Split Out', category: 'data', description: 'Split array into items' },
  { type: 'n8n-nodes-base.merge', name: 'Merge', category: 'data', description: 'Merge data from two inputs' },
  { type: 'n8n-nodes-base.aggregate', name: 'Aggregate', category: 'data', description: 'Aggregate items into one' },
  { type: 'n8n-nodes-base.removeDuplicates', name: 'Remove Duplicates', category: 'data', description: 'Deduplicate items by field' },
  { type: 'n8n-nodes-base.sort', name: 'Sort', category: 'data', description: 'Sort items by field' },
  { type: 'n8n-nodes-base.limit', name: 'Limit', category: 'data', description: 'Limit number of items' },
  { type: 'n8n-nodes-base.convertToFile', name: 'Convert to File', category: 'data', description: 'Convert to JSON/CSV/XML file' },
  { type: 'n8n-nodes-base.extractFromFile', name: 'Extract from File', category: 'data', description: 'Extract data from file' },
  { type: 'n8n-nodes-base.html', name: 'HTML', category: 'data', description: 'Extract data from HTML' },
  { type: 'n8n-nodes-base.xml', name: 'XML', category: 'data', description: 'Convert between JSON and XML' },
  { type: 'n8n-nodes-base.markdown', name: 'Markdown', category: 'data', description: 'Convert Markdown to HTML' },
  { type: 'n8n-nodes-base.dateTime', name: 'Date & Time', category: 'data', description: 'Format and manipulate dates' },
  { type: 'n8n-nodes-base.crypto', name: 'Crypto', category: 'data', description: 'Hash, HMAC, encrypt data' },
  { type: 'n8n-nodes-base.compression', name: 'Compression', category: 'data', description: 'Compress/decompress files' },

  // === Flow Control ===
  { type: 'n8n-nodes-base.if', name: 'IF', category: 'flow', description: 'Conditional true/false branching' },
  { type: 'n8n-nodes-base.switch', name: 'Switch', category: 'flow', description: 'Multi-condition routing' },
  { type: 'n8n-nodes-base.filter', name: 'Filter', category: 'flow', description: 'Filter items by condition' },
  { type: 'n8n-nodes-base.splitInBatches', name: 'Split In Batches', category: 'flow', description: 'Loop through items in batches' },
  { type: 'n8n-nodes-base.wait', name: 'Wait', category: 'flow', description: 'Wait for time or webhook' },
  { type: 'n8n-nodes-base.noOp', name: 'No Operation', category: 'flow', description: 'Placeholder node' },
  { type: 'n8n-nodes-base.executeWorkflow', name: 'Execute Workflow', category: 'flow', description: 'Execute another workflow' },
  { type: 'n8n-nodes-base.stopAndError', name: 'Stop and Error', category: 'flow', description: 'Stop execution with error' },

  // === HTTP & API ===
  { type: 'n8n-nodes-base.httpRequest', name: 'HTTP Request', category: 'http', description: 'Make HTTP requests' },
  { type: 'n8n-nodes-base.respondToWebhook', name: 'Respond to Webhook', category: 'http', description: 'Send response to webhook' },
  { type: 'n8n-nodes-base.graphql', name: 'GraphQL', category: 'http', description: 'Execute GraphQL queries' },

  // === Communication ===
  { type: 'n8n-nodes-base.telegram', name: 'Telegram', category: 'communication', description: 'Send Telegram messages' },
  { type: 'n8n-nodes-base.gmail', name: 'Gmail', category: 'communication', description: 'Send/read Gmail emails' },
  { type: 'n8n-nodes-base.slack', name: 'Slack', category: 'communication', description: 'Send Slack messages' },
  { type: 'n8n-nodes-base.discord', name: 'Discord', category: 'communication', description: 'Send Discord messages' },
  { type: 'n8n-nodes-base.microsoftTeams', name: 'Microsoft Teams', category: 'communication', description: 'Send Teams messages' },
  { type: 'n8n-nodes-base.sendEmail', name: 'Send Email', category: 'communication', description: 'Send email via SMTP' },
  { type: 'n8n-nodes-base.whatsApp', name: 'WhatsApp Business', category: 'communication', description: 'Send WhatsApp messages' },

  // === Data Sources ===
  { type: 'n8n-nodes-base.airtable', name: 'Airtable', category: 'datasource', description: 'Airtable CRUD operations' },
  { type: 'n8n-nodes-base.googleSheets', name: 'Google Sheets', category: 'datasource', description: 'Google Sheets read/write' },
  { type: 'n8n-nodes-base.postgres', name: 'Postgres', category: 'datasource', description: 'PostgreSQL queries' },
  { type: 'n8n-nodes-base.mysql', name: 'MySQL', category: 'datasource', description: 'MySQL queries' },
  { type: 'n8n-nodes-base.mongoDB', name: 'MongoDB', category: 'datasource', description: 'MongoDB operations' },
  { type: 'n8n-nodes-base.redis', name: 'Redis', category: 'datasource', description: 'Redis get/set/delete' },
  { type: 'n8n-nodes-base.supabase', name: 'Supabase', category: 'datasource', description: 'Supabase database operations' },
  { type: 'n8n-nodes-base.notion', name: 'Notion', category: 'datasource', description: 'Notion pages/databases' },

  // === File & Storage ===
  { type: 'n8n-nodes-base.googleDrive', name: 'Google Drive', category: 'storage', description: 'Google Drive files' },
  { type: 'n8n-nodes-base.s3', name: 'AWS S3', category: 'storage', description: 'S3 bucket operations' },
  { type: 'n8n-nodes-base.ftp', name: 'FTP', category: 'storage', description: 'FTP file operations' },
  { type: 'n8n-nodes-base.readWriteFile', name: 'Read/Write File', category: 'storage', description: 'Local file read/write' },

  // === Project Management ===
  { type: 'n8n-nodes-base.jira', name: 'Jira', category: 'project', description: 'Jira issue operations' },
  { type: 'n8n-nodes-base.github', name: 'GitHub', category: 'project', description: 'GitHub repo/issue/PR operations' },
  { type: 'n8n-nodes-base.gitlab', name: 'GitLab', category: 'project', description: 'GitLab operations' },
  { type: 'n8n-nodes-base.trello', name: 'Trello', category: 'project', description: 'Trello board/card operations' },
  { type: 'n8n-nodes-base.asana', name: 'Asana', category: 'project', description: 'Asana task operations' },
  { type: 'n8n-nodes-base.linearApp', name: 'Linear', category: 'project', description: 'Linear issue tracking' },

  // === CRM & Marketing ===
  { type: 'n8n-nodes-base.hubspot', name: 'HubSpot', category: 'crm', description: 'HubSpot CRM operations' },
  { type: 'n8n-nodes-base.salesforce', name: 'Salesforce', category: 'crm', description: 'Salesforce operations' },
  { type: 'n8n-nodes-base.mailchimp', name: 'Mailchimp', category: 'crm', description: 'Mailchimp list/campaign' },

  // === AI ===
  { type: '@n8n/n8n-nodes-langchain.openAi', name: 'OpenAI', category: 'ai', description: 'OpenAI chat/text/image' },
  { type: '@n8n/n8n-nodes-langchain.googleGemini', name: 'Google Gemini', category: 'ai', description: 'Google Gemini AI' },
  { type: '@n8n/n8n-nodes-langchain.anthropic', name: 'Anthropic', category: 'ai', description: 'Claude AI (via n8n node)' },

  // === Utility ===
  { type: 'n8n-nodes-base.stickyNote', name: 'Sticky Note', category: 'utility', description: 'Visual note on canvas' },
  { type: 'n8n-nodes-base.errorTrigger', name: 'Error Trigger', category: 'utility', description: 'Trigger on workflow error' },
  { type: 'n8n-nodes-base.editFields', name: 'Edit Fields', category: 'utility', description: 'Rename/remove/reorder fields' },

  // === Payment ===
  { type: 'n8n-nodes-base.stripe', name: 'Stripe', category: 'payment', description: 'Stripe payments' },

  // === Analytics ===
  { type: 'n8n-nodes-base.googleAnalytics', name: 'Google Analytics', category: 'analytics', description: 'GA reporting' },
];

/**
 * Search for nodes matching a query.
 */
export function findNodes(query) {
  const q = query.toLowerCase();
  return NODE_INDEX.filter(n =>
    n.name.toLowerCase().includes(q) ||
    n.type.toLowerCase().includes(q) ||
    n.description.toLowerCase().includes(q) ||
    n.category.toLowerCase().includes(q)
  );
}

/**
 * Get a node by its type string.
 */
export function getNodeByType(type) {
  return NODE_INDEX.find(n => n.type === type) || null;
}

/**
 * Get all categories with their node counts.
 */
export function getCategories() {
  const cats = {};
  for (const node of NODE_INDEX) {
    cats[node.category] = (cats[node.category] || 0) + 1;
  }
  return cats;
}

/**
 * Get all nodes in a category.
 */
export function getNodesByCategory(category) {
  return NODE_INDEX.filter(n => n.category === category);
}

/**
 * Get the full node index.
 */
export function getAllNodes() {
  return [...NODE_INDEX];
}

/**
 * Build a compact summary for AI prompt injection.
 * Returns node types grouped by category for Claude's context.
 */
export function buildCatalogSummary() {
  const categories = {};
  for (const node of NODE_INDEX) {
    if (!categories[node.category]) categories[node.category] = [];
    categories[node.category].push(`${node.name} (${node.type})`);
  }

  let summary = 'Available n8n nodes by category:\n';
  for (const [cat, nodes] of Object.entries(categories)) {
    summary += `\n${cat.toUpperCase()}: ${nodes.join(', ')}`;
  }
  return summary;
}
