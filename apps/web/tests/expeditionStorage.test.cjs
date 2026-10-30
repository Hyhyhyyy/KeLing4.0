const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const path = require('node:path');
const { IDBFactory } = require('fake-indexeddb');
const esbuild = require('esbuild');
const indexedDB = new IDBFactory();
function load() {
  const result = esbuild.buildSync({ stdin: { contents: "export * from './src/services/expeditionStorage'; export * from './src/services/guestSession';", resolveDir: path.resolve(__dirname, '..') }, bundle: true, platform: 'node', format: 'cjs', write: false });
  const exports = {};
  const context = { module: { exports }, exports, require, crypto: globalThis.crypto, structuredClone, TextEncoder, Date, indexedDB, console };
  vm.runInNewContext(result.outputFiles[0].text, context);
  return context.module.exports;
}
const api = load();
const scope = id => ({ kind: 'account', id });
const operation = id => ({ id, command: { opId: id, expectedRevision: 0, action: { type: 'PAUSE' } }, createdAt: new Date().toISOString(), status: 'pending' });

test('IndexedDB persists drafts across repository reload and isolates accounts', async () => {
  await api.saveExpeditionDraft(scope('alice'), { runId: 'run-a', baseRevision: 3, value: { explanation: '仅属于甲' }, updatedAt: '2026-10-30T00:00:00Z' });
  const restarted = load();
  assert.equal((await restarted.readExpeditionLocal(scope('alice'))).drafts['run-a'].value.explanation, '仅属于甲');
  assert.equal(Object.keys((await restarted.readExpeditionLocal(scope('bob'))).drafts).length, 0);
});
test('concurrent IndexedDB transactions preserve every queued operation and reject id reuse', async () => {
  await Promise.all(Array.from({ length: 12 }, (_, i) => api.enqueueExpeditionOperation(scope('queue-user'), operation('op-' + i))));
  assert.equal((await api.readExpeditionLocal(scope('queue-user'))).outbox.length, 12);
  await api.enqueueExpeditionOperation(scope('queue-user'), operation('op-0'));
  assert.equal((await api.readExpeditionLocal(scope('queue-user'))).outbox.length, 12);
  const conflicting = operation('op-0'); conflicting.command.action.type = 'CANCEL';
  await assert.rejects(api.enqueueExpeditionOperation(scope('queue-user'), conflicting));
  assert.equal((await api.readExpeditionLocal(scope('queue-user'))).outbox[0].command.action.type, 'PAUSE');
});
test('aborted local transaction preserves the old draft rather than saving a partial change', async () => {
  await assert.rejects(api.updateExpeditionLocal(scope('alice'), state => { state.drafts = {}; throw new Error('simulate invalid mutation'); }));
  assert.equal((await api.readExpeditionLocal(scope('alice'))).drafts['run-a'].baseRevision, 3);
});
test('guest records use RAM only and ending a visit rejects stale writes', async () => {
  const id = api.startGuestSession(), guest = { kind: 'guest', id };
  const originalOpen = indexedDB.open;
  indexedDB.open = () => { throw new Error('guest must not touch disk'); };
  try {
    await api.enqueueExpeditionOperation(guest, operation('temporary'));
    assert.equal((await api.readExpeditionLocal(guest)).outbox.length, 1);
    api.endGuestSession();
    await assert.rejects(api.enqueueExpeditionOperation(guest, operation('late')));
    const next = { kind: 'guest', id: api.startGuestSession() };
    assert.equal((await api.readExpeditionLocal(next)).outbox.length, 0);
  } finally { indexedDB.open = originalOpen; api.endGuestSession(); }
});
test('offline identity matches the exact previously verified token; another token cannot read it', async () => {
  const user = { id: 'verified', name: '本机账号', email: '', level: 1, exp: 0, crystals: 0, energy: 0 };
  await api.rememberExpeditionIdentity(user, 'token-A-not-a-provider-key');
  assert.equal((await api.readExpeditionIdentity('token-A-not-a-provider-key')).id, 'verified');
  assert.equal(await api.readExpeditionIdentity('token-B'), null);
  const db = await new Promise(resolve => { const r = indexedDB.open('keling-expedition-v1', 1); r.onsuccess = () => resolve(r.result); });
  const stored = await new Promise(resolve => { const r = db.transaction('identities').objectStore('identities').getAll(); r.onsuccess = () => resolve(r.result); });
  assert.equal(JSON.stringify(stored).includes('token-A-not-a-provider-key'), false);
  db.close();
});
test('clearing one account never deletes another account draft', async () => {
  await api.clearExpeditionLocal(scope('queue-user'));
  assert.equal((await api.readExpeditionLocal(scope('queue-user'))).outbox.length, 0);
  assert.ok((await api.readExpeditionLocal(scope('alice'))).drafts['run-a']);
});
