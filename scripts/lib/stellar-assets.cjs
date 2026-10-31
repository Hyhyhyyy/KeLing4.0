const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '../..');
const source = path.join(root, 'assets/stellar');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function readCanonicalAssets() {
  const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'));
  const names = manifest.assets.map(asset => asset.name);
  const actual = fs.readdirSync(source).filter(name => name.endsWith('.png')).sort();
  if (!names.length || new Set(names).size !== names.length || JSON.stringify([...names].sort()) !== JSON.stringify(actual)) {
    throw new Error('Canonical artwork inventory differs from manifest; explicitly refresh the manifest after reviewing changes.');
  }
  for (const asset of manifest.assets) {
    if (!/^[a-z0-9_]+\.png$/.test(asset.name)) throw new Error('Invalid artwork filename');
    const bytes = fs.readFileSync(path.join(source, asset.name));
    if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
        bytes.length !== asset.bytes || sha256(bytes) !== asset.sha256 ||
        bytes.readUInt32BE(16) !== asset.width || bytes.readUInt32BE(20) !== asset.height) {
      throw new Error('Canonical artwork differs from manifest: ' + asset.name);
    }
  }
  return manifest;
}

module.exports = { root, source, sha256, readCanonicalAssets };
