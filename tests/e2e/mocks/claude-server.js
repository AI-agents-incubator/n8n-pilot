/**
 * Mock Anthropic Claude API server for E2E tests.
 * Runs on localhost:3100.
 */

import express from 'express';

const app = express();
app.use(express.json());

// Sample workflow response
const SAMPLE_WORKFLOW = {
  name: 'Test Webhook Workflow',
  nodes: [
    {
      id: '1a2b3c4d-5e6f-7890-abcd-ef1234567890',
      name: 'Webhook Trigger',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 1,
      position: [250, 300],
      parameters: {
        path: 'test-hook',
        httpMethod: 'POST',
      },
    },
    {
      id: '2b3c4d5e-6f78-90ab-cdef-123456789012',
      name: 'Set Data',
      type: 'n8n-nodes-base.set',
      typeVersion: 3.4,
      position: [550, 300],
      parameters: {
        mode: 'manual',
        assignments: {
          assignments: [
            { id: 'a1', name: 'status', value: 'processed', type: 'string' },
          ],
        },
        options: {},
      },
    },
  ],
  connections: {
    'Webhook Trigger': {
      main: [[{ node: 'Set Data', type: 'main', index: 0 }]],
    },
  },
  settings: { executionOrder: 'v1' },
};

// POST /v1/messages — Main endpoint
app.post('/v1/messages', (req, res) => {
  const apiKey = req.headers['x-api-key'];
  const { model, messages, max_tokens, system } = req.body;

  // Auth check
  if (!apiKey || apiKey === 'invalid-key') {
    return res.status(401).json({
      type: 'error',
      error: { type: 'authentication_error', message: 'Invalid API key' },
    });
  }

  // Simulate rate limit
  if (apiKey === 'rate-limited-key') {
    return res.status(429).json({
      type: 'error',
      error: { type: 'rate_limit_error', message: 'Rate limited' },
    });
  }

  // Simulate overloaded
  if (apiKey === 'overloaded-key') {
    return res.status(529).json({
      type: 'error',
      error: { type: 'overloaded_error', message: 'Overloaded' },
    });
  }

  // Simulate slow response
  if (apiKey === 'slow-key') {
    return setTimeout(() => {
      res.json(buildResponse(SAMPLE_WORKFLOW, model));
    }, 5000);
  }

  // Simulate bad JSON response
  if (apiKey === 'bad-json-key') {
    return res.json(buildResponse('This is not valid JSON at all', model));
  }

  // Normal response
  const workflowJson = JSON.stringify(SAMPLE_WORKFLOW);
  res.json(buildResponse(workflowJson, model));
});

function buildResponse(content, model = 'claude-sonnet-4-20250514') {
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  return {
    id: 'msg_mock_001',
    type: 'message',
    role: 'assistant',
    model,
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    usage: {
      input_tokens: 342,
      output_tokens: 1204,
    },
  };
}

const PORT = 3100;
app.listen(PORT, () => {
  console.log(`Mock Claude API running on http://localhost:${PORT}`);
});
