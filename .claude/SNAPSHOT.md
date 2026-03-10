# SNAPSHOT — n8n Pilot

**Version:** 1.0.0 | **Phase:** Initial Release | **Progress:** 85%

## Project
Chrome Extension (Manifest V3) — AI-powered n8n workflow manager with Claude API integration.
Fully local, no external servers, privacy-first.

## Active Modules
- **background.js** — Service Worker: central message router, API calls
- **popup.js** — UI: 5 tabs (Generate, Workflows, Executions, History, Settings)
- **content.js** — Content Script: workflow injection into n8n editor
- **lib/claude-client.js** — Anthropic API client (retry, timeout)
- **lib/workflow-generator.js** — AI workflow generation + validation
- **lib/n8n-client.js** — n8n REST API client
- **lib/crypto.js** — AES-256-GCM encryption for API keys

## Current Status
- ✅ Extension loads and runs in Chrome
- ✅ Settings UI: Claude API key, n8n URL/key, model, options
- ✅ Workflow generation (Generate tab)
- ✅ Workflow injection into n8n editor
- ✅ Workflows/Executions tabs functional
- ✅ History tracking + versioning
- ⚠️ Known issue: Claude API returns 400 (credit balance) — see diagnostic report

## Recent Work
- Initial v1.0.0 release (single commit)
- Comprehensive test suite: 284 unit tests + E2E
- Diagnostic tool created: diagnostic.html + n8n-pilot-api-diagnostic-report.md
- Security: AES-256-GCM, CSP, optional permissions

## Tech Stack
Vanilla JS (ES modules) | Chrome Extension MV3 | Anthropic API | n8n REST API | Vitest | Playwright
