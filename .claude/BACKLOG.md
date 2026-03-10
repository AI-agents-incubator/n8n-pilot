# BACKLOG — n8n Pilot

*Source: code analysis + Kodex review*

> 📋 Active tasks only. Strategic planning → [ROADMAP.md](./ROADMAP.md)

## 🐛 Bugs
- [ ] Review n8n content script selectors — may need updates for newer n8n versions
- [ ] Add rate limiting/backoff in claude-client.js (currently no delay between retries)

## 🔧 Improvements
- [ ] Configure ESLint/linter (`"lint": "echo 'No linter configured'"` in package.json)
- [ ] Add inline JSDoc comments to lib modules
- [x] ~~Fix .gitignore~~ — done (.env, credentials, *.pem, *.key, security/reports/)

## 🧪 Testing
- [ ] Run full test suite and verify all 284 tests pass
- [ ] Check E2E tests with Playwright mock servers
- [ ] Add coverage reporting to CI

## 📦 Packaging
- [ ] Build script for extension packaging (.crx or zip for Chrome Web Store)
- [ ] Verify manifest.json icons (icons/ directory exists)
