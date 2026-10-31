const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),jwt=require('jsonwebtoken');
const file=path.resolve(__dirname,'../src/config/rate-limit.ts');const mod=new Module(file,module);mod.filename=file;mod.paths=Module._nodeModulePaths(path.dirname(file));
mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,file);
const {clientRateLimitKey,accountRateLimitKey,authAttemptRateLimitKey}=mod.exports;
const env={MIAODA_APP_ID:'unit-test-app',JWT_SECRET:'unit-test-secret-with-at-least-32-bytes-only'};
const req=(auth,email='a@example.invalid')=>({ip:'10.0.0.1',headers:{authorization:auth},body:{email}});
const token=id=>'Bearer '+jwt.sign({userId:id},env.JWT_SECRET,{algorithm:'HS256',issuer:'keling-server',audience:'keling-clients'});
test('valid accounts sharing an ingress do not share their normal API budget',()=>{
 assert.notEqual(accountRateLimitKey(req(token('one')),env),accountRateLimitKey(req(token('two')),env));
});
test('unverified tokens cannot create independent rate limit buckets',()=>{
 assert.equal(accountRateLimitKey(req('Bearer fake-a'),env),clientRateLimitKey(req(),env));
 assert.equal(accountRateLimitKey(req('Bearer fake-b'),env),clientRateLimitKey(req(),env));
 assert.equal(accountRateLimitKey(req(token('one')),{}),clientRateLimitKey(req(),{}));
});
test('hosted login attempts are normalized per email without exposing email in the key',()=>{
 const first=authAttemptRateLimitKey(req(undefined,' A@Example.Invalid '),env);
 assert.equal(first,authAttemptRateLimitKey(req(),env));
 assert.notEqual(first,authAttemptRateLimitKey(req(undefined,'b@example.invalid'),env));
 assert.ok(!first.includes('@'));
 assert.equal(authAttemptRateLimitKey(req(),{}),clientRateLimitKey(req(),{}));
});
