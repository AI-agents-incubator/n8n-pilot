# IDEAS — n8n Pilot

*Brainstorming space. Unfiltered, unplanned. See ROADMAP.md for committed plans.*

---

## AI & Generation
- Natural language workflow modifications: "make this workflow run every hour instead"
- Workflow suggestions based on current n8n instance (analyze existing workflows)
- AI-powered workflow review: "find potential issues in this workflow"
- Convert workflow to natural language description
- "Clone and adapt" — copy workflow, AI adapts it for new use case

## UX Ideas
- Keyboard shortcuts in popup (Ctrl+Enter to generate)
- Workflow preview before injection (visual tree)
- Drag-and-drop prompt templates
- Pinned favorite workflows
- Batch generation (generate multiple variations)

## Integration
- Webhook testing built-in
- Direct node documentation lookup from n8n docs
- Auto-detect n8n version and adjust API calls
- Share workflows via URL (export as gist)
- Import from n8n community templates browser

## Technical
- Background sync: periodically check execution status
- IndexedDB for larger history (vs chrome.storage limit)
- Service Worker cache for offline access to UI
- WebSocket support for real-time execution monitoring
