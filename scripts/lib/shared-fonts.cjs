const fs = require('node:fs');
const path = require('node:path');
const { root, sha256 } = require('./stellar-assets.cjs');

const source = path.join(root, 'assets/fonts');
function readCanonicalFonts() {
  const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'));
  const expected = ['STZHONGS.TTF', 'STZHONGS.woff2'];
  if (JSON.stringify(manifest.files.map(file => file.name).sort()) !== JSON.stringify(expected)) {
    throw new Error('The shared font inventory differs from its manifest.');
  }
  for (const file of manifest.files) {
    const bytes = fs.readFileSync(path.join(source, file.name));
    const signature = file.name.endsWith('.TTF')
      ? bytes.subarray(0, 4).toString('hex') === '00010000'
      : bytes.toString('ascii', 0, 4) === 'wOF2';
    if (!signature || bytes.length !== file.bytes || sha256(bytes) !== file.sha256) {
      throw new Error('Shared font differs from manifest: ' + file.name);
    }
  }
  return manifest;
}

function syncWebFonts() {
  readCanonicalFonts();
  const target = path.join(root, 'apps/web/public/fonts');
  fs.mkdirSync(target, { recursive: true });
  fs.copyFileSync(path.join(source, 'STZHONGS.woff2'), path.join(target, 'STZHONGS.woff2'));
}

module.exports = { readCanonicalFonts, syncWebFonts };
