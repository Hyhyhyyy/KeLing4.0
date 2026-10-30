const {spawnSync}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
function run(file,args,cwd=root){
  const result=spawnSync(process.execPath,[file,...args],{cwd,env:process.env,stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status||1);
}
// Migration is an explicit opt-in for a controlled deployment, never a normal
run(path.join(root,'scripts/build-shared.cjs'),[]);
// build side effect. It uses Prisma's migration ledger and the direct URL.
if(process.env.KELING_APPLY_MIGRATIONS==='1')run(path.join(root,'scripts/migrate-cloud.cjs'),[]);
// Explicit generation defeats stale dependency caches. Local SQLite data is
// never imported into a deployment.
run(require.resolve('prisma/build/index.js',{paths:[path.join(root,'apps/server')]}),['generate','--schema','apps/server/prisma/schema.postgresql.prisma']);
for(const workspace of ['server','web']){
  const cwd=path.join(root,'apps',workspace);
  run(require.resolve('typescript/bin/tsc',{paths:[cwd]}),workspace==='web'?['-b']:[],cwd);
}
const web=path.join(root,'apps/web');
run(path.join(path.dirname(require.resolve('vite/package.json',{paths:[web]})),'bin/vite.js'),['build'],web);
if(process.env.KELING_VERIFY_URL)run(path.join(root,'scripts/verify-deployment.cjs'),[]);
