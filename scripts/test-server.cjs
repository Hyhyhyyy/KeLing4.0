const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {spawnSync}=require('node:child_process');
const server=path.resolve(__dirname,'../apps/server');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'keling-tests-'));
const database='file:'+path.join(dir,'test.db').replaceAll('\\','/');
const env={...process.env,NODE_ENV:'test',DATABASE_URL:database,JWT_SECRET:'isolated-test-secret-not-used-in-any-deployment',DEEPSEEK_API_KEY:'',AGENTARTS_RUNTIME_URL:'',AGENTARTS_API_KEY:'',AGENTARTS_TOOL_SECRET:'',PLANNING_PROVIDER:'auto',TS_NODE_PROJECT:path.join(server,'tsconfig.json')};
// Tests must never inherit billable model access from the developer's shell.
for(const key of Object.keys(env))if(key.startsWith('AI_'))delete env[key];
function run(args){const r=spawnSync(process.execPath,args,{cwd:server,env,stdio:'inherit'});if(r.error)throw r.error;return r.status??1;}
const cli=require.resolve('prisma/build/index.js',{paths:[server]});
let status=run([path.resolve(__dirname,'build-shared.cjs')]);
if(!status)status=run([cli,'generate','--schema','prisma/schema.prisma']);
if(!status)status=run([require.resolve('typescript/bin/tsc',{paths:[server]}),'-p','tsconfig.json']);
if(!status)status=run([cli,'db','execute','--file','prisma/init-local.sql','--schema','prisma/schema.prisma']);
if(!status)status=run([cli,'db','execute','--file','prisma/upgrade-assistant.sql','--schema','prisma/schema.prisma']);
if(!status)status=run([cli,'db','execute','--file','prisma/upgrade-expedition.sql','--schema','prisma/schema.prisma']);
if(!status)status=run(['--test','-r','ts-node/register',...fs.readdirSync(path.join(server,'tests')).filter(f=>f.endsWith('.test.cjs')).map(f=>'tests/'+f)]);
console.log('Tests used isolated temporary SQLite; application databases were not modified.');process.exitCode=status;
