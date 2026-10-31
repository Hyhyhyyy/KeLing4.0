const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module');
const file=require.resolve('./gateway.service.ts');
const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText;
const mod=new Module(file,module);mod.filename=file;mod.paths=module.paths;
const real=mod.require.bind(mod);mod.require=(name)=>name.includes('keling-server.cjs')?{app:()=>{throw Error('No backend requests in path tests')}}:real(name);
mod._compile(source,file);const {hostedPath}=mod.exports;
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
