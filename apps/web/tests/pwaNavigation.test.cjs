const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const esbuild = require('esbuild');
const { generateSW } = require('workbox-build');

const compiled = esbuild.buildSync({ entryPoints: [path.resolve(__dirname, '../config/pwa.ts')], bundle: true, platform: 'node', format: 'cjs', write: false });
const optionsContext = { module: { exports: {} }, exports: {} };
vm.runInNewContext(compiled.outputFiles[0].text, optionsContext);
const { workboxOptions, OFFLINE_SHELL } = optionsContext.module.exports;
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'keling-pwa-navigation-'));
after(() => { assert.equal(path.dirname(directory), os.tmpdir()); assert.ok(path.basename(directory).startsWith('keling-pwa-navigation-')); fs.rmSync(directory, { recursive: true, force: true }); });

class MemoryCache {
  constructor() { this.entries = new Map(); }
  key(request) { return typeof request === 'string' ? request : request.url; }
  async match(request) { return this.entries.get(this.key(request))?.clone(); }
  async put(request, response) { this.entries.set(this.key(request), response.clone()); }
  async keys() { return [...this.entries.keys()].map(url => new Request(url)); }
  async delete(request) { return this.entries.delete(this.key(request)); }
}
class ExtendableEvent {
  constructor(type, properties = {}) { this.type = type; this.pending = []; Object.assign(this, properties); }
  waitUntil(promise) { this.pending.push(Promise.resolve(promise)); }
  respondWith(promise) { assert.equal(this.response, undefined, 'one fetch handler must own the response'); this.response = Promise.resolve(promise); }
  async settled() { for (let index = 0; index < this.pending.length; index++) await this.pending[index]; }
}

async function workerRuntime(base) {
  const listeners = new Map(), stores = new Map(), requests = [];
  let offline = false, installing = true;
  const scope = new URL(base, 'https://example.test');
  const cacheStorage = {
    async open(name) { if (!stores.has(name)) stores.set(name, new MemoryCache()); return stores.get(name); },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async match(request) { for (const cache of stores.values()) { const result = await cache.match(request); if (result) return result; } }
  };
  const context = vm.createContext({
    URL, Request, Response, Headers, Promise, console, setTimeout, clearTimeout,
    ExtendableEvent, FetchEvent: ExtendableEvent,
    location: new URL('sw.js', scope), registration: { scope: scope.href }, caches: cacheStorage,
    clients: { claim: async () => {}, matchAll: async () => [] }, skipWaiting: async () => {},
    addEventListener(type, callback) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(callback); },
    async fetch(input) {
      const request = typeof input === 'string' ? new Request(input) : input;
      requests.push(request.url);
      if (offline) throw new TypeError('Network unavailable');
      if (!installing && request.mode === 'navigate') return new Response(`NETWORK ${new URL(request.url).pathname}`, { headers: { 'Content-Type': 'text/html' } });
      const name = new URL(request.url).pathname.slice(scope.pathname.length);
      const file = path.join(directory, name);
      return fs.existsSync(file) ? new Response(fs.readFileSync(file), { headers: { 'Content-Type': name.endsWith('.html') ? 'text/html' : 'application/javascript' } }) : new Response('missing', { status: 404 });
    }
  });
  context.self = context;
  context.importScripts = (...urls) => urls.forEach(url => vm.runInContext(fs.readFileSync(path.join(directory, path.basename(new URL(url, scope).pathname)), 'utf8'), context));
  vm.runInContext(fs.readFileSync(path.join(directory, 'sw.js'), 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  const install = new ExtendableEvent('install');
  for (const listener of listeners.get('install') || []) listener(install);
  await install.settled();
  const activate = new ExtendableEvent('activate');
  for (const listener of listeners.get('activate') || []) listener(activate);
  await activate.settled(); installing = false;
  return {
    requests, stores, setOffline(value) { offline = value; },
    async navigate(relative) {
      const request = new Request(new URL(relative, scope));
      Object.defineProperty(request, 'mode', { value: 'navigate' });
      const event = new ExtendableEvent('fetch', { request });
      for (const listener of listeners.get('fetch') || []) listener(event);
      let response, failure;
      try { response = await event.response; } catch (error) { failure = error; }
      await event.settled().catch(() => {});
      if (failure) throw failure;
      return response;
    }
  };
}

test('real Workbox fetch routes use the network for roots, index.html and guide, with offline shell fallback but no API fallback', async () => {
  fs.writeFileSync(path.join(directory, 'fixture.js'), 'self.fixture = true;');
  fs.writeFileSync(path.join(directory, 'index.html'), '<html>current build</html>');
  fs.copyFileSync(path.join(directory, 'index.html'), path.join(directory, OFFLINE_SHELL));
  fs.mkdirSync(path.join(directory, 'graph-editor'));
  fs.writeFileSync(path.join(directory, 'graph-editor/index.html'), '<html>offline graph editor</html>');
  fs.writeFileSync(path.join(directory, 'graph-editor/editor-ABC123.js'), 'self.graphEngine = true;');
  const result = await generateSW({ ...workboxOptions(), globDirectory: directory, swDest: path.join(directory, 'sw.js'), mode: 'production' });
  assert.equal(result.warnings.length, 0);
  for (const base of ['/', '/app/example/']) {
    const worker = await workerRuntime(base);
    assert.equal(worker.requests.some(url => new URL(url).pathname === `${base}index.html`), false, 'index.html must not be precached');
    for (const route of ['', 'index.html', 'guide']) {
      const response = await worker.navigate(route);
      assert.equal(await response.text(), `NETWORK ${base}${route}`);
    }
    worker.setOffline(true);
    assert.equal(await (await worker.navigate('graph-editor/index.html')).text(), '<html>offline graph editor</html>', 'graph navigation must retain its own document, never the SPA shell');
    assert.equal(await worker.navigate('graph-editor/missing.html'), undefined, 'unknown graph documents must not become the SPA');
    for (const route of ['', 'index.html', 'guide']) assert.equal(await (await worker.navigate(route)).text(), '<html>current build</html>');
    await assert.rejects(worker.navigate('api/account'), /no-response|Network unavailable/);
    assert.equal([...worker.stores.keys()].some(name => /navigation|pages/.test(name)), false, 'no runtime page cache can pin old HTML');
  }
});

test('the shipped offline shell is byte-identical to post-processed HTML and has no automatic register injection', () => {
  const dist = path.resolve(__dirname, '../dist');
  assert.deepEqual(fs.readFileSync(path.join(dist, OFFLINE_SHELL)), fs.readFileSync(path.join(dist, 'index.html')));
  assert.doesNotMatch(fs.readFileSync(path.join(dist, 'index.html'), 'utf8'), /vite-plugin-pwa:register-sw|src=["'][^"']*registerSW\.js/);
});
