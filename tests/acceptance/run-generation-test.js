#!/usr/bin/env node
/**
 * Acceptance Test: Generate workflows from natural language prompts
 * and compare with real example workflows.
 *
 * Uses the same system prompt as workflow-generator.js
 * Calls Claude API directly (no chrome dependencies).
 *
 * Usage: node tests/acceptance/run-generation-test.js
 */

import { validate, normalize } from '../../lib/workflow-validator.js';
import { extractJson } from '../../lib/utils.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const EXAMPLE_DIR = path.resolve(PROJECT_ROOT, 'example');
const OUTPUT_DIR = path.resolve(__dirname, 'output');

// Load .env file from project root
function loadEnv() {
  const envPath = path.join(PROJECT_ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.substring(0, eqIdx).trim();
    const value = trimmed.substring(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnv();

const API_KEY = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error('ERROR: CLAUDE_API_KEY not set (check .env file)');
  process.exit(1);
}

const MODEL = 'claude-sonnet-4-5-20250929';

// Same system prompt as lib/workflow-generator.js
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

FILTER NODE PARAMETER FORMAT:
{
  "conditions": {
    "options": { "caseSensitive": true, "leftValue": "" },
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

IMPORTANT:
- Every workflow MUST have exactly one trigger node as the first node
- All node names must be unique within the workflow
- Use expression syntax {{ $json.field }} for referencing data from previous nodes
- Generate proper UUIDs for all id fields
- Keep the workflow practical and complete
- For AI nodes (OpenAI, Gemini), use the resource locator (__rl) pattern for model selection
- For httpRequest nodes, specify method, url, headers, and authentication as needed`;


// ============================================================================
// WORKFLOW PROMPTS — derived from analysis of example/ files
// ============================================================================

const WORKFLOW_TESTS = [
  {
    id: 'macwhisper',
    name: 'MacWhisper Transcript Processor',
    file: 'MacWhisper (1).json',
    prompt: `Create a workflow called "MacWhisper Transcript Processor" that processes podcast/stream transcripts:

1. TRIGGER: Webhook (POST) that receives JSON with body.transcript (full text with timecodes) and body.title
2. AI Step 1 - "Fragment Selection": Use Google Gemini (gemini-3-flash-preview model) to analyze the transcript and find the most engaging/emotional fragments. The system prompt should ask to identify 3-5 fragments with start/end timecodes in format [HH:MM].
3. AI Step 2 - "Get Fragment Text": Use Google Gemini again to extract verbatim text for each selected fragment from the full transcript, using the timecodes from step 1. The transcript is referenced from the Webhook node.
4. Code Node - "Split Fragments": JavaScript that splits the AI response by "---" delimiter, parsing each fragment into {start, end, content} objects using regex for [HH:MM] -- [HH:MM] pattern.
5. AI Step 3 - "Create Subtitles": Use Google Gemini to convert each fragment's text into SRT subtitle format at ~140 words per minute.
6. Convert to File 1: Convert the SRT content to a .srt file, filename "fragment_{{ $itemIndex + 1 }}.srt"
7. Edit Fields (Set node): Create a formatted text field combining timecodes and content
8. Convert to File 2: Convert the formatted text to a .txt file, filename "timecodes_{{ $itemIndex + 1 }}.txt"
9. Gmail: Send email to user with the .srt file as attachment, subject "Fragments"

Flow: Webhook -> Fragment Selection -> Get Fragment Text -> Split Fragments -> (two branches)
  Branch 1: Create Subtitles -> Convert to .srt -> Gmail
  Branch 2: Edit Fields -> Convert to .txt`,
    expectedNodes: ['webhook', 'googleGemini', 'googleGemini', 'googleGemini', 'code', 'convertToFile', 'convertToFile', 'set', 'gmail'],
    expectedNodeTypes: {
      'n8n-nodes-base.webhook': 1,
      '@n8n/n8n-nodes-langchain.googleGemini': 3,
      'n8n-nodes-base.code': 1,
      'n8n-nodes-base.convertToFile': 2,
      'n8n-nodes-base.set': 1,
      'n8n-nodes-base.gmail': 1,
    },
    minNodes: 8,
  },
  {
    id: 'supabase-plugin',
    name: 'Membership Webhook Router',
    file: 'Supabase-plugin.json',
    prompt: `Create a workflow called "Membership Webhook Router" that handles membership purchase webhooks and routes contacts to an email marketing platform:

1. TRIGGER: Webhook (POST) that receives membership transaction data with body.data.membership.id and body.data.member.email

2. IF Node "Check ChatGPT Course": Check if membership.id equals 143102
   - TRUE branch -> HTTP Request to GetResponse API (GET https://api.getresponse.com/v3/contacts, query by email from webhook, with X-Auth-Token header)
     -> IF "Contact Exists": Check if response has contactId
       - TRUE -> GetResponse "Update Contact" (add tag "pmC6T")
       - FALSE -> GetResponse "Create Contact" (campaignId "GDPGC", tag "pmC6T", email from webhook)

3. IF Node "Check Vibe Course": Check if membership.id equals 157990
   - TRUE branch -> HTTP Request to GetResponse API (same pattern, query by email)
     -> IF "Contact Exists": Check if response has contactId
       - TRUE -> GetResponse "Update Contact" (campaignId "CXmyi", tag "TN6JI")
       - FALSE -> GetResponse "Create Contact" (campaignId "CXmyi", tag "TN6JI", email from webhook)

The workflow has two parallel branches from the Webhook, each with the same check-then-create-or-update pattern but different campaign IDs and tags.`,
    expectedNodeTypes: {
      'n8n-nodes-base.webhook': 1,
      'n8n-nodes-base.if': 4,
      'n8n-nodes-base.httpRequest': 2,
      'n8n-nodes-base.getResponse': 4,
    },
    minNodes: 11,
  },
  {
    id: 'inoreader-ai',
    name: 'AI News RSS Pipeline',
    file: 'inoreader_AI-_196267257.json',
    prompt: `Create a workflow called "AI News RSS Pipeline" that monitors an RSS feed for AI articles, processes them through multiple AI stages, and publishes to Telegram:

1. TRIGGER: RSS Feed Trigger polling https://www.inoreader.com/stream/user/1004901627/tag/AI

2. HTTP Request: Fetch the full article page from the RSS item's link

3. HTML Extract: Extract text content from the fetched HTML page

4. OpenAI "Garbage Filter": Use gpt-4.1-nano model to analyze if the content is AI-related and not spam. System prompt asks to output "aicontent" if valid.

5. Filter Node: Check if the AI's response contains "aicontent" - only pass through valid AI articles

6. OpenAI "Translate to Russian": Use gpt-4o model to translate the article to Russian

7. OpenAI "Generate Announcement": Use gpt-4.1-nano to create a short announcement/teaser

8. OpenAI "Generate Summary": Use gpt-4.1-nano to create a detailed summary

9. Code Node "Split Text": Split long text into chunks for Telegraph publishing

10. Code Node "Format for Telegraph": Format content as Telegraph-compatible JSON

11. HTTP Request "Get Token": Call api.telegra.ph/createAccount to get publishing token

12. HTTP Request "Publish": Call api.telegra.ph/createPage to publish the article

13. Code Node "Calculate Cost": Calculate API token usage costs for GPT-4o and GPT-4.1-nano

14. Telegram: Send the announcement + summary + article link + cost to chat ID 196267257 with HTML formatting

Flow: RSS -> HTTP -> HTML -> Garbage Filter -> Filter -> Translate -> Announcement -> Summary -> Split -> Format -> Get Token -> Publish -> Calculate Cost -> Telegram`,
    expectedNodeTypes: {
      'n8n-nodes-base.rssFeedReadTrigger': 1,
      'n8n-nodes-base.httpRequest': 3,
      'n8n-nodes-base.html': 1,
      '@n8n/n8n-nodes-langchain.openAi': 4,
      'n8n-nodes-base.filter': 1,
      'n8n-nodes-base.code': 3,
      'n8n-nodes-base.telegram': 1,
    },
    minNodes: 13,
  },
  {
    id: 'inoreader-telegram',
    name: 'Telegram Channel RSS Forwarder',
    file: 'inoreader_AI_Telegram-_196267257.json',
    prompt: `Create a workflow called "Telegram Channel RSS Forwarder" that monitors an RSS feed of curated Telegram channel posts and forwards them:

1. TRIGGER: RSS Feed Trigger polling https://www.inoreader.com/stream/user/1004901627/tag/AI_Telegram

2. HTML Extract "Extract Text": Extract text content from the RSS item's HTML content

3. Code Node "Extract Links": JavaScript that parses HTML to find image URLs (Image_1, Image_2 etc) and other links from the content

4. Code Node "Remove Thumbnails": JavaScript that removes thumbnail/thumb.jpeg references from extracted data

5. Code Node "Clean Text": JavaScript that cleans and formats the text for Telegram (removes extra whitespace, formats links)

6. IF Node: Check if Image_1 exists in the extracted links data (from step 3)
   - TRUE (has image):
     -> Telegram "Send Photo": Send the image (photo URL) to chat 196267257
     -> Telegram "Send Text": Send the cleaned text to chat 196267257
   - FALSE (no image):
     -> Telegram "Send Text Only": Send just the cleaned text to chat 196267257

Flow: RSS -> HTML Extract -> Extract Links -> Remove Thumbnails -> Clean Text -> IF
  IF [true] -> Send Photo -> Send Text
  IF [false] -> Send Text Only`,
    expectedNodeTypes: {
      'n8n-nodes-base.rssFeedReadTrigger': 1,
      'n8n-nodes-base.html': 1,
      'n8n-nodes-base.code': 3,
      'n8n-nodes-base.if': 1,
      'n8n-nodes-base.telegram': 3,
    },
    minNodes: 9,
  },
  {
    id: 'twitter-ai-feed',
    name: 'Twitter AI Feed Translator',
    file: 'rss.app_Twitter_AI_selebs-_196267257.json',
    prompt: `Create a workflow called "Twitter AI Feed Translator" that monitors AI celebrity Twitter accounts via RSS, filters and translates tweets:

1. TRIGGER: RSS Feed Trigger polling an rss.app feed URL

2. Three parallel Filter nodes from the trigger:
   a. Filter "Retweets": Check if title contains "RT @" (these are filtered OUT / dead end)
   b. Filter "Mentions": Check if title contains "@" (these are filtered OUT / dead end)
   c. Filter "Original Tweets": Check title does NOT contain "@" AND does NOT contain "RT @" (only original tweets pass through)

3. Code Node "Clean Junk": JavaScript that removes unwanted text patterns from the tweet

4. Code Node "Clean Links": JavaScript that removes cc:/pic references from the tweet text

5. OpenAI "Translate": Use chatgpt-4o-latest model to translate the tweet to Russian

6. OpenAI "Commentary": Use chatgpt-4o-latest model to generate an analytical commentary about the tweet's significance

7. Telegram: Send to chat 196267257 with HTML formatting - include the original translated tweet, the AI analysis/commentary, and a link to the original tweet

Flow: RSS -> Filter "Retweets" (dead end)
      RSS -> Filter "Mentions" (dead end)
      RSS -> Filter "Original Tweets" -> Clean Junk -> Clean Links -> Translate -> Commentary -> Telegram`,
    expectedNodeTypes: {
      'n8n-nodes-base.rssFeedReadTrigger': 1,
      'n8n-nodes-base.filter': 3,
      'n8n-nodes-base.code': 2,
      '@n8n/n8n-nodes-langchain.openAi': 2,
      'n8n-nodes-base.telegram': 1,
    },
    minNodes: 9,
  },
];

// ============================================================================
// API CALL
// ============================================================================

async function callClaude(prompt, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 8192,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`API ${response.status}: ${err.substring(0, 200)}`);
      }

      const data = await response.json();
      const content = data.content?.[0]?.text || '';
      const usage = data.usage || {};

      return { success: true, content, usage, model: data.model };
    } catch (err) {
      if (attempt < retries) {
        console.log(`  Retry ${attempt + 1}/${retries}...`);
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }
      return { success: false, error: err.message };
    }
  }
}

// ============================================================================
// COMPARISON
// ============================================================================

function compareWorkflows(generated, originalFile, expected) {
  const results = { pass: true, checks: [] };

  // Load original for reference
  const original = JSON.parse(fs.readFileSync(path.join(EXAMPLE_DIR, originalFile), 'utf-8'));
  const origNodes = original.nodes.filter(n => n.type !== 'n8n-nodes-base.stickyNote');

  // Check 1: Has required fields
  const hasName = !!generated.name;
  const hasNodes = Array.isArray(generated.nodes) && generated.nodes.length > 0;
  const hasConnections = !!generated.connections && typeof generated.connections === 'object';
  const hasSettings = !!generated.settings;

  results.checks.push({ name: 'Has name', pass: hasName });
  results.checks.push({ name: 'Has nodes', pass: hasNodes });
  results.checks.push({ name: 'Has connections', pass: hasConnections });
  results.checks.push({ name: 'Has settings', pass: hasSettings });

  if (!hasNodes) { results.pass = false; return results; }

  // Check 2: Minimum node count
  const genNodes = generated.nodes.filter(n => n.type !== 'n8n-nodes-base.stickyNote');
  const nodeCountOk = genNodes.length >= expected.minNodes;
  results.checks.push({
    name: `Node count >= ${expected.minNodes}`,
    pass: nodeCountOk,
    detail: `got ${genNodes.length}, original has ${origNodes.length}`,
  });
  if (!nodeCountOk) results.pass = false;

  // Check 3: Expected node types present
  const genTypeCounts = {};
  for (const node of genNodes) {
    genTypeCounts[node.type] = (genTypeCounts[node.type] || 0) + 1;
  }

  for (const [type, expectedCount] of Object.entries(expected.expectedNodeTypes)) {
    const actual = genTypeCounts[type] || 0;
    const ok = actual >= expectedCount;
    results.checks.push({
      name: `Has ${expectedCount}x ${type.split('.').pop()}`,
      pass: ok,
      detail: `got ${actual}`,
    });
    if (!ok) results.pass = false;
  }

  // Check 4: Has trigger node
  const triggerTypes = [
    'n8n-nodes-base.webhook',
    'n8n-nodes-base.scheduleTrigger',
    'n8n-nodes-base.manualTrigger',
    'n8n-nodes-base.rssFeedReadTrigger',
    'n8n-nodes-base.formTrigger',
  ];
  const hasTrigger = genNodes.some(n => triggerTypes.includes(n.type));
  results.checks.push({ name: 'Has trigger node', pass: hasTrigger });
  if (!hasTrigger) results.pass = false;

  // Check 5: All nodes have required fields
  const allNodesValid = genNodes.every(n => n.id && n.name && n.type && n.position);
  results.checks.push({ name: 'All nodes have id/name/type/position', pass: allNodesValid });
  if (!allNodesValid) results.pass = false;

  // Check 6: Unique node names
  const names = genNodes.map(n => n.name);
  const uniqueNames = new Set(names);
  const namesUnique = uniqueNames.size === names.length;
  results.checks.push({ name: 'All node names unique', pass: namesUnique });
  if (!namesUnique) results.pass = false;

  // Check 7: Connections reference existing nodes
  const nodeNameSet = new Set(names);
  let allConnectionsValid = true;
  for (const [srcName, conn] of Object.entries(generated.connections)) {
    if (!nodeNameSet.has(srcName)) {
      allConnectionsValid = false;
      break;
    }
    if (conn.main) {
      for (const outputs of conn.main) {
        if (Array.isArray(outputs)) {
          for (const link of outputs) {
            if (!nodeNameSet.has(link.node)) {
              allConnectionsValid = false;
            }
          }
        }
      }
    }
  }
  results.checks.push({ name: 'All connections reference valid nodes', pass: allConnectionsValid });
  if (!allConnectionsValid) results.pass = false;

  // Check 8: executionOrder v1
  const hasV1 = generated.settings?.executionOrder === 'v1';
  results.checks.push({ name: 'Settings has executionOrder v1', pass: hasV1 });
  if (!hasV1) results.pass = false;

  // Check 9: Passes workflow-validator
  const validation = validate(generated);
  const noErrors = !validation.errors || validation.errors.length === 0;
  results.checks.push({
    name: 'Passes workflow-validator',
    pass: noErrors,
    detail: noErrors ? null : validation.errors.join('; '),
  });
  if (!noErrors) results.pass = false;

  return results;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('='.repeat(70));
  console.log('n8n Pilot — Acceptance Test: Workflow Generation');
  console.log(`Model: ${MODEL}`);
  console.log('='.repeat(70));
  console.log();

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let totalPassed = 0;
  let totalFailed = 0;
  const results = [];

  for (const test of WORKFLOW_TESTS) {
    console.log(`--- [${test.id}] ${test.name} ---`);
    console.log(`  Sending prompt (${test.prompt.length} chars)...`);

    const startTime = Date.now();
    const response = await callClaude(test.prompt);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    if (!response.success) {
      console.log(`  FAIL: API error — ${response.error}`);
      totalFailed++;
      results.push({ id: test.id, pass: false, error: response.error });
      continue;
    }

    console.log(`  Response received (${duration}s, ${response.usage?.input_tokens || '?'}/${response.usage?.output_tokens || '?'} tokens)`);

    // Extract JSON
    const workflow = extractJson(response.content);
    if (!workflow) {
      console.log(`  FAIL: Could not extract JSON from response`);
      console.log(`  Response preview: ${response.content.substring(0, 200)}...`);
      totalFailed++;
      results.push({ id: test.id, pass: false, error: 'No valid JSON in response' });
      // Save raw response for debugging
      fs.writeFileSync(path.join(OUTPUT_DIR, `${test.id}-raw.txt`), response.content);
      continue;
    }

    // Normalize
    const normalized = normalize(workflow);

    // Save generated workflow
    fs.writeFileSync(
      path.join(OUTPUT_DIR, `${test.id}-generated.json`),
      JSON.stringify(normalized, null, 2)
    );

    // Compare
    const comparison = compareWorkflows(normalized, test.file, test);

    // Print results
    for (const check of comparison.checks) {
      const icon = check.pass ? 'OK' : 'FAIL';
      const detail = check.detail ? ` (${check.detail})` : '';
      console.log(`  [${icon}] ${check.name}${detail}`);
    }

    if (comparison.pass) {
      console.log(`  PASSED`);
      totalPassed++;
    } else {
      console.log(`  FAILED`);
      totalFailed++;
    }

    results.push({ id: test.id, pass: comparison.pass, checks: comparison.checks });
    console.log();

    // Small delay between API calls
    if (WORKFLOW_TESTS.indexOf(test) < WORKFLOW_TESTS.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // Summary
  console.log('='.repeat(70));
  console.log(`RESULTS: ${totalPassed} passed, ${totalFailed} failed out of ${WORKFLOW_TESTS.length}`);
  console.log('Generated workflows saved to: tests/acceptance/output/');
  console.log('='.repeat(70));

  // Save summary
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'summary.json'),
    JSON.stringify({ model: MODEL, date: new Date().toISOString(), totalPassed, totalFailed, results }, null, 2)
  );

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
