// Copy canonical art byte-for-byte; each client handles layout/cell selection at render time.
const fs = require('node:fs'); const path = require('node:path'); const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..'), source = path.join(root, 'assets/stellar');
const files = fs.readdirSync(source).filter(f => f.endsWith('.png'));
if (!files.length) throw new Error('No canonical stellar assets found');
const destinations = ['apps/web/public/stellar', 'apps/android/app/src/main/assets/stellar'];
const manifest = files.map(name => { const bytes = fs.readFileSync(path.join(source, name)); return { name, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }; });
for (const dest of destinations) {
  fs.mkdirSync(path.join(root, dest), { recursive: true });
  for (const file of files) fs.copyFileSync(path.join(source, file), path.join(root, dest, file));
  fs.writeFileSync(path.join(root, dest, 'manifest.json'), JSON.stringify({ version: 1, assets: manifest }, null, 2) + '\n');
}
fs.writeFileSync(path.join(source, 'manifest.json'), JSON.stringify({ version: 1, assets: manifest }, null, 2) + '\n');
fs.copyFileSync(path.join(source, 'app_icon.png'), path.join(root, 'apps/android/app/src/main/res/drawable-nodpi/stellar_app_icon.png'));
console.log(`Synced ${files.length} canonical PNGs to Web and Android without changing artwork.`);
