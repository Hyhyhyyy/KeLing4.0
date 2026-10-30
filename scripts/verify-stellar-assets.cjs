const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/stellar/manifest.json'),'utf8'));
for(const asset of manifest.assets)for(const directory of ['assets/stellar','apps/web/public/stellar','apps/android/app/src/main/assets/stellar']){
 const bytes=fs.readFileSync(path.join(root,directory,asset.name));
 if(crypto.createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw new Error('Asset drift: '+directory+'/'+asset.name);
 if(bytes.readUInt32BE(16)!==asset.width||bytes.readUInt32BE(20)!==asset.height)throw new Error('Invalid dimensions: '+asset.name);
}
if(!fs.readFileSync(path.join(root,'apps/android/app/src/main/res/drawable-nodpi/stellar_app_icon.png')).equals(fs.readFileSync(path.join(root,'assets/stellar/app_icon.png'))))throw new Error('Launcher icon drift');
console.log(`Verified ${manifest.assets.length} canonical PNGs, both clients and the Android launcher icon.`);
