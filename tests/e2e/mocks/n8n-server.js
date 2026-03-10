/**
 * Mock n8n REST API server for E2E tests.
 * Runs on localhost:5678.
 */

import express from 'express';

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
