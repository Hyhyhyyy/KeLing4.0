require('ts-node/register');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

if (process.env.NODE_ENV !== 'test' || !/^file:.*keling-tests-/.test(process.env.DATABASE_URL || '')) {
  throw new Error('Run inline tests through scripts/test-server.cjs with disposable SQLite.');
}
const { PrismaClient } = require('@prisma/client');
const { AgentService } = require('../src/agentarts/service');
const { today } = require('../src/agentarts/contract');
const { runtimeConfigured } = require('../src/agentarts/runtime');
const { planningProvider } = require('../src/agentarts/deepseek');

test('inline retrieves scoped real records, sends review status and confirms only once', async () => {
  const db = new PrismaClient();
  const owner = randomUUID(), stranger = randomUUID();
  const values = { PLANNING_PROVIDER: 'agentarts', AGENTARTS_CONTEXT_MODE: 'inline', AGENTARTS_RUNTIME_URL: 'https://runtime.example.test/invocations', AGENTARTS_API_KEY: 'synthetic-inline-key', AGENTARTS_TOOL_SECRET: '', AGENTARTS_RUNTIME_KIND: 'workflow' };
  const saved = Object.fromEntries(Object.keys(values).map(k => [k, process.env[k]]));
  const originalFetch = global.fetch;
  Object.assign(process.env, values);
  let requests = 0, outputSource;
  try {
    assert.equal(runtimeConfigured(), true);
    assert.equal(planningProvider(), 'AgentArts');
    for (const id of [owner, stranger]) await db.user.create({ data: { id, email: `${id}@inline.test`, passwordHash: 'synthetic-only' } });
    const course = await db.course.create({ data: { userId: owner, name: '内联数据结构', code: 'INLINE', teacher: '' } });
    const other = await db.course.create({ data: { userId: owner, name: '其他课程', code: 'OTHER', teacher: '' } });
    const foreign = await db.course.create({ data: { userId: stranger, name: course.name, code: 'FOREIGN', teacher: '' } });
    const node = await db.knowledgeNode.create({ data: { courseId: course.id, name: '二叉树', description: '前序、中序和后序' } });
    await db.knowledgeNode.create({ data: { courseId: foreign.id, name: '禁止读取', description: 'STRANGER_SECRET' } });
    await db.knowledgeNode.create({ data: { courseId: other.id, name: '禁止读取', description: 'OTHER_COURSE_SECRET' } });
    const note = await db.note.create({ data: { userId: owner, title: '独特的遍历笔记', content: 'INLINE_NOTE_MARKER', sourceType: 'USER_CREATED', relatedNodeIds: JSON.stringify([node.id]) } });
    await db.note.create({ data: { userId: stranger, title: course.name, content: 'STRANGER_NOTE_SECRET', sourceType: 'USER_CREATED' } });
    await db.task.create({ data: { userId: owner, courseId: other.id, title: 'OTHER_TASK_SECRET', description: 'Other course fixture', type: 'EXERCISE' } });
    outputSource = 'note:' + note.id;
    global.fetch = async (url, options) => {
      requests++;
      assert.equal(String(url), values.AGENTARTS_RUNTIME_URL);
      assert.equal(options.headers.Authorization, 'Bearer synthetic-inline-key');
      const { inputs } = JSON.parse(options.body);
      assert.equal(inputs.courseId, course.id);
      assert.equal(inputs.courseName, course.name);
      assert.equal(inputs.query, inputs.goal);
      assert.equal(inputs.dailyMinutes, 30);
      assert.equal(inputs.toolToken, undefined);
      assert.equal(typeof inputs.context, 'string');
      const context = JSON.parse(inputs.context);
      assert.ok(context.sources.some(s => s.id === 'note:' + note.id && s.text === 'INLINE_NOTE_MARKER'));
      assert.ok(context.sources.some(s => s.id === 'kg:' + node.id));
      assert.ok(!inputs.context.includes('SECRET'));
      if (inputs.mode === 'review') assert.ok(context.tasks.some(t => t.title === '遍历练习' && t.status === 'COMPLETED' && t.actualMinutes === 25));
      else assert.deepEqual(context.tasks, []);
      const plan = { summary: '模拟响应用于验证接入，不是模型效果证据', tasks: [{ title: '遍历练习', description: '使用已检索笔记', date: inputs.startDate, minutes: 30, sourceIds: [outputSource] }] };
      return new Response('data: ' + JSON.stringify({ event: 'summary_response', content: JSON.stringify(plan) }) + '\n\ndata: {"event":"end"}\n\n');
    };
    const svc = new AgentService(db);
    const input = { courseId: course.id, goal: '复习二叉树', examDate: today(), dailyMinutes: 30, mode: 'plan' };
    const plan = await svc.run(owner, input);
    assert.equal(plan.status, 'SUCCEEDED', plan.error);
    assert.ok(plan.events.some(e => e.status === 'sources_retrieved' && e.sourceIds.includes('note:' + note.id)));
    assert.equal(await db.task.count({ where: { userId: owner, courseId: course.id } }), 0);
    await assert.rejects(() => svc.confirm(stranger, plan.id));
    await svc.confirm(owner, plan.id);
    await svc.confirm(owner, plan.id);
    assert.equal(await db.task.count({ where: { userId: owner, courseId: course.id } }), 1);
    await db.task.updateMany({ where: { userId: owner, courseId: course.id }, data: { status: 'COMPLETED', actualMinutes: 25 } });
    const review = await svc.run(owner, { ...input, mode: 'review' });
    assert.equal(review.status, 'SUCCEEDED', review.error);
    assert.equal(requests, 2);
    outputSource = 'note:invented';
    const invalid = await svc.run(owner, { ...input, mode: 'review' });
    assert.equal(invalid.status, 'FAILED');
    await assert.rejects(() => svc.confirm(owner, invalid.id));
    assert.equal(await db.task.count({ where: { userId: owner, courseId: course.id } }), 1);
    const empty = await db.course.create({ data: { userId: owner, name: '空白无资料', code: 'EMPTY', teacher: '' } });
    await assert.rejects(() => svc.run(owner, { ...input, courseId: empty.id }), /真实资料依据/);
    assert.equal(requests, 3, 'empty course must not call the runtime');
    assert.equal(await db.task.count({ where: { userId: owner, courseId: empty.id } }), 0);
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await db.agentRun.deleteMany({ where: { userId: { in: [owner, stranger] } } });
    await db.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
    await db.$disconnect();
  }
});
