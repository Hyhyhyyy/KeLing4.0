const { test } = require('node:test');
const assert = require('node:assert/strict');
const { audit, independent } = require('../../../scripts/audit-expedition-content.cjs');
test('all chapter answers match independent traversal and ancestor checks without changing human review', () => {
  const result = audit();
  assert.equal(result.counts.canonicalMatches, 18);
  assert.equal(result.oldVersionBlocked, true);
});
test('content oracle detects ancestor violations that parent-only comparisons miss', () => {
  const tree = { root: 'r', nodes: [
    { id: 'r', value: 10, left: 'l', right: 'q' },
    { id: 'l', value: 5, left: null, right: 'x' },
    { id: 'x', value: 12, left: null, right: null },
    { id: 'q', value: 20, left: null, right: null },
  ] };
  const result = independent(tree);
  assert.deepEqual(result.bfs, ['r', 'l', 'q', 'x']);
  assert.deepEqual(result.preorder, ['r', 'l', 'x', 'q']);
  assert.deepEqual(result.invalid, ['x']);
  tree.nodes.find(n => n.id === 'x').value = 7;
  assert.equal(independent(tree).validBst, true);
});
