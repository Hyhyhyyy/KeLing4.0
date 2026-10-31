// Generate the Web public directory from the single canonical artwork source.
const fs = require('node:fs');
const path = require('node:path');
const { root, source, readCanonicalAssets } = require('./lib/stellar-assets.cjs');

if (process.argv.length > 2) throw new Error('To regenerate artwork metadata, use scripts/prepare-stellar-art.py with the original PNG directory.');
const manifest = readCanonicalAssets();
const target = path.join(root, 'apps/web/public/stellar');
fs.mkdirSync(target, { recursive: true });
const expected = new Set(manifest.assets.map(asset => asset.name));
for (const file of fs.readdirSync(target, { withFileTypes: true })) {
  if (file.isFile() && /\.(png|webp)$/.test(file.name) && !expected.has(file.name)) fs.unlinkSync(path.join(target, file.name));
}
for (const { name } of manifest.assets) fs.copyFileSync(path.join(source, name), path.join(target, name));
fs.copyFileSync(path.join(source, 'manifest.json'), path.join(target, 'manifest.json'));
console.log(`Prepared ${manifest.assets.length} Web images from assets/stellar.`);
