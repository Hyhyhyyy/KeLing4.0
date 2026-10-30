const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { indexPages, parseMaterial, searchSpans, sha256 } = require('../src/learning/materials');
const { makeSchedule } = require('../src/learning/planner');
const { app } = require('../src/index');
const { prisma: db } = require('../src/database');
const jwt = require('jsonwebtoken');

test('material positions refer to immutable normalized UTF-16 text, including emoji and page gaps', async () => {
  const text = '# 树 🌱\r\n\r\n' + '甲'.repeat(1599) + '🌍乙\n第二行';
  const m = await parseMaterial({ title: '引用', format: 'MARKDOWN', text });
  assert.equal(m.content.includes('\r'), false);
  assert.equal(m.contentHash, sha256(m.content));
  for (const span of m.spans) {
    const slice = m.content.slice(span.startUtf16, span.endUtf16);
    assert.equal(sha256(slice), span.textHash);
    assert.equal(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(slice), false);
  }
  const pdf = indexPages(['第一页\n\n二段', '', '第三页'], 'PDF');
  assert.deepEqual(pdf.spans.map(s => s.page), [1, 1, 3]);
  assert.equal(pdf.content.slice(pdf.spans.at(-1).startUtf16), '第三页');
  await assert.rejects(() => parseMaterial({ title: '空', format: 'TEXT', text: '   ' }), /未读取到文字/);
  await assert.rejects(() => parseMaterial({ title: '伪造', format: 'PDF', pdfBase64: Buffer.from('not pdf').toString('base64') }), /文字 PDF/);
});

test('keyword retrieval cannot return a location absent from the supplied immutable material', () => {
  const indexed = indexPages(['队列先进先出\n\n栈后进先出'], 'TEXT');
  const materials = [{ id: 'v1', title: '数据结构', ...indexed, spans: indexed.spans.map((s, i) => ({ ...s, id: 's' + i })) }];
  const results = searchSpans(materials, '队列');
  assert.equal(results.length, 1); assert.equal(results[0].text, '队列先进先出');
  assert.equal(results[0].contentHash, indexed.contentHash);
  assert.deepEqual(searchSpans(materials, '火山'), []);
});

