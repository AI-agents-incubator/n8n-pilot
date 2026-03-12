/**
 * Mock Anthropic Claude API server for E2E tests.
 * Runs on localhost:3100.
 * Supports both regular and streaming (SSE) responses.
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
  const { model, stream } = req.body;

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

  // Streaming response (SSE)
  if (stream) {
    return handleStreamingResponse(res, model);
  }

  // Normal (non-streaming) response
  const workflowJson = JSON.stringify(SAMPLE_WORKFLOW);
  res.json(buildResponse(workflowJson, model));
});

function handleStreamingResponse(res, model = 'claude-sonnet-4-5-20250929') {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const workflowJson = JSON.stringify(SAMPLE_WORKFLOW, null, 2);
  const fullText = `Here's a webhook workflow for you:\n\n\`\`\`json\n${workflowJson}\n\`\`\`\n\nThis workflow listens for POST requests and sets a status field.`;

  // Send message_start event
  const sseEvent = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  res.write(sseEvent('message_start', {
    type: 'message_start',
    message: {
      id: 'msg_mock_stream_001',
      type: 'message',
      role: 'assistant',
      model: model || 'claude-sonnet-4-5-20250929',
      content: [],
      stop_reason: null,
      usage: { input_tokens: 342, output_tokens: 0 },
    },
  }));

  // Send content_block_start
  res.write(sseEvent('content_block_start', {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'text', text: '' },
  }));

  // Stream text in chunks with delays
  const chunkSize = 40;
  const chunks = [];
  for (let i = 0; i < fullText.length; i += chunkSize) {
    chunks.push(fullText.slice(i, i + chunkSize));
  }

  let chunkIndex = 0;
  const interval = setInterval(() => {
    if (chunkIndex >= chunks.length) {
      clearInterval(interval);

      // Send content_block_stop
      res.write(sseEvent('content_block_stop', {
        type: 'content_block_stop',
        index: 0,
      }));

      // Send message_delta with stop_reason
      res.write(sseEvent('message_delta', {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: { output_tokens: 1204 },
      }));

      // Send message_stop
      res.write(sseEvent('message_stop', {
        type: 'message_stop',
      }));

      res.end();
      return;
    }

    res.write(sseEvent('content_block_delta', {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: chunks[chunkIndex] },
    }));

    chunkIndex++;
  }, 30); // 30ms between chunks for fast testing
}

function buildResponse(content, model = 'claude-sonnet-4-5-20250929') {
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
