/**
 * n8n Pilot — Workflow Version Tracker
 * Stores versions of workflows for comparison and rollback.
 */

import { now } from './utils.js';
import * as settings from './settings.js';

const STORAGE_KEY = 'n8nPilotVersions';

/**
 * Save a new version of a workflow.
 */
export async function saveVersion(workflowId, workflow, source = 'saved') {
  const limit = await settings.get('versionLimit');
  const all = await loadAll();

  if (!all[workflowId]) {
    all[workflowId] = [];
  }

  const versions = all[workflowId];
  const nextVersion = versions.length > 0
    ? Math.max(...versions.map(v => v.version)) + 1
    : 1;

  versions.push({
    version: nextVersion,
    workflow: structuredClone(workflow),
    timestamp: now(),
    source, // 'generated', 'saved', 'imported'
  });

  // Enforce limit (FIFO)
  while (versions.length > limit) {
    versions.shift();
  }

  all[workflowId] = versions;
  await saveAll(all);

  return nextVersion;
}

/**
 * Get all versions for a workflow.
 */
export async function getVersions(workflowId) {
  const all = await loadAll();
  return all[workflowId] || [];
}

/**
 * Get a specific version.
 */
export async function getVersion(workflowId, versionNumber) {
  const versions = await getVersions(workflowId);
  return versions.find(v => v.version === versionNumber) || null;
}

/**
 * Delete a specific version.
 */
export async function deleteVersion(workflowId, versionNumber) {
  const all = await loadAll();
  if (!all[workflowId]) return;

  all[workflowId] = all[workflowId].filter(v => v.version !== versionNumber);

  if (all[workflowId].length === 0) {
    delete all[workflowId];
  }

  await saveAll(all);
}

/**
 * Delete all versions for a workflow.
 */
export async function deleteWorkflowVersions(workflowId) {
  const all = await loadAll();
  delete all[workflowId];
  await saveAll(all);
}

/**
 * Compare two versions (simple diff).
 */
export async function diff(workflowId, v1Number, v2Number) {
  const v1 = await getVersion(workflowId, v1Number);
  const v2 = await getVersion(workflowId, v2Number);

  if (!v1 || !v2) {
    return { error: 'One or both versions not found' };
  }

  const w1 = v1.workflow;
  const w2 = v2.workflow;

  const nodeNames1 = new Set((w1.nodes || []).map(n => n.name));
  const nodeNames2 = new Set((w2.nodes || []).map(n => n.name));

  const nodesAdded = [...nodeNames2].filter(n => !nodeNames1.has(n));
  const nodesRemoved = [...nodeNames1].filter(n => !nodeNames2.has(n));

  // Nodes present in both — check if parameters changed
  const nodesModified = [];
  for (const name of nodeNames1) {
    if (!nodeNames2.has(name)) continue;
    const n1 = (w1.nodes || []).find(n => n.name === name);
    const n2 = (w2.nodes || []).find(n => n.name === name);
    if (JSON.stringify(n1) !== JSON.stringify(n2)) {
      nodesModified.push(name);
    }
  }

  const connectionsChanged =
    JSON.stringify(w1.connections || {}) !== JSON.stringify(w2.connections || {});

  return {
    nodesAdded,
    nodesRemoved,
    nodesModified,
    connectionsChanged,
    v1: { version: v1.version, timestamp: v1.timestamp },
    v2: { version: v2.version, timestamp: v2.timestamp },
  };
}

/**
 * Get list of all tracked workflow IDs.
 */
export async function listTrackedWorkflows() {
  const all = await loadAll();
  return Object.keys(all).map(id => ({
    workflowId: id,
    versionCount: all[id].length,
    lastUpdated: all[id].length > 0
      ? all[id][all[id].length - 1].timestamp
      : null,
  }));
}

// --- Internal ---

async function loadAll() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || {};
}

async function saveAll(data) {
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
}
