# ARCHITECTURE — n8n Pilot

## Overview

Chrome Extension (Manifest V3) with injected side panel architecture.
3 contexts (background, content, panel) + 15 library modules.
Message-based architecture, fully async, no runtime dependencies.

## Components

### background.js (Service Worker)
Central orchestrator. Routes 40+ message actions between content script and external APIs.
- Handles all `chrome.runtime.sendMessage` requests
- Makes HTTPS calls to Anthropic API, n8n REST API, and template server
- Manages `chrome.storage.local` for state persistence
- Auto-searches templates before workflow generation

### content.js (Content Script + Side Panel)
Injected into n8n pages. Creates Shadow DOM side panel.
- Injects generated workflows into n8n canvas editor
- Shows chat UI with streaming responses
- Context-aware: detects current workflow, node selection
- Shadow DOM isolation (no CSS conflicts with n8n)

### Context Menu
3 actions: Explain, Generate Code Node, Optimize with AI.
Registered in background.js, dispatched to content script panel.

## Library Modules (`lib/`)

| Module | Purpose |
|--------|---------|
| `claude-client.js` | Anthropic API: streaming + non-streaming, retry (3x), 3min timeout |
| `workflow-generator.js` | Build enhanced prompt from blueprint + templates, call Claude, validate |
| `workflow-validator.js` | Normalize pipeline: typeVersions, parameters, model actualization (~350 lines) |
| `prompt-analyzer.js` | NLP: user prompt → WorkflowBlueprint (55+ platform patterns) |
| `model-actualizer.js` | Map deprecated AI models to current (OpenAI: gpt-4→gpt-4.1-nano, Gemini: 2.0→2.5) |
| `template-search.js` | HTTP client: search, diagram, categories, stats, integrations (localhost:8000) |
| `node-catalog-core.js` | Core node schemas with exact parameter structures (Webhook, IF, Code, OpenAI, Gemini) |
| `node-catalog-index.js` | 150+ n8n node type registry (name, type, description, category) |
| `n8n-client.js` | n8n REST API: workflows, executions, variables, tags, credentials |
| `settings.js` | Read/write settings with encryption, templateServerUrl support |
| `crypto.js` | AES-256-GCM encryption via Web Crypto API |
| `history.js` | Store/retrieve generation history in chrome.storage |
| `versions.js` | Workflow versioning: save, compare, rollback |
| `utils.js` | UUID, timestamp, JSON parsing, escapeHtml, debounce |

## Data Flow

### Generate Workflow (Smart Pipeline)
```
User prompt → content.js panel
  → sendMessage(analyzePrompt)
    → prompt-analyzer.js → WorkflowBlueprint
  → sendMessage(generateFromBlueprint)
    → background.js
      → template-search.js (find matching templates)
      → workflow-generator.js
        → buildEnhancedPrompt(blueprint, templates)
        → claude-client.js → Anthropic API
      → workflow-validator.js
        → normalize (typeVersions, parameters)
        → model-actualizer.js (fix deprecated models)
    → history.js (save to storage)
  → content.js (display + inject into n8n)
```

### Template Search Pipeline
```
Blueprint → buildSearchQuery() → keywords
  → searchTemplates(query, trigger, complexity)
    → GET /api/workflows?q=...&trigger=...
  → top 3 matches → buildTemplateHint()
    → injected into system prompt as reference examples
```

### Model Actualization
```
Node with modelId: "gpt-4o"
  → actualizeNode()
    → OPENAI_MODEL_MAP["gpt-4o"] → "gpt-4.1-nano"
    → update __rl value + cachedResultName
```

## Security

- **API keys:** AES-256-GCM encrypted in `chrome.storage.local`
- **CSP:** `script-src 'self'; object-src 'none'`
- **Permissions:** Minimal + optional host permissions
- **No external CDNs** — all code local
- **No telemetry** — only calls: Claude API, user's n8n, local template server
- **Shadow DOM** — panel isolated from page CSS/JS

## Testing

| Type | Tool | Count |
|------|------|-------|
| Unit tests | Vitest | 415 tests, 14 files |
| E2E tests | Playwright | Mock Claude + n8n servers |
| Acceptance | Custom | Generate → push → verify in real n8n |
| Coverage | Vitest | `npm run test:coverage` |

## File Structure

```
n8n-pilot/
├── manifest.json              # Chrome Extension Manifest V3
├── background.js              # Service Worker (40+ message actions)
├── content.js                 # Content Script + Shadow DOM panel
├── panel/                     # Side panel views (chat, settings, history)
├── lib/
│   ├── claude-client.js       # Anthropic API (streaming)
│   ├── workflow-generator.js  # Generation + template hints
│   ├── workflow-validator.js  # Normalize pipeline
│   ├── prompt-analyzer.js     # NLP → Blueprint (55+ platforms)
│   ├── model-actualizer.js    # Deprecated model mapping
│   ├── template-search.js     # Template library client
│   ├── node-catalog-core.js   # Core node schemas
│   ├── node-catalog-index.js  # 150+ node registry
│   ├── n8n-client.js          # n8n REST API
│   ├── settings.js            # Settings management
│   ├── crypto.js              # AES-256-GCM encryption
│   ├── history.js             # Generation history
│   ├── versions.js            # Workflow versioning
│   └── utils.js               # Utilities
├── example/                   # 6 real workflow JSONs
├── tests/
│   ├── unit/                  # 415 unit tests (Vitest)
│   ├── e2e/                   # Playwright E2E tests
│   └── acceptance/            # Real n8n integration tests
├── icons/                     # Extension icons
└── .claude/                   # Framework state files
```
