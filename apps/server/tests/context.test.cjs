require('ts-node/register');
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');

// This suite writes synthetic fixtures only to the test runner's disposable SQLite.
if (process.env.NODE_ENV !== 'test' || !/^file:.*keling-tests-/.test(process.env.DATABASE_URL || '')) {
  throw new Error('Run context tests through scripts/test-server.cjs with its isolated SQLite database.');
}
const { prisma: db } = require('../src/database');
const { resolveContext, contextRefInput, contextTurnInput } = require('../src/ai/context');
const { AssistantService } = require('../src/ai/service');
const { assistantRouter } = require('../src/ai/routes');
const { AIError } = require('../src/ai/catalog');

after(() => db.$disconnect());

async function fixtures(run) {
  const owner = randomUUID(), stranger = randomUUID();
  try {
    for (const id of [owner, stranger]) {
      await db.user.create({ data: { id, email: `${id}@context.test`, passwordHash: 'synthetic-test-only' } });
    }
    const course = await db.course.create({ data: { userId: owner, name: '范围内课程', code: 'CTX', teacher: 'PRIVATE_TEACHER' } });
    const foreignCourse = await db.course.create({ data: { userId: stranger, name: '其他账户课程', code: 'OTHER', teacher: '' } });
    const note = await db.note.create({ data: { userId: owner, title: '递归学习笔记', content: '原始资料：递归需要终止条件。', sourceType: 'USER_CREATED' } });
    const task = await db.task.create({ data: { userId: owner, title: '练习递归', description: '解释终止条件并完成一道习题。', type: 'EXERCISE', estimatedMinutes: 25, courseId: course.id } });
    await run({ owner, stranger, course, foreignCourse, note, task });
  } finally {
    // AI records have no Prisma relation; clean them before the user's cascading records.
    await db.aiTurn.deleteMany({ where: { userId: { in: [owner, stranger] } } });
    await db.aiSession.deleteMany({ where: { userId: { in: [owner, stranger] } } });
    await db.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
  }
}

