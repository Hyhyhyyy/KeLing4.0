const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { independent } = require('./audit-expedition-content.cjs');
const root = path.resolve(__dirname, '..');
const production = 'https://ucn5aajxnx7f.feishuapp.com/app/app_17h4dw5jwdg';
const args = process.argv.slice(2), option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const execute = args.includes('--execute'), cleanupOnly = args.includes('--cleanup-only');
const plan = {
  script: 'scripts/smoke-online-api.cjs', defaultMode: 'NO_NETWORK',
  sequence: ['new isolated account', 'course', 'note save and stale-write rejection', 'material import/replay/search',
    'material heading extraction/confirmation', 'task complete/replay', 'constraint schedule preview/confirm/replay',
    'training expedition submit/feedback/record/replay', 'owned-resource cleanup'],
  excluded: ['external model calls', 'existing user accounts', 'production database direct access', 'human review or badge approval'],
  cleanup: 'Delete only IDs saved for this newly generated account: tasks, note, imported material (tombstone), course. Keep isolated account and immutable operation/reward/expedition audit records; no account-delete API exists.',
};
if (!execute && !cleanupOnly) { console.log(JSON.stringify(plan, null, 2)); process.exit(0); }
if (execute && cleanupOnly) throw new Error('Choose --execute or --cleanup-only');

