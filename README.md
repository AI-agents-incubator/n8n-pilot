# n8n Pilot

![Version](https://img.shields.io/badge/version-2.3.0-blue)
![Chrome Extension](https://img.shields.io/badge/chrome-Manifest%20V3-green)
![Tests](https://img.shields.io/badge/tests-438%20passing-brightgreen)
![License](https://img.shields.io/badge/license-MIT-yellow)
![Claude API](https://img.shields.io/badge/Claude-Sonnet%204.5%20%7C%20Opus%204-blueviolet)

AI-powered Chrome extension for n8n workflow management. Generate, modify, and manage n8n workflows using natural language via Claude API.

*Chrome-extension (Manifest V3) with side panel injection.*
*No external servers, no telemetry, no subscriptions. Fully local and private.*

---

## Quick Start

### 1. Install the Extension

**Option A: Download release (recommended)**

1. Download the latest `.zip` from [GitHub Releases](../../releases)
2. Unzip to any folder

**Option B: Clone the repository**

```bash
git clone https://github.com/AI-agents-incubator/n8n-pilot.git
```

### 2. Load in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top right)
3. Click **Load unpacked**
4. Select the `n8n-pilot/` folder (or unzipped release folder)
5. Pin the extension icon in Chrome toolbar

### 3. Configure

Click the extension icon and open **Settings** (gear icon):

| Setting | Required | Where to get it |
|---------|----------|-----------------|
| **Claude API Key** | Yes | [console.anthropic.com](https://console.anthropic.com) > API Keys |
| **n8n URL** | Yes | Your n8n instance URL (e.g. `https://n8n.example.com`) |
| **n8n API Key** | Yes | n8n Settings > API > Create API Key |

> **Note:** The Claude API key is tied to a specific workspace. Make sure the workspace has credits (Settings > Billing).

### 4. Start Using

1. Open your n8n instance in Chrome
2. The n8n Pilot side panel appears automatically
3. Type a request like: *"Create a workflow that checks a website every hour and sends a Telegram alert if it's down"*
4. The AI generates a complete n8n workflow

---

## How It Works

When you send a message, it goes through a multi-stage pipeline before reaching Claude:

```
User Prompt
    |
    v
[1. Analyze] -----> Workflow Blueprint (trigger type, nodes, complexity)
    |
    v
[2. Search] ------> Find matching templates from 2000+ library
    |
    v
[3. Preflight] ---> Check for missing details (URLs, IDs, etc.)
    |                   |
    |              Missing info? --> Show Q&A card --> User fills in
    |
    v
[4. Generate] ----> Claude API (streaming) with enriched context
    |
    v
[5. Normalize] ---> Fix parameters, update models, validate JSON
    |
    v
[6. Display] -----> Workflow card with Copy / Inject / Save / Download
```

**Stage 1 — Analyze:** Local NLP (no API call) detects trigger type, required nodes, and platform integrations from 55+ supported services.

**Stage 2 — Template Search:** Queries a local template library (2053 templates) for similar workflows. Matched templates are injected into the prompt as reference examples.

**Stage 3 — Preflight Validation:** Programmatically checks if critical parameters are missing (e.g. Telegram chat ID, API endpoint URL). If gaps are found, an interactive card appears in chat with input fields. You can fill them in or skip.

**Stage 4 — Generate:** Sends the enriched prompt to Claude API via streaming (Server-Sent Events). The response appears in real-time. Multi-turn conversation memory (up to 20 messages) provides context.

**Stage 5 — Normalize:** Post-processes the generated workflow JSON: fixes deprecated model IDs (OpenAI, Gemini), corrects parameter formats, validates node structure.

**Stage 6 — Display:** Shows the workflow card with action buttons and a node-count delta if re-generating.

---

## Features

### AI Workflow Generation

Describe what you need in natural language. The extension generates a complete n8n workflow JSON with proper node types, connections, parameters, and credentials structure.

- Works with 150+ n8n node types
- 55+ platform detection (Telegram, Slack, Gmail, Shopify, HubSpot, etc.)
- Supports both new workflow creation and modification of existing ones

### Multi-turn Conversation

Claude remembers the conversation context. You can:
- Ask follow-up questions
- Request modifications to a previously generated workflow
- Have a back-and-forth dialogue about your automation needs

### Preflight Validation

Before calling Claude, the extension checks if your prompt is complete:
- Missing a Telegram chat ID? It asks.
- No API endpoint URL? It asks.
- Schedule interval not specified? It asks.

Supports 12 node types: Telegram, HTTP Request, Gmail, Schedule, Webhook, RSS, Slack, Airtable, Google Sheets, Postgres, Notion, Discord.

If your prompt already contains the needed info (e.g. a URL), the question is automatically skipped.

### Workflow Management

- List all workflows from your n8n instance
- Filter by status: All / Active / Inactive
- Search by name
- Activate/deactivate workflows directly

### Execution Monitoring

- View recent workflow executions
- Filter by workflow and status (Success / Error / Running)

### Context Menu

Right-click in n8n to access:
- **Explain** — get an explanation of selected code or node
- **Generate Code** — generate JavaScript/Python for Code nodes
- **Optimize** — get optimization suggestions

### Additional Features

- **Copy Dialog** — one-click copy of the full conversation to clipboard
- **Template Search Badge** — shows how many matching templates were found
- **Workflow Card Delta** — displays node count changes (+2/-1) when re-generating
- **Error Action Cards** — API key errors show a direct "Open Settings" button
- **Generation History** — browse and reuse previous generations

---

## Security & Privacy

n8n Pilot is designed with a security-first approach. Here is exactly what it does and does not do:

### What We Do

| Aspect | Implementation |
|--------|---------------|
| **API Key Encryption** | Keys encrypted with AES-256-GCM (Web Crypto API) before storage |
| **Local Storage Only** | All data in `chrome.storage.local` — never leaves your machine |
| **Direct API Calls** | Browser talks directly to `api.anthropic.com` and your n8n instance |
| **Minimal Permissions** | Only `storage`, `activeTab`, `scripting`, `clipboardWrite`, `contextMenus` |
| **Optional Host Access** | Chrome asks permission for each new n8n domain on first use |
| **Content Security Policy** | `script-src 'self'; object-src 'none'` — no inline scripts, no external resources |
| **Shadow DOM Isolation** | Side panel is fully isolated — no CSS leaks, no DOM conflicts |

### What We DO NOT Do

- **No external servers** — no proxy, no backend, no relay
- **No telemetry** — no analytics, no tracking, no usage data collection
- **No data sharing** — your prompts, workflows, and keys never go anywhere except Anthropic API and your n8n
- **No account required** — no sign-up, no login to our service
- **No network requests** except to `api.anthropic.com` and your n8n URL

### Data Flow

```
Your Browser
    |
    |--- HTTPS ---> api.anthropic.com  (Claude API — your key)
    |
    |--- HTTPS ---> your-n8n.example.com  (n8n API — your key)
    |
    (nothing else)
```

### Chrome Permissions Explained

| Permission | Why |
|-----------|-----|
| `storage` | Save encrypted API keys and settings locally |
| `activeTab` | Detect if you're on an n8n page |
| `scripting` | Inject the side panel into n8n pages |
| `clipboardWrite` | Copy workflow JSON and conversation to clipboard |
| `contextMenus` | Right-click menu for Explain/Generate/Optimize |
| `notifications` | Optional alerts for workflow operations |
| `host_permissions: api.anthropic.com` | Required to call Claude API |
| `optional_host_permissions` | Granted per-domain when you first use n8n on a new URL |

---

## Settings Reference

| Setting | Default | Description |
|---------|---------|-------------|
| Claude API Key | — | Your Anthropic API key (encrypted at rest) |
| n8n URL | — | Base URL of your n8n instance |
| n8n API Key | — | Your n8n REST API key (encrypted at rest) |
| Default Model | Claude Sonnet 4.5 | AI model for generation |
| Auto-inject | Off | Automatically paste workflow into n8n canvas |
| Keep History | On | Save generation history locally |
| Notifications | On | Show browser notifications for results |

### Supported Claude Models

| Model | Best For |
|-------|----------|
| Claude Sonnet 4.5 | Best balance of speed and quality (recommended) |
| Claude Sonnet 4 | Fast and capable |
| Claude Opus 4 | Most powerful, slower |
| Claude Haiku 3.5 | Fastest and cheapest |

---

## Troubleshooting

### "Credit balance too low"

Your API key is tied to a workspace without credits:
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Check the workspace name (top left)
3. Go to Settings > Billing
4. Ensure this workspace has credits
5. Create a new key **in the correct workspace**

### "Invalid x-api-key"

API key is invalid or revoked. Create a new one in the Anthropic console.

### Inject not working

1. Make sure n8n is open in the active Chrome tab
2. You must be in the **workflow editor** (canvas with nodes)
3. If auto-inject didn't work, press **Cmd+V** (Mac) or **Ctrl+V** (Windows) on the canvas
4. On first use, Chrome may ask for host access permission — confirm it

### Status shows yellow (partial)

Only one service is connected. Check the other:
- Claude: valid API key with credits
- n8n: correct URL and API key, n8n instance reachable

### Extension not updating after code changes

Go to `chrome://extensions/`, find n8n Pilot, click the refresh button (circular arrow). Chrome caches extension files and doesn't watch for changes automatically.

---

## For Developers

### Architecture

```
n8n-pilot/
|
|-- background.js          Service Worker: message router, 40+ actions
|-- content.js             Content Script: Shadow DOM panel injection
|
|-- panel/
|   |-- panel.html         Side panel markup
|   |-- panel.css          Dark theme styles (CSS custom properties)
|   |-- chat.js            Chat controller (standalone module)
|   |-- settings-view.js   Settings controller
|
|-- lib/
|   |-- claude-client.js       Anthropic API client (SSE streaming)
|   |-- workflow-generator.js  AI generation + system prompt + post-processing
|   |-- workflow-validator.js  Normalize pipeline (parameters, models, structure)
|   |-- prompt-analyzer.js     NLP: user text -> workflow blueprint (55+ platforms)
|   |-- preflight.js           Blueprint validation, missing parameter detection
|   |-- model-actualizer.js    Deprecated model -> current model mapping
|   |-- template-search.js     HTTP client for template library (2053 templates)
|   |-- node-catalog-core.js   Core node parameter schemas (25 nodes)
|   |-- node-catalog-index.js  150+ n8n node type registry
|   |-- n8n-client.js          n8n REST API client
|   |-- crypto.js              AES-256-GCM encryption (Web Crypto API)
|   |-- settings.js            Settings management
|   |-- history.js             Generation history (chrome.storage)
|   |-- versions.js            Workflow versioning: save, compare, rollback
|   |-- utils.js               Shared utilities
|
|-- tests/
|   |-- unit/              438 unit tests (Vitest)
|   |-- e2e/               E2E tests (Playwright)
|   |-- acceptance/        Integration tests with live n8n
|
|-- icons/                 Extension icons (16-128px)
|-- example/               6 real workflow JSONs (for reference)
|-- scripts/
|   |-- bump-version.js    Version management across all files
|   |-- build-release.sh   Build release ZIP archive
```

### Generation Pipeline (Detailed)

```
User sends message
    |
    v
background.js: case 'generateWorkflowStream'
    |
    |-- Load conversation history (last 20 messages from chrome.storage)
    |
    |-- promptAnalyzer.analyze(prompt)
    |     Returns: { trigger, nodes[], complexity, credentialsNeeded }
    |
    |-- templateSearch.findTemplates(blueprint)
    |     Returns: 0-3 matching template workflows
    |
    |-- preflight.validate(blueprint, prompt)
    |     Returns: { questions[], complete }
    |     If !complete -> send PREFLIGHT_QUESTIONS to content.js -> WAIT
    |
    |-- generator.buildStreamingPrompt(blueprint, templates)
    |     Combines: base system prompt + node schemas + template hints
    |
    |-- claudeClient.sendMessageStream({ systemPrompt, messages })
    |     Streams via SSE -> STREAM_CHUNK messages to content.js
    |
    |-- generator.postProcessStreamResult(response)
    |     Extracts JSON, normalizes parameters, validates structure
    |
    v
content.js: renders workflow card with Copy/Inject/Save/Download
```

### Key Design Patterns

| Pattern | Where | Purpose |
|---------|-------|---------|
| Shadow DOM | content.js | Panel isolated from n8n page styles |
| Message routing | background.js switch | Central orchestration of all actions |
| SSE streaming | claude-client.js | Real-time response display |
| `_msg()` helper | content.js | `chrome.runtime.sendMessage` wrapper |
| `$()` shorthand | content.js | `getElementById` within Shadow DOM |
| CSS custom properties | panel.css | Theming via `--color-*`, `--spacing-*` |
| Dual chat controllers | content.js + panel/chat.js | Must be kept in sync |

### Setup

```bash
git clone https://github.com/AI-agents-incubator/n8n-pilot.git
cd n8n-pilot
npm install
```

### Running Tests

```bash
# All unit tests
npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage
```

### Version Management

Version is tracked in 4 files, updated atomically:

```bash
npm run version:patch   # 2.3.0 -> 2.3.1
npm run version:minor   # 2.3.0 -> 2.4.0
npm run version:major   # 2.3.0 -> 3.0.0
```

This updates: `package.json`, `manifest.json`, `.claude/SNAPSHOT.md`, `README.md` badge.

### Building a Release

```bash
bash scripts/build-release.sh
```

Creates `dist/n8n-pilot-vX.Y.Z.zip` with only the files needed for Chrome installation.

### Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make changes and add tests
4. Run tests: `npm test`
5. Commit with a descriptive message
6. Push and open a Pull Request

---

## License

[MIT](LICENSE) - Alex Krol, 2026
