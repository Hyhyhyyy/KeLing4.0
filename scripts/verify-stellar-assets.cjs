const fs = require('node:fs');
const path = require('node:path');
const { root, sha256, readCanonicalAssets } = require('./lib/stellar-assets.cjs');
const manifest = readCanonicalAssets();
const android = JSON.parse(fs.readFileSync(path.join(root, 'docs/auth/android-art-manifest.json'), 'utf8'));
const directory = path.join(root, 'apps/android/app/src/main/optimizedAssets/stellar');
if (android.files.length !== manifest.assets.length) throw new Error('Incomplete Android artwork inventory');
const expected = android.files.map(asset => asset.file).sort();
const actual = fs.readdirSync(directory).filter(name => name.endsWith('.webp')).sort();
if (JSON.stringify(actual) !== JSON.stringify(expected) || new Set(expected).size !== expected.length) throw new Error('Unexpected Android artwork');
for (const asset of android.files) {
  if (!/^[a-z0-9_]+\.webp$/.test(asset.file)) throw new Error('Invalid Android artwork filename');
  const original = manifest.assets.find(item => item.name === asset.source);
  if (!original || original.sha256 !== asset.sourceSha256 || original.width !== asset.width || original.height !== asset.height) {
    throw new Error('Android artwork needs regeneration: ' + asset.file);
  }
  const bytes = fs.readFileSync(path.join(directory, asset.file));
  if (bytes.length !== asset.bytes || sha256(bytes) !== asset.sha256 ||
      bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error('Android artwork differs from manifest: ' + asset.file);
  }
}
console.log(`Verified ${manifest.assets.length} canonical PNGs and ${android.files.length} Android WebP derivatives.`);
