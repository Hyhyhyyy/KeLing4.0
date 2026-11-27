const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
require('reflect-metadata');
const ts = require('typescript');
const { NestFactory } = require('@nestjs/core');
const { Module: NestModule, Logger } = require('@nestjs/common');
const { FileService } = require('@lark-apaas/fullstack-nestjs-core');

const fontPath = process.env.KELING_FONT_SOURCE || path.resolve(__dirname, '../../../../../assets/fonts/STZHONGS.woff2');
const font = fs.readFileSync(fontPath);
const fontHash = '0451629e411c5b66319cd1558adb59eb9e0660fe07c5537ec7356254823a61c5';
assert.equal(crypto.createHash('sha256').update(font).digest('hex'), fontHash, 'Use the reviewed font asset');
Logger.overrideLogger(false);

function loadController(filename, exported) {
  const full = path.join(__dirname, filename);
  const output = ts.transpileModule(fs.readFileSync(full, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, experimentalDecorators: true, emitDecoratorMetadata: true },
  }).outputText;
  const mod = new Module(full, module);
  mod.filename = full;
  mod.paths = Module._nodeModulePaths(path.dirname(full));
  mod._compile(output, full);
  return mod.exports[exported];
}
const ArtworkController = loadController('artwork.controller.ts', 'ArtworkController');
const FontController = loadController('font.controller.ts', 'FontController');
const ReleaseController = loadController('release.controller.ts', 'ReleaseController');
const DownloadController = loadController('download.controller.ts', 'DownloadController');

async function fixture(run, overrides = {}) {
  const calls = [];
  const fake = { from(bucket) { return {
    async createSignedUrl(asset, seconds) {
      calls.push({ method: 'sign', bucket, asset, seconds });
      if (overrides.sign) return overrides.sign();
      return 'https://example.invalid/public-art.webp';
    },
    async download(asset) {
      calls.push({ method: 'download', bucket, asset });
      return { content: new Blob([overrides.download ? await overrides.download() : font]), metadata: null };
    },
  }; } };
  class TestModule {}
  NestModule({ controllers: [ReleaseController, ArtworkController, FontController, DownloadController], providers: [{ provide: FileService, useValue: fake }] })(TestModule);
  const app = await NestFactory.create(TestModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  try { await run(await app.getUrl(), calls); } finally { await app.close(); }
}

test('artwork routes sign only the reviewed objects and ignore caller paths', async () => {
  await fixture(async (origin, calls) => {
    for (const [name, asset, hash] of [
      ['title_mascots', '/1882830203673659.webp', 'cb7465ec80df7de393563fe1dc7933fd2867acda31cd8152eb609493b327fd78'],
      ['navigation_arrow', '/1882832922057850.webp', 'b722445a6f11afa60081ef6c92cb3a907acd288df5832e839212c65d398b6107'],
      ['guide_scroll', '/1882902547070985.webp', 'ddb5f0afe6b4545cc062cd18abc0bce73b18fd2b9ec3094209e290bf56a0f695'],
    ]) {
      const response = await fetch(`${origin}/stellar/${name}.webp?path=/private-file`, { redirect: 'manual' });
      assert.equal(response.status, 302);
      assert.equal(response.headers.get('location'), 'https://example.invalid/public-art.webp');
      assert.equal(response.headers.get('cache-control'), 'public, max-age=300');
      assert.equal(response.headers.get('x-content-sha256'), hash);
      assert.deepEqual(calls.at(-1), { method: 'sign', bucket: 'bucket_aadk4xawzf4xg', asset, seconds: 3600 });
    }
  });
});

test('unlisted artwork and fonts never request storage', async () => {
  await fixture(async (origin, calls) => {
    for (const relative of ['/stellar/private.webp', '/fonts/private.woff2']) {
      assert.equal((await fetch(origin + relative)).status, 404);
    }
    assert.equal(calls.length, 0);
  });
});

test('Android download signs only the frozen graph and AI RC2 package and does not cache its redirect', async () => {
  await fixture(async (origin, calls) => {
    const response = await fetch(origin + '/download/android?path=/private-file', { redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-content-sha256'), 'ad3569e2fb5e930e9827ba30a9163da1c01c1cdf2d14359809a20f68dfc0ba48');
    assert.equal(response.headers.get('location'), 'https://example.invalid/public-art.webp');
    assert.deepEqual(calls, [{ method: 'sign', bucket: 'bucket_aadk4xawzf4xg', asset: '/1882980283768928.apk', seconds: 3600 }]);
  });
});

test('artwork signing failures and unsafe signed URLs return uncached errors', async () => {
  for (const value of ['http://example.invalid/asset', 'https://user:pass@example.invalid/asset', null]) {
    await fixture(async (origin) => {
      const response = await fetch(origin + '/stellar/navigation_arrow.webp', { redirect: 'manual' });
      assert.equal(response.status, 503);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('location'), null);
    }, { sign() { if (value === null) throw new Error('Signing unavailable'); return value; } });
  }
});

test('font bytes use the fixed object with WOFF2 MIME, public CORS and integrity header', async () => {
  await fixture(async (origin, calls) => {
    const response = await fetch(origin + '/fonts/STZHONGS.woff2?path=/private-file', { headers: { Origin: 'https://example.invalid' } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'font/woff2');
    assert.equal(response.headers.get('content-length'), String(font.length));
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
    assert.equal(response.headers.get('cross-origin-resource-policy'), 'cross-origin');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('cache-control'), 'public, max-age=86400');
    assert.equal(response.headers.get('x-content-sha256'), fontHash);
    assert.equal(response.headers.get('location'), null);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), font);
    assert.deepEqual(calls, [{ method: 'download', bucket: 'bucket_aadk4xawzf4xg', asset: '/1882832924311610.woff2' }]);
  });
});

