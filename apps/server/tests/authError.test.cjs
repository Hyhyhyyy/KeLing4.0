const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),vm=require('node:vm');
const context={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../../web/src/services/authError.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);
const {authErrorMessage,validAuthResponse}=context.exports;
test('auth errors distinguish unavailable network from rejected credentials and rate limits',()=>{
 assert.match(authErrorMessage({code:'ERR_NETWORK'},'失败'),/网络无法连接/);
 assert.equal(authErrorMessage({response:{status:401,data:{error:'邮箱或密码错误'}}},'失败'),'邮箱或密码错误');
 assert.match(authErrorMessage({response:{status:503,data:{error:'internal detail'}}},'失败'),/服务暂不可用/);
 assert.match(authErrorMessage({response:{status:429}},'失败'),/过于频繁/);
 assert.equal(authErrorMessage({response:{status:400,data:{error:{sensitive:true}}}},'失败'),'失败');
});
test('malformed auth success cannot establish a logged-in session',()=>{
 for(const data of [null,{}, {token:''},{token:'t',user:{}},{token:'t',user:{id:'u'}}])assert.equal(validAuthResponse(data),false);
 assert.equal(validAuthResponse({token:'t',user:{id:'u',name:'名',email:'a@b.com'}}),true);
});
