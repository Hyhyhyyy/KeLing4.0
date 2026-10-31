const { readCanonicalAssets } = require('./lib/stellar-assets.cjs');
const manifest = readCanonicalAssets();
console.log(`Verified ${manifest.assets.length} shared assets for Web and Android.`);
