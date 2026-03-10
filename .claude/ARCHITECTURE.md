# ARCHITECTURE — n8n Pilot

## Overview

Chrome Extension (Manifest V3) with 3 main contexts + 9 library modules.
Message-based architecture, fully async, no runtime dependencies.

## Components

### background.js (Service Worker)
Central orchestrator. Routes messages between popup/content and external APIs.
- Handles all `chrome.runtime.sendMessage` requests
- Makes direct HTTPS calls to Anthropic API and n8n REST API
- Manages `chrome.storage.local` for state persistence
- Handles permission checking and optional host permissions

### popup.html + popup.js + popup.css (UI)
Main user interface (420px popup window, dark theme).
- **5 tabs:** Generate, Workflows, Executions, History, Settings
- **+1 tab:** Debug (dev mode)
- Sends messages to background.js for all data operations
- Renders results, handles user interactions

### content.js (Content Script)
Injected only into n8n pages (not all sites).
- Injects generated workflows into n8n canvas editor
- Shows notifications overlaid on n8n UI
- Prevents double-injection with `window.__n8nPilotInjected`

## Library Modules (`lib/`)

| Module | Purpose |
|--------|---------|
| `claude-client.js` | Anthropic API: POST /v1/messages, retry (3x), 3min timeout |
| `workflow-generator.js` | Build system prompt + call Claude + validate output |
| `workflow-validator.js` | Validate/normalize n8n workflow JSON (350 lines) |
| `n8n-client.js` | n8n REST API: workflows, executions, variables, 15s timeout |
| `settings.js` | Read/write settings with encryption integration |
| `crypto.js` | AES-256-GCM encryption via Web Crypto API |
| `history.js` | Store/retrieve generation history in chrome.storage |
| `versions.js` | Workflow versioning: save, compare, rollback |
| `utils.js` | UUID, timestamp, JSON parsing, escapeHtml, etc. |

## Data Flow

### Generate Workflow
```
User prompt → popup.js
  → sendMessage(generateWorkflow)
    → background.js
      → workflow-generator.js
        → claude-client.js → Anthropic API
      → workflow-validator.js (validate JSON)
    → history.js (save to storage)
  → popup.js (display result with Copy/Inject/Save/Download)
```

### Inject Workflow
```
User clicks Inject → popup.js
  → sendMessage(injectWorkflow)
    → background.js
      → chrome.scripting.executeScript → content.js
        → Copy to clipboard
        → Find n8n canvas, dispatch paste event
        → Show overlay notification
```

### Settings & Security
```
User enters API key → popup.js
  → sendMessage(updateSettings)
    → background.js → settings.js
      → crypto.js (AES-256-GCM encrypt)
        → chrome.storage.local (encrypted value)
```

## Security

- **API keys:** Never stored in plaintext — AES-256-GCM via Web Crypto API
- **CSP:** `script-src 'self'; object-src 'none'` — no inline scripts
- **Permissions:** Minimal + optional (user grants n8n host on first use)
- **No external CDNs** — all code local
- **No telemetry** — zero external calls except Claude API + user's n8n

## Testing

| Type | Tool | Count |
|------|------|-------|
| Unit tests | Vitest | ~284 tests, 11 files |
| E2E tests | Playwright | Mock Claude + n8n servers |
| Coverage | Vitest coverage | `npm run test:coverage` |

## File Structure

```
n8n-pilot/
├── manifest.json          # Chrome Extension Manifest V3
├── background.js          # Service Worker (main orchestrator)
├── popup.html             # Popup UI markup
├── popup.js               # Popup UI logic
├── popup.css              # Dark theme styles
├── content.js             # n8n page content script
├── diagnostic.html        # Debug/diagnostic tool
├── lib/                   # Core library modules
│   ├── claude-client.js
│   ├── workflow-generator.js
│   ├── workflow-validator.js
│   ├── n8n-client.js
│   ├── settings.js
│   ├── crypto.js
│   ├── history.js
│   ├── versions.js
│   └── utils.js
├── icons/                 # Extension icons (16, 32, 48, 128px)
├── tests/                 # Test suite
│   ├── *.test.js          # Vitest unit tests
│   └── e2e/               # Playwright E2E tests
├── security/              # Framework security tools
├── src/framework-core/    # Framework CLI (migration)
└── .claude/               # Framework state files
```
