# IDEAS — n8n Pilot

*Brainstorming space. Unfiltered, unplanned.*

---

## AI & Generation
- Natural language workflow modifications: "make this workflow run every hour instead"
- AI-powered workflow review: "find potential issues in this workflow"
- Convert workflow to natural language description
- "Clone and adapt" — copy workflow, AI adapts it for new use case
- Multi-model support: let user pick OpenAI/Gemini for generation (not just Claude)
- Template-based generation: pick a template, AI adapts it to user's specifics

## UX Ideas
- Keyboard shortcuts in panel (Ctrl+Enter to generate)
- Workflow preview before injection (Mermaid diagram from template server)
- Drag-and-drop prompt templates
- Pinned favorite workflows
- Batch generation (generate multiple variations)
- Categories browser: show template categories for discovery
- Autocomplete node names in chat input (from node catalog)

## Integration
- ~~Import from n8n community templates browser~~ ✅ Done (template-search.js)
- Webhook testing built-in
- Direct node documentation lookup from n8n docs
- Auto-detect n8n version and adjust API calls
- Share workflows via URL (export as gist)
- Template server auto-start (bundle Python server or use Docker)

## Technical
- Background sync: periodically check execution status
- IndexedDB for larger history (vs chrome.storage limit)
- Service Worker cache for offline access to UI
- WebSocket support for real-time execution monitoring
- Incremental template indexing (sync new templates without full rebuild)
- Workflow diff visualization in panel (before/after modification)
