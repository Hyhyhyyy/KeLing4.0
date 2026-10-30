// Safe local bootstrap: never overwrites an environment file or an existing database.
const fs=require('node:fs');
const path=require('node:path');
const {randomBytes}=require('node:crypto');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),server=path.join(root,'apps/server');
if(Number(process.versions.node.split('.')[0])<22)throw new Error('请安装 Node.js 22 或更高版本');
const envFile=path.join(server,'.env');
if(!fs.existsSync(envFile)){
 const template=fs.readFileSync(path.join(server,'.env.example'),'utf8').replace('replace_with_a_random_secret_at_least_32_bytes',randomBytes(48).toString('hex'));
 fs.writeFileSync(envFile,template,{flag:'wx',mode:0o600});
 console.log('已创建本地 .env 和随机登录密钥；未配置任何云端密钥。');
}
require(require.resolve('dotenv',{paths:[server]})).config({path:envFile,quiet:true});
if(process.env.NODE_ENV==='production')throw new Error('此命令仅初始化本地开发环境');
const url=process.env.DATABASE_URL;
if(!url?.startsWith('file:'))throw new Error('本地初始化只支持 SQLite；不会修改云数据库');
const dbPath=path.resolve(server,'prisma',url.slice(5));
const relative=path.relative(path.join(server,'prisma'),dbPath);
if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('本地数据库必须位于 apps/server/prisma 内');
function run(args){
 const r=spawnSync(process.execPath,[require.resolve('prisma/build/index.js',{paths:[server]}),...args],{cwd:server,env:process.env,stdio:'inherit'});
 if(r.error||r.status!==0)throw r.error||new Error('Prisma 初始化失败');
}
run(['generate','--schema','prisma/schema.prisma']);
if(fs.existsSync(dbPath))console.log('保留已有本地数据库，未重建表或清除数据。');
else run(['db','execute','--schema','prisma/schema.prisma','--file','prisma/init-local.sql']);
const upgrade=spawnSync(process.execPath,[path.join(root,'scripts/upgrade-local.cjs')],{cwd:root,env:process.env,stdio:'inherit'});
if(upgrade.status!==0)throw new Error('共享会话表升级失败');
console.log('本地环境就绪：运行 npm run dev，然后访问 http://localhost:5173');
