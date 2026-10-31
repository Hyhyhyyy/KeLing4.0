const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const result=spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'generate','--schema',path.join(root,'vendor/schema.prisma')],{cwd:root,stdio:'inherit'});
if(result.status!==0)process.exit(result.status||1);
fs.cpSync(path.join(root,'vendor'),path.join(root,'dist/vendor'),{recursive:true});
