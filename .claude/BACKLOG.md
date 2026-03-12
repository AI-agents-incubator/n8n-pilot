# BACKLOG — n8n Pilot

*Updated: 2026-03-11 | Post-Phase 6*

> Active tasks only. Completed items removed.

## Bugs
- [ ] Review n8n content script selectors — may need updates for newer n8n versions
- [ ] Add rate limiting/backoff in claude-client.js (currently no delay between retries)

## Improvements
- [ ] Configure ESLint/linter (`"lint": "echo 'No linter configured'"` in package.json)
- [ ] Template diagram rendering in panel UI (Mermaid → SVG preview)
- [ ] Categories-based guided dialog in chat UI (use getCategories endpoint)
- [ ] Stats dashboard: show template library analytics in settings/about
- [ ] Use template integrations list for autocomplete in chat input

## Testing
- [ ] Add coverage reporting to CI
- [ ] E2E tests for template search flow (mock template server)
- [ ] Acceptance test: verify generated workflows run without errors in n8n

## Packaging
- [ ] Build script for extension packaging (.crx or zip for Chrome Web Store)
- [ ] Verify manifest.json icons (icons/ directory exists)
- [ ] Version bump automation script
