# SNAPSHOT — n8n Pilot

**Version:** 2.1.0 | **Phase:** Phase 6 Complete | **Progress:** 100%

## Project
Chrome Extension (Manifest V3) — AI-powered n8n workflow manager with Claude API integration.
Injected side panel (Shadow DOM), chat UI with streaming, smart generator with node catalog,
model actualizer, template library integration. Fully local, privacy-first.

## Active Modules
- **background.js** — Service Worker: central message router, 40+ actions
- **content.js** — Injected side panel via Shadow DOM (not popup)
- **lib/claude-client.js** — Anthropic API client (streaming + non-streaming)
- **lib/workflow-generator.js** — AI generation with blueprint system + template hints
- **lib/workflow-validator.js** — Normalize pipeline: typeVersions, parameters, model actualization
- **lib/prompt-analyzer.js** — NLP blueprint from user prompt (55+ platform patterns)
- **lib/model-actualizer.js** — Deprecated model → current model mapping (OpenAI, Gemini)
- **lib/template-search.js** — HTTP client for local template library (2053 templates)
- **lib/node-catalog-core.js** — Core node schemas (Webhook, IF, Code, OpenAI, Gemini, etc.)
- **lib/node-catalog-index.js** — 150+ n8n node type registry
- **lib/n8n-client.js** — n8n REST API client
- **lib/crypto.js** — AES-256-GCM encryption for API keys
- **lib/settings.js** — Settings with templateServerUrl support
- **lib/history.js** — Generation history in chrome.storage
- **lib/versions.js** — Workflow versioning: save, compare, rollback

## Current Status
- ✅ Side panel injected into n8n pages (Shadow DOM isolation)
- ✅ Chat UI with streaming responses
- ✅ Smart generation: prompt → blueprint → enhanced prompt → Claude → normalize
- ✅ Context-aware: detects current n8n workflow, secondary views
- ✅ Context menu integration (Explain, Generate Code, Optimize)
- ✅ Model actualizer: auto-replaces deprecated AI models in generated workflows
- ✅ Template search: finds matching templates from 2053-template library before generation
- ✅ Parameter format fixes: OpenAI (modelId+messages), IF/Filter (typeValidation+version)
- ✅ 55+ platform detection in prompt analyzer
- ✅ 415 unit tests passing (14 test files)
- ✅ E2E + acceptance test infrastructure

## Recent Work (Phase 6)
- Model actualizer: deprecated OpenAI (gpt-4→gpt-4.1-nano) and Gemini (gemini-2.0→gemini-2.5-flash) mapping
- Template search integration: searchTemplates, getDiagram, getCategories, getStats, getIntegrations
- Auto-search templates before generation, inject as reference examples in prompt
- Expanded prompt-analyzer from ~25 to 55+ platforms (CRM, social, e-commerce, DevOps, databases)
- Fixed OpenAI/Gemini parameter format (modelId+messages, not model+prompt)
- Fixed IF/Filter conditions.options (typeValidation+version)

## Tech Stack
Vanilla JS (ES modules) | Chrome Extension MV3 | Anthropic API | n8n REST API | Vitest | Playwright
