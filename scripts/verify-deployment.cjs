// Opt-in HTTP verification of an already deployed project, usable from a
// Vercel build when the developer's network cannot reach *.vercel.app.
const assert = require('node:assert/strict');
const base = new URL(process.env.KELING_VERIFY_URL || process.argv[2]);
if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/') {
  throw new Error('Verification requires an HTTPS deployment origin');
}
const headers = {};
// Only send the platform's automation credential to its exact project alias.
if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
  const trustedHost = process.env.KELING_VERIFY_TRUSTED_HOST || process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (base.hostname !== trustedHost) {
    throw new Error('Verification origin must match the explicitly verified project host');
  }
  headers['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
}
async function request(path, options = {}, expected = 200) {
  const response = await fetch(new URL(path, base), {
    ...options, headers: { ...headers, ...options.headers },
    signal: AbortSignal.timeout(25000), redirect: 'error'
  });
  assert.equal(response.status, expected, `${path}: HTTP ${response.status}`);
  return response;
}
(async () => {
  const page = await (await request('/explore')).text();
  assert.match(page, /课灵/);
  assert.equal((await (await request('/api/health')).json()).status, 'ok');
  assert.equal((await (await request('/api/ready')).json()).status, 'ready');
  await request('/api/user/profile', {}, 401);
  console.log('Deployment HTTP checks passed: HTML, health, database readiness, unauthenticated access denied.');
  if (process.env.KELING_VERIFY_WRITES === '1') {
    const { randomUUID, randomBytes } = require('node:crypto');
    const json = (token, body, method = 'POST') => ({
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const email = `deployment-${randomUUID()}@test.invalid`;
    const password = randomBytes(24).toString('hex');
    const first = await (await request('/api/auth/register', json(null, { email, password, name: '部署验证账号' }), 201)).json();
    const second = await (await request('/api/auth/register', json(null, {
      email: `deployment-${randomUUID()}@test.invalid`, password: randomBytes(24).toString('hex'), name: '隔离验证账号'
    }), 201)).json();
    const mobile = await (await request('/api/auth/login', json(null, { email, password }))).json();
    await request('/api/user/profile', json(first.token, { avatarUrl: 'stellar:avatar-7' }, 'PUT'));
    const profile = await (await request('/api/auth/me', json(mobile.token, null, 'GET'))).json();
    assert.equal(profile.user.avatarUrl, 'stellar:avatar-7');
    const note = (await (await request('/api/notes', json(first.token, { title: '部署同步验证', content: '初始测试内容' }), 201)).json()).note;
    await request(`/api/notes/${note.id}`, json(second.token, { content: '禁止跨用户写入', expectedUpdatedAt: note.updatedAt }, 'PUT'), 404);
    await request(`/api/notes/${note.id}`, json(first.token, { content: '跨会话编辑', expectedUpdatedAt: note.updatedAt }, 'PUT'));
    await request(`/api/notes/${note.id}`, json(mobile.token, { content: '旧版本冲突', expectedUpdatedAt: note.updatedAt }, 'PUT'), 409);
    const notes = (await (await request('/api/notes', json(mobile.token, null, 'GET'))).json()).notes;
    assert.equal(notes.find(item => item.id === note.id).content, '跨会话编辑');
    const catalog = await (await request('/api/ai/catalog', json(first.token, null, 'GET'))).json();
    assert.equal(catalog.providers.length, 14);
    await request(`/api/notes/${note.id}`, json(first.token, null, 'DELETE'));
    console.log('Deployment write checks passed: registration, login, shared profile/notes, ownership, stale-write conflict, 14-provider catalog. Two generated test.invalid accounts remain; test note deleted; no model calls made.');
  }
  const publicResponse = await fetch(new URL('/api/health', base), { signal: AbortSignal.timeout(25000), redirect: 'manual' });
  console.log(`Public access without Vercel bypass: HTTP ${publicResponse.status}`);
})().catch(error => { console.error('Deployment verification failed:', error.message); process.exitCode = 1; });
