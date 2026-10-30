// A separate static showcase: no credentials, database, API or login forms.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),web=path.join(root,'apps/web');
const output=path.join(root,'.cache','public-preview');
const env={...process.env,VITE_PUBLIC_PREVIEW:'true',VITE_API_BASE_URL:'/api'};
function run(file,args){const r=spawnSync(process.execPath,[file,...args],{cwd:web,env,stdio:'inherit'});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status||1);}
run(require.resolve('typescript/bin/tsc',{paths:[web]}),['-b']);
run(path.join(path.dirname(require.resolve('vite/package.json')),'bin/vite.js'),['build','--outDir',output]);
fs.writeFileSync(path.join(output,'vercel.json'),JSON.stringify({rewrites:[{source:'/(.*)',destination:'/index.html'}],headers:[{source:'/sw.js',headers:[{key:'Cache-Control',value:'no-cache'}]}]},null,2)+'\n');
console.log('Static preview prepared in .cache/public-preview. No server secrets or application database are included.');
