const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module');
const file=require.resolve('./gateway.service.ts');
const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText;
const mod=new Module(file,module);mod.filename=file;mod.paths=module.paths;
const real=mod.require.bind(mod);mod.require=(name)=>name.includes('keling-server.cjs')?{app:()=>{throw Error('No backend requests in path tests')}}:real(name);
mod._compile(source,file);const {hostedPath,GatewayService}=mod.exports;
test('hosted API paths retain query-free route and strip only complete prefix',()=>{
 assert.equal(hostedPath('/app/app_17h4dw5jwdg/api/auth/login','/app/app_17h4dw5jwdg'),'/api/auth/login');
 assert.equal(hostedPath('/app/app_17h4dw5jwdgx/api','/app/app_17h4dw5jwdg'),'/app/app_17h4dw5jwdgx/api');
});
test('web root and direct local path remain valid',()=>{
 assert.equal(hostedPath('/app/app_17h4dw5jwdg','/app/app_17h4dw5jwdg'),'/');
 assert.equal(hostedPath('/api/health',''),'/api/health');
});
test('reject traversal and encoded traversal',()=>{
 for(const value of ['/../secret','/%2e%2e/secret','/a/%00b','/%5csecret'])assert.throws(()=>hostedPath(value,''));
});
test('decode file names without allowing a remote target',()=>{
 assert.equal(hostedPath('/assets/a%20b.png',''),'/assets/a b.png');
 assert.throws(()=>hostedPath('https://example.com',''));
});

async function withGateway(run) {
 const express=require('express');
 const app=express(),gateway=new GatewayService();
 app.use((req,res,next)=>{gateway.forward(req,res).catch(next);});
 const server=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});
 try {await run(`http://127.0.0.1:${server.address().port}/app/app_17h4dw5jwdg`);}
 finally {await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
}

test('stable entry files bypass browser and intermediary caches',async()=>{
 await withGateway(async base=>{
  for(const path of ['/index.html','/offline-shell.html','/sw.js','/registerSW.js','/manifest.webmanifest','/sw%2ejs?check=1']){
   const response=await fetch(base+path);
   assert.equal(response.status,200,path);
   assert.equal(response.headers.get('cache-control'),'no-store, no-cache, must-revalidate',path);
   await response.arrayBuffer();
  }
 });
});

test('SPA navigation uses the same non-cacheable entry policy',async()=>{
 await withGateway(async base=>{
  for(const path of ['','/','/explore','/guide','?release=20261126-rc6']){
   const response=await fetch(base+path);
   assert.equal(response.status,200,path);
   assert.equal(response.headers.get('cache-control'),'no-store, no-cache, must-revalidate',path);
   assert.match(response.headers.get('content-type'),/^text\/html/);
   await response.arrayBuffer();
  }
 });
});

test('hashed assets keep their cache policy and absent files remain 404',async()=>{
 const path=require('node:path');
 const root=path.resolve(__dirname,'../../../vendor/web');
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'../source-manifest.json'),'utf8'));
 const asset=Object.keys(manifest.webBuild.generatedFiles).find(name=>/^assets\/index-[\w-]+\.js$/.test(name));
 assert.ok(asset);
 await withGateway(async base=>{
  const response=await fetch(base+'/'+asset);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'public, max-age=3600');
  await response.arrayBuffer();
  assert.equal((await fetch(base+'/missing-update-script.js')).status,404);
 });
});