async function withTestModel(run) {
  const values = { AI_CUSTOM_BASE_URL: 'https://test.example/v1', AI_CUSTOM_API_KEY: 'synthetic-test-only', AI_CUSTOM_CHAT_MODELS: 'context-test' };
  const old = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  try { await run(); } finally {
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

const requestContext = preview => ({ ...preview.ref, fingerprint: preview.fingerprint });
test('broad keyword retrieval keeps source versions and failure snapshots before calling a model', async () => withTestModel(() => fixtures(async ({owner, note}) => {
  const retained = [];
  const service = new AssistantService(db, async () => { throw new AIError('PROVIDER_AUTH', 'Synthetic failure'); }, undefined, work => retained.push(work));
  const session = await service.create(owner, {providerId:'custom',modelId:'context-test',includeContext:true,retrievalMode:'keyword'});
  await service.start(owner,session.id,{message:'递归',clientRequestId:randomUUID()});
  await Promise.all(retained);
  const turn = (await service.get(owner,session.id)).turns[0];
  assert.equal(turn.status,'FAILED');
  const source=turn.sources.find(s=>s.id===note.id);
  assert.ok(source);assert.equal(source.updatedAt,note.updatedAt.toISOString());assert.equal(source.truncated,false);
}))) ;
const notFound = error => error.code === 'CONTEXT_NOT_FOUND' && error.status === 404;
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
async function bounded(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Test model did not enter its controlled gate')), 5000); })]);
  } finally { clearTimeout(timer); }
}

test('context references reject caller-supplied data and accept only the defined resource contract', () => {
  const ref = { kind: 'note', id: randomUUID() };
  assert.deepEqual(contextRefInput.parse(ref), ref);
  for (const value of [{ ...ref, userId: 'another-user' }, { ...ref, kind: 'url' }, { ...ref, text: 'injected source' }, { kind: 'note', id: '' }]) {
    assert.equal(contextRefInput.safeParse(value).success, false);
  }
  assert.equal(contextTurnInput.safeParse({ ...ref, fingerprint: 'a'.repeat(64) }).success, true);
  assert.equal(contextTurnInput.safeParse(ref).success, false);
  assert.equal(contextTurnInput.safeParse({ ...ref, fingerprint: 'not-a-version' }).success, false);
});

test('previews are model-independent, owned, and conceal missing or inaccessible resource identities', async () => fixtures(async ({ owner, stranger, course, note, task }) => {
  for (const [kind, row] of [['course', course], ['note', note], ['task', task]]) {
    const ref = { kind, id: row.id };
    const result = await resolveContext(db, owner, ref);
    assert.deepEqual(result.ref, ref);
    assert.match(result.fingerprint, /^[a-f0-9]{64}$/);
    assert.equal(result.title, row.name || row.title);
    assert.ok(result.sources.length > 0);
    for (const source of result.sources) {
      assert.ok(Number.isFinite(Date.parse(source.updatedAt)));
      assert.equal(typeof source.truncated, 'boolean');
    }
    assert.equal((await resolveContext(db, owner, ref)).fingerprint, result.fingerprint);
    await assert.rejects(() => resolveContext(db, stranger, ref), notFound);
    await assert.rejects(() => resolveContext(db, owner, { kind, id: randomUUID() }), notFound);
    assert.ok(!JSON.stringify(result).includes('PRIVATE_TEACHER'));
    assert.ok(!JSON.stringify(result).includes('@context.test'));
  }
  await db.course.update({ where: { id: course.id }, data: { isArchived: true } });
  await assert.rejects(() => resolveContext(db, owner, { kind: 'course', id: course.id }), notFound);
}));

test('previews disclose bounded excerpts and restrict course material to its six newest knowledge nodes', async () => fixtures(async ({ owner, course, foreignCourse, note, task }) => {
  const longNote = 'n'.repeat(6000) + 'NOTE_TAIL_NOT_IN_PREVIEW';
  await db.note.update({ where: { id: note.id }, data: { content: longNote } });
  const notePreview = await resolveContext(db, owner, { kind: 'note', id: note.id });
  assert.equal(notePreview.sources.find(source => source.kind === 'note').text, longNote.slice(0, 6000));
  assert.equal(notePreview.sources.find(source => source.kind === 'note').truncated, true);
  assert.ok(notePreview.warnings.length > 0);

  await db.task.update({ where: { id: task.id }, data: { description: 't'.repeat(4000) + 'TASK_TAIL_NOT_IN_PREVIEW' } });
  const taskPreview = await resolveContext(db, owner, { kind: 'task', id: task.id });
  assert.ok(taskPreview.sources.some(source => source.kind === 'task' && source.truncated));
  assert.ok(taskPreview.warnings.length > 0);
  assert.ok(taskPreview.sources.some(source => source.text.includes('t'.repeat(4000))));
  assert.ok(taskPreview.sources.some(source => source.text.includes('25')));
  assert.ok(!JSON.stringify(taskPreview).includes('TASK_TAIL_NOT_IN_PREVIEW'));

  const ids = [];
  for (let i = 0; i < 8; i++) {
    const row = await db.knowledgeNode.create({ data: { courseId: course.id, name: `知识点 ${i}`, description: `node-${i}:` + 'k'.repeat(1200), updatedAt: new Date(Date.UTC(2026, 9, i + 1)) } });
    ids.push(row.id);
  }
  await db.knowledgeNode.create({ data: { courseId: foreignCourse.id, name: 'FOREIGN_NODE', description: 'OTHER_ACCOUNT_PRIVATE', updatedAt: new Date('2026-11-01T00:00:00Z') } });
  const unselectedCourse = await db.course.create({ data: { userId: owner, name: '未选课程', code: 'UNSELECTED', teacher: '' } });
  await db.knowledgeNode.create({ data: { courseId: unselectedCourse.id, name: 'UNSELECTED_NODE', description: 'OUTSIDE_SELECTED_COURSE', updatedAt: new Date('2026-11-02T00:00:00Z') } });
  const coursePreview = await resolveContext(db, owner, { kind: 'course', id: course.id });
  const knowledge = coursePreview.sources.filter(source => source.kind === 'knowledge');
  assert.deepEqual(knowledge.map(source => source.id), ids.slice(2).reverse());
  assert.ok(knowledge.every(source => source.text.length === 1000 && source.truncated));
  assert.ok(coursePreview.sources.some(source => source.kind === 'course'));
  assert.ok(coursePreview.warnings.length > 0);
  assert.ok(!JSON.stringify(coursePreview).includes('OTHER_ACCOUNT_PRIVATE'));
  assert.ok(!JSON.stringify(coursePreview).includes('OUTSIDE_SELECTED_COURSE'));
  await db.knowledgeNode.updateMany({ where: { courseId: course.id }, data: { description: '短知识点摘录' } });
  const selectionOnlyPreview = await resolveContext(db, owner, { kind: 'course', id: course.id });
  assert.ok(selectionOnlyPreview.sources.every(source => !source.truncated));
  assert.ok(selectionOnlyPreview.warnings.length > 0, 'The six-node limit must be disclosed even without text truncation');
}));

test('turn submission independently rejects foreign, missing, and archived contexts before generation', async () => withTestModel(() => fixtures(async ({ owner, stranger, course, note }) => {
  let calls = 0;
  const retained = [];
  const service = new AssistantService(db, async () => { calls++; return { content: 'should not run', usage: {} }; }, undefined, work => retained.push(work));
  const ownerSession = await service.create(owner, { providerId: 'custom', modelId: 'context-test' });
  const strangerSession = await service.create(stranger, { providerId: 'custom', modelId: 'context-test' });
  const notePreview = await resolveContext(db, owner, { kind: 'note', id: note.id });
  const coursePreview = await resolveContext(db, owner, { kind: 'course', id: course.id });
  const send = (userId, sessionId, context) => service.start(userId, sessionId, { message: '解释资料', clientRequestId: randomUUID(), context });
  await assert.rejects(() => send(stranger, strangerSession.id, requestContext(notePreview)), notFound);
  await assert.rejects(() => send(owner, ownerSession.id, { kind: 'note', id: randomUUID(), fingerprint: notePreview.fingerprint }), notFound);
  await db.course.update({ where: { id: course.id }, data: { isArchived: true } });
  await assert.rejects(() => send(owner, ownerSession.id, requestContext(coursePreview)), notFound);
  assert.equal(calls, 0);
  assert.equal(retained.length, 0);
  assert.equal(await db.aiTurn.count({ where: { sessionId: { in: [ownerSession.id, strangerSession.id] } } }), 0);
})));

test('a changed preview fails before creating a turn or invoking a model', async () => withTestModel(() => fixtures(async ({ owner, note }) => {
  let calls = 0;
  const retained = [];
  const service = new AssistantService(db, async () => { calls++; return { content: 'should not run', usage: {} }; }, undefined, work => retained.push(work));
  const session = await service.create(owner, { providerId: 'custom', modelId: 'context-test' });
  const preview = await resolveContext(db, owner, { kind: 'note', id: note.id });
  await db.note.update({ where: { id: note.id }, data: { content: '改版后的资料内容。' } });
  const changed = await resolveContext(db, owner, preview.ref);
  assert.notEqual(changed.fingerprint, preview.fingerprint);
  await assert.rejects(() => service.start(owner, session.id, { message: '解释当前资料', clientRequestId: randomUUID(), context: requestContext(preview) }), error => error.code === 'CONTEXT_CHANGED' && error.status === 409);
  assert.equal(calls, 0);
  assert.equal(retained.length, 0);
  assert.equal(await db.aiTurn.count({ where: { sessionId: session.id } }), 0);
  assert.equal((await service.get(owner, session.id)).session.activeRequestId, '');
})));

test('explicit context overrides broad retrieval, binds idempotency, and preserves the accepted source through edits and note saves', async () => withTestModel(() => fixtures(async ({ owner, stranger, note, task }) => {
  const gate = deferred(), entered = deferred();
  let calls = 0, retrievalCalls = 0, messages;
  const retained = [];
  const service = new AssistantService(db, async (_provider, _model, input) => {
    calls++; messages = input; entered.resolve(); await gate.promise;
    return { content: '根据资料，递归需要终止条件。[资料1]', usage: { inputTokens: 12, outputTokens: 6 } };
  }, async () => { retrievalCalls++; throw new Error('Broad retrieval must not run for explicit context'); }, work => retained.push(work));
  try {
    const preview = await resolveContext(db, owner, { kind: 'note', id: note.id });
    const taskPreview = await resolveContext(db, owner, { kind: 'task', id: task.id });
    const session = await service.create(owner, { providerId: 'custom', modelId: 'context-test', includeContext: true });
    const request = { message: '用例子解释终止条件', clientRequestId: randomUUID(), context: requestContext(preview) };
    const receipt = await service.start(owner, session.id, request);
    await bounded(entered.promise);
    const running = await service.get(owner, session.id);
    assert.equal(running.turns[0].status, 'RUNNING');
    assert.deepEqual(running.turns[0].sources, preview.sources);
    assert.equal(retrievalCalls, 0);
    assert.ok(messages.at(-1).content.includes(note.content));
    assert.ok(!messages.at(-1).content.includes(task.description));
    await assert.rejects(() => service.get(stranger, session.id), error => error.status === 404);

    await db.note.update({ where: { id: note.id }, data: { content: '这是提交后才发生的修订，不应进入原请求。' } });
    assert.equal((await service.start(owner, session.id, request)).id, receipt.id);
    // JSON field order is not request identity; schema parsing should canonicalize it.
    const reordered = { context: { fingerprint: request.context.fingerprint, id: request.context.id, kind: request.context.kind }, clientRequestId: request.clientRequestId, message: request.message };
    assert.equal((await service.start(owner, session.id, reordered)).id, receipt.id);
    await assert.rejects(() => service.start(owner, session.id, { ...request, context: requestContext(taskPreview) }), error => error.code === 'IDEMPOTENCY_CONFLICT');
    await assert.rejects(() => service.start(owner, session.id, { message: request.message, clientRequestId: request.clientRequestId }), error => error.code === 'IDEMPOTENCY_CONFLICT');
    // A literal JSON suffix in a plain message must not collide with structured context.
    await assert.rejects(() => service.start(owner, session.id, { message: request.message + '\n' + JSON.stringify(request.context), clientRequestId: request.clientRequestId }), error => error.code === 'IDEMPOTENCY_CONFLICT');
    assert.equal(calls, 1);
    assert.equal(retained.length, 1);
    gate.resolve(); await retained[0];
    const completed = await service.get(owner, session.id);
    assert.equal(completed.turns[0].status, 'SUCCEEDED');
    assert.deepEqual(completed.turns[0].sources, preview.sources);
    const saved = await service.saveNote(owner, receipt.id);
    assert.ok(saved.content.includes(completed.turns[0].assistantText));
    assert.ok(saved.content.includes(note.title));
    assert.ok(saved.content.includes(note.content));
    assert.ok(saved.content.includes(preview.sources[0].updatedAt));
    assert.equal((await service.saveNote(owner, receipt.id)).id, saved.id);
    await assert.rejects(() => service.saveNote(stranger, receipt.id), error => error.status === 404);
  } finally { gate.resolve(); await Promise.allSettled(retained); }
})));

test('failed and cancelled turns keep accepted source snapshots and cannot become saved AI notes', async () => withTestModel(() => fixtures(async ({ owner, note }) => {
  const preview = await resolveContext(db, owner, { kind: 'note', id: note.id });
  const failedWork = [];
  const failing = new AssistantService(db, async () => { throw new AIError('PROVIDER_AUTH', 'Synthetic provider failure', 502); }, undefined, work => failedWork.push(work));
  const failedSession = await failing.create(owner, { providerId: 'custom', modelId: 'context-test' });
  const failed = await failing.start(owner, failedSession.id, { message: '失败路径', clientRequestId: randomUUID(), context: requestContext(preview) });
  await Promise.all(failedWork);
  const failedTurn = (await failing.get(owner, failedSession.id)).turns[0];
  assert.equal(failedTurn.status, 'FAILED');
  assert.deepEqual(failedTurn.sources, preview.sources);
  await assert.rejects(() => failing.saveNote(owner, failed.id), error => error.status === 404);

  const gate = deferred(), entered = deferred(), work = [];
  const service = new AssistantService(db, async () => { entered.resolve(); await gate.promise; return { content: 'Too late', usage: {} }; }, undefined, task => work.push(task));
  try {
    const session = await service.create(owner, { providerId: 'custom', modelId: 'context-test' });
    const receipt = await service.start(owner, session.id, { message: '取消路径', clientRequestId: randomUUID(), context: requestContext(preview) });
    await bounded(entered.promise);
    await service.cancel(owner, session.id);
    gate.resolve(); await Promise.all(work);
    const result = await service.get(owner, session.id);
    assert.equal(result.turns[0].status, 'CANCELLED');
    assert.equal(result.session.activeRequestId, '');
    assert.deepEqual(result.turns[0].sources, preview.sources);
    await assert.rejects(() => service.saveNote(owner, receipt.id), error => error.status === 404);
  } finally { gate.resolve(); await Promise.allSettled(work); }
})));

test('context preview HTTP route requires authentication, disables caching, and uses indistinguishable 404 responses', async () => fixtures(async ({ owner, stranger, note }) => {
  const app = express(); app.use(express.json()); app.use('/api/ai', assistantRouter(db));
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const url = `http://127.0.0.1:${server.address().port}/api/ai/context-preview`;
  const call = (body, userId) => fetch(url, { method: 'POST', headers: {
    'Content-Type': 'application/json',
    ...(userId ? { Authorization: 'Bearer ' + jwt.sign({ userId }, process.env.JWT_SECRET, { algorithm: 'HS256', issuer: 'keling-server', audience: 'keling-clients' }) } : {}),
  }, body: JSON.stringify(body) });
  try {
    assert.equal((await call({ kind: 'note', id: note.id })).status, 401);
    const response = await call({ kind: 'note', id: note.id }, owner);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.equal((await response.json()).title, note.title);
    const inaccessible = await call({ kind: 'note', id: note.id }, stranger);
    const missing = await call({ kind: 'note', id: randomUUID() }, stranger);
    assert.equal(inaccessible.status, 404); assert.equal(missing.status, 404);
    assert.deepEqual(await inaccessible.json(), await missing.json());
    assert.equal((await call({ kind: 'note', id: note.id, userId: stranger }, owner)).status, 400);
    assert.equal((await call({ kind: 'url', id: 'https://private.invalid' }, owner)).status, 400);
  } finally { await new Promise(resolve => server.close(resolve)); }
}));
