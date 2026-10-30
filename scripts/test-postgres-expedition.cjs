// Run only against a newly created, expiring Neon test branch. Never loads .env.
const path = require('node:path'), assert = require('node:assert/strict'), { spawnSync } = require('node:child_process'), { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '..'), server = path.join(root, 'apps/server');
let url; try { url = new URL(process.env.DATABASE_URL || 'invalid:'); } catch { throw new Error('A valid temporary-branch connection is required.'); }
if (!process.env.KELING_TEST_BRANCH_NAME?.startsWith('test-expedition-') || !process.env.KELING_TEST_BRANCH_ID?.startsWith('br-') || !process.env.KELING_TEST_HOST || url.hostname !== process.env.KELING_TEST_HOST || url.hostname.includes('-pooler.') || !['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('An explicitly selected isolated test branch and its direct host are required.');
const redact = text => { let safe = String(text).replace(/postgres(?:ql)?:\/\/[^\s"']+/g, '[DATABASE_URL]'); for (const password of [url.password, decodeURIComponent(url.password)].filter(Boolean)) safe = safe.split(password).join('[PASSWORD]'); return safe; };
const cli = require.resolve('prisma/build/index.js', { paths: [server] });
process.env.NODE_ENV = 'test';
async function main() {
  const migration = spawnSync(process.execPath, [cli, 'migrate', 'deploy', '--schema', 'prisma/schema.postgresql.prisma'], { cwd: server, env: process.env, encoding: 'utf8', timeout: 120000 });
  if (migration.status !== 0 || migration.error) throw new Error('Isolated migration failed: ' + redact((migration.stderr || migration.stdout || '') + (migration.error?.message || '')));
  console.log('PostgreSQL migrations applied to the explicit temporary branch.');
  const { prisma: db } = require(path.join(server, 'dist/database.js'));
  const service = require(path.join(server, 'dist/expedition/service.js')), core = require('@keling/shared/expedition');
  const userId = randomUUID(), now = new Date();
  try {
    await db.user.create({ data: { id: userId, email: `expedition-fixture-${userId}@example.invalid`, passwordHash: 'NOT_A_LOGIN_CREDENTIAL', level: 2, exp: 13, energy: 71, crystals: 8 } });
    const course = await db.course.create({ data: { userId, name: '隔离PostgreSQL事务验证', code: 'FIXTURE', teacher: '自动化测试' } });
    const first = await service.getChapter(db, userId, course.id, now); assert.equal(first.account.legacy.crystals, 8);
    const started = await service.startRun(db, userId, { opId: randomUUID(), courseId: course.id, deviceId: 'postgres-test-web', questKind: 'EXPLORE', objectiveKey: 'bt.bfs.queue', mode: 'TRAINING' }, now);
    const exercise = core.CHAPTER.exercises.find(e => e.id === started.run.exerciseIds[0]);
    const submitted = await service.commandRun(db, userId, started.run.id, { opId: randomUUID(), expectedRevision: 0, writer: started.writer, action: { type: 'SUBMIT', answer: core.expectedAnswer(exercise) } }, now);
    const command = { opId: randomUUID(), expectedRevision: submitted.revision, writer: started.writer, action: { type: 'ACK_FEEDBACK', nextStep: '保留证据并预约回访' } };
    const results = await Promise.all([service.commandRun(db, userId, started.run.id, command, now), service.commandRun(db, userId, started.run.id, command, now)]);
    assert.equal(await db.rewardGrant.count({ where: { userId, kind: 'CYCLE' } }), 1); assert.equal(results[0].account.crystals, 10); assert.equal(results[1].account.crystals, 10); assert.equal(results[0].evidenceDelta[0].strict, false);
    const second = await service.startRun(db, userId, { opId: randomUUID(), courseId: course.id, deviceId: 'postgres-test-web', questKind: 'EXPLORE', objectiveKey: 'bt.dfs.stack', mode: 'TRAINING' }, now);
    const take = await service.leaseRun(db, userId, second.run.id, { opId: randomUUID(), expectedRevision: 0, deviceId: 'postgres-test-phone', intent: 'takeover' }, now);
    await assert.rejects(service.commandRun(db, userId, second.run.id, { opId: randomUUID(), expectedRevision: take.run.revision, writer: second.writer, action: { type: 'HINT' } }, now), e => e.code === 'WRITER_CHANGED');
    const report = { opId: randomUUID(), courseId: course.id, title: '隔离自述测试', durationMinutes: 7 };
    await Promise.all([service.selfReport(db, userId, report, now), service.selfReport(db, userId, { ...report, opId: randomUUID() }, now)]);
    assert.equal(await db.studyRecord.count({ where: { userId } }), 1); assert.equal((await db.user.findUnique({ where: { id: userId } })).totalStudyMinutes, 7);
    const account = (await service.rewards(db, userId, now)).account;
    const bought = await service.baseCommand(db, userId, { opId: randomUUID(), expectedRevision: account.revision, action: 'BUY', decorationId: 'antenna' }, now); assert.equal(bought.account.crystals, 4);
    assert.equal((await db.user.findUnique({ where: { id: userId } })).energy, 71);
    const stored = await db.expeditionOperation.findMany({ where: { userId } }); assert.ok(stored.every(x => !x.receipt.includes(started.writer.token) && !x.payload.includes(started.writer.token)));
    console.log(JSON.stringify({ migration: 'passed', engine: 'PostgreSQL', scenarios: ['legacy snapshot', 'source-linked loop', 'concurrent idempotent grant', 'device takeover', 'self-report deduplication', 'atomic purchase', 'token redaction'], syntheticUserId: userId, branchId: process.env.KELING_TEST_BRANCH_ID, cleanup: 'Synthetic fixtures remain only in the expiring test branch.' }));
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(redact(error.message)); process.exitCode = 1; });
