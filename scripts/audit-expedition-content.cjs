const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const sourceFile = path.join(root, 'packages/shared/src/expedition/chapter.json');
const hash = value => createHash('sha256').update(value).digest('hex');

// This oracle does not call the app's queue/stack or min/max traversal.
function independent(tree) {
  const nodes = new Map(tree.nodes.map(n => [n.id, n]));
  assert.equal(nodes.size, tree.nodes.length, 'duplicate node IDs');
  assert.equal(new Set(tree.nodes.map(n => n.value)).size, tree.nodes.length, 'this chapter requires distinct values');
  const parents = new Map(), levels = [], preorder = [], inorder = [], visited = new Set(), constraints = [];
  for (const n of nodes.values()) {
    assert.ok(Number.isFinite(n.value));
    for (const [side, child] of [['left', n.left], ['right', n.right]]) if (child !== null) {
      assert.ok(nodes.has(child), 'missing child'); assert.ok(!parents.has(child), 'shared child');
      parents.set(child, { id: n.id, side });
    }
  }
  assert.ok(nodes.has(tree.root)); assert.ok(!parents.has(tree.root), 'root has parent');
  function visit(id, depth) {
    if (id === null) return;
    assert.ok(!visited.has(id), 'cycle'); visited.add(id);
    const n = nodes.get(id); (levels[depth] ??= []).push(id); preorder.push(id);
    visit(n.left, depth + 1); inorder.push(id); visit(n.right, depth + 1);
  }
  visit(tree.root, 0); assert.equal(visited.size, nodes.size, 'unreachable node');
  for (const n of nodes.values()) {
    const checks = []; let child = n.id;
    while (parents.has(child)) {
      const p = parents.get(child), ancestor = nodes.get(p.id);
      checks.push({ ancestor: p.id, relation: p.side === 'left' ? '<' : '>', bound: ancestor.value,
        satisfied: p.side === 'left' ? n.value < ancestor.value : n.value > ancestor.value });
      child = p.id;
    }
    constraints.push({ node: n.id, value: n.value, checks, valid: checks.every(c => c.satisfied) });
  }
  const invalid = constraints.filter(c => !c.valid).map(c => c.node);
  const increasing = inorder.every((id, i) => !i || nodes.get(inorder[i - 1]).value < nodes.get(id).value);
  assert.equal(increasing, invalid.length === 0, 'inorder and ancestor checks disagree');
  return { bfs: levels.flat(), preorder, inorder, validBst: increasing, invalid, constraints };
}
function audit() {
  const bytes = fs.readFileSync(sourceFile), chapter = JSON.parse(bytes);
  const core = require(path.join(root, 'packages/shared/dist/expedition'));
  assert.deepEqual(core.CHAPTER, chapter, 'run node scripts/build-shared.cjs before auditing');
  assert.equal(chapter.objectives.length, 3); assert.equal(chapter.exercises.length, 18);
  assert.equal(new Set(chapter.exercises.map(e => e.id)).size, 18);
  const rows = chapter.exercises.map(e => {
    const x = independent(e.tree);
    const isBst = e.objectiveKey === 'bt.bst.bounds';
    const expected = isBst ? { validBst: x.validBst, order: x.invalid } :
      { order: e.objectiveKey === 'bt.bfs.queue' ? x.bfs : x.preorder, structure: e.objectiveKey === 'bt.bfs.queue' ? 'QUEUE' : 'STACK' };
    const appAnswer = core.expectedAnswer(e);
    if (isBst) { assert.equal(appAnswer.validBst, expected.validBst); assert.deepEqual([...appAnswer.order].sort(), [...expected.order].sort()); }
    else assert.deepEqual(appAnswer, expected);
    assert.equal(e.sourceParagraph, chapter.objectives.findIndex(o => o.key === e.objectiveKey));
    assert.equal(e.review.humanStatus, 'PENDING'); assert.equal(e.review.reviewer, null); assert.equal(e.review.reviewedAt, null);
    let checks;
    if (e.template === 'TEACH_COMPANION') {
      const result = core.evaluate(e, { explanation: '此文本仅用于验证讲解保存后的反馈类型，不代表知识正确。' });
      assert.equal(result.kind, 'SELF_REPORTED'); assert.equal(result.correct, null); assert.equal(result.independentEligible, false);
      assert.deepEqual(result.rubric, e.rubric); checks = { selfReportNotAutoGraded: true };
    } else {
      const correct = core.evaluate(e, expected); assert.equal(correct.correct, true); assert.equal(correct.kind, 'RULE_CHECKED');
      assert.deepEqual(correct.rubric, e.rubric); assert.deepEqual(correct.expectedOrder, appAnswer.order);
      const wrongChoice = isBst ? { ...expected, validBst: !expected.validBst } : { ...expected, structure: expected.structure === 'QUEUE' ? 'STACK' : 'QUEUE' };
      assert.equal(core.evaluate(e, wrongChoice).correct, false);
      const wrongOrder = { ...expected, order: expected.order.length ? expected.order.slice(1) : [e.tree.root] };
      assert.equal(core.evaluate(e, wrongOrder).correct, false);
      checks = { correctAnswerAccepted: true, wrongChoiceRejected: true, wrongOrderRejected: true, feedbackMatchesRubric: true };
    }
    return { id: e.id, version: e.version, objective: e.objectiveKey, template: e.template, nodeCount: e.tree.nodes.length,
      expected, sourceParagraph: e.sourceParagraph, treeValid: true, canonicalMatches: true, checks,
      ...(isBst ? { inorder: x.inorder, ancestorChecks: x.constraints } : {}), humanStatus: e.review.humanStatus };
  });
  const explanation = chapter.exercises.find(e => e.id === 'bt-3-6');
  const original = independent(explanation.tree);
  assert.equal(original.validBst, true);
  const hypothetical = JSON.parse(JSON.stringify(explanation.tree)); hypothetical.nodes.find(n => n.id === 'E').value = 58;
  const changed = independent(hypothetical); assert.deepEqual(changed.invalid, ['E']);
  assert.deepEqual(original.constraints.find(n => n.node === 'E').checks.map(c => [c.ancestor, c.relation, c.bound]), [['B', '>', 23], ['A', '<', 54]]);
  const oldRun = core.createRun({ id: 'audit-old-version', courseId: 'synthetic', questKind: 'EXPLORE', mode: 'TRAINING', now: '2026-11-26T00:00:00Z', sources: [] }, core.createProgress());
  oldRun.run.contentVersion = '1.0.0';
  assert.throws(() => core.reduceCommand(oldRun.run, oldRun.progress, { type: 'HINT' }, { now: '2026-11-26T00:00:00Z', operationId: 'audit-only' }), e => e.code === 'CONTENT_STALE');
  return { date: new Date().toISOString(), contentVersion: chapter.version, contentSha256: hash(bytes),
    method: 'BFS by recursive depth buckets; preorder recursion; BST ancestor path constraints cross-checked with strictly increasing inorder. App canonical functions used only for comparison.',
    counts: { objectives: 3, exercises: 18, structurallyValid: rows.length, canonicalMatches: rows.length, ruleChecked: rows.filter(r => r.template === 'ROUTE_REPAIR').length, selfReported: rows.filter(r => r.template === 'TEACH_COMPANION').length, humanPending: rows.length },
    oldVersionBlocked: true, hypotheticalCounterexample: { exerciseId: explanation.id, originalE: 32, hypotheticalE: 58, bounds: [23, 54], invalidNodes: changed.invalid },
    limitations: ['Automated algorithm and AI-assisted wording audit; not independent human approval.', 'All human review fields remain pending.', 'Traversal practice/review variants can share topology; IDs alone do not prove learning transfer.'], exercises: rows };
}
module.exports = { independent, audit };
if (require.main === module) {
  const report = audit();
  const output = path.join(root, 'docs/validation/expedition-content-2026-11-26.json');
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ output: path.relative(root, output), ...report.counts, contentVersion: report.contentVersion }));
}
