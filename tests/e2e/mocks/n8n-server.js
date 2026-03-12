/**
 * Mock n8n REST API server for E2E tests.
 * Runs on localhost:5678.
 * Serves a fake n8n UI page + REST API endpoints.
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

// In-memory data
let workflows = [
  {
    id: 'wf-001',
    name: 'Email Notification',
    active: true,
    nodes: [{ id: 'n1', name: 'Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 1, position: [250, 300], parameters: {} }],
    connections: {},
    settings: { executionOrder: 'v1' },
    tags: [{ id: 't1', name: 'production' }],
    createdAt: '2026-03-01T10:00:00Z',
    updatedAt: '2026-03-10T08:00:00Z',
  },
  {
    id: 'wf-002',
    name: 'Data Backup',
    active: false,
    nodes: [{ id: 'n2', name: 'Schedule', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1, position: [250, 300], parameters: {} }],
    connections: {},
    settings: { executionOrder: 'v1' },
    tags: [],
    createdAt: '2026-02-15T10:00:00Z',
    updatedAt: '2026-03-09T12:00:00Z',
  },
  {
    id: 'wf-003',
    name: 'Webhook Handler',
    active: true,
    nodes: [],
    connections: {},
    settings: {},
    tags: [],
    createdAt: '2026-03-05T10:00:00Z',
    updatedAt: '2026-03-10T07:55:00Z',
  },
];

let executions = [
  { id: 'ex-001', workflowId: 'wf-001', status: 'success', startedAt: '2026-03-10T07:58:00Z', stoppedAt: '2026-03-10T07:58:01Z', mode: 'webhook' },
  { id: 'ex-002', workflowId: 'wf-002', status: 'error', startedAt: '2026-03-10T07:45:00Z', stoppedAt: '2026-03-10T07:45:02Z', mode: 'trigger' },
  { id: 'ex-003', workflowId: 'wf-001', status: 'success', startedAt: '2026-03-10T07:00:00Z', stoppedAt: '2026-03-10T07:00:00Z', mode: 'webhook' },
];

let variables = [
  { id: 'var-001', key: 'API_URL', value: 'https://api.example.com', type: 'string' },
  { id: 'var-002', key: 'MAX_RETRIES', value: '3', type: 'string' },
];

let tags = [
  { id: 't1', name: 'production' },
  { id: 't2', name: 'development' },
];

let credentials = [
  { id: 'cred-001', name: 'HTTP Basic Auth', type: 'httpBasicAuth', createdAt: '2026-01-01T00:00:00Z' },
];

// --- Fake n8n UI pages ---

const N8N_PAGE_HTML = `<!DOCTYPE html>
<html lang="en" data-n8n-pilot-test-mode="true">
<head>
  <meta charset="UTF-8">
  <title>n8n — Workflow Automation</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1a1a2e; color: #e0e0e0; }
    #app { min-height: 100vh; display: flex; }
    .sidebar { width: 64px; background: #16162a; border-right: 1px solid #333; padding: 16px 8px; }
    .main-content { flex: 1; padding: 24px; transition: margin-right 0.3s; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
    h1 { font-size: 20px; font-weight: 600; }
    .workflow-list { display: grid; gap: 12px; }
    .workflow-card { background: #222244; border: 1px solid #333; border-radius: 8px; padding: 16px; cursor: pointer; }
    .workflow-card:hover { border-color: #ff6d5a; }
    .workflow-card h3 { font-size: 14px; margin-bottom: 4px; }
    .workflow-card .meta { font-size: 12px; color: #888; }
    .badge { font-size: 11px; padding: 2px 6px; border-radius: 4px; }
    .badge.active { background: #1b5e20; color: #4caf50; }
    .badge.inactive { background: #333; color: #888; }
  </style>
  <script>window.__N8N_PILOT_TEST_MODE__ = true;</script>
</head>
<body>
  <div id="app">
    <div class="sidebar">
      <div style="width:32px;height:32px;background:#ff6d5a;border-radius:8px;margin:0 auto;"></div>
    </div>
    <div class="main-content">
      <div class="header">
        <h1>Workflows</h1>
        <button class="btn" data-test-id="new-workflow">+ New Workflow</button>
      </div>
      <div class="workflow-list" id="workflowList"></div>
    </div>
  </div>
</body>
</html>`;

const N8N_WORKFLOW_PAGE_HTML = (id) => `<!DOCTYPE html>
<html lang="en" data-n8n-pilot-test-mode="true">
<head>
  <meta charset="UTF-8">
  <title>n8n — Workflow Editor</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1a1a2e; color: #e0e0e0; }
    #app { min-height: 100vh; display: flex; }
    .main-content { flex: 1; transition: margin-right 0.3s; }
    .toolbar { height: 48px; background: #16162a; border-bottom: 1px solid #333; display: flex; align-items: center; padding: 0 16px; gap: 12px; }
    .toolbar input[data-test-id="workflow-name-input"] { background: transparent; border: none; color: #fff; font-size: 14px; font-weight: 600; }
    .toolbar button { background: #ff6d5a; color: #fff; border: none; border-radius: 4px; padding: 6px 12px; cursor: pointer; }
    .canvas { flex: 1; height: calc(100vh - 48px); background: #0d0d1a; position: relative; }
    .canvas .placeholder { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #555; font-size: 14px; }
  </style>
  <script>window.__N8N_PILOT_TEST_MODE__ = true;</script>
</head>
<body>
  <div id="app">
    <div class="main-content">
      <div class="toolbar">
        <input data-test-id="workflow-name-input" value="Test Workflow ${id}">
        <button data-test-id="save-workflow">Save</button>
      </div>
      <div class="canvas" data-test-id="canvas" id="canvas">
        <div class="placeholder">Canvas — workflow ${id}</div>
      </div>
    </div>
  </div>
</body>
</html>`;

// Serve n8n pages
app.get('/', (req, res) => res.type('html').send(N8N_PAGE_HTML));
app.get('/home', (req, res) => res.type('html').send(N8N_PAGE_HTML));
app.get('/home/workflows', (req, res) => res.type('html').send(N8N_PAGE_HTML));
app.get('/workflow/:id', (req, res) => res.type('html').send(N8N_WORKFLOW_PAGE_HTML(req.params.id)));

// Auth middleware
function auth(req, res, next) {
  const apiKey = req.headers['x-n8n-api-key'];
  if (!apiKey || apiKey === 'invalid-key') {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  next();
}

app.use('/api/v1', auth);

// === Workflows ===

app.get('/api/v1/workflows', (req, res) => {
  let result = [...workflows];
  if (req.query.active !== undefined) {
    result = result.filter(w => String(w.active) === req.query.active);
  }
  if (req.query.name) {
    const q = req.query.name.toLowerCase();
    result = result.filter(w => w.name.toLowerCase().includes(q));
  }
  const limit = parseInt(req.query.limit) || 50;
  res.json({ data: result.slice(0, limit), nextCursor: null });
});

app.get('/api/v1/workflows/:id', (req, res) => {
  const wf = workflows.find(w => w.id === req.params.id);
  if (!wf) return res.status(404).json({ message: 'Not found' });
  res.json(wf);
});

app.post('/api/v1/workflows', (req, res) => {
  const wf = {
    id: 'wf-' + Date.now(),
    ...req.body,
    active: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  workflows.push(wf);
  res.status(201).json(wf);
});

app.put('/api/v1/workflows/:id', (req, res) => {
  const idx = workflows.findIndex(w => w.id === req.params.id);
  if (idx === -1) return res.status(404).json({ message: 'Not found' });
  workflows[idx] = { ...workflows[idx], ...req.body, updatedAt: new Date().toISOString() };
  res.json(workflows[idx]);
});

app.delete('/api/v1/workflows/:id', (req, res) => {
  workflows = workflows.filter(w => w.id !== req.params.id);
  res.status(204).end();
});

app.post('/api/v1/workflows/:id/activate', (req, res) => {
  const wf = workflows.find(w => w.id === req.params.id);
  if (!wf) return res.status(404).json({ message: 'Not found' });
  wf.active = true;
  res.json(wf);
});

app.post('/api/v1/workflows/:id/deactivate', (req, res) => {
  const wf = workflows.find(w => w.id === req.params.id);
  if (!wf) return res.status(404).json({ message: 'Not found' });
  wf.active = false;
  res.json(wf);
});

// === Executions ===

app.get('/api/v1/executions', (req, res) => {
  let result = [...executions];
  if (req.query.workflowId) {
    result = result.filter(e => e.workflowId === req.query.workflowId);
  }
  if (req.query.status) {
    result = result.filter(e => e.status === req.query.status);
  }
  const limit = parseInt(req.query.limit) || 50;
  res.json({ data: result.slice(0, limit), nextCursor: null });
});

app.get('/api/v1/executions/:id', (req, res) => {
  const ex = executions.find(e => e.id === req.params.id);
  if (!ex) return res.status(404).json({ message: 'Not found' });
  res.json(ex);
});

app.delete('/api/v1/executions/:id', (req, res) => {
  executions = executions.filter(e => e.id !== req.params.id);
  res.status(204).end();
});

// === Variables ===

app.get('/api/v1/variables', (req, res) => {
  res.json({ data: variables });
});

app.post('/api/v1/variables', (req, res) => {
  const v = { id: 'var-' + Date.now(), ...req.body };
  variables.push(v);
  res.status(201).json(v);
});

app.patch('/api/v1/variables/:id', (req, res) => {
  const idx = variables.findIndex(v => v.id === req.params.id);
  if (idx === -1) return res.status(404).json({ message: 'Not found' });
  variables[idx] = { ...variables[idx], ...req.body };
  res.json(variables[idx]);
});

app.delete('/api/v1/variables/:id', (req, res) => {
  variables = variables.filter(v => v.id !== req.params.id);
  res.status(204).end();
});

// === Tags ===

app.get('/api/v1/tags', (req, res) => {
  res.json({ data: tags });
});

app.post('/api/v1/tags', (req, res) => {
  const t = { id: 't-' + Date.now(), name: req.body.name };
  tags.push(t);
  res.status(201).json(t);
});

// === Credentials ===

app.get('/api/v1/credentials', (req, res) => {
  res.json({ data: credentials });
});

// === Health ===
app.get('/healthz', (req, res) => res.json({ status: 'ok' }));

const PORT = 5678;
app.listen(PORT, () => {
  console.log(`Mock n8n API running on http://localhost:${PORT}`);
});