test('font loading is shared and cached, with conditional GET and HEAD support', async () => {
  await fixture(async (origin, calls) => {
    const url = origin + '/fonts/STZHONGS.woff2';
    const responses = await Promise.all([fetch(url), fetch(url)]);
    assert.deepEqual(responses.map(response => response.status), [200, 200]);
    await Promise.all(responses.map(response => response.arrayBuffer()));
    const conditional = await fetch(url, { headers: { 'If-None-Match': `W/"${fontHash}"` } });
    assert.equal(conditional.status, 304);
    assert.equal((await conditional.arrayBuffer()).byteLength, 0);
    assert.equal(conditional.headers.get('etag'), `"${fontHash}"`);
    const head = await fetch(url, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-length'), String(font.length));
    assert.equal((await head.arrayBuffer()).byteLength, 0);
    assert.equal(calls.length, 1);
  });
});

test('font size and hash mismatches are rejected without caching', async () => {
  const corrupt = Buffer.from(font);
  corrupt[corrupt.length - 1] ^= 1;
  for (const value of [font.subarray(0, 8), corrupt]) {
    await fixture(async (origin) => {
      const response = await fetch(origin + '/fonts/STZHONGS.woff2');
      assert.equal(response.status, 503);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.match(response.headers.get('content-type'), /application\/json/);
      assert.notEqual(response.headers.get('etag'), `"${fontHash}"`);
      assert.equal(response.headers.get('x-content-sha256'), null);
    }, { download() { return value; } });
  }
});

test('a failed font download does not prevent a successful retry', async () => {
  let attempts = 0;
  await fixture(async (origin, calls) => {
    const url = origin + '/fonts/STZHONGS.woff2';
    assert.equal((await fetch(url)).status, 503);
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), font);
    assert.equal(calls.length, 2);
  }, { download() { if (++attempts === 1) throw new Error('Storage temporarily unavailable'); return font; } });
});

test('version checks use the verified published APK without a GitHub network dependency', async () => {
  await fixture(async (origin, calls) => {
    for (const code of [28,29]) {
      const r=await fetch(origin+'/api/app/version?versionCode='+code);
      const value=await r.json();
      assert.equal(r.status,200); assert.equal(value.success,true);
      assert.equal(value.latestVersion.versionCode,29);
      assert.equal(value.latestVersion.fileSize,78331402);
      assert.equal(value.latestVersion.sha256,'ad3569e2fb5e930e9827ba30a9163da1c01c1cdf2d14359809a20f68dfc0ba48');
      assert.equal(value.needUpdate,code<29); assert.equal(value.forceUpdate,false);
      assert.equal(r.headers.get('cache-control'),'no-store');
    }
    assert.equal(calls.length,0);
  });
});
