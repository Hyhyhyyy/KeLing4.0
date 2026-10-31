const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '../..');
const source = path.join(root, 'assets/stellar');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function readCanonicalAssets() {
  const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'));
  const names = manifest.assets.map(asset => asset.name);
  const actual = fs.readdirSync(source).filter(name => /\.(png|webp)$/.test(name)).sort();
  if (!names.length || new Set(names).size !== names.length || JSON.stringify([...names].sort()) !== JSON.stringify(actual)) {
    throw new Error('Canonical artwork inventory differs from manifest; regenerate metadata with scripts/prepare-stellar-art.py.');
  }
  for (const asset of manifest.assets) {
    if (!/^[a-z0-9_]+\.(png|webp)$/.test(asset.name)) throw new Error('Invalid artwork filename');
    const bytes = fs.readFileSync(path.join(source, asset.name));
    const validHeader = asset.name.endsWith('.png')
      ? bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if (!validHeader || bytes.length !== asset.bytes || sha256(bytes) !== asset.sha256) {
      throw new Error('Canonical artwork differs from manifest: ' + asset.name);
    }
  }
  return manifest;
}

module.exports = { root, source, sha256, readCanonicalAssets };
