// Generated Prisma client is a runtime dependency; retain it after the platform tracer.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function retain(source,target){
 if(fs.statSync(source).isDirectory()){
  fs.mkdirSync(target,{recursive:true});
  for(const entry of fs.readdirSync(source))retain(path.join(source,entry),path.join(target,entry));
  return;
 }
 if(fs.existsSync(target)){
  const a=fs.statSync(source),b=fs.statSync(target);
  // The platform tracer already hard-links many files; copying a file onto itself fails on Windows.
  if(a.dev===b.dev&&a.ino===b.ino)return;
 }
 fs.copyFileSync(source,target);
}
for(const folder of ['.prisma/client','@prisma/client']){
 retain(path.join(root,'node_modules',folder),path.join(root,'dist/node_modules',folder));
}
