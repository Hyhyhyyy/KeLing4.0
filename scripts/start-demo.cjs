// Local rehearsal: fresh SQLite, same-origin Web/API, no inherited cloud secrets.
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const serverRoot = path.join(root, 'apps/server');
const smoke = process.argv.includes('--smoke');
if (process.argv.slice(2).some(arg => arg !== '--smoke')) throw new Error('Usage: node scripts/start-demo.cjs [--smoke]');
if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node.js 22.13+ is required.');
const cache = path.join(root, '.cache', 'defense-demo');
fs.mkdirSync(cache, { recursive: true });
const session = fs.mkdtempSync(path.join(cache, 'session-'));
// Whitelist OS/toolchain variables instead of forwarding DATABASE_URL or model keys.
const env = {};
for (const [key, value] of Object.entries(process.env)) {
  if (/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMDATA|PROCESSOR_ARCHITECTURE|NUMBER_OF_PROCESSORS)$/i.test(key)) env[key] = value;
}
Object.assign(env, {
  NODE_ENV: 'test', DATABASE_URL: 'file:' + path.join(session, 'demo.db').replaceAll('\\', '/'),
  JWT_SECRET: randomBytes(48).toString('hex'), PLANNING_PROVIDER: 'auto',
  CORS_ORIGINS: 'http://127.0.0.1:4173,http://localhost:4173',
  VITE_API_BASE_URL: '/api', VITE_PUBLIC_BASE: '/', VITE_HOSTING_PLATFORM: '',
});
function run(args, cwd = root, overrides = {}) {
  const result = spawnSync(process.execPath, args, { cwd, env: { ...env, ...overrides }, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw result.error || new Error('Demo preparation failed; see the preceding build output.');
}

async function verify(base) {
  const checks = [];
  let token;
  async function request(route, method = 'GET', body, expected = 200) {
    const response = await fetch(base + '/api/' + route, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
    const result = await response.json();
    assert.equal(response.status, expected, route + ': ' + JSON.stringify(result));
    checks.push({ route, status: response.status });
    return result;
  }
  const html = await (await fetch(base + '/login')).text();
  assert.match(html, /<html/);
  await request('ready');
  const email = 'rehearsal-' + randomBytes(6).toString('hex') + '@example.invalid';
  const password = randomBytes(24).toString('hex');
  const registered = await request('auth/register', 'POST', { name: '本地演示', email, password }, 201);
  token = registered.token;
  assert.ok(token);
  await request('auth/me');
  const course = (await request('courses', 'POST', { name: '二叉树演示课程' }, 201)).course;
  const note = await request('notes', 'POST', { title: '二叉树演示课程 学习笔记', content: '先序遍历顺序为根、左、右。', courseId: course.id }, 201);
  assert.ok(note.note?.id);
  const task = (await request('tasks', 'POST', { title: '手工完成先序遍历', courseId: course.id, estimatedMinutes: 10 }, 201)).task;
  await request('tasks/' + task.id + '/complete', 'POST', { actualMinutes: 5 });
  const tasks = await request('tasks');
  assert.ok(tasks.tasks.some(item => item.id === task.id && item.status === 'COMPLETED'));
  const status = await request('agent/status');
  assert.equal(status.configured, false, 'Local demo must not inherit model credentials.');
  token = undefined;
  const login = await request('auth/login', 'POST', { email, password });
  token = login.token;
  const notes = await request('notes');
  assert.ok(notes.notes.some(item => item.id === note.note.id));
  const result = { checkedAt: new Date().toISOString(), passed: true, scope: 'isolated SQLite + built Web + real application APIs; no cloud AI', checks };
  fs.writeFileSync(path.join(session, 'smoke.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

async function main() {
  run([path.join(__dirname, 'build-shared.cjs')]);
  const prisma = require.resolve('prisma/build/index.js', { paths: [serverRoot] });
  run([prisma, 'generate', '--schema', 'prisma/schema.prisma'], serverRoot);
  for (const file of ['init-local.sql', 'upgrade-assistant.sql', 'upgrade-expedition.sql']) {
    run([prisma, 'db', 'execute', '--schema', 'prisma/schema.prisma', '--file', 'prisma/' + file], serverRoot);
  }
  run([require.resolve('typescript/bin/tsc', { paths: [serverRoot] })], serverRoot);
  run([path.join(__dirname, 'sync-stellar-assets.cjs')]);
  const webRoot = path.join(root, 'apps/web');
  run([require.resolve('typescript/bin/tsc', { paths: [webRoot] }), '-b'], webRoot);
  const vite = path.join(path.dirname(require.resolve('vite/package.json', { paths: [webRoot] })), 'bin/vite.js');
  run([vite, 'build'], webRoot, { NODE_ENV: 'production' });
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, env);
  const { app } = require(path.join(serverRoot, 'dist/index.js'));
  const { prisma: database } = require(path.join(serverRoot, 'dist/database.js'));
  const express = require(require.resolve('express', { paths: [serverRoot] }));
  const dist = path.join(webRoot, 'dist');
  // A rehearsal must never make outbound model/version/download requests.
  const outboundFetch = globalThis.fetch;
  globalThis.fetch = (input, options) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') return Promise.reject(new Error('Cloud requests are disabled in the local rehearsal.'));
    return outboundFetch(input, options);
  };
  app.use(express.static(dist, { setHeaders: res => res.setHeader('Cache-Control', 'no-store') }));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/')) return res.sendFile(path.join(dist, 'index.html'));
    next();
  });
  const server = app.listen(smoke ? 0 : 4173, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const base = 'http://127.0.0.1:' + server.address().port;
  console.log('\nLocal rehearsal: ' + base + '\nFresh isolated data: ' + session + '\nCloud AI disabled. Register a local rehearsal account or use the guest workspace. Ctrl+C to stop.');
  if (smoke) {
    try { await verify(base); }
    finally { await new Promise(resolve => server.close(resolve)); await database.$disconnect(); }
  }
}
main().catch(() => { console.error('Local rehearsal failed. No production data was changed; inspect the preparation output.'); process.exitCode = 1; });