const cache = path.join(root, '.cache', 'online-api-smoke');
const suppliedState = option('--state');
if (cleanupOnly && !suppliedState) throw new Error('--cleanup-only requires --state');
const statePath = suppliedState ? path.resolve(suppliedState) : path.join(cache, randomUUID() + '.private.json');
if (!statePath.toLowerCase().startsWith(cache.toLowerCase() + path.sep) || !statePath.endsWith('.private.json')) throw new Error('State must stay inside .cache/online-api-smoke/*.private.json');
if (execute && fs.existsSync(statePath)) throw new Error('New run cannot reuse an existing state file');
let state = cleanupOnly ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {
  kind: 'KELING_ISOLATED_API_SMOKE', runId: randomUUID(), baseUrl: option('--base-url') || production,
  email: 'api-smoke-' + randomUUID() + '@example.invalid', password: randomBytes(24).toString('base64url'),
  userId: null, token: null, courseId: null, noteId: null, materialId: null, taskIds: [], expedition: null,
};
const base = state.baseUrl.replace(/\/$/, ''), url = new URL(base);
if (!(base === production || (['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol === 'http:'))) throw new Error('Unexpected API host');
if (state.kind !== 'KELING_ISOLATED_API_SMOKE' || !/^api-smoke-[a-f0-9-]+@example\.invalid$/.test(state.email)) throw new Error('Refuse non-smoke account');
fs.mkdirSync(cache, { recursive: true });
const save = () => fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
const report = { startedAt: new Date().toISOString(), target: base, runId: state.runId, mode: cleanupOnly ? 'cleanup' : 'smoke',
  steps: [], checks: [], cleanup: [], externalModelsCalled: false, humanReviewChanged: false, status: 'RUNNING' };
const reportPath = statePath.replace('.private.json', '.report.json');
const cookies = new Map();
function captureCookies(headers) {
  for (const cookie of headers.getSetCookie()) {
    const [first, ...attributes] = cookie.split(';'), p = first.indexOf('='); if (p <= 0) continue;
    const options = Object.fromEntries(attributes.map(a => { const i = a.indexOf('='); return i < 0 ? [a.trim().toLowerCase(), true] : [a.slice(0, i).trim().toLowerCase(), a.slice(i + 1).trim()]; }));
    const name = first.slice(0, p), cookiePath = options.path || '/', key = name + ';' + cookiePath;
    if ((options['max-age'] !== undefined && Number(options['max-age']) <= 0) || (options.expires && Date.parse(options.expires) <= Date.now())) cookies.delete(key);
    else cookies.set(key, { name, value: first.slice(p + 1), path: cookiePath });
  }
}
function requestHeaders() {
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json', Origin: url.origin, Referer: base + '/' };
  const applicable = [...cookies.values()].filter(c => (url.pathname + '/api').startsWith(c.path)).sort((a, b) => b.path.length - a.path.length);
  if (applicable.length) headers.Cookie = applicable.map(c => `${c.name}=${c.value}`).join('; ');
  const csrf = applicable.find(c => c.name === 'suda-csrf-token');
  if (csrf) headers['X-Suda-Csrf-Token'] = csrf.value;
  if (state.token) headers.Authorization = 'Bearer ' + state.token;
  return headers;
}
async function api(route, method = 'GET', body, statuses = [200], label = route) {
  const at = Date.now(); let response;
  try { response = await fetch(base + '/api' + route, { method, headers: requestHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(45000) }); }
  catch { report.steps.push({ label, method, networkFailure: true }); throw new Error('Network request failed: ' + label); }
  captureCookies(response.headers);
  let result; try { result = await response.json(); } catch { throw new Error('Expected JSON: ' + label + ' HTTP ' + response.status); }
  report.steps.push({ label, method, status: response.status, ms: Date.now() - at,
    ...(typeof result.code === 'string' && /^[A-Z_]{1,60}$/.test(result.code) ? { code: result.code } : {}) });
  if (!statuses.includes(response.status)) throw new Error('Unexpected HTTP ' + response.status + ': ' + label);
  return result;
}
function check(name, condition) { assert.ok(condition, name); report.checks.push({ name, passed: true }); }
async function ensureOwner() {
  if (!state.token) { const login = await api('/auth/login', 'POST', { email: state.email, password: state.password }); state.token = login.token; save(); }
  const profile = (await api('/user/profile')).user;
  check('cleanup uses exactly the generated account', profile.id === state.userId && profile.email === state.email);
}
async function cleanup() {
  if (!state.userId) return;
  await ensureOwner();
  async function attempt(label, fn) {
    try { await fn(); report.cleanup.push({ label, passed: true }); }
    catch { report.cleanup.push({ label, passed: false }); }
  }
  if (state.expedition?.runId) await attempt('close active test expedition', async () => {
    const current = await api('/expedition/v1/runs/' + state.expedition.runId);
    if (!['SETTLED', 'CANCELLED', 'CONTENT_STALE'].includes(current.run.status)) {
      const lease = await api('/expedition/v1/runs/' + current.run.id + '/lease', 'POST', {
        opId: randomUUID(), expectedRevision: current.run.revision, deviceId: state.expedition.deviceId, intent: 'takeover' });
      await api('/expedition/v1/runs/' + current.run.id + '/commands', 'POST', { opId: randomUUID(),
        expectedRevision: lease.run.revision, writer: lease.writer, action: { type: 'CANCEL' } });
    }
  });
  for (const id of [...state.taskIds]) await attempt('delete created task', async () => {
    await api('/tasks/' + id, 'DELETE', undefined, [200, 404]); state.taskIds = state.taskIds.filter(x => x !== id); save();
  });
  if (state.noteId) await attempt('delete created note', async () => { await api('/notes/' + state.noteId, 'DELETE', undefined, [200, 404]); state.noteId = null; save(); });
  if (state.materialId) await attempt('tombstone imported material', async () => {
    await api('/learning/v1/materials/' + state.materialId, 'DELETE', { opId: randomUUID() }, [200, 404]); state.materialId = null; save();
  });
  if (state.courseId) await attempt('delete created course and its knowledge nodes', async () => {
    await api('/courses/' + state.courseId, 'DELETE', undefined, [200, 404]); state.courseId = null; save();
  });
  state.cleanedAt = new Date().toISOString(); save();
  report.retained = ['isolated test account', 'operation receipts', 'expedition/progress/reward audit records', 'material tombstones and immutable references'];
}
async function smoke() {
  const suffix = state.runId.slice(0, 8);
  const registered = await api('/auth/register', 'POST', { name: 'API 冒烟隔离账号 ' + suffix, email: state.email, password: state.password }, [201]);
  state.userId = registered.user.id; state.token = registered.token; save();
  const course = (await api('/courses', 'POST', { name: 'API 冒烟课程 ' + suffix, code: 'SMOKE-' + suffix, schedule: [] }, [201])).course;
  state.courseId = course.id; save();
  let note = (await api('/notes', 'POST', { title: 'API 冒烟笔记 ' + suffix, content: '队列按先进先出处理节点。', sourceType: 'USER_CREATED' }, [201])).note;
  state.noteId = note.id; save();
  const oldVersion = note.updatedAt;
  note = (await api('/notes/' + note.id, 'PUT', { content: '层序遍历使用队列，先左后右加入孩子。', expectedUpdatedAt: oldVersion })).note;
  await api('/notes/' + note.id, 'PUT', { content: '不应保存的旧草稿', expectedUpdatedAt: oldVersion }, [409], 'stale note write');
  const input = { opId: randomUUID(), title: '层序资料 ' + suffix, sourceName: '隔离冒烟合成资料', format: 'MARKDOWN', text: '# 层序遍历\n\n队列先进先出。访问根节点后，先左后右把孩子加入队尾。' };
  const imported = await api('/learning/v1/courses/' + course.id + '/materials', 'POST', input);
  state.materialId = imported.material.id; save();
  const replay = await api('/learning/v1/courses/' + course.id + '/materials', 'POST', input);
  check('material import replay keeps version ID', replay.replayed && replay.material.id === state.materialId);
  const found = await api('/learning/v1/courses/' + course.id + '/materials/search', 'POST', { query: '队列' });
  check('search returns imported evidence', found.method === 'keyword' && found.sources.some(s => s.materialVersionId === state.materialId));
  const draft = await api('/learning/v1/courses/' + course.id + '/map-draft', 'POST', { query: '队列' });
  const candidate = draft.candidates[0]; check('map draft has cited material', !!candidate?.source?.spanId);
  const nodes = await api('/learning/v1/courses/' + course.id + '/map-confirm', 'POST', { opId: randomUUID(), candidates: [{ title: candidate.title, description: candidate.description,
    materialVersionId: candidate.source.materialVersionId, spanId: candidate.source.spanId, contentHash: candidate.source.contentHash }] });
  check('map confirmation creates cited knowledge point', nodes.nodes.length === 1);
  const task = (await api('/tasks', 'POST', { title: 'API 冒烟任务 ' + suffix, courseId: course.id, type: 'STUDY', estimatedMinutes: 10 }, [201])).task;
  state.taskIds.push(task.id); save();
  await api('/tasks/' + task.id + '/complete', 'POST', { actualMinutes: 1 });
  const completedAgain = await api('/tasks/' + task.id + '/complete', 'POST', { actualMinutes: 99 });
  check('task completion is idempotent', completedAgain.alreadyCompleted && completedAgain.task.actualMinutes === 1);
  const date = new Date(Date.now() + 32 * 3600000).toISOString().slice(0, 10);
  const preview = await api('/learning/v1/courses/' + course.id + '/schedule', 'POST', { startDate: date, examDate: date, dailyMinutes: 60,
    dayStart: '18:00', dayEnd: '21:00', units: [{ title: 'API 规则排程 ' + suffix, minutes: 25, objectiveKey: 'bt.bfs.queue' }] });
  check('constraint preview is explicit and allocates once', preview.method === 'CONSTRAINT_SCHEDULER' && preview.tasks.length === 1 && preview.unallocated.length === 0);
  const confirmed = await api('/learning/v1/schedule/' + preview.previewId + '/confirm', 'POST', {});
  state.taskIds.push(...confirmed.taskIds); save();
  const confirmedAgain = await api('/learning/v1/schedule/' + preview.previewId + '/confirm', 'POST', {});
  check('schedule confirmation is idempotent', confirmedAgain.replayed && JSON.stringify(confirmedAgain.taskIds) === JSON.stringify(confirmed.taskIds));
  const catalog = await api('/expedition/v1/catalog');
  check('current shared chapter is deployed', catalog.chapter.version === '1.0.1');
  check('human review remains pending', catalog.chapter.exercises.every(e => e.review.humanStatus === 'PENDING' && e.review.reviewer === null));
  const deviceId = 'api-smoke-' + suffix;
  const started = await api('/expedition/v1/runs', 'POST', { opId: randomUUID(), courseId: course.id, questKind: 'EXPLORE', objectiveKey: 'bt.bfs.queue', mode: 'TRAINING', deviceId });
  state.expedition = { runId: started.run.id, deviceId }; save();
  const exercise = catalog.chapter.exercises.find(e => e.id === started.run.exerciseIds[0]);
  const expected = independent(exercise.tree);
  const submitted = await api('/expedition/v1/runs/' + started.run.id + '/commands', 'POST', { opId: randomUUID(), expectedRevision: started.run.revision,
    writer: started.writer, action: { type: 'SUBMIT', answer: { order: expected.bfs, structure: 'QUEUE' } } });
  check('real server checks canonical tree answer', submitted.feedback.correct && !submitted.feedback.independentEligible);
  const ackInput = { opId: randomUUID(), expectedRevision: submitted.run.revision, writer: started.writer,
    action: { type: 'ACK_FEEDBACK', nextStep: '再用另一棵树练习队列顺序' } };
  const settled = await api('/expedition/v1/runs/' + started.run.id + '/commands', 'POST', ackInput);
  const settledAgain = await api('/expedition/v1/runs/' + started.run.id + '/commands', 'POST', ackInput);
  check('expedition settles once without independent badge', settled.run.status === 'SETTLED' && settledAgain.replayed && settled.evidenceDelta.every(e => e.kind === 'ATTEMPTED' && !e.strict));
  const evidence = await api('/expedition/v1/courses/' + course.id + '/evidence');
  check('expedition evidence remains readable', evidence.evidence.some(e => e.runId === started.run.id));
  const grants = await api('/expedition/v1/rewards');
  check('one cycle reward after replay', grants.grants.filter(g => g.kind === 'CYCLE').length === 1);
  const profile = (await api('/user/profile')).user;
  check('manual time credited once', profile.totalStudyMinutes === 1);
}
(async () => {
  save();
  try {
    const initial = await fetch(base, { signal: AbortSignal.timeout(30000), redirect: 'error' }); captureCookies(initial.headers);
    if (!initial.ok) throw new Error('Bootstrap HTTP ' + initial.status);
    if (!cleanupOnly) {
      const health = await api('/health');
      check('current release is deployed before registering', health.version === '4.0.6-defense-rc7');
    }
    if (!cleanupOnly) await smoke();
    report.status = 'PASSED';
  } catch (error) { report.status = 'FAILED'; report.failure = String(error.message).replace(/[\r\n]/g, ' ').slice(0, 240); }
  finally {
    try { await cleanup(); } catch { report.cleanup.push({ label: 'ownership or cleanup connection', passed: false }); }
    if (report.cleanup.some(c => !c.passed)) report.status = 'CLEANUP_INCOMPLETE';
    report.finishedAt = new Date().toISOString(); fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ status: report.status, checks: report.checks.length, report: path.relative(root, reportPath), privateState: path.relative(root, statePath) }));
    process.exitCode = report.status === 'PASSED' ? 0 : 1;
  }
})();
