// Generate the Web public directory from the single canonical artwork source.
const fs = require('node:fs');
const path = require('node:path');
const { root, source, sha256, readCanonicalAssets } = require('./lib/stellar-assets.cjs');

if (process.argv.includes('--refresh-manifest')) {
  const assets = fs.readdirSync(source).filter(name => name.endsWith('.png')).sort().map(name => {
    const bytes = fs.readFileSync(path.join(source, name));
    return { name, bytes: bytes.length, sha256: sha256(bytes), width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  });
  fs.writeFileSync(path.join(source, 'manifest.json'), JSON.stringify({ version: 1, assets }, null, 2) + '\n');
}
const manifest = readCanonicalAssets();
const target = path.join(root, 'apps/web/public/stellar');
fs.mkdirSync(target, { recursive: true });
for (const { name } of manifest.assets) fs.copyFileSync(path.join(source, name), path.join(target, name));
fs.copyFileSync(path.join(source, 'manifest.json'), path.join(target, 'manifest.json'));
console.log(`Prepared ${manifest.assets.length} Web images from assets/stellar.`);
