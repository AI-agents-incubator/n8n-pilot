/**
 * n8n Pilot — Prompt Analyzer
 * Analyzes user prompts to create workflow blueprints.
 * Uses node catalog to map intents to n8n node types.
 */

import * as catalogIndex from './node-catalog-index.js';
import * as catalogCore from './node-catalog-core.js';

/**
 * Analyze a user prompt and return a workflow blueprint.
 * This does local analysis without an API call — fast and free.
 *
 * @param {string} prompt - User's workflow description
 * @returns {WorkflowBlueprint}
 */
export function analyze(prompt) {
  const lower = prompt.toLowerCase();

  const blueprint = {
    trigger: detectTrigger(lower),
    nodes: detectNodes(lower),
    connections: [], // Will be inferred during generation
    credentialsNeeded: [],
    complexity: 'simple',
    summary: '',
  };

  // Collect credentials from detected nodes
  for (const node of [...(blueprint.trigger ? [blueprint.trigger] : []), ...blueprint.nodes]) {
    const coreNode = catalogCore.getCoreNode(node.type);
    if (coreNode?.credentials) {
      const credType = Object.keys(coreNode.credentials)[0];
      if (credType && !blueprint.credentialsNeeded.includes(credType)) {
        blueprint.credentialsNeeded.push(credType);
      }
    }
  }

  // Determine complexity
  const totalNodes = (blueprint.trigger ? 1 : 0) + blueprint.nodes.length;
  if (totalNodes > 5) blueprint.complexity = 'complex';
  else if (totalNodes > 2) blueprint.complexity = 'moderate';

  // Build summary
  const triggerName = blueprint.trigger?.name || 'manual trigger';
  const nodeNames = blueprint.nodes.map(n => n.name).join(', ');
  blueprint.summary = `${triggerName} → ${nodeNames || 'processing'}`;

  return blueprint;
}

/**
 * Build an enhanced system prompt that includes relevant node schemas.
 * Only includes schemas for nodes detected in the blueprint.
 *
 * @param {WorkflowBlueprint} blueprint
 * @param {string} baseSystemPrompt - The default generator system prompt
 * @returns {string}
 */
export function buildEnhancedPrompt(blueprint, baseSystemPrompt) {
  // Collect relevant node types from blueprint
  const relevantTypes = new Set();
  if (blueprint.trigger) relevantTypes.add(blueprint.trigger.type);
  for (const node of blueprint.nodes) {
    relevantTypes.add(node.type);
  }

  // Build schema section for relevant core nodes only
  const schemas = [];
  for (const type of relevantTypes) {
    const coreNode = catalogCore.getCoreNode(type);
    if (coreNode) {
      schemas.push(`\n--- ${type} (v${coreNode.typeVersion}) ---\n${JSON.stringify(coreNode.defaultParameters, null, 2)}`);
    }
  }

  let enhanced = baseSystemPrompt;

  if (schemas.length > 0) {
    enhanced += '\n\nDETAILED PARAMETER SCHEMAS FOR THIS WORKFLOW:\n';
    enhanced += 'Use these exact parameter structures for the nodes below:\n';
    enhanced += schemas.join('\n');
  }

  // Add catalog summary for non-core nodes
  const nonCoreTypes = [...relevantTypes].filter(t => !catalogCore.isCoreNode(t));
  if (nonCoreTypes.length > 0) {
    enhanced += '\n\nAdditional nodes referenced (use standard n8n parameters):\n';
    for (const type of nonCoreTypes) {
      const info = catalogIndex.getNodeByType(type);
      if (info) {
        enhanced += `- ${info.name} (${type}): ${info.description}\n`;
      }
    }
  }

  return enhanced;
}

// --- Internal Detection Functions ---

function detectTrigger(text) {
  // Webhook triggers
  if (text.match(/\b(webhook|http trigger|api endpoint|rest endpoint|incoming request)\b/)) {
    return { type: 'n8n-nodes-base.webhook', name: 'Webhook', role: 'trigger' };
  }

  // Schedule triggers
  if (text.match(/\b(every\s+\d+\s+(minutes?|hours?|days?|seconds?)|schedule|cron|interval|periodic|daily|hourly|weekly)\b/)) {
    return { type: 'n8n-nodes-base.scheduleTrigger', name: 'Schedule Trigger', role: 'trigger' };
  }

  // Form trigger
  if (text.match(/\b(form|user input|submit|questionnaire)\b/)) {
    return { type: 'n8n-nodes-base.formTrigger', name: 'Form Trigger', role: 'trigger' };
  }

  // RSS trigger
  if (text.match(/\b(rss|feed|blog post|news feed)\b/)) {
    return { type: 'n8n-nodes-base.rssFeedReadTrigger', name: 'RSS Feed Trigger', role: 'trigger' };
  }

  // Email trigger
  if (text.match(/\b(new email|incoming email|email trigger|when.*email)\b/)) {
    return { type: 'n8n-nodes-base.gmailTrigger', name: 'Gmail Trigger', role: 'trigger' };
  }

  // Telegram trigger
  if (text.match(/\b(telegram message|telegram bot|when.*telegram)\b/)) {
    return { type: 'n8n-nodes-base.telegramTrigger', name: 'Telegram Trigger', role: 'trigger' };
  }

  // GitHub trigger
  if (text.match(/\b(github event|pull request|github webhook|when.*commit|when.*push)\b/)) {
    return { type: 'n8n-nodes-base.githubTrigger', name: 'GitHub Trigger', role: 'trigger' };
  }

  // Slack trigger
  if (text.match(/\b(slack message|slack event|when.*slack)\b/)) {
    return { type: 'n8n-nodes-base.slackTrigger', name: 'Slack Trigger', role: 'trigger' };
  }

  // Default: manual trigger
  return { type: 'n8n-nodes-base.manualTrigger', name: 'Manual Trigger', role: 'trigger' };
}

