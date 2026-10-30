const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

// This is a Node unit-test harness, not browser automation. Every network adapter
// is replaced; these tests cannot call a real model or application database.
const memory = new Map();
global.localStorage = {
  getItem: key => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: key => memory.delete(key),
};
global.window = { location: { href: '' }, localStorage: global.localStorage };
global.fetch = async () => { throw new Error('Unexpected network access in isolated guest test'); };
const root = path.resolve(__dirname, '..');
const compiled = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'keling-guest-integration-')), 'entry.cjs');
esbuild.buildSync({
  stdin: { contents: `export { default as api } from './apps/web/src/services/api';
    export { useAppStore } from './apps/web/src/store/useAppStore';
    export { getGuestSessionId } from './apps/web/src/services/guestSession';
    export { useModelAccess, changeModelCredentials } from './apps/web/src/services/modelAccess';`,
    resolveDir: root, sourcefile: 'guest-test-entry.ts', loader: 'ts' },
  bundle: true, platform: 'node', format: 'cjs', outfile: compiled,
  define: { 'import.meta.env': '{}' }, logLevel: 'silent',
});
const { api, useAppStore, getGuestSessionId, useModelAccess, changeModelCredentials } = require(compiled);
const calls = [];
const response = (config, data) => ({ config, data, status: 200, statusText: 'OK', headers: {} });
const account = { id: 'account-only', name: 'Account owner', energy: 7, crystals: 3 };
api.defaults.adapter = async config => {
  calls.push({ path: config.url, authorization: config.headers.get('Authorization') });
  if (config.url === '/auth/login') return response(config, { token: 'new-account-token', user: account });
  if (config.url === '/auth/me') return response(config, { user: account });
  if (config.url === '/courses') return response(config, { courses: [] });
  if (config.url === '/tasks') return response(config, { tasks: [] });
  if (config.url === '/notes') return response(config, { notes: [] });
  if (config.url === '/app/version') return response(config, { latestVersion: { versionName: 'test' } });
  throw new Error(`Unexpected remote operation: ${config.url}`);
};
test('guest uses complete CRUD through the normal API without account traffic or persistence', async () => {
  memory.set('token', 'existing-account-token');
  useAppStore.setState({ token: 'existing-account-token', user: account, isAuthenticated: true });
  const before = calls.length;
  await useAppStore.getState().startGuest();
  assert.equal(useAppStore.getState().isGuest, true);
  assert.notEqual(useAppStore.getState().user.id, account.id);
  const { data } = await api.post('/notes', { title: 'Only this visit', content: 'Never persist my guest content', tags: ['guest'] });
  await useAppStore.getState().loadNotes();
  assert.ok(useAppStore.getState().notes.some(note => note.id === data.note.id));
  assert.equal(calls.length, before);
  assert.equal(memory.get('token'), 'existing-account-token');
  assert.ok(![...memory.values()].join('').includes('Never persist my guest content'));
});
test('guest unknown routes fail closed instead of falling through to account APIs', async () => {
  const before = calls.length;
  await assert.rejects(api.get('/private-unimplemented-operation'), error => error.response?.status === 404);
  assert.equal(calls.length, before);
  assert.equal(window.location.href, '');
});
test('guest release checks are public and do not carry a saved account token', async () => {
  await api.get('/app/version');
  assert.equal(calls.at(-1).path, '/app/version');
  assert.equal(calls.at(-1).authorization, undefined);
});
test('ending a visit clears content and Key while preserving the original account', async () => {
  const oldId = getGuestSessionId();
  changeModelCredentials({ providerId: 'openai', apiKey: 'not-a-real-key' });
  useAppStore.getState().endGuest();
  assert.equal(getGuestSessionId(), null);
  assert.equal(useModelAccess.getState().apiKey, '');
  assert.equal(useAppStore.getState().notes.length, 0);
  assert.equal(memory.get('token'), 'existing-account-token');
  await useAppStore.getState().loadUser();
  assert.equal(useAppStore.getState().user.id, account.id);
  await useAppStore.getState().startGuest();
  assert.notEqual(getGuestSessionId(), oldId);
  assert.ok(!useAppStore.getState().notes.some(note => note.title === 'Only this visit'));
});
test('a pending account read cannot overwrite a newly opened guest workspace', async () => {
  useAppStore.getState().endGuest();
  const original = api.defaults.adapter;
  let resolveRead;
  const dispatched = new Promise(resolve => {
    api.defaults.adapter = config => new Promise(done => {
      resolveRead = () => done(response(config, { user: account }));
      resolve();
    });
  });
  const pending = useAppStore.getState().loadUser();
  await dispatched;
  await useAppStore.getState().startGuest();
  resolveRead();
  await pending;
  assert.equal(useAppStore.getState().isGuest, true);
  assert.notEqual(useAppStore.getState().user.id, account.id);
  api.defaults.adapter = original;
});
test('sign-in deliberately switches to account state and discards visitor data', async () => {
  await api.post('/notes', { title: 'Discard on login', content: 'Guest draft' });
  await useAppStore.getState().login('synthetic@example.test', 'synthetic-test-password');
  assert.equal(getGuestSessionId(), null);
  assert.equal(useAppStore.getState().isGuest, false);
  assert.equal(useAppStore.getState().isAuthenticated, true);
  assert.equal(useAppStore.getState().user.id, account.id);
  assert.equal(useAppStore.getState().notes.length, 0);
  assert.equal(memory.get('token'), 'new-account-token');
});
