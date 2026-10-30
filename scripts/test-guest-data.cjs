// Pure-memory contract checks: no browser, database, or provider credentials are used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, after } = require('node:test');
const root = path.resolve(__dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'keling-guest-data-'));
const bundle = path.join(temporary, 'guest-data.cjs');
require('esbuild').buildSync({
  stdin: { contents: "export * from './apps/web/src/services/guestData'; export * from './apps/web/src/services/guestSession';", resolveDir: root },
  bundle: true, platform: 'node', format: 'cjs', target: 'node22', outfile: bundle,
});
const { handleGuestData: request, getGuestWorkspace, startGuestSession, endGuestSession } = require(bundle);
after(() => fs.rmSync(temporary, { recursive: true, force: true }));
const fresh = () => { endGuestSession(); return startGuestSession(); };
const failure = status => error => error.response?.status === status;

test('new visitor identity contains explicit samples, zero learning records, and no prior session data', async () => {
  const previous = fresh();
  const { user } = await request('GET', '/auth/me');
  assert.equal(user.totalStudyMinutes, 0); assert.equal(user.energy, 0);
  assert.equal((await request('GET', '/tasks')).tasks.length, 0);
  assert.equal((await request('GET', '/notes')).notes.length, 0);
  assert.match((await request('GET', '/courses')).courses[0].name, /^示例/);
  await request('POST', '/notes', { title: 'temporary', content: 'must disappear' });
  endGuestSession();
  assert.throws(() => getGuestWorkspace(), failure(401));
  const next = startGuestSession(); assert.notEqual(next, previous);
  assert.equal((await request('GET', '/notes')).notes.length, 0);
  assert.equal((await request('GET', '/auth/me')).user.id, next);
});

test('API results are detached copies; profile updates cannot forge reward fields', async () => {
  fresh();
  const response = await request('GET', '/courses'); response.courses[0].name = 'changed externally';
  assert.notEqual((await request('GET', '/courses')).courses[0].name, 'changed externally');
  await assert.rejects(request('PUT', '/user/profile', { energy: 99999 }), failure(400));
  await assert.rejects(request('POST', '/user/energy', { amount: 99999 }), failure(410));
  await assert.rejects(request('PUT', '/user/profile', { name: 'partial change', weeklyStudyGoal: -1 }), failure(400));
  assert.equal((await request('GET', '/auth/me')).user.name, '游客探索者');
  await request('PUT', '/user/profile', { name: '本次昵称', avatarUrl: 'stellar:avatar-8', weeklyStudyGoal: 180 });
  assert.equal((await request('GET', '/user/profile')).user.name, '本次昵称');
});

test('task completion records actual minutes once, balances once, and rejects reopening', async () => {
  fresh();
  const course = (await request('GET', '/courses')).courses[0];
  const { task } = await request('POST', '/tasks', { title: '练习', courseId: course.id, estimatedMinutes: 25, rewards: { energy: 999999 } });
  const responses = await Promise.all([request('POST', `/tasks/${task.id}/complete`, { actualMinutes: 7 }), request('POST', `/tasks/${task.id}/complete`, { actualMinutes: 9 })]);
  assert.equal(responses.filter(r => r.alreadyCompleted).length, 1);
  const { user } = await request('GET', '/auth/me');
  assert.equal(user.totalStudyMinutes, 7); assert.equal(user.energy, 20);
  assert.equal((await request('GET', `/courses/${course.id}`)).course.totalStudyMinutes, 7);
  assert.equal((await request('GET', '/tasks')).tasks[0].actualMinutes, 7);
  await assert.rejects(request('PUT', `/tasks/${task.id}`, { status: 'PENDING' }), failure(409));
  const achievements = (await request('GET', '/achievements/user')).achievements;
  assert.equal(achievements.find(a => a.achievementId === 'first_task').isUnlocked, true);
});

test('invalid completion and invalid task links never partially update state', async () => {
  fresh();
  const { task } = await request('POST', '/tasks', { title: '正常任务' });
  await assert.rejects(request('POST', `/tasks/${task.id}/complete`, { actualMinutes: -2 }), failure(400));
  assert.equal((await request('GET', `/tasks/${task.id}`)).task.status, 'PENDING');
  await assert.rejects(request('POST', '/tasks', { title: '不存在课程', courseId: 'invalid' }), failure(404));
  await assert.rejects(request('PUT', `/tasks/${task.id}`, { title: '不要部分保存', priority: 99 }), failure(400));
  assert.equal((await request('GET', `/tasks/${task.id}`)).task.title, '正常任务');
  await request('PUT', `/tasks/${task.id}`, { status: 'ABANDONED' });
  await assert.rejects(request('POST', `/tasks/${task.id}/complete`), failure(409));
  assert.equal((await request('GET', '/auth/me')).user.totalStudyMinutes, 0);
});