function detectNodes(text) {
  const nodes = [];

  // HTTP Request
  if (text.match(/\b(fetch|api call|http request|get data from|call api|rest api|curl|request to)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.httpRequest', name: 'HTTP Request', role: 'action' });
  }

  // Code node
  if (text.match(/\b(javascript|js code|custom code|python|transform data|script|process data)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.code', name: 'Code', role: 'transform' });
  }

  // Set node
  if (text.match(/\b(set field|set value|assign|map field|rename field)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.set', name: 'Set', role: 'transform' });
  }

  // IF / conditional
  if (text.match(/\b(if|condition|check|branch|when.*then|conditional)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.if', name: 'IF', role: 'flow' });
  }

  // Filter
  if (text.match(/\b(filter|only.*where|exclude|include only|discard)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.filter', name: 'Filter', role: 'flow' });
  }

  // Switch
  if (text.match(/\b(switch|route|multiple conditions|case|different paths)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.switch', name: 'Switch', role: 'flow' });
  }

  // Merge
  if (text.match(/\b(merge|combine|join|concatenate data)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.merge', name: 'Merge', role: 'transform' });
  }

  // Split
  if (text.match(/\b(split|separate|loop.*each|for each|iterate)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.splitOut', name: 'Split Out', role: 'transform' });
  }

  // Communication nodes
  if (text.match(/\b(telegram|send.*telegram)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.telegram', name: 'Telegram', role: 'action' });
  }
  if (text.match(/\b(gmail|send.*email|email.*notification)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.gmail', name: 'Gmail', role: 'action' });
  }
  if (text.match(/\b(slack|send.*slack|slack.*message)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.slack', name: 'Slack', role: 'action' });
  }
  if (text.match(/\b(discord|send.*discord)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.discord', name: 'Discord', role: 'action' });
  }

  // Data sources
  if (text.match(/\b(airtable)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.airtable', name: 'Airtable', role: 'datasource' });
  }
  if (text.match(/\b(google sheets|spreadsheet)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.googleSheets', name: 'Google Sheets', role: 'datasource' });
  }
  if (text.match(/\b(postgres|postgresql|sql database)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.postgres', name: 'Postgres', role: 'datasource' });
  }
  if (text.match(/\b(mysql)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.mysql', name: 'MySQL', role: 'datasource' });
  }
  if (text.match(/\b(mongodb|mongo)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.mongoDB', name: 'MongoDB', role: 'datasource' });
  }
  if (text.match(/\b(notion)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.notion', name: 'Notion', role: 'datasource' });
  }

  // AI
  if (text.match(/\b(openai|gpt|chatgpt)\b/)) {
    nodes.push({ type: '@n8n/n8n-nodes-langchain.openAi', name: 'OpenAI', role: 'ai' });
  }
  if (text.match(/\b(gemini|google ai)\b/)) {
    nodes.push({ type: '@n8n/n8n-nodes-langchain.googleGemini', name: 'Google Gemini', role: 'ai' });
  }
  if (text.match(/\b(anthropic|claude)\b/) && !text.match(/claude\s*(api|key|model)/)) {
    nodes.push({ type: '@n8n/n8n-nodes-langchain.anthropic', name: 'Anthropic', role: 'ai' });
  }

  // File
  if (text.match(/\b(csv|json file|xml file|convert.*file|export.*file)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.convertToFile', name: 'Convert to File', role: 'action' });
  }

  // HTML
  if (text.match(/\b(scrape|html|web page|extract.*page|parse.*page)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.html', name: 'HTML', role: 'transform' });
  }

  // Project management
  if (text.match(/\b(jira|jira issue)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.jira', name: 'Jira', role: 'action' });
  }
  if (text.match(/\b(github|github issue|github pr)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.github', name: 'GitHub', role: 'action' });
  }

  // Google Drive
  if (text.match(/\b(google drive|gdrive)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.googleDrive', name: 'Google Drive', role: 'storage' });
  }

  // Wait
  if (text.match(/\b(wait|delay|pause|sleep)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.wait', name: 'Wait', role: 'flow' });
  }

  // --- Additional platforms (from template library patterns) ---

  // Cloud storage
  if (text.match(/\b(dropbox)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.dropbox', name: 'Dropbox', role: 'storage' });
  }
  if (text.match(/\b(aws s3|s3 bucket|amazon s3)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.awsS3', name: 'AWS S3', role: 'storage' });
  }

  // CRM / Marketing
  if (text.match(/\b(hubspot)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.hubspot', name: 'HubSpot', role: 'action' });
  }
  if (text.match(/\b(salesforce)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.salesforce', name: 'Salesforce', role: 'action' });
  }
  if (text.match(/\b(mailchimp)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.mailchimp', name: 'Mailchimp', role: 'action' });
  }
  if (text.match(/\b(sendgrid)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.sendGrid', name: 'SendGrid', role: 'action' });
  }

  // Project management
  if (text.match(/\b(trello)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.trello', name: 'Trello', role: 'action' });
  }
  if (text.match(/\b(asana)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.asana', name: 'Asana', role: 'action' });
  }
  if (text.match(/\b(linear)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.linear', name: 'Linear', role: 'action' });
  }
  if (text.match(/\b(clickup)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.clickUp', name: 'ClickUp', role: 'action' });
  }
  if (text.match(/\b(todoist)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.todoist', name: 'Todoist', role: 'action' });
  }

  // Communication
  if (text.match(/\b(whatsapp)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.whatsApp', name: 'WhatsApp', role: 'action' });
  }
  if (text.match(/\b(microsoft teams|ms teams)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.microsoftTeams', name: 'Microsoft Teams', role: 'action' });
  }
  if (text.match(/\b(twilio|sms)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.twilio', name: 'Twilio', role: 'action' });
  }

  // Social media
  if (text.match(/\b(twitter|tweet|x\.com)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.twitter', name: 'Twitter', role: 'action' });
  }
  if (text.match(/\b(facebook|meta)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.facebookGraphApi', name: 'Facebook', role: 'action' });
  }
  if (text.match(/\b(instagram)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.instagram', name: 'Instagram', role: 'action' });
  }
  if (text.match(/\b(linkedin)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.linkedIn', name: 'LinkedIn', role: 'action' });
  }

  // Databases
  if (text.match(/\b(redis)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.redis', name: 'Redis', role: 'datasource' });
  }
  if (text.match(/\b(supabase)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.supabase', name: 'Supabase', role: 'datasource' });
  }
  if (text.match(/\b(firebase|firestore)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.googleFirebaseCloudFirestore', name: 'Firebase', role: 'datasource' });
  }

  // E-commerce
  if (text.match(/\b(shopify)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.shopify', name: 'Shopify', role: 'action' });
  }
  if (text.match(/\b(stripe|payment)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.stripe', name: 'Stripe', role: 'action' });
  }
  if (text.match(/\b(woocommerce)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.wooCommerce', name: 'WooCommerce', role: 'action' });
  }

  // DevOps / Monitoring
  if (text.match(/\b(gitlab)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.gitlab', name: 'GitLab', role: 'action' });
  }
  if (text.match(/\b(sentry)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.sentry', name: 'Sentry', role: 'action' });
  }
  if (text.match(/\b(pagerduty)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.pagerDuty', name: 'PagerDuty', role: 'action' });
  }

  // Content / Media
  if (text.match(/\b(wordpress)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.wordpress', name: 'WordPress', role: 'action' });
  }
  if (text.match(/\b(youtube)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.youTube', name: 'YouTube', role: 'action' });
  }

  // Productivity
  if (text.match(/\b(google calendar|gcal)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.googleCalendar', name: 'Google Calendar', role: 'action' });
  }
  if (text.match(/\b(microsoft outlook|outlook)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.microsoftOutlook', name: 'Microsoft Outlook', role: 'action' });
  }

  // AI / ML (additional)
  if (text.match(/\b(ollama|local llm|local ai)\b/)) {
    nodes.push({ type: '@n8n/n8n-nodes-langchain.ollama', name: 'Ollama', role: 'ai' });
  }
  if (text.match(/\b(pinecone|vector db|vector store)\b/)) {
    nodes.push({ type: '@n8n/n8n-nodes-langchain.pinecone', name: 'Pinecone', role: 'ai' });
  }

  // Misc
  if (text.match(/\b(zapier|make\.com|ifttt)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.httpRequest', name: 'HTTP Request', role: 'action' });
  }
  if (text.match(/\b(xml|soap)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.xml', name: 'XML', role: 'transform' });
  }
  if (text.match(/\b(ftp|sftp)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.ftp', name: 'FTP', role: 'action' });
  }
  if (text.match(/\b(ssh|remote server)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.ssh', name: 'SSH', role: 'action' });
  }
  if (text.match(/\b(rss reader|rss feed|read.*rss)\b/)) {
    nodes.push({ type: 'n8n-nodes-base.rssFeedRead', name: 'RSS Feed Read', role: 'action' });
  }

  return nodes;
}
