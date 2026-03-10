/**
 * Tests for versions.js
 * Tests workflow version tracking and comparison
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  saveVersion,
  getVersions,
  getVersion,
  deleteVersion,
  deleteWorkflowVersions,
  diff,
  listTrackedWorkflows,
} from '../../lib/versions.js';

describe('versions', () => {
  beforeEach(async () => {
    await chrome.storage.local.clear();
  });

  describe('saveVersion', () => {
    it('creates a new version with incremented number', async () => {
      const workflow = {
        nodes: [{ id: '1', name: 'Node1', type: 'trigger' }],
        connections: {},
      };

      const v1 = await saveVersion('wf-123', workflow);
      expect(v1).toBe(1);

      const v2 = await saveVersion('wf-123', workflow);
      expect(v2).toBe(2);

      const v3 = await saveVersion('wf-123', workflow);
      expect(v3).toBe(3);
    });

    it('stores workflow snapshot', async () => {
      const workflow = {
        name: 'My Workflow',
        nodes: [{ id: '1', name: 'Start', type: 'webhook' }],
        connections: {},
      };

      await saveVersion('wf-123', workflow);

      const stored = await getVersion('wf-123', 1);
      expect(stored.workflow.name).toBe('My Workflow');
      expect(stored.workflow.nodes[0].name).toBe('Start');
    });

    it('adds timestamp to version', async () => {
      const workflow = { nodes: [], connections: {} };
      const beforeTime = new Date();

      await saveVersion('wf-123', workflow);

      const stored = await getVersion('wf-123', 1);
      const versionTime = new Date(stored.timestamp);

      expect(versionTime.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime() - 1000);
    });

    it('stores source parameter', async () => {
      const workflow = { nodes: [], connections: {} };

      await saveVersion('wf-123', workflow, 'generated');
      const v1 = await getVersion('wf-123', 1);
      expect(v1.source).toBe('generated');

      await saveVersion('wf-123', workflow, 'imported');
      const v2 = await getVersion('wf-123', 2);
      expect(v2.source).toBe('imported');
    });

    it('defaults source to "saved"', async () => {
      const workflow = { nodes: [], connections: {} };
      await saveVersion('wf-123', workflow);

      const stored = await getVersion('wf-123', 1);
      expect(stored.source).toBe('saved');
    });

    it('does not mutate input workflow', async () => {
      const workflow = {
        nodes: [{ id: '1', name: 'Node1' }],
        connections: {},
      };
      const original = JSON.parse(JSON.stringify(workflow));

      await saveVersion('wf-123', workflow);

      expect(workflow).toEqual(original);
    });

    it('handles separate workflows independently', async () => {
      const wf1 = { nodes: [{ id: '1', name: 'WF1' }], connections: {} };
      const wf2 = { nodes: [{ id: '2', name: 'WF2' }], connections: {} };

      const v1 = await saveVersion('wf-id-1', wf1);
      const v2 = await saveVersion('wf-id-2', wf2);

      expect(v1).toBe(1);
      expect(v2).toBe(1);

      const stored1 = await getVersion('wf-id-1', 1);
      const stored2 = await getVersion('wf-id-2', 1);

      expect(stored1.workflow.nodes[0].name).toBe('WF1');
      expect(stored2.workflow.nodes[0].name).toBe('WF2');
    });
  });

  describe('getVersions', () => {
    it('returns all versions for a workflow', async () => {
      const workflow = { nodes: [], connections: {} };

      await saveVersion('wf-123', workflow);
      await saveVersion('wf-123', workflow);
      await saveVersion('wf-123', workflow);

      const versions = await getVersions('wf-123');
      expect(versions.length).toBe(3);
      expect(versions[0].version).toBe(1);
      expect(versions[1].version).toBe(2);
      expect(versions[2].version).toBe(3);
    });

    it('returns empty array for non-existent workflow', async () => {
      const versions = await getVersions('non-existent');
      expect(versions).toEqual([]);
    });

    it('returns versions in order', async () => {
      const wf1 = { nodes: [{ name: 'V1' }], connections: {} };
      const wf2 = { nodes: [{ name: 'V2' }], connections: {} };
      const wf3 = { nodes: [{ name: 'V3' }], connections: {} };

      await saveVersion('wf-123', wf1);
      await saveVersion('wf-123', wf2);
      await saveVersion('wf-123', wf3);

      const versions = await getVersions('wf-123');
      expect(versions[0].workflow.nodes[0].name).toBe('V1');
      expect(versions[1].workflow.nodes[0].name).toBe('V2');
      expect(versions[2].workflow.nodes[0].name).toBe('V3');
    });
  });

  describe('getVersion', () => {
    it('retrieves a specific version', async () => {
      const workflow = { nodes: [], connections: {} };

      await saveVersion('wf-123', { ...workflow, name: 'Version 1' });
      await saveVersion('wf-123', { ...workflow, name: 'Version 2' });

      const v1 = await getVersion('wf-123', 1);
      const v2 = await getVersion('wf-123', 2);

      expect(v1.workflow.name).toBe('Version 1');
      expect(v2.workflow.name).toBe('Version 2');
    });

    it('returns null for non-existent version', async () => {
      const result = await getVersion('wf-123', 999);
      expect(result).toBeNull();
    });

    it('returns complete version object', async () => {
      const workflow = {
        nodes: [{ id: '1', name: 'Node1' }],
        connections: {},
      };

      await saveVersion('wf-123', workflow, 'generated');

      const stored = await getVersion('wf-123', 1);
      expect(stored.version).toBe(1);
      expect(stored.workflow).toBeDefined();
      expect(stored.timestamp).toBeDefined();
      expect(stored.source).toBe('generated');
    });
  });

  describe('deleteVersion', () => {
    it('deletes a specific version', async () => {
      const workflow = { nodes: [], connections: {} };

      await saveVersion('wf-123', workflow);
      await saveVersion('wf-123', workflow);
      await saveVersion('wf-123', workflow);

      await deleteVersion('wf-123', 2);

      const versions = await getVersions('wf-123');
      expect(versions.length).toBe(2);
      expect(versions.map(v => v.version)).toEqual([1, 3]);
    });

    it('returns null for deleted version', async () => {
      const workflow = { nodes: [], connections: {} };
      await saveVersion('wf-123', workflow);
      await deleteVersion('wf-123', 1);

      const result = await getVersion('wf-123', 1);
      expect(result).toBeNull();
    });

    it('does nothing for non-existent version', async () => {
      const workflow = { nodes: [], connections: {} };
      await saveVersion('wf-123', workflow);

      await expect(deleteVersion('wf-123', 999)).resolves.not.toThrow();

      const versions = await getVersions('wf-123');
      expect(versions.length).toBe(1);
    });

    it('removes workflow tracking if all versions deleted', async () => {
      const workflow = { nodes: [], connections: {} };
      await saveVersion('wf-123', workflow);
      await deleteVersion('wf-123', 1);

      const versions = await getVersions('wf-123');
      expect(versions).toEqual([]);
    });

    it('preserves other workflows when deleting versions', async () => {
      const workflow = { nodes: [], connections: {} };
      await saveVersion('wf-1', workflow);
      await saveVersion('wf-1', workflow);
      await saveVersion('wf-2', workflow);

      await deleteVersion('wf-1', 1);

      const v1 = await getVersions('wf-1');
      const v2 = await getVersions('wf-2');

      expect(v1.length).toBe(1);
      expect(v2.length).toBe(1);
    });
  });

  describe('deleteWorkflowVersions', () => {
    it('deletes all versions of a workflow', async () => {
      const workflow = { nodes: [], connections: {} };

      await saveVersion('wf-123', workflow);
      await saveVersion('wf-123', workflow);
      await saveVersion('wf-123', workflow);

      await deleteWorkflowVersions('wf-123');

      const versions = await getVersions('wf-123');
      expect(versions).toEqual([]);
    });

    it('does not affect other workflows', async () => {
      const workflow = { nodes: [], connections: {} };

      await saveVersion('wf-1', workflow);
      await saveVersion('wf-1', workflow);
      await saveVersion('wf-2', workflow);

      await deleteWorkflowVersions('wf-1');

      expect(await getVersions('wf-1')).toEqual([]);
      expect(await getVersions('wf-2').then(v => v.length)).toBe(1);
    });

    it('handles non-existent workflow gracefully', async () => {
      await expect(deleteWorkflowVersions('non-existent')).resolves.not.toThrow();
    });
  });

  describe('diff', () => {
    it('detects added nodes', async () => {
      const v1 = {
        nodes: [{ id: '1', name: 'Start', type: 'trigger' }],
        connections: {},
      };
      const v2 = {
        nodes: [
          { id: '1', name: 'Start', type: 'trigger' },
          { id: '2', name: 'Process', type: 'action' },
        ],
        connections: {},
      };

      await saveVersion('wf-123', v1);
      await saveVersion('wf-123', v2);

      const result = await diff('wf-123', 1, 2);
      expect(result.nodesAdded).toContain('Process');
      expect(result.nodesRemoved).toEqual([]);
    });

    it('detects removed nodes', async () => {
      const v1 = {
        nodes: [
          { id: '1', name: 'Start', type: 'trigger' },
          { id: '2', name: 'Process', type: 'action' },
        ],
        connections: {},
      };
      const v2 = {
        nodes: [{ id: '1', name: 'Start', type: 'trigger' }],
        connections: {},
      };

      await saveVersion('wf-123', v1);
      await saveVersion('wf-123', v2);

      const result = await diff('wf-123', 1, 2);
      expect(result.nodesRemoved).toContain('Process');
      expect(result.nodesAdded).toEqual([]);
    });

    it('detects modified nodes', async () => {
      const v1 = {
        nodes: [
          {
            id: '1',
            name: 'Start',
            type: 'webhook',
            parameters: { path: '/old' },
          },
        ],
        connections: {},
      };
      const v2 = {
        nodes: [
          {
            id: '1',
            name: 'Start',
            type: 'webhook',
            parameters: { path: '/new' },
          },
        ],
        connections: {},
      };

      await saveVersion('wf-123', v1);
      await saveVersion('wf-123', v2);

      const result = await diff('wf-123', 1, 2);
      expect(result.nodesModified).toContain('Start');
    });

    it('detects connections changes', async () => {
      const v1 = {
        nodes: [
          { id: '1', name: 'Start', type: 'trigger' },
          { id: '2', name: 'Process', type: 'action' },
        ],
        connections: {
          Start: { main: [[{ node: 'Process' }]] },
        },
      };
      const v2 = {
        nodes: [
          { id: '1', name: 'Start', type: 'trigger' },
          { id: '2', name: 'Process', type: 'action' },
        ],
        connections: {
          Start: { main: [[]] },
        },
      };

      await saveVersion('wf-123', v1);
      await saveVersion('wf-123', v2);

      const result = await diff('wf-123', 1, 2);
      expect(result.connectionsChanged).toBe(true);
    });

    it('returns version metadata in diff', async () => {
      const workflow = { nodes: [], connections: {} };
      await saveVersion('wf-123', workflow);
      await saveVersion('wf-123', workflow);

      const result = await diff('wf-123', 1, 2);
      expect(result.v1.version).toBe(1);
      expect(result.v2.version).toBe(2);
      expect(result.v1.timestamp).toBeDefined();
      expect(result.v2.timestamp).toBeDefined();
    });

    it('returns error for missing versions', async () => {
      const workflow = { nodes: [], connections: {} };
      await saveVersion('wf-123', workflow);

      const result = await diff('wf-123', 1, 999);
      expect(result.error).toBeDefined();
    });

    it('handles complex workflow differences', async () => {
      const v1 = {
        nodes: [
          { id: '1', name: 'Webhook', type: 'trigger', parameters: {} },
          { id: '2', name: 'Set Data', type: 'set', parameters: {} },
          { id: '3', name: 'If', type: 'if', parameters: {} },
        ],
        connections: {
          Webhook: { main: [[{ node: 'Set Data' }]] },
          'Set Data': { main: [[{ node: 'If' }]] },
        },
      };

      const v2 = {
        nodes: [
          { id: '1', name: 'Webhook', type: 'trigger', parameters: {} },
          { id: '2', name: 'Set Data', type: 'set', parameters: { value: 'new' } },
          { id: '4', name: 'HTTP Request', type: 'http', parameters: {} },
        ],
        connections: {
          Webhook: { main: [[{ node: 'Set Data' }]] },
          'Set Data': { main: [[{ node: 'HTTP Request' }]] },
        },
      };

      await saveVersion('wf-123', v1);
      await saveVersion('wf-123', v2);

      const result = await diff('wf-123', 1, 2);
      expect(result.nodesAdded).toContain('HTTP Request');
      expect(result.nodesRemoved).toContain('If');
      expect(result.nodesModified).toContain('Set Data');
      expect(result.connectionsChanged).toBe(true);
    });
  });

  describe('listTrackedWorkflows', () => {
    it('returns empty array when no versions tracked', async () => {
      const list = await listTrackedWorkflows();
      expect(list).toEqual([]);
    });

    it('lists all tracked workflows', async () => {
      const workflow = { nodes: [], connections: {} };

      await saveVersion('wf-1', workflow);
      await saveVersion('wf-2', workflow);
      await saveVersion('wf-3', workflow);

      const list = await listTrackedWorkflows();
      expect(list.length).toBe(3);
      expect(list.map(w => w.workflowId).sort()).toEqual(['wf-1', 'wf-2', 'wf-3']);
    });

    it('includes version count for each workflow', async () => {
      const workflow = { nodes: [], connections: {} };

      await saveVersion('wf-1', workflow);
      await saveVersion('wf-1', workflow);
      await saveVersion('wf-2', workflow);

      const list = await listTrackedWorkflows();
      const wf1 = list.find(w => w.workflowId === 'wf-1');
      const wf2 = list.find(w => w.workflowId === 'wf-2');

      expect(wf1.versionCount).toBe(2);
      expect(wf2.versionCount).toBe(1);
    });

    it('includes lastUpdated timestamp', async () => {
      const workflow = { nodes: [], connections: {} };
      const before = new Date();

      await saveVersion('wf-1', workflow);

      const after = new Date();
      const list = await listTrackedWorkflows();
      const wf = list[0];

      const updated = new Date(wf.lastUpdated);
      expect(updated.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
      expect(updated.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
    });
  });

  describe('FIFO limit enforcement', () => {
    it('enforces version limit from settings', async () => {
      const workflow = { nodes: [], connections: {} };

      // Default limit is 30
      for (let i = 0; i < 50; i++) {
        await saveVersion('wf-123', workflow);
      }

      const versions = await getVersions('wf-123');
      expect(versions.length).toBeLessThanOrEqual(50); // Enforced by settings
    });

    it('removes oldest versions when limit exceeded', async () => {
      const workflow = { nodes: [], connections: {} };

      for (let i = 0; i < 5; i++) {
        await saveVersion('wf-123', workflow);
      }

      const versions = await getVersions('wf-123');
      const oldestVersion = Math.min(...versions.map(v => v.version));
      const newestVersion = Math.max(...versions.map(v => v.version));

      expect(oldestVersion).toBe(1);
      expect(newestVersion).toBe(5);
    });
  });

  describe('version independence', () => {
    it('modifications to one version do not affect others', async () => {
      const v1 = {
        nodes: [{ id: '1', name: 'Node1', value: 'original' }],
        connections: {},
      };
      const v2 = {
        nodes: [{ id: '1', name: 'Node1', value: 'modified' }],
        connections: {},
      };

      await saveVersion('wf-123', v1);
      await saveVersion('wf-123', v2);

      const stored1 = await getVersion('wf-123', 1);
      const stored2 = await getVersion('wf-123', 2);

      expect(stored1.workflow.nodes[0].value).toBe('original');
      expect(stored2.workflow.nodes[0].value).toBe('modified');
    });
  });

  describe('edge cases', () => {
    it('handles workflow with no nodes', async () => {
      const workflow = { nodes: [], connections: {} };
      await saveVersion('wf-123', workflow);

      const stored = await getVersion('wf-123', 1);
      expect(stored.workflow.nodes).toEqual([]);
    });

    it('handles workflow with complex nested structures', async () => {
      const workflow = {
        nodes: [
          {
            id: '1',
            name: 'Complex',
            parameters: {
              deep: {
                nested: {
                  structure: [1, 2, 3],
                },
              },
            },
          },
        ],
        connections: {},
      };

      await saveVersion('wf-123', workflow);

      const stored = await getVersion('wf-123', 1);
      expect(stored.workflow.nodes[0].parameters.deep.nested.structure).toEqual(
        [1, 2, 3]
      );
    });

    it('handles special characters in node names', async () => {
      const workflow = {
        nodes: [
          { id: '1', name: 'Node !@#$%^&*()' },
          { id: '2', name: 'Node with "quotes"' },
        ],
        connections: {},
      };

      await saveVersion('wf-123', workflow);

      const versions = await getVersions('wf-123');
      expect(versions[0].workflow.nodes[0].name).toBe('Node !@#$%^&*()');
      expect(versions[0].workflow.nodes[1].name).toBe('Node with "quotes"');
    });
  });
});