test('notes use strictly advancing versions and reject stale saves without replacing draft', async () => {
  fresh();
  const first = (await request('POST', '/notes', { title: '原始', content: '原文', tags: ['数学'] })).note;
  const updated = (await request('PUT', `/notes/${first.id}`, { content: '最新正文', expectedUpdatedAt: first.updatedAt })).note;
  assert.ok(Date.parse(updated.updatedAt) > Date.parse(first.updatedAt));
  await assert.rejects(request('PUT', `/notes/${first.id}`, { content: '过期覆盖', expectedUpdatedAt: first.updatedAt }), failure(409));
  assert.equal((await request('GET', '/notes')).notes[0].content, '最新正文');
  await assert.rejects(request('PUT', `/notes/${first.id}`, { title: '不应保存', content: '' }), failure(400));
  assert.equal((await request('GET', '/notes')).notes[0].title, '原始');
});

test('knowledge batch relationships are validated atomically and parent edits prevent cycles', async () => {
  fresh();
  const { course } = await request('POST', '/courses', { name: '关系课程' });
  const path = `/knowledge/${course.id}/nodes`;
  await assert.rejects(request('POST', path + '/batch', { nodes: [{ name: 'A', parentNames: ['B'] }, { name: 'B', parentNames: ['A'] }] }), failure(400));
  assert.equal((await request('GET', path)).nodes.length, 0);
  const batch = await request('POST', path + '/batch', { nodes: [{ name: 'A' }, { name: 'B', parentNames: ['A'] }] });
  const [a, b] = batch.nodes;
  assert.deepEqual(a.childIds, [b.id]); assert.deepEqual(b.parentIds, [a.id]);
  await assert.rejects(request('PUT', `/knowledge/node/${a.id}`, { parentIds: [b.id] }), failure(400));
  assert.deepEqual((await request('GET', path)).nodes[0].parentIds, []);
  await request('PUT', `/knowledge/node/${b.id}`, { difficulty: 5, masteryLevel: .9, isUnlocked: true });
  assert.equal((await request('GET', `/knowledge/node/${b.id}`)).node.difficulty, 5);
});

test('deleting courses removes graph edges and detaches retained tasks and notes', async () => {
  fresh();
  const { course } = await request('POST', '/courses', { name: '待删除课程' });
  const { node } = await request('POST', `/knowledge/${course.id}/nodes`, { name: '知识点' });
  const { task } = await request('POST', '/tasks', { title: '保留任务', courseId: course.id, knowledgeNodeIds: [node.id] });
  await request('POST', '/notes', { title: '保留笔记', content: '内容', relatedNodeIds: [node.id] });
  await request('DELETE', `/courses/${course.id}`);
  await assert.rejects(request('GET', `/knowledge/node/${node.id}`), failure(404));
  const remaining = (await request('GET', `/tasks/${task.id}`)).task;
  assert.equal(remaining.courseId, null); assert.deepEqual(remaining.knowledgeNodeIds, []);
  assert.deepEqual((await request('GET', '/notes')).notes[0].relatedNodeIds, []);
});

test('check-in is idempotent and reports the shared Shanghai study day', async () => {
  fresh();
  const first = await request('POST', '/checkin');
  const second = await request('POST', '/checkin');
  assert.equal(first.alreadyCheckedIn, false); assert.equal(second.alreadyCheckedIn, true);
  assert.deepEqual(second.rewards, { energy: 0, crystals: 0 });
  const status = await request('GET', '/checkin/status');
  assert.equal(status.timezone, 'Asia/Shanghai'); assert.equal(status.hasCheckedInToday, true);
  const expected = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10).replaceAll('-', '');
  assert.equal(status.lastCheckInDate, expected);
  assert.equal((await request('GET', '/checkin/records')).records.length, 1);
  assert.equal((await request('GET', '/auth/me')).user.energy, 10);
});

test('course filters, node cleanup, and task filtering reflect actual current workspace', async () => {
  fresh();
  const { course } = await request('POST', '/courses', { name: '筛选课程', planetStyleIndex: 6 });
  await request('POST', '/tasks', { title: '属于该课', courseId: course.id, priority: 5 });
  await request('POST', '/tasks', { title: '独立任务' });
  assert.equal((await request('GET', '/tasks', {}, { courseId: course.id })).tasks.length, 1);
  await request('PUT', `/courses/${course.id}`, { isArchived: true });
  assert.equal((await request('GET', '/courses')).courses.some(c => c.id === course.id), false);
  assert.equal((await request('GET', `/courses/${course.id}`)).course.planetStyleIndex, 6);
  const a = (await request('POST', `/knowledge/${course.id}/nodes`, { name: '先修' })).node;
  const b = (await request('POST', `/knowledge/${course.id}/nodes`, { name: '后续', parentIds: [a.id] })).node;
  await request('DELETE', `/knowledge/node/${a.id}`);
  assert.deepEqual((await request('GET', `/knowledge/node/${b.id}`)).node.parentIds, []);
});

test('unsupported routes return undefined for explicit outer-adapter handling', async () => {
  fresh();
  assert.equal(await request('GET', '/unrecognised/route'), undefined);
  assert.equal(await request('POST', '/ai/sessions'), undefined);
  assert.equal(await request('GET', '/app/version'), undefined);
});
