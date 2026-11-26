const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { AgentService } = require('../src/agentarts/service');
const { today } = require('../src/agentarts/contract');
const { parseMaterial } = require('../src/learning/materials');
const { retrieve } = require('../src/ai/retrieval');

if (process.env.NODE_ENV !== 'test' || !/^file:.*keling-tests-/.test(process.env.DATABASE_URL || '')) {
  throw new Error('Run material AI tests only through the disposable SQLite test runner.');
}

async function fixture(work) {
  const db = new PrismaClient(), owner = randomUUID(), stranger = randomUUID();
  try {
    for (const id of [owner, stranger]) await db.user.create({ data: { id, email: id + '@material-ai.test', passwordHash: 'synthetic-only' } });
    const course = await db.course.create({ data: { userId: owner, name: '导入资料规划', code: '', teacher: '' } });
    const foreign = await db.course.create({ data: { userId: stranger, name: course.name, code: '', teacher: '' } });
    const save = async (text, previous, target = course, extra = {}) => {
      const parsed = await parseMaterial({ title: '队列讲义', format: 'TEXT', text });
      const { warnings, spans, ...data } = parsed;
      return db.materialVersion.create({ data: { ...data, userId: target.userId, courseId: target.id,
        materialId: previous?.materialId || randomUUID(), version: (previous?.version || 0) + 1,
        supersedesId: previous?.id, spans: { create: spans }, ...extra }, include: { spans: true } });
    };
    await work({ db, owner, stranger, course, foreign, save });
  } finally {
    await db.agentRun.deleteMany({ where: { userId: { in: [owner, stranger] } } });
    await db.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
    await db.$disconnect();
  }
}

test('an imported-only course can produce and confirm a scoped plan, with simultaneous confirmations creating tasks once', async () => fixture(async ({ db, owner, course, foreign, save }) => {
  const material = await save('队列先进先出，层序遍历按层访问节点。');
  await save('队列 OTHER_ACCOUNT_PRIVATE', null, foreign);
  let calls = 0, svc;
  svc = new AgentService(db, async input => {
    calls++;
    const context = await svc.tool(input.runId, input.toolToken, input.goal);
    assert.equal(context.sources.length, 1);
    assert.equal(context.sources[0].id, `material:${material.id}:${material.spans[0].id}`);
    assert.ok(!JSON.stringify(context).includes('OTHER_ACCOUNT_PRIVATE'));
    return JSON.stringify({ summary: '模拟生成，仅验证后端流程', tasks: [{ title: '队列练习', description: '依据上传讲义', date: today(), minutes: 20, sourceIds: [context.sources[0].id] }] });
  });
  const run = await svc.run(owner, { courseId: course.id, goal: '练习队列', examDate: today(), dailyMinutes: 30 });
  assert.equal(run.status, 'SUCCEEDED', run.error);
  assert.equal(await db.task.count({ where: { userId: owner } }), 0);
  for(let i=0;i<41;i++) await save('无关新资料 '+i);
  await Promise.all([svc.confirm(owner, run.id), svc.confirm(owner, run.id)]);
  assert.equal(await db.task.count({ where: { userId: owner } }), 1);
  assert.equal(calls, 1);
}));

test('replacing or removing a cited material prevents stale planning and confirmation', async () => fixture(async ({ db, owner, course, save }) => {
  let material = await save('队列旧版本。'), changeDuringGeneration = false, svc;
  svc = new AgentService(db, async input => {
    const context = await svc.tool(input.runId, input.toolToken, input.goal);
    if (changeDuringGeneration) material = await save('队列生成时更新版本。', material);
    return JSON.stringify({ summary: '模拟计划', tasks: [{ title: '队列练习', description: '', date: today(), minutes: 20, sourceIds: [context.sources[0].id] }] });
  });
  const input = { courseId: course.id, goal: '练习队列', examDate: today(), dailyMinutes: 30 };
  const first = await svc.run(owner, input);
  assert.equal(first.status, 'SUCCEEDED');
  material = await save('队列新版本。', material);
  await assert.rejects(() => svc.confirm(owner, first.id), /资料已更新或移除/);
  assert.equal(await db.task.count({ where: { userId: owner } }), 0);
  changeDuringGeneration = true;
  const stale = await svc.run(owner, input);
  assert.equal(stale.status, 'FAILED');
  assert.match(stale.error, /资料已更新或移除/);
  changeDuringGeneration = false;
  const current = await svc.run(owner, input);
  assert.equal(current.status, 'SUCCEEDED');
  await db.materialVersion.update({ where: { id: material.id }, data: { deletedAt: new Date() } });
  await assert.rejects(() => svc.confirm(owner, current.id), /资料已更新或移除/);
  await assert.rejects(() => svc.run(owner, input), /真实资料依据/);
  assert.equal(await db.task.count({ where: { userId: owner } }), 0);
}));

test('global assistant retrieval includes latest imported text and omits old, tombstoned, archived and foreign material', async () => fixture(async ({ db, owner, course, foreign, save }) => {
  const old = await save('队列 OLD_PRIVATE_TEXT');
  const latest = await save('队列 LATEST_TEXT', old);
  const deleted = await save('队列 DELETED_OLDER_TEXT');
  await save('队列 DELETED_CURRENT_TEXT', deleted, course, { deletedAt: new Date() });
  await save('队列 FOREIGN_TEXT', null, foreign);
  const result = await retrieve(db, owner, '队列', 'keyword');
  assert.equal(result.length, 1);
  assert.equal(result[0].kind, 'material');
  assert.equal(result[0].id, `material:${latest.id}:${latest.spans[0].id}`);
  assert.match(result[0].text, /LATEST_TEXT/);
  assert.ok(!JSON.stringify(result).includes('OLD_PRIVATE_TEXT'));
  assert.ok(!JSON.stringify(result).includes('DELETED_'));
  assert.ok(!JSON.stringify(result).includes('FOREIGN_TEXT'));
  await db.course.update({ where: { id: course.id }, data: { isArchived: true } });
  assert.deepEqual(await retrieve(db, owner, '队列', 'keyword'), []);
  await assert.rejects(() => new AgentService(db).run(owner, { courseId: course.id, goal: '队列', examDate: today(), dailyMinutes: 30 }), /课程不存在/);
}));
