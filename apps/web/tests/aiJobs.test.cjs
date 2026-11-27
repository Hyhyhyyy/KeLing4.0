const {test}=require('node:test');
const assert=require('node:assert/strict');
const harness=require('./expeditionHarness.cjs');
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});

test('guest native job uses opaque polling token, never an existing account bearer, and unwraps the actual result',async()=>{
 const h=harness();h.account();h.guest(false);let calls=0;
 h.setFetch(async(url,options)=>{calls++;assert.equal(options.headers.Authorization,undefined);if(calls===1){assert.equal(url,'/api/trial/workspace/chat');return response({jobId:'native-job',jobToken:'opaque-test-job-token',status:'RUNNING'},202);}assert.equal(url,'/api/ai-jobs/native-job');assert.equal(options.headers['X-AI-Job-Token'],'opaque-test-job-token');return response({jobId:'native-job',status:'SUCCEEDED',result:{answer:'Synthetic transport result',sources:[]}});});
 const actual=await h.requestAI('/trial/workspace/chat',{message:'question'});assert.equal(actual.answer,'Synthetic transport result');assert.equal(calls,2);
});
test('account native polling preserves bearer while synchronous BYOK does not trigger a job poll',async()=>{
 const h=harness();h.account('native-owner');let calls=0;
 h.setFetch(async(_url,options)=>{assert.equal(options.headers.Authorization,'Bearer verified-native-owner');return ++calls===1?response({jobId:'account-job',status:'RUNNING'},202):response({status:'SUCCEEDED',result:{answer:'Actual synthetic completion'}});});
 assert.equal((await h.requestAI('/learning/v1/courses/course/tutor',{},undefined,true)).answer,'Actual synthetic completion');assert.equal(calls,2);
 h.setFetch(async()=>{calls++;return response({answer:'Synchronous result'});});assert.equal((await h.requestAI('/trial/workspace/chat',{})).answer,'Synchronous result');assert.equal(calls,3);
});
test('failed native job stays failed; stopping waiting prevents another poll and returns cancellation',async()=>{
 const h=harness();h.guest(false);let calls=0;
 h.setFetch(async()=>++calls===1?response({jobId:'failed-job',status:'RUNNING'},202):response({status:'FAILED',code:'PROVIDER_ERROR',error:'Synthetic model failure'}));
 await assert.rejects(h.requestAI('/trial/workspace/chat',{}),error=>error.response.data.code==='PROVIDER_ERROR');assert.equal(calls,2);
 const abort=new AbortController();calls=0;h.setFetch(async()=>{calls++;return response({jobId:'cancelled-job',status:'RUNNING'},202);});const pending=h.requestAI('/trial/workspace/chat',{},abort.signal);const rejected=assert.rejects(pending,error=>error.response.data.code==='CANCELLED');await new Promise(resolve=>setImmediate(resolve));abort.abort();await rejected;assert.equal(calls,1);
});
test('changing workspace rejects a late native response before another user can consume it',async()=>{
 const h=harness();h.guest(false);let complete;
 h.setFetch(()=>new Promise(resolve=>{complete=resolve;}));const pending=h.requestAI('/trial/workspace/chat',{}),rejected=assert.rejects(pending,error=>error.response.data.code==='CANCELLED');h.guest(false);complete(response({answer:'Previous visitor result'}));await rejected;
});
