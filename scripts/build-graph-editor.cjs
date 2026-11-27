// One offline editor bundle is copied byte-for-byte to Web and Android.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { buildSync } = require('esbuild');
const root=path.resolve(__dirname,'..'), source=path.join(root,'packages/graph-editor');
const destinations=['apps/web/public/graph-editor','apps/android/app/src/main/assets/graph-editor'].map(p=>path.join(root,p));
const result=buildSync({absWorkingDir:root,entryPoints:[path.join(source,'src/editor.ts')],bundle:true,write:false,outdir:path.join(source,'dist'),entryNames:'editor-[hash]',format:'iife',platform:'browser',target:['chrome102'],minify:true,legalComments:'eof',mainFields:['module','main'],loader:{'.woff2':'file'},external:['../fonts/STZHONGS.woff2']});
const generatedNames=result.outputFiles.map(file=>path.basename(file.path));
const html=fs.readFileSync(path.join(source,'index.html'),'utf8').replace('./editor.js','./'+generatedNames.find(name=>name.endsWith('.js'))).replace('./editor.css','./'+generatedNames.find(name=>name.endsWith('.css')));
const packages=['@antv/x6','@dagrejs/dagre','@dagrejs/graphlib','lodash-es','dom-align','mousetrap','utility-types'];
const licenses=packages.map(name=>{const directory=path.dirname(require.resolve(name+'/package.json',{paths:[source]})),metadata=JSON.parse(fs.readFileSync(path.join(directory,'package.json'),'utf8'));const licenseFile=fs.readdirSync(directory).find(file=>/^licen[cs]e(?:\.md|\.txt)?$/i.test(file));return {name,version:metadata.version,license:metadata.license,text:licenseFile?fs.readFileSync(path.join(directory,licenseFile),'utf8'):''};});
for(const destination of destinations){
  fs.mkdirSync(destination,{recursive:true});
  for(const name of fs.readdirSync(destination))if(/^editor(?:-[A-Z0-9]+)?\.(?:js|css)$/.test(name)&&!generatedNames.includes(name)){
    const obsolete=path.resolve(destination,name);if(path.dirname(obsolete)!==destination)throw new Error('Generated editor path escaped destination');fs.unlinkSync(obsolete);
  }
  for(const file of result.outputFiles)fs.writeFileSync(path.join(destination,path.basename(file.path)),file.contents);
  fs.writeFileSync(path.join(destination,'index.html'),html);
  fs.writeFileSync(path.join(destination,'licenses.json'),JSON.stringify(licenses,null,2)+'\n');
  const files=[...generatedNames,'index.html','licenses.json'].map(name=>({name,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(destination,name))).digest('hex')}));
  fs.writeFileSync(path.join(destination,'manifest.json'),JSON.stringify({protocol:1,engine:'@antv/x6@3.1.8',layout:'@dagrejs/dagre@3.1.4',files},null,2)+'\n');
}
console.log(`Built local X6 + Dagre editor for Web and Android (${result.outputFiles.map(file=>`${path.basename(file.path)} ${(file.contents.length/1024).toFixed(1)} KiB`).join(', ')}).`);
