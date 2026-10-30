require('ts-node/register');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runtimeDatabaseUrl,postgresPoolConfig}=require('../src/config/database');
const {allowedCorsOrigins}=require('../src/config/security');
const {retainBackground}=require('../src/services/background');
const {clientRateLimitKey}=require('../src/config/rate-limit');

test('Vercel rate limits separate clients behind the same proxy and ignore spoofed headers locally',()=>{
  const request=ip=>({headers:{'x-vercel-forwarded-for':ip},ip:'10.0.0.1',socket:{remoteAddress:'10.0.0.1'}});
  assert.notEqual(clientRateLimitKey(request('198.51.100.1'),{VERCEL:'1'}),clientRateLimitKey(request('198.51.100.2'),{VERCEL:'1'}));
  assert.equal(clientRateLimitKey(request('198.51.100.1'),{}),'10.0.0.1');
  for(const bad of ['invalid','198.51.100.1, 198.51.100.2',['198.51.100.1']])assert.equal(clientRateLimitKey(request(bad),{VERCEL:'1'}),'10.0.0.1');
  assert.equal(clientRateLimitKey(request('2001:db8:abcd:1200::1'),{VERCEL:'1'}),clientRateLimitKey(request('2001:db8:abcd:1201::2'),{VERCEL:'1'}));
});

test('cloud connections require persistent TLS PostgreSQL and bound the instance pool',()=>{
  assert.equal(runtimeDatabaseUrl({DATABASE_URL:'file:local.db'}),'file:local.db');
  for(const value of ['', 'file:temporary.db','postgresql://u:p@host/db'])assert.throws(()=>runtimeDatabaseUrl({VERCEL:'1',DATABASE_URL:value}));
  const url=new URL(runtimeDatabaseUrl({VERCEL:'1',DATABASE_URL:'postgresql://u:p@host/db?sslmode=require'}));
  assert.equal(url.searchParams.get('connection_limit'),'1');
  assert.equal(url.searchParams.get('connect_timeout'),'15');
  assert.equal(url.searchParams.get('sslmode'),'require');
  url.searchParams.set('connection_limit','2');
  assert.equal(new URL(runtimeDatabaseUrl({VERCEL:'1',DATABASE_URL:String(url)})).searchParams.get('connection_limit'),'2');
});

test('PostgreSQL adapter caps connections and keeps full TLS certificate checks',()=>{
  const config=postgresPoolConfig('postgresql://u:p@host/db?sslmode=require&connection_limit=1&connect_timeout=25');
  assert.equal(config.max,1);assert.equal(config.connectionTimeoutMillis,25000);
  assert.equal(new URL(config.connectionString).searchParams.get('sslmode'),'verify-full');
  assert.equal(new URL(config.connectionString).searchParams.has('connection_limit'),false);
  for(const limit of ['0','-1','11','Infinity','1.5'])assert.throws(()=>postgresPoolConfig(`postgresql://u:p@host/db?connection_limit=${limit}`));
});

test('only exact configured Vercel hosts become allowed production origins',()=>{
  const keys=['NODE_ENV','CORS_ORIGINS','VERCEL','VERCEL_URL','VERCEL_PROJECT_PRODUCTION_URL','VERCEL_BRANCH_URL'];
  const before=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  try{
    Object.assign(process.env,{NODE_ENV:'production',CORS_ORIGINS:'https://learn.example',VERCEL:'1',VERCEL_URL:'keling-abc.vercel.app',VERCEL_PROJECT_PRODUCTION_URL:'keling.vercel.app',VERCEL_BRANCH_URL:'evil.test/path'});
    assert.deepEqual(allowedCorsOrigins(),['https://learn.example','https://keling-abc.vercel.app','https://keling.vercel.app']);
    assert.ok(!allowedCorsOrigins().includes('https://unrelated.vercel.app'));
    delete process.env.VERCEL;assert.deepEqual(allowedCorsOrigins(),['https://learn.example']);
  }finally{for(const key of keys){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];}}
});

test('Vercel receives the unfinished promise before a response can finish',async()=>{
  const key=Symbol.for('@vercel/request-context');
  const context=globalThis[key],before=process.env.VERCEL;
  let release,retained;
  const work=new Promise(resolve=>release=resolve);
  globalThis[key]={get:()=>({waitUntil:promise=>{retained=promise;}})};
  try{
    process.env.VERCEL='1';retainBackground(work);assert.equal(retained,work);
    release();await retained;
  }finally{if(context===undefined)delete globalThis[key];else globalThis[key]=context;if(before===undefined)delete process.env.VERCEL;else process.env.VERCEL=before;}
});

test('unconfigured deployment fails closed without loading Prisma or accepting user data',()=>{
  const before={DATABASE_URL:process.env.DATABASE_URL,JWT_SECRET:process.env.JWT_SECRET};
  try{
    delete process.env.DATABASE_URL;delete process.env.JWT_SECRET;
    const handler=require('../../../api/index.js');
    const response={headers:{},setHeader(key,value){this.headers[key]=value;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
    handler({url:'/api/auth/register'},response);
    assert.equal(response.code,503);assert.equal(response.headers['Cache-Control'],'no-store');
    assert.equal(response.body.code,'DEPLOYMENT_NOT_CONFIGURED');
  }finally{for(const [key,value] of Object.entries(before)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
