const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),vm=require('node:vm');
const context={exports:{},AbortController,setTimeout,clearTimeout};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../../web/src/services/authRequest.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);
const {withAuthDeadline}=context.exports;
test('never-returning transport is bounded and aborted',async()=>{
 let transport;
 await assert.rejects(withAuthDeadline(signal=>{transport=signal;return new Promise(()=>{});},undefined,20),e=>e.code==='AUTH_TIMEOUT');
 assert.equal(transport.aborted,true);
});
test('cancelled attempt ignores late success and a fresh attempt succeeds',async()=>{
 const cancel=new AbortController();let finish;
 const pending=withAuthDeadline(()=>new Promise(resolve=>{finish=resolve;}),cancel.signal,1000);
 await Promise.resolve();cancel.abort();
 await assert.rejects(pending,e=>e.code==='AUTH_CANCELLED');finish('late');
 assert.equal(await withAuthDeadline(async()=> 'fresh'), 'fresh');
});
test('already-aborted attempts never send an account request',async()=>{
 const cancel=new AbortController();cancel.abort();let sent=false;
 await assert.rejects(withAuthDeadline(async()=>{sent=true;},cancel.signal),e=>e.code==='AUTH_CANCELLED');
 assert.equal(sent,false);
});
test('upstream errors remain distinguishable from timeout',async()=>{
 const error={response:{status:401,data:{error:'邮箱或密码错误'}}};
 await assert.rejects(withAuthDeadline(async()=>{throw error;}),e=>e===error);
});
