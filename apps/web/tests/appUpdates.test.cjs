const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const esbuild = require('esbuild');
const built = esbuild.buildSync({ entryPoints: [path.resolve(__dirname, '../src/services/appUpdates.ts')], bundle: true, platform: 'node', format: 'cjs', write: false });
const context = { module: { exports: {} }, exports: {}, URL, setTimeout, clearTimeout };
vm.runInNewContext(built.outputFiles[0].text, context);
const { watchAppUpdates, applyAppUpdate } = context.module.exports;

class Worker extends EventTarget {
  constructor(state) { super(); this.state = state; this.messages = []; }
  change(state) { this.state = state; this.dispatchEvent(new Event('statechange')); }
  postMessage(message) { this.messages.push(message); }
}
class Registration extends EventTarget {
  constructor(active = null) { super(); this.active = active; this.installing = null; this.waiting = null; this.updates = 0; }
  async update() { this.updates++; }
  install(worker) { this.installing = worker; this.dispatchEvent(new Event('updatefound')); }
}
class Container extends EventTarget {
  constructor(registration, controller = null) { super(); this.registration = registration; this.controller = controller; this.calls = []; }
  async register(url, options) { this.calls.push({ url, options }); return this.registration; }
  control(worker) { this.controller = worker; this.dispatchEvent(new Event('controllerchange')); }
}

test('first install and initial claim do not announce an update; custom app path bypasses HTTP cache', async () => {
  const registration = new Registration(), worker = new Worker('installing');
  registration.installing = worker;
  const container = new Container(registration), offers = [];
  const monitor = watchAppUpdates({ container, baseURL: 'https://example.test/app/example/', onAvailable: item => offers.push(item) });
  await monitor.ready;
  assert.equal(container.calls[0].url, 'https://example.test/app/example/sw.js');
  assert.equal(container.calls[0].options.scope, '/app/example/');
  assert.equal(container.calls[0].options.updateViaCache, 'none');
  worker.change('installed'); worker.change('activated'); container.control(worker);
  assert.equal(offers.length, 0);
  monitor.dispose();
});

test('an update is offered once, does not reload or touch drafts, and waits for explicit approval and activation', async () => {
  const previous = new Worker('activated'), registration = new Registration(previous), container = new Container(registration, previous);
  const offers = [], drafts = { text: '未保存的游客内容' };
  let reloads = 0;
  const monitor = watchAppUpdates({ container, baseURL: 'https://example.test/', onAvailable: item => offers.push(item) });
  await monitor.ready;
  const next = new Worker('installing'); registration.install(next); next.change('installed');
  assert.equal(offers.length, 1); assert.equal(reloads, 0); assert.equal(drafts.text, '未保存的游客内容');
  let warning = '';
  assert.equal(await applyAppUpdate(offers[0], { isGuest: true, confirm: text => { warning = text; return false; }, reload: () => reloads++ }), false);
  assert.match(warning, /清空本次游客数据/); assert.equal(reloads, 0); assert.equal(next.messages.length, 0);
  const applying = applyAppUpdate(offers[0], { isGuest: true, confirm: () => true, reload: () => reloads++ });
  assert.equal(reloads, 0);
  next.change('activated');
  await Promise.resolve(); assert.equal(reloads, 0, 'in-scope document must wait for its controller to change');
  container.control(next);
  assert.equal(await applying, true); assert.equal(reloads, 1); assert.equal(offers.length, 1);
  assert.equal(drafts.text, '未保存的游客内容');
  monitor.dispose();
});

test('a waiting update is discoverable, while registration failure and unmounted listeners leave the app running', async () => {
  const active = new Worker('activated'), registration = new Registration(active);
  registration.waiting = new Worker('installed');
  const container = new Container(registration, active), offers = [], errors = [];
  const monitor = watchAppUpdates({ container, baseURL: 'https://example.test/', onAvailable: item => offers.push(item) });
  await monitor.ready; assert.equal(offers.length, 1);
  await monitor.check(); assert.equal(registration.updates, 1);
  monitor.dispose(); container.control(new Worker('activated')); assert.equal(offers.length, 1);
  container.register = async () => { throw new Error('Unsupported MIME type text/html'); };
  const failed = watchAppUpdates({ container, baseURL: 'https://example.test/', onAvailable: () => assert.fail('must not announce a failed registration'), onError: error => errors.push(error) });
  await failed.ready; assert.equal(errors.length, 1); failed.dispose();
});

test('a replaced controller announces an update without forcing another tab to reload', async () => {
  const active = new Worker('activated'), container = new Container(new Registration(active), active), offers = [];
  const monitor = watchAppUpdates({ container, baseURL: 'https://example.test/app/other/', onAvailable: item => offers.push(item) });
  await monitor.ready; container.control(new Worker('activated'));
  assert.equal(offers.length, 1);
  monitor.dispose();
});

test('failed activation aborts an approved update without reloading', async () => {
  const active = new Worker('activated'), registration = new Registration(active), container = new Container(registration, active), offers = [];
  const monitor = watchAppUpdates({ container, baseURL: 'https://example.test/', onAvailable: item => offers.push(item) });
  await monitor.ready;
  const next = new Worker('installing'); registration.install(next); next.change('installed');
  let reloads = 0;
  const applying = applyAppUpdate(offers[0], { isGuest: false, confirm: () => true, reload: () => reloads++ });
  next.change('redundant');
  await assert.rejects(applying, /更新未能启用/);
  assert.equal(reloads, 0); monitor.dispose();
});

test('a no-slash recovery document can confirm a waiting update without waiting for an out-of-scope controller', async () => {
  const registration = new Registration(new Worker('activated'));
  registration.waiting = new Worker('installed');
  const container = new Container(registration), offers = [];
  const monitor = watchAppUpdates({ container, baseURL: 'https://example.test/app/example/', pageURL: 'https://example.test/app/example?release=rc6', onAvailable: item => offers.push(item) });
  await monitor.ready; assert.equal(offers.length, 1);
  let reloads = 0;
  const applying = applyAppUpdate(offers[0], { isGuest: false, confirm: () => true, reload: () => reloads++ });
  assert.equal(registration.waiting.messages[0].type, 'SKIP_WAITING');
  registration.waiting.change('activated');
  assert.equal(await applying, true); assert.equal(reloads, 1); assert.equal(container.controller, null);
  monitor.dispose();
});
