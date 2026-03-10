# Changelog

All notable changes to n8n Pilot will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

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
