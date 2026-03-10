# SNAPSHOT — n8n Pilot

**Version:** 1.0.0 | **Phase:** Stable | **Progress:** 95%

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
- ✅ Claude API integration working (API key issue resolved)

## Recent Work
- Initial v1.0.0 release
- 7 cross-module bugs fixed (Kodex review): validation, async injection, versioning, model passthrough, settings consistency, CSS classes
- 17 regression tests added (kodex-regression.test.js)
- 284 unit tests passing + E2E suite
- Diagnostic tool: diagnostic.html (API troubleshooting, kept as dev-tool)
- API key workspace billing issue resolved
- README.md with full setup/usage guide
- PLAN-workflow-testing.md: next feature spec (Generate → Deploy → Test → Report)

## Tech Stack
Vanilla JS (ES modules) | Chrome Extension MV3 | Anthropic API | n8n REST API | Vitest | Playwright
