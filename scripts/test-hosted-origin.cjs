// Explicit-target smoke check. Empty bodies stop at validation: no account,
// real credential, model discovery request to a vendor, or chat is created.
const assert = require('node:assert/strict');

async function checkHostedOrigin(value, transport = fetch) {
  const base = new URL(value);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if ((base.protocol !== 'https:' && !(base.protocol === 'http:' && loopback)) || base.username || base.password || base.search || base.hash) {
    throw new Error('Use an HTTPS application base URL without credentials, query or fragment.');
  }
  base.pathname = base.pathname.replace(/\/+$/, '') + '/';
  const root = await transport(base, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  assert.equal(root.status, 200, 'Application root must return HTTP 200');
  const cookies = root.headers.getSetCookie().map(value => value.split(';', 1)[0]);
  const csrf = cookies.find(value => value.startsWith('suda-csrf-token='));
  assert.ok(csrf, 'Application root must issue the platform CSRF cookie');
  await root.body?.cancel();
  const headers = {
    Origin: base.origin,
    Cookie: cookies.join('; '),
    'X-Suda-Csrf-Token': decodeURIComponent(csrf.slice('suda-csrf-token='.length)),
    'Content-Type': 'application/json',
  };
  const cases = [
    ['auth/login', data => data.error === '邮箱和密码为必填项'],
    ['auth/register', data => data.error === '请输入有效邮箱和 10–128 位密码'],
    ['model-access/discover', data => data.code === 'VALIDATION'],
  ];
  const results = [];
  for (const [path, accepts] of cases) {
    const response = await transport(new URL('api/' + path, base), {
      method: 'POST', headers, body: '{}', redirect: 'error', signal: AbortSignal.timeout(30000),
    });
    const data = await response.json().catch(() => null);
    const passed = response.status === 400 && Boolean(data && accepts(data));
    results.push({ path, status: response.status, validationReached: passed });
  }
  return { base: base.href, origin: base.origin, rootStatus: root.status, passed: results.every(item => item.validationReached), results };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const value = args.length === 1 && !args[0].startsWith('-') ? args[0]
    : args.length === 2 && args[0] === '--base' ? args[1] : null;
  if (!value) {
    console.error('Usage: node scripts/test-hosted-origin.cjs --base https://host/app/app_id');
    process.exitCode = 2;
  } else {
    checkHostedOrigin(value).then(result => {
      console.log(JSON.stringify(result, null, 2));
      if (!result.passed) process.exitCode = 1;
    }).catch(error => {
      console.error(error instanceof assert.AssertionError ? error.message : 'Hosted origin check failed: invalid URL, transport, redirect, or response.');
      process.exitCode = 1;
    });
  }
}

module.exports = { checkHostedOrigin };
