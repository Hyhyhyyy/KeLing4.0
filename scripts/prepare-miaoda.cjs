// Package the reviewed KeLing code for Miaoda; no env files or user data are copied.
const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const output=path.resolve(process.argv[2]);
const esbuild=require(require.resolve('esbuild',{paths:[path.join(root,'apps/web')]}));
async function main(){
 fs.mkdirSync(output,{recursive:true});
 const deps=Object.keys(require(path.join(root,'apps/server/package.json')).dependencies).filter(x=>x!=='@keling/shared');
 await esbuild.build({entryPoints:[path.join(root,'apps/server/src/index.ts')],outfile:path.join(output,'keling-server.cjs'),bundle:true,platform:'node',format:'cjs',target:'node22',external:[...deps,'uuid'],sourcemap:false});
 await esbuild.build({entryPoints:[path.join(root,'apps/server/src/learning/pdfWorker.ts')],outfile:path.join(output,'pdfWorker.js'),bundle:true,platform:'node',format:'cjs',target:'node22',external:deps,sourcemap:false});
 const schema=fs.readFileSync(path.join(root,'apps/server/prisma/schema.postgresql.prisma'),'utf8').replace('provider = "prisma-client-js"','provider = "prisma-client-js"\n  engineType = "client"');
 fs.writeFileSync(path.join(output,'schema.prisma'),schema);
 fs.cpSync(path.join(root,'apps/web/dist'),path.join(output,'web'),{recursive:true});
 const files={};
 function hashTree(dir){for(const file of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,file.name);if(file.isDirectory())hashTree(p);else files[path.relative(root,p).replaceAll('\\','/')]=crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');}}
 for(const dir of ['apps/server/src','apps/web/src','packages/shared/src'])hashTree(path.join(root,dir));
 fs.writeFileSync(path.join(output,'source-manifest.json'),JSON.stringify({source:'Hyhyhyyy/KeLing4.0',generatedAt:new Date().toISOString(),files},null,2)+'\n');
 console.log('Packaged existing server, shared rules and web; no migrations are run.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
