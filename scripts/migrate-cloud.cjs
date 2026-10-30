const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const envFile=path.join(root,'.env.vercel.local');
const local=fs.existsSync(envFile)?require('node:util').parseEnv(fs.readFileSync(envFile,'utf8')):{};
const env={...local,...process.env};
let url;
try{url=new URL(env.DIRECT_URL||'');}catch{throw new Error('Set DIRECT_URL in ignored .env.vercel.local or the shell before migrating.');}
if(!['postgres:','postgresql:'].includes(url.protocol)||!['require','verify-ca','verify-full'].includes(url.searchParams.get('sslmode'))){
  throw new Error('DIRECT_URL must be a PostgreSQL connection that requires TLS.');
}
if(url.hostname.includes('-pooler.'))throw new Error('Use the direct Neon connection for migrations, not its pooler host.');
const result=spawnSync(process.execPath,[require.resolve('prisma/build/index.js',{paths:[path.join(root,'apps/server')]}),'migrate','deploy','--schema','apps/server/prisma/schema.postgresql.prisma'],{
  cwd:root,env:{...env,DATABASE_URL:env.DIRECT_URL},encoding:'utf8'
});
// Prisma may include connection details in errors. Redact complete URLs and
// the password before any output, including URL-encoded/raw representations.
const redact=text=>{
  let safe=(text||'').replace(/postgres(?:ql)?:\/\/[^\s"']+/g,'[REDACTED_DATABASE_URL]');
  for(const secret of [url.password,decodeURIComponent(url.password)].filter(Boolean))safe=safe.split(secret).join('[REDACTED]');
  return safe;
};
if(result.stdout)process.stdout.write(redact(result.stdout));
if(result.stderr)process.stderr.write(redact(result.stderr));
if(result.error)throw new Error('Could not start Prisma migrations');
process.exitCode=result.status??1;
