# Changelog

All notable changes to n8n Pilot will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

## [2.2.0] - 2026-03-11

### Added
- Multi-turn conversation: Claude remembers previous messages within a chat session (up to 20 messages)
- Copy Dialog button: one-click copy of full conversation to clipboard
- Template search badge: shows "📎 N templates found" before generation
- Workflow card delta: shows node count changes (+2/-1) when re-generating
- Error action cards: "API key not configured" errors show "Open Settings" button

### Changed
- System prompt: Claude now asks clarifying questions instead of generating placeholder workflows
- System prompt: Claude no longer gives n8n import tutorials (user is already in n8n editor)
- System prompt: incremental workflow edits instead of full regeneration
- Privacy controls: chat history respects "Save History" toggle, "Reset All Data" clears chat memory

### Fixed
- Streaming pipeline: `extractJson()` double-parse crash (object parsed as string)
- Token count display: `{input, output}` object no longer shows as `[object Object]`
- Architecture docs: removed stale `popup.html` reference, updated to `panel/` structure

## [2.1.0] - 2026-03-11

### Added
- Model actualizer (`lib/model-actualizer.js`): auto-replaces deprecated AI models
  - OpenAI: gpt-4, gpt-4o, chatgpt-4o-latest → gpt-4.1-nano
  - Gemini: gemini-2.0-flash, gemini-1.5-flash → models/gemini-2.5-flash
  - Integrated into normalize pipeline (transparent to users)
- Template search integration (`lib/template-search.js`): HTTP client for local template library
  - searchTemplates, getTemplate, getDiagram, getCategories, getStats, getIntegrations
  - Auto-searches matching templates before generation, injects as reference examples
  - Graceful degradation: works without template server
- Expanded prompt-analyzer platform detection from ~25 to 55+ platforms
  - CRM: HubSpot, Salesforce, Mailchimp, SendGrid
  - Social: Twitter, Facebook, Instagram, LinkedIn
  - E-commerce: Shopify, Stripe, WooCommerce
  - Databases: Redis, Supabase, Firebase
  - DevOps: GitLab, Sentry, PagerDuty
  - Communication: WhatsApp, Microsoft Teams, Twilio
  - AI: Ollama, Pinecone
  - And more: Dropbox, AWS S3, Trello, Asana, Linear, ClickUp, Todoist, WordPress, YouTube, Google Calendar, FTP/SSH, XML
- 7 new background.js message actions for template search
- `.env.example` for development configuration
- Example workflow JSONs (`example/` directory)
- Acceptance test infrastructure (`tests/acceptance/`)
- E2E test suite (Playwright): panel, chat, settings, workflows

### Fixed
- OpenAI node parameters: `model`+`prompt` → `modelId`+`messages.values[]` (v1.8 format)
- Gemini node parameters: `model` → `modelId`, added `builtInTools: {}` (v1.1 format)
- IF node conditions: added `typeValidation: "strict"` + `version: 3` (v2.3 format)
- Filter node conditions: added `typeValidation: "strict"` + `version: 2`
- Node catalog: OpenAI and Gemini defaults now use correct parameter schemas

## [2.0.0] - 2026-03-10

### Added
- Injected side panel architecture (Shadow DOM, replaces popup)
- Chat UI with streaming responses
- Smart generator: prompt → blueprint → enhanced prompt → Claude → normalize
- Node catalog: 150+ node types + core schemas
- Prompt analyzer: NLP-based workflow blueprint from natural language
- Context awareness: detects current n8n workflow
- Context menu integration (Explain, Generate Code, Optimize)
- Chat memory with FIFO eviction (100 messages per context)

## [1.0.0] - 2026-03-10

### Added
- Chrome Extension (Manifest V3) with 5-tab UI: Generate, Workflows, Executions, History, Settings
- AI workflow generation via Claude API (Sonnet 4.5, Opus 4, Haiku 3.5)
- Workflow injection into n8n canvas editor via content script
- n8n REST API integration: workflows, executions, variables management
- AES-256-GCM encryption for API keys (Web Crypto API)
- Workflow versioning: save, compare, rollback
- Generation history with search
- Debug tab for raw Claude API testing
- 284 unit tests (Vitest) + 17 regression tests + E2E suite (Playwright)
- Diagnostic tool (diagnostic.html) for API troubleshooting
- README with full setup and usage guide (Russian)
- Content Security Policy: `script-src 'self'; object-src 'none'`
- Optional host permissions (user grants n8n access on first use)

### Fixed
- Workflow validation: invalid workflows no longer returned as success
- Content script injection: async with proper result reporting
- Versioning: API fallback when workflow data missing from content script
- Model passthrough: user-selected model forwarded through entire stack
- Settings field names: consistent across popup.js and settings.js
- CSS status classes: all JS-assigned classes defined in stylesheet
- URL regex: handles dashed workflow IDs correctly