test('bounded PDF worker extracts real text and rejects an empty text layer', async () => {
  const parseCompiled = require('../dist/learning/materials').parseMaterial;
  const pdf = text => {
    const stream = text ? 'BT /F1 12 Tf 50 750 Td (' + text + ') Tj ET' : '';
    const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream'];
    let source = '%PDF-1.4\n'; const offsets = [0];
    objects.forEach((o, i) => { offsets.push(Buffer.byteLength(source)); source += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
    const xref = Buffer.byteLength(source);
    source += 'xref\n0 6\n0000000000 65535 f \n' + offsets.slice(1).map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
    source += 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
    return Buffer.from(source).toString('base64');
  };
  const material = await parseCompiled({ title: 'Original text fixture', format: 'PDF', pdfBase64: pdf('Binary tree queue') });
  assert.match(material.content, /Binary tree queue/);
  assert.equal(material.spans[0].page, 1);
  await assert.rejects(() => parseCompiled({ title: 'Empty layer', format: 'PDF', pdfBase64: pdf('') }), /未读取到文字/);
});

test('constraint schedule respects classes, locked tasks, rest, daily budget and exclusions without deleting anything', () => {
  const now = new Date('2026-10-30T00:00:00Z');
  const input = { startDate: '2026-10-30', examDate: '2026-11-01', dailyMinutes: 60, dayStart: '18:00', dayEnd: '21:00',
    rest: [{ start: '19:00', end: '19:30' }], excludedDates: ['2026-10-31'], units: Array.from({ length: 5 }, (_, i) => ({ title: '目标' + i, minutes: 25 })) };
  const tasks = [{ id: 'fixed', title: '原任务', estimatedMinutes: 30, scheduledAt: '2026-10-30T10:00:00Z', status: 'PENDING' }];
  const courses = [{ id: 'c', name: '课程', schedule: [{ dayOfWeek: 5, startHour: 18, startMinute: 30, durationMinutes: 30 }] }];
  const result = makeSchedule(input, tasks, courses, now);
  assert.equal(result.tasks[0].startTime, '19:30');
  assert.equal(result.tasks.length, 3); assert.equal(result.unallocated.length, 2);
  assert.equal(result.diff.changed, 0); assert.equal(result.diff.deleted, 0);
  assert.ok(result.days.every(d => d.existingMinutes + d.newMinutes <= input.dailyMinutes));
  assert.ok(result.tasks.every(t => t.date !== '2026-10-31'));
  assert.throws(() => makeSchedule({ ...input, dayEnd: '23:30' }, [], [], now), /06:00/);
  assert.throws(() => makeSchedule(input, [], [{ id: 'bad', name: '错误课表', schedule: 'malformed' }], now), /课表/);
});

test('real material persistence, version conflicts, ownership, map confirmation and schedule idempotency', async () => {
  const owner = randomUUID(), other = randomUUID();
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = 'http://127.0.0.1:' + server.address().port + '/api/learning/v1';
  const token = userId => jwt.sign({ userId }, process.env.JWT_SECRET, { algorithm: 'HS256', issuer: 'keling-server', audience: 'keling-clients' });
  const call = async (path, body, method = 'POST', who = owner) => {
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: 'Bearer ' + token(who) } : {}) }, body: method === 'GET' ? undefined : JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  try {
    for (const id of [owner, other]) await db.user.create({ data: { id, email: id + '@test.local', passwordHash: 'test' } });
    const course = await db.course.create({ data: { userId: owner, name: '数据结构', code: '', teacher: '' } });
    const path = '/courses/' + course.id;
    const raw = { title: '二叉树', format: 'MARKDOWN', text: '# 队列\n\n队列先进先出。\n\n# 栈\n\n栈后进先出。' };
    const anon = await call('/materials/parse', raw, 'POST', null);
    assert.equal(anon.status, 200); assert.ok(anon.body.spans.length);
    const input = { ...raw, opId: randomUUID() };
    const created = await call(path + '/materials', input);
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const v1 = created.body.material;
    assert.equal((await call(path + '/materials', input)).body.material.id, v1.id);
    assert.equal((await call(path + '/materials', { ...input, text: 'different' })).status, 409);
    assert.equal((await call('/materials/' + v1.id, null, 'GET', other)).status, 404);
    const draft = await call(path + '/map-draft', { query: '队列' });
    const candidates = draft.body.candidates.map(c => ({ title: c.title, description: c.description, materialVersionId: c.source.materialVersionId, spanId: c.source.spanId, contentHash: c.source.contentHash }));
    const confirm = { opId: randomUUID(), candidates };
    const mapped = await call(path + '/map-confirm', confirm);
    assert.equal(mapped.status, 200); assert.ok(mapped.body.nodes.length);
    assert.deepEqual((await call(path + '/map-confirm', confirm)).body.nodes, mapped.body.nodes);
    const update = { ...raw, opId: randomUUID(), materialId: v1.materialId, expectedVersionId: v1.id, text: raw.text + '\n\n新版补充' };
    const v2 = (await call(path + '/materials', update)).body.material;
    assert.equal(v2.version, 2); assert.equal(v2.supersedesId, v1.id);
    assert.equal((await call(path + '/materials', { ...update, opId: randomUUID() })).status, 409);
    assert.equal((await call(path + '/map-confirm', { ...confirm, opId: randomUUID() })).status, 409);
    assert.equal((await call('/materials/' + v1.id, null, 'GET')).body.material.content, raw.text);
    const date = new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10);
    const schedule = { startDate: date, examDate: date, dailyMinutes: 60, units: [{ title: '队列练习', minutes: 25 }] };
    assert.equal((await call('/schedule/preview', { request: schedule }, 'POST', null)).status, 200);
    const plan = await call(path + '/schedule', schedule);
    assert.equal(plan.status, 200, JSON.stringify(plan.body));
    const saved = await call('/schedule/' + plan.body.previewId + '/confirm', {});
    assert.equal(saved.status, 200); assert.equal(saved.body.taskIds.length, 1);
    assert.deepEqual((await call('/schedule/' + plan.body.previewId + '/confirm', {})).body.taskIds, saved.body.taskIds);
    assert.equal((await call('/schedule/' + plan.body.previewId + '/confirm', {}, 'POST', other)).status, 404);
    const stale = await call(path + '/schedule', schedule);
    await db.task.update({ where: { id: saved.body.taskIds[0] }, data: { estimatedMinutes: 35 } });
    assert.equal((await call('/schedule/' + stale.body.previewId + '/confirm', {})).status, 409);
    assert.equal((await call('/materials/' + v2.id, { opId: randomUUID() }, 'DELETE')).status, 200);
    assert.equal((await call(path + '/materials', null, 'GET')).body.materials.length, 0);
    assert.ok((await call('/materials/' + v1.id, null, 'GET')).body.material.deletedAt);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await db.sourceSpan.deleteMany({ where: { materialVersion: { userId: owner } } });
    await db.materialVersion.deleteMany({ where: { userId: owner } });
    await db.expeditionOperation.deleteMany({ where: { userId: owner } });
    await db.user.deleteMany({ where: { id: { in: [owner, other] } } });
    await db.$disconnect();
  }
});
