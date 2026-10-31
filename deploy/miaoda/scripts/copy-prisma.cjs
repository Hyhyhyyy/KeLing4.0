// Generated Prisma client is a runtime dependency; retain it after the platform tracer.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
for(const folder of ['.prisma/client','@prisma/client']){
 fs.cpSync(path.join(root,'node_modules',folder),path.join(root,'dist/node_modules',folder),{recursive:true});
}
