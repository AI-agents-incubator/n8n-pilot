/**
 * n8n Pilot — Core Node Catalog
 * Detailed parameter schemas for the 25 most commonly used n8n nodes.
 * Used by the smart generator to produce accurate workflow JSON.
 */

const CORE_NODES = {
  // === Triggers ===
  'n8n-nodes-base.manualTrigger': {
    type: 'n8n-nodes-base.manualTrigger',
    typeVersion: 1,
    category: 'trigger',
    description: 'Manually trigger workflow via n8n UI',
    defaultParameters: {},
    credentials: null,
  },
  'n8n-nodes-base.scheduleTrigger': {
    type: 'n8n-nodes-base.scheduleTrigger',
    typeVersion: 1.2,
    category: 'trigger',
    description: 'Trigger on cron schedule (interval, cron expression)',
    defaultParameters: {
      rule: {
        interval: [{ field: 'hours', hoursInterval: 1 }],
      },
    },
    credentials: null,
  },
  'n8n-nodes-base.webhook': {
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2,
    category: 'trigger',
    description: 'Trigger via HTTP webhook (GET, POST, etc.)',
    defaultParameters: {
      path: 'webhook-path',
      httpMethod: 'POST',
      responseMode: 'onReceived',
      responseCode: 200,
    },
    credentials: null,
  },
  'n8n-nodes-base.formTrigger': {
    type: 'n8n-nodes-base.formTrigger',
    typeVersion: 2.2,
    category: 'trigger',
    description: 'Display a form and trigger when submitted',
    defaultParameters: {
      formTitle: 'Form',
      formFields: {
        values: [
          { fieldLabel: 'Name', fieldType: 'text', requiredField: true },
        ],
      },
    },
    credentials: null,
  },
  'n8n-nodes-base.rssFeedReadTrigger': {
    type: 'n8n-nodes-base.rssFeedReadTrigger',
    typeVersion: 1,
    category: 'trigger',
    description: 'Polls an RSS feed for new items',
    defaultParameters: {
      feedUrl: '',
      pollTimes: { item: [{ mode: 'everyHour' }] },
    },
    credentials: null,
  },

  // === Data Transformation ===
  'n8n-nodes-base.set': {
    type: 'n8n-nodes-base.set',
    typeVersion: 3.4,
    category: 'data',
    description: 'Set or modify fields in the data',
    defaultParameters: {
      mode: 'manual',
      assignments: {
        assignments: [
          { id: '', name: 'fieldName', value: '', type: 'string' },
        ],
      },
      options: {},
    },
    credentials: null,
  },
  'n8n-nodes-base.code': {
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    category: 'data',
    description: 'Run custom JavaScript or Python code',
    defaultParameters: {
      jsCode: '// Process items\nfor (const item of $input.all()) {\n  // item.json contains the data\n}\nreturn $input.all();',
      mode: 'runOnceForAllItems',
    },
    credentials: null,
  },
  'n8n-nodes-base.splitOut': {
    type: 'n8n-nodes-base.splitOut',
    typeVersion: 1,
    category: 'data',
    description: 'Split an array field into separate items',
    defaultParameters: {
      fieldToSplitOut: '',
      options: {},
    },
    credentials: null,
  },
  'n8n-nodes-base.merge': {
    type: 'n8n-nodes-base.merge',
    typeVersion: 3,
    category: 'data',
    description: 'Merge data from two inputs',
    defaultParameters: {
      mode: 'combine',
      mergeByFields: {
        values: [{ field1: '', field2: '' }],
      },
      options: {},
    },
    credentials: null,
  },
  'n8n-nodes-base.convertToFile': {
    type: 'n8n-nodes-base.convertToFile',
    typeVersion: 1.1,
    category: 'data',
    description: 'Convert data to file (JSON, CSV, XML, etc.)',
    defaultParameters: {
      operation: 'json',
      options: {},
    },
    credentials: null,
  },
  'n8n-nodes-base.html': {
    type: 'n8n-nodes-base.html',
    typeVersion: 1.2,
    category: 'data',
    description: 'Extract data from HTML using CSS selectors',
    defaultParameters: {
      operation: 'extractHtmlContent',
      extractionValues: {
        values: [
          { key: 'data', cssSelector: '', returnValue: 'text' },
        ],
      },
    },
    credentials: null,
  },

  // === Flow Control ===
  'n8n-nodes-base.if': {
    type: 'n8n-nodes-base.if',
    typeVersion: 2,
    category: 'flow',
    description: 'Conditional branching (true/false)',
    defaultParameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '' },
        conditions: [
          {
            id: '',
            leftValue: '={{ $json.field }}',
            rightValue: '',
            operator: { type: 'string', operation: 'equals' },
          },
        ],
        combinator: 'and',
      },
      options: {},
    },
    credentials: null,
  },
  'n8n-nodes-base.switch': {
    type: 'n8n-nodes-base.switch',
    typeVersion: 3,
    category: 'flow',
    description: 'Route items based on multiple conditions',
    defaultParameters: {
      rules: {
        values: [
          {
            conditions: {
              conditions: [
                {
                  leftValue: '={{ $json.field }}',
                  rightValue: '',
                  operator: { type: 'string', operation: 'equals' },
                },
              ],
            },
            output: 0,
          },
        ],
      },
      options: {},
    },
    credentials: null,
  },
  'n8n-nodes-base.filter': {
    type: 'n8n-nodes-base.filter',
    typeVersion: 2,
    category: 'flow',
    description: 'Filter items based on conditions (pass/discard)',
    defaultParameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '' },
        conditions: [
          {
            id: '',
            leftValue: '={{ $json.field }}',
            rightValue: '',
            operator: { type: 'string', operation: 'equals' },
          },
        ],
        combinator: 'and',
      },
      options: {},
    },
    credentials: null,
  },
  'n8n-nodes-base.splitInBatches': {
    type: 'n8n-nodes-base.splitInBatches',
    typeVersion: 3,
    category: 'flow',
    description: 'Loop through items in batches',
    defaultParameters: {
      batchSize: 10,
      options: {},
    },
    credentials: null,
  },
  'n8n-nodes-base.wait': {
    type: 'n8n-nodes-base.wait',
    typeVersion: 1.1,
    category: 'flow',
    description: 'Wait for a specified time or webhook callback',
    defaultParameters: {
      amount: 1,
      unit: 'seconds',
    },
    credentials: null,
  },
  'n8n-nodes-base.noOp': {
    type: 'n8n-nodes-base.noOp',
    typeVersion: 1,
    category: 'flow',
    description: 'No operation — placeholder node for flow clarity',
    defaultParameters: {},
    credentials: null,
  },

  // === HTTP & API ===
  'n8n-nodes-base.httpRequest': {
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    category: 'http',
    description: 'Make HTTP requests (GET, POST, PUT, DELETE, etc.)',
    defaultParameters: {
      method: 'GET',
      url: '',
      options: {},
    },
    credentials: null,
  },

  // === Communication ===
  'n8n-nodes-base.telegram': {
    type: 'n8n-nodes-base.telegram',
    typeVersion: 1.2,
    category: 'communication',
    description: 'Send messages via Telegram Bot API',
    defaultParameters: {
      operation: 'sendMessage',
      chatId: '',
      text: '',
    },
    credentials: { telegramApi: { id: '', name: '' } },
  },
  'n8n-nodes-base.gmail': {
    type: 'n8n-nodes-base.gmail',
    typeVersion: 2.1,
    category: 'communication',
    description: 'Send and read emails via Gmail',
    defaultParameters: {
      operation: 'send',
      sendTo: '',
      subject: '',
      message: '',
    },
    credentials: { gmailOAuth2: { id: '', name: '' } },
  },

  // === Data Sources ===
  'n8n-nodes-base.airtable': {
    type: 'n8n-nodes-base.airtable',
    typeVersion: 2.1,
    category: 'datasource',
    description: 'Read, create, update, delete Airtable records',
    defaultParameters: {
      operation: 'list',
    },
    credentials: { airtableTokenApi: { id: '', name: '' } },
  },

  // === AI ===
  '@n8n/n8n-nodes-langchain.openAi': {
    type: '@n8n/n8n-nodes-langchain.openAi',
    typeVersion: 1.8,
    category: 'ai',
    description: 'OpenAI chat completion / text generation',
    defaultParameters: {
      modelId: { __rl: true, value: 'gpt-4.1-nano', mode: 'list', cachedResultName: 'gpt-4.1-nano' },
      messages: { values: [{ content: '' }] },
      options: {},
      simplify: false,
    },
    credentials: { openAiApi: { id: '', name: '' } },
  },

  '@n8n/n8n-nodes-langchain.googleGemini': {
    type: '@n8n/n8n-nodes-langchain.googleGemini',
    typeVersion: 1.1,
    category: 'ai',
    description: 'Google Gemini (PaLM) chat completion / text generation',
    defaultParameters: {
      modelId: { __rl: true, value: 'models/gemini-2.5-flash', mode: 'list', cachedResultName: 'gemini-2.5-flash' },
      messages: { values: [{ content: '' }] },
      options: {},
      builtInTools: {},
    },
    credentials: { googlePalmApi: { id: '', name: '' } },
  },

  // === Utility ===
  'n8n-nodes-base.stickyNote': {
    type: 'n8n-nodes-base.stickyNote',
    typeVersion: 1,
    category: 'utility',
    description: 'Visual sticky note for workflow documentation',
    defaultParameters: {
      content: '',
      height: 160,
      width: 240,
    },
    credentials: null,
  },
};

/**
 * Get a core node schema by type.
 */
export function getCoreNode(type) {
  return CORE_NODES[type] || null;
}

/**
 * Get all core node schemas.
 */
export function getAllCoreNodes() {
  return { ...CORE_NODES };
}

/**
 * Check if a node type is in the core catalog.
 */
export function isCoreNode(type) {
  return type in CORE_NODES;
}

/**
 * Get core nodes by category.
 */
export function getCoreNodesByCategory(category) {
  return Object.values(CORE_NODES).filter(n => n.category === category);
}

/**
 * List all core node types.
 */
export function listCoreTypes() {
  return Object.keys(CORE_NODES);
}
