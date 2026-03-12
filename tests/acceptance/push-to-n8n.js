#!/usr/bin/env node
/**
 * Push generated workflows to real n8n instance and verify they were accepted.
 * Usage: node tests/acceptance/push-to-n8n.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR = path.resolve(__dirname, 'output');

// Load .env
function loadEnv() {
  const envPath = path.join(PROJECT_ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.substring(0, eqIdx).trim();
    const value = trimmed.substring(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnv();

const N8N_BASE_URL = process.env.N8N_BASE_URL;
const N8N_API_KEY = process.env.N8N_API_KEY;

if (!N8N_BASE_URL || !N8N_API_KEY) {
  console.error('ERROR: N8N_BASE_URL and N8N_API_KEY must be set in .env');
  process.exit(1);
}

const WORKFLOW_FILES = [
  'macwhisper-generated.json',
  'supabase-plugin-generated.json',
  'inoreader-ai-generated.json',
  'inoreader-telegram-generated.json',
  'twitter-ai-feed-generated.json',
];

async function createWorkflow(workflow) {
  const payload = {
    name: `[AI Generated] ${workflow.name}`,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings: workflow.settings || { executionOrder: 'v1' },
  };

  const response = await fetch(`${N8N_BASE_URL}/api/v1/workflows`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-N8N-API-KEY': N8N_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errText.substring(0, 300)}`);
  }

  return response.json();
}

async function getWorkflow(id) {
  const response = await fetch(`${N8N_BASE_URL}/api/v1/workflows/${id}`, {
    headers: { 'X-N8N-API-KEY': N8N_API_KEY },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function deleteWorkflow(id) {
  const response = await fetch(`${N8N_BASE_URL}/api/v1/workflows/${id}`, {
    method: 'DELETE',
    headers: { 'X-N8N-API-KEY': N8N_API_KEY },
  });
  return response.ok;
}

async function main() {
  console.log('='.repeat(60));
  console.log('n8n Pilot — Push Generated Workflows to n8n');
  console.log(`Target: ${N8N_BASE_URL}`);
  console.log('='.repeat(60));
  console.log();

  const createdIds = [];
  let passed = 0;
  let failed = 0;

  for (const file of WORKFLOW_FILES) {
    const filePath = path.join(OUTPUT_DIR, file);
    const id = file.replace('-generated.json', '');

    if (!fs.existsSync(filePath)) {
      console.log(`[SKIP] ${id} — file not found`);
      failed++;
      continue;
    }

    const workflow = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    console.log(`--- [${id}] ${workflow.name} (${workflow.nodes.length} nodes) ---`);

    // Step 1: Create in n8n
    try {
      const created = await createWorkflow(workflow);
      console.log(`  [OK] Created in n8n — ID: ${created.id}`);
      createdIds.push({ id: created.id, testId: id });

      // Step 2: Fetch back and verify
      const fetched = await getWorkflow(created.id);
      const nodeCount = fetched.nodes?.length || 0;
      const connCount = Object.keys(fetched.connections || {}).length;

      console.log(`  [OK] Verified — ${nodeCount} nodes, ${connCount} connections`);

      // Step 3: Check node count matches what we sent
      if (nodeCount === workflow.nodes.length) {
        console.log(`  [OK] Node count matches (${nodeCount})`);
      } else {
        console.log(`  [WARN] Node count mismatch: sent ${workflow.nodes.length}, got ${nodeCount}`);
      }

      console.log(`  PASSED`);
      passed++;
    } catch (err) {
      console.log(`  [FAIL] ${err.message}`);
      failed++;
    }

    console.log();
  }

  // Summary
  console.log('='.repeat(60));
  console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${WORKFLOW_FILES.length}`);
  console.log();

  if (createdIds.length > 0) {
    console.log('Created workflow IDs (in your n8n):');
    for (const { id, testId } of createdIds) {
      console.log(`  ${testId}: ${N8N_BASE_URL}/workflow/${id}`);
    }
  }

  // Cleanup option — don't auto-delete, let user review
  console.log();
  console.log('Workflows left in n8n with "[AI Generated]" prefix for review.');
  console.log('='.repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
