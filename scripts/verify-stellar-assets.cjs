const { readCanonicalAssets } = require('./lib/stellar-assets.cjs');
const manifest = readCanonicalAssets();
const fonts = require('./lib/shared-fonts.cjs').readCanonicalFonts();
console.log(`Verified ${manifest.assets.length} shared assets for Web and Android.`);
console.log(`Verified ${fonts.files.length} shared font files.`);
