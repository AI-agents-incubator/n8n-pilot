/**
 * Tests for workflow-validator.js
 * Tests workflow validation and normalization
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validate, normalize } from '../../lib/workflow-validator.js';

describe('workflow-validator', () => {
  describe('validate', () => {
    describe('basic validation', () => {
      it('validates a valid workflow', () => {
        const workflow = {
          nodes: [
            {
              id: '1',
              name: 'Webhook',
              type: 'n8n-nodes-base.webhook',
              position: [100, 100],
            },
            {
              id: '2',
              name: 'Set Data',
              type: 'n8n-nodes-base.set',
              position: [300, 100],
            },
          ],
          connections: {
            Webhook: {
              main: [[{ node: 'Set Data', type: 'main', index: 0 }]],
            },
          },
        };

        const result = validate(workflow);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('returns valid: false when workflow is not an object', () => {
        const result = validate('not an object');
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toBe('Workflow is not a valid object');
      });

      it('returns valid: false when workflow is null', () => {
        const result = validate(null);
        expect(result.valid).toBe(false);
      });
    });

    describe('nodes validation', () => {
      it('reports error when nodes field is missing', () => {
        const result = validate({});
        expect(result.errors).toContain('Missing "nodes" field');
      });

      it('reports error when nodes array is empty', () => {
        const workflow = { nodes: [] };
        const result = validate(workflow);
        expect(result.errors).toContain('Workflow has no nodes');
      });

      it('warns when nodes is an object instead of array', () => {
        const workflow = {
          nodes: { '0': { name: 'Node1' }, '1': { name: 'Node2' } },
        };
        const result = validate(workflow);
        expect(result.warnings).toContain('"nodes" is an object, will be converted to array');
      });

      it('reports error when nodes is not array or object', () => {
        const workflow = { nodes: 'invalid' };
        const result = validate(workflow);
        expect(result.errors).toContain('"nodes" must be an array');
      });
    });

    describe('trigger node validation', () => {
      it('warns when no trigger node is found', () => {
        const workflow = {
          nodes: [
            { id: '1', name: 'Regular Node', type: 'n8n-nodes-base.set' },
          ],
        };
        const result = validate(workflow);
        expect(result.warnings).toContain(
          'No trigger node found — workflow may not start automatically'
        );
      });

      it('does not warn when webhook trigger is present', () => {
        const workflow = {
          nodes: [
            { id: '1', name: 'Webhook', type: 'n8n-nodes-base.webhook' },
          ],
        };
        const result = validate(workflow);
        expect(result.warnings.some(w => w.includes('trigger'))).toBe(false);
      });

      it('does not warn when schedule trigger is present', () => {
        const workflow = {
          nodes: [
            { id: '1', name: 'Trigger', type: 'n8n-nodes-base.scheduleTrigger' },
          ],
        };
        const result = validate(workflow);
        expect(result.warnings.some(w => w.includes('trigger'))).toBe(false);
      });

      it('recognizes manual trigger', () => {
        const workflow = {
          nodes: [
            { id: '1', name: 'Manual', type: 'n8n-nodes-base.manualTrigger' },
          ],
        };
        const result = validate(workflow);
        expect(result.valid).toBe(true);
      });

      it('recognizes cron trigger', () => {
        const workflow = {
          nodes: [
            { id: '1', name: 'Cron', type: 'n8n-nodes-base.cronTrigger' },
          ],
        };
        const result = validate(workflow);
        expect(result.valid).toBe(true);
      });
    });

    describe('node validation', () => {
      it('reports error when node is missing type', () => {
        const workflow = {
          nodes: [
            { id: '1', name: 'Node1', type: 'n8n-nodes-base.webhook' },
            { id: '2', name: 'BadNode' },
          ],
        };
        const result = validate(workflow);
        expect(result.errors.some(e => e.includes('missing "type"'))).toBe(true);
      });

      it('warns when node is missing position', () => {
        const workflow = {
          nodes: [
            {
              id: '1',
              name: 'Node1',
              type: 'n8n-nodes-base.webhook',
            },
          ],
        };
        const result = validate(workflow);
        expect(result.warnings.some(w => w.includes('position'))).toBe(true);
      });

      it('warns when node is missing name', () => {
        const workflow = {
          nodes: [
            {
              id: '1',
              type: 'n8n-nodes-base.webhook',
              position: [100, 100],
            },
          ],
        };
        const result = validate(workflow);
        expect(result.warnings.some(w => w.includes('name'))).toBe(true);
      });
    });

    describe('duplicate node names', () => {
      it('warns when duplicate node names exist', () => {
        const workflow = {
          nodes: [
            { id: '1', name: 'Duplicate', type: 'n8n-nodes-base.webhook' },
            { id: '2', name: 'Duplicate', type: 'n8n-nodes-base.set' },
          ],
        };
        const result = validate(workflow);
        expect(result.warnings).toContain('Duplicate node name: "Duplicate"');
      });

      it('does not warn for unique node names', () => {
        const workflow = {
          nodes: [
            { id: '1', name: 'Node1', type: 'n8n-nodes-base.webhook' },
            { id: '2', name: 'Node2', type: 'n8n-nodes-base.set' },
          ],
        };
        const result = validate(workflow);
        expect(result.warnings.some(w => w.includes('Duplicate'))).toBe(false);
      });
    });

    describe('connections validation', () => {
      it('warns when connections field is missing', () => {
        const workflow = {
          nodes: [{ id: '1', name: 'Node1', type: 'n8n-nodes-base.webhook' }],
        };
        const result = validate(workflow);
        expect(result.warnings).toContain(
          'Missing "connections" field — nodes will be disconnected'
        );
      });

      it('reports error when connections is not an object', () => {
        const workflow = {
          nodes: [{ id: '1', name: 'Node1', type: 'n8n-nodes-base.webhook' }],
          connections: 'invalid',
        };
        const result = validate(workflow);
        expect(result.errors).toContain('"connections" must be an object');
      });
    });
  });

  describe('normalize', () => {
    describe('numeric object to array conversion', () => {
      it('converts numeric-keyed object to array', () => {
        const workflow = {
          nodes: {
            '0': { id: '1', name: 'First', type: 'n8n-nodes-base.webhook' },
            '1': { id: '2', name: 'Second', type: 'n8n-nodes-base.set' },
          },
          connections: {},
        };

        const normalized = normalize(workflow);
        expect(Array.isArray(normalized.nodes)).toBe(true);
        expect(normalized.nodes.length).toBe(2);
        expect(normalized.nodes[0].name).toBe('First');
        expect(normalized.nodes[1].name).toBe('Second');
      });

      it('preserves array nodes', () => {
        const workflow = {
          nodes: [
            { id: '1', name: 'Node1', type: 'n8n-nodes-base.webhook' },
          ],
          connections: {},
        };

        const normalized = normalize(workflow);
        expect(Array.isArray(normalized.nodes)).toBe(true);
        expect(normalized.nodes.length).toBe(1);
      });

      it('converts empty object nodes to empty array', () => {
        const workflow = { nodes: {}, connections: {} };
        const normalized = normalize(workflow);
        expect(normalized.nodes).toEqual([]);
      });
    });

    describe('missing node IDs', () => {
      it('generates IDs for nodes without them', () => {
        const workflow = {
          nodes: [
            { name: 'Node1', type: 'n8n-nodes-base.webhook' },
            { name: 'Node2', type: 'n8n-nodes-base.set' },
          ],
          connections: {},
        };

        const normalized = normalize(workflow);
        expect(normalized.nodes[0].id).toBeDefined();
        expect(normalized.nodes[1].id).toBeDefined();
        expect(normalized.nodes[0].id).not.toBe(normalized.nodes[1].id);
      });

      it('preserves existing node IDs', () => {
        const workflow = {
          nodes: [
            { id: 'existing-id', name: 'Node1', type: 'n8n-nodes-base.webhook' },
          ],
          connections: {},
        };

        const normalized = normalize(workflow);
        expect(normalized.nodes[0].id).toBe('existing-id');
      });
    });

    describe('missing node positions', () => {
      it('provides default position for nodes without position', () => {
        const workflow = {
          nodes: [
            { id: '1', name: 'Node1', type: 'n8n-nodes-base.webhook' },
          ],
          connections: {},
        };

        const normalized = normalize(workflow);
        expect(normalized.nodes[0].position).toEqual([800, 300]);
      });

      it('fixes position to array of numbers', () => {
        const workflow = {
          nodes: [
            {
              id: '1',
              name: 'Node1',
              type: 'n8n-nodes-base.webhook',
              position: ['100', '200'],
            },
          ],
          connections: {},
        };

        const normalized = normalize(workflow);
        expect(normalized.nodes[0].position).toEqual([100, 200]);
        expect(typeof normalized.nodes[0].position[0]).toBe('number');
      });

      it('fixes incomplete position arrays', () => {
        const workflow = {
          nodes: [
            { id: '1', name: 'Node1', type: 'n8n-nodes-base.webhook', position: [100] },
          ],
          connections: {},
        };

        const normalized = normalize(workflow);
        expect(normalized.nodes[0].position).toEqual([800, 300]);
      });
    });

    describe('node parameters', () => {
      it('ensures node has parameters object', () => {
        const workflow = {
          nodes: [
            { id: '1', name: 'Node1', type: 'n8n-nodes-base.webhook' },
          ],
          connections: {},
        };

        const normalized = normalize(workflow);
        expect(normalized.nodes[0].parameters).toBeDefined();
        expect(typeof normalized.nodes[0].parameters).toBe('object');
      });

      it('sets default typeVersion to 1', () => {
        const workflow = {
          nodes: [
            { id: '1', name: 'Node1', type: 'n8n-nodes-base.webhook' },
          ],
          connections: {},
        };

        const normalized = normalize(workflow);
        expect(normalized.nodes[0].typeVersion).toBe(1);
      });

      it('preserves existing typeVersion', () => {
        const workflow = {
          nodes: [
            {
              id: '1',
              name: 'Node1',
              type: 'n8n-nodes-base.webhook',
              typeVersion: 3,
            },
          ],
          connections: {},
        };

        const normalized = normalize(workflow);
        expect(normalized.nodes[0].typeVersion).toBe(3);
      });
    });

    describe('Set node parameter fix', () => {
      it('fixes Set node with old format (values array)', () => {
        const workflow = {
          nodes: [
            {
              id: '1',
              name: 'Set',
              type: 'n8n-nodes-base.set',
              parameters: {
                values: [
                  { name: 'var1', value: 'test1' },
                  { name: 'var2', value: 'test2' },
                ],
              },
            },
          ],
          connections: {},
        };

        const normalized = normalize(workflow);
        const params = normalized.nodes[0].parameters;

        expect(params.assignments).toBeDefined();
        expect(params.assignments.assignments).toBeDefined();
        expect(params.assignments.assignments.length).toBe(2);
        expect(params.assignments.assignments[0].name).toBe('var1');
        expect(params.assignments.assignments[0].id).toBeDefined();
      });

      it('handles Set node with already correct format', () => {
        const workflow = {
          nodes: [
            {
              id: '1',
              name: 'Set',
              type: 'n8n-nodes-base.set',
              parameters: {
                assignments: {
                  assignments: [
                    { id: 'uuid1', name: 'var1', value: 'test', type: 'string' },
                  ],
                },
              },
            },
          ],
          connections: {},
        };

        const normalized = normalize(workflow);
        const params = normalized.nodes[0].parameters;

        expect(params.assignments.assignments[0].id).toBe('uuid1');
        expect(params.assignments.assignments[0].name).toBe('var1');
      });

      it('generates IDs for Set node assignments without them', () => {
        const workflow = {
          nodes: [
            {
              id: '1',
              name: 'Set',
              type: 'n8n-nodes-base.set',
              parameters: {
                assignments: {
                  assignments: [
                    { name: 'var1', value: 'test', type: 'string' },
                  ],
                },
              },
            },
          ],
          connections: {},
        };

        const normalized = normalize(workflow);
        const assignments = normalized.nodes[0].parameters.assignments.assignments;

        expect(assignments[0].id).toBeDefined();
        expect(assignments[0].id.length).toBeGreaterThan(0);
      });
    });

    describe('IF node condition fix', () => {
      it('fixes IF node with correct format', () => {
        const workflow = {
          nodes: [
            {
              id: '1',
              name: 'If',
              type: 'n8n-nodes-base.if',
              parameters: {
                conditions: {
                  conditions: [
                    {
                      id: 'c1',
                      leftValue: 'value1',
                      rightValue: 'value2',
                      operator: { type: 'string', operation: 'equals' },
                    },
                  ],
                  options: { caseSensitive: true, leftValue: '' },
                  combinator: 'and',
                },
              },
            },
          ],
          connections: {},
        };

        const normalized = normalize(workflow);
        const params = normalized.nodes[0].parameters;

        expect(params.conditions.conditions[0].id).toBe('c1');
        expect(params.conditions.combinator).toBe('and');
      });

      it('generates IDs for IF node conditions without them', () => {
        const workflow = {
          nodes: [
            {
              id: '1',
              name: 'If',
              type: 'n8n-nodes-base.if',
              parameters: {
                conditions: {
                  conditions: [
                    {
                      leftValue: 'a',
                      rightValue: 'b',
                      operator: { type: 'string', operation: 'equals' },
                    },
                  ],
                },
              },
            },
          ],
          connections: {},
        };

        const normalized = normalize(workflow);
        const condition = normalized.nodes[0].parameters.conditions.conditions[0];

        expect(condition.id).toBeDefined();
      });

      it('adds missing options and combinator to IF node', () => {
        const workflow = {
          nodes: [
            {
              id: '1',
              name: 'If',
              type: 'n8n-nodes-base.if',
              parameters: {
                conditions: {
                  conditions: [
                    {
                      id: 'c1',
                      leftValue: 'x',
                      rightValue: 'y',
                      operator: { type: 'string', operation: 'equals' },
                    },
                  ],
                },
              },
            },
          ],
          connections: {},
        };

        const normalized = normalize(workflow);
        const cond = normalized.nodes[0].parameters.conditions;

        expect(cond.options).toBeDefined();
        expect(cond.combinator).toBe('and');
      });
    });

    describe('connections fix', () => {
      it('converts numeric connection objects to arrays', () => {
        const workflow = {
          nodes: [{ id: '1', name: 'Start', type: 'n8n-nodes-base.webhook' }],
          connections: {
            Start: {
              main: {
                '0': [{ node: 'Next', type: 'main', index: 0 }],
              },
            },
          },
        };

        const normalized = normalize(workflow);
        const conn = normalized.connections.Start.main;

        expect(Array.isArray(conn)).toBe(true);
        expect(Array.isArray(conn[0])).toBe(true);
      });

      it('ensures connection format is standardized', () => {
        const workflow = {
          nodes: [{ id: '1', name: 'A', type: 'n8n-nodes-base.webhook' }],
          connections: {
            A: {
              main: [[{ node: 'B' }]],
            },
          },
        };

        const normalized = normalize(workflow);
        const conn = normalized.connections.A.main[0][0];

        expect(conn.type).toBe('main');
        expect(conn.index).toBe(0);
      });
    });

    describe('workflow metadata', () => {
      it('ensures settings object exists', () => {
        const workflow = { nodes: [], connections: {} };
        const normalized = normalize(workflow);
        expect(normalized.settings).toBeDefined();
      });

      it('sets default executionOrder', () => {
        const workflow = { nodes: [], connections: {} };
        const normalized = normalize(workflow);
        expect(normalized.settings.executionOrder).toBe('v1');
      });

      it('preserves existing executionOrder', () => {
        const workflow = {
          nodes: [],
          connections: {},
          settings: { executionOrder: 'v2' },
        };
        const normalized = normalize(workflow);
        expect(normalized.settings.executionOrder).toBe('v2');
      });

      it('sets default name', () => {
        const workflow = { nodes: [], connections: {} };
        const normalized = normalize(workflow);
        expect(normalized.name).toBe('Generated Workflow');
      });

      it('preserves existing name', () => {
        const workflow = {
          nodes: [],
          connections: {},
          name: 'My Workflow',
        };
        const normalized = normalize(workflow);
        expect(normalized.name).toBe('My Workflow');
      });
    });

    describe('does not mutate original', () => {
      it('does not modify input workflow', () => {
        const workflow = {
          nodes: [
            { id: '1', name: 'Node1', type: 'n8n-nodes-base.webhook' },
          ],
          connections: {},
        };

        const original = JSON.parse(JSON.stringify(workflow));
        normalize(workflow);

        expect(workflow).toEqual(original);
      });
    });

    describe('complex workflow normalization', () => {
      it('normalizes a complex AI-generated workflow', () => {
        const workflow = {
          nodes: {
            '0': {
              name: 'Webhook',
              type: 'n8n-nodes-base.webhook',
              parameters: {
                path: 'test',
              },
            },
            '1': {
              name: 'Set Variables',
              type: 'n8n-nodes-base.set',
              parameters: {
                values: [{ name: 'result', value: 'success' }],
              },
            },
            '2': {
              name: 'Condition',
              type: 'n8n-nodes-base.if',
              parameters: {
                conditions: {
                  string: [
                    { value1: 'x', operation: 'equals', value2: 'y' },
                  ],
                },
              },
            },
          },
          connections: {
            Webhook: {
              main: {
                '0': [{ node: 'Set Variables' }],
              },
            },
          },
        };

        const normalized = normalize(workflow);

        // Should have all nodes as array
        expect(Array.isArray(normalized.nodes)).toBe(true);
        expect(normalized.nodes.length).toBe(3);

        // All nodes should have IDs and positions
        for (const node of normalized.nodes) {
          expect(node.id).toBeDefined();
          expect(node.position).toBeDefined();
        }

        // Set node should be fixed
        const setNode = normalized.nodes.find(n => n.type === 'n8n-nodes-base.set');
        expect(setNode.parameters.assignments).toBeDefined();

        // IF node should be fixed
        const ifNode = normalized.nodes.find(n => n.type === 'n8n-nodes-base.if');
        expect(ifNode.parameters.conditions.combinator).toBe('and');

        // Connections should be arrays
        expect(Array.isArray(normalized.connections.Webhook.main)).toBe(true);
      });
    });
  });
});
