// In-memory client contract checks with synthetic transport; no external model requests.
const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {test,after}=require('node:test');
const root=path.resolve(__dirname,'..'),temporary=fs.mkdtempSync(path.join(os.tmpdir(),'keling-guest-ai-')),bundle=path.join(temporary,'guest-ai.cjs');
require('esbuild').buildSync({stdin:{contents:"export * from './apps/web/src/services/guestAI';export * from './apps/web/src/services/guestData';export * from './apps/web/src/services/guestSession';export {useModelAccess} from './apps/web/src/services/modelAccess';",resolveDir:root},bundle:true,platform:'node',format:'cjs',target:'node22',define:require('./lib/vite-test-env.cjs'),outfile:bundle});
const {handleGuestAI:request,handleGuestData:crud,getGuestWorkspace,startGuestSession,endGuestSession,useModelAccess}=require(bundle);
const originalFetch=global.fetch;after(()=>{global.fetch=originalFetch;fs.rmSync(temporary,{recursive:true,force:true});});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const fresh=()=>{endGuestSession();startGuestSession();useModelAccess.setState({providerId:'openai',apiKey:'synthetic-guest-test-key',model:'test-chat',models:[],baseUrl:''});};
const input={providerId:'openai',modelId:'test-chat',title:'test',scenario:'CONCEPT_EXPLAIN',includeContext:false,retrievalMode:'keyword',embeddingProviderId:'',embeddingModelId:''};
const response=value=>new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
const makeSession=async()=> (await request('POST','/ai/sessions',input,{})).session;
test('conversation request is stateless, idempotent, carries history and saves a note once',async()=>{
 fresh();let calls=0;const messages=[];
 global.fetch=async(url,options)=>{assert.equal(url,'/api/trial/workspace/chat');assert.equal(options.credentials,'omit');assert.equal(options.headers.Authorization,undefined);calls++;messages.push(JSON.parse(options.body));return response({answer:'合成测试回答',usage:{inputTokens:3},sources:[]});};
 const s=await makeSession(),body={message:'第一个问题',clientRequestId:crypto.randomUUID()};
 const first=await request('POST',`/ai/sessions/${s.id}/turns`,body,{});await tick();
 assert.deepEqual(await request('POST',`/ai/sessions/${s.id}/turns`,body,{}),{id:first.id,status:'SUCCEEDED'});assert.equal(calls,1);
 await assert.rejects(request('POST',`/ai/sessions/${s.id}/turns`,{...body,message:'另一个问题'},{}),e=>e.response.data.code==='IDEMPOTENCY_CONFLICT');
 await Promise.all([request('POST',`/ai/turns/${first.id}/note`,{},{}),request('POST',`/ai/turns/${first.id}/note`,{},{})]);assert.equal(getGuestWorkspace().notes.length,1);
 await request('POST',`/ai/sessions/${s.id}/turns`,{message:'追问',clientRequestId:crypto.randomUUID()},{});await tick();assert.equal(messages[1].history.length,2);assert.equal(messages[1].history[0].content,'第一个问题');
 await request('DELETE',`/ai/sessions/${s.id}`,{},{});assert.equal((await request('GET','/ai/sessions',{},{})).sessions.length,0);assert.equal(getGuestWorkspace().notes.length,1);
});
test('changed context blocks generation and preserves the original question for retry',async()=>{
 fresh();global.fetch=()=>assert.fail('changed context must not call external transport');
 const note=(await crud('POST','/notes',{title:'资料',content:'旧内容'})).note;
 const context=await request('POST','/ai/context-preview',{kind:'note',id:note.id},{});
 await crud('PUT',`/notes/${note.id}`,{content:'新内容',expectedUpdatedAt:note.updatedAt});
 const s=await makeSession();await assert.rejects(request('POST',`/ai/sessions/${s.id}/turns`,{message:'资料是什么',clientRequestId:crypto.randomUUID(),context:{kind:'note',id:note.id,fingerprint:context.fingerprint}},{}),e=>e.response.data.code==='CONTEXT_CHANGED');
 assert.equal((await request('GET',`/ai/sessions/${s.id}`,{},{})).turns.length,0);
});
test('cancel and ending a guest workspace reject late responses and clear sessions',async()=>{
 fresh();const pending=[];global.fetch=(_url,options)=>new Promise(resolve=>pending.push({resolve,signal:options.signal}));
 const s=await makeSession();await request('POST',`/ai/sessions/${s.id}/turns`,{message:'取消问题',clientRequestId:crypto.randomUUID()},{});
 await request('POST',`/ai/sessions/${s.id}/cancel`,{},{});assert.equal(pending[0].signal.aborted,true);pending[0].resolve(response({answer:'不应显示',sources:[],usage:{}}));await tick();
 assert.equal((await request('GET',`/ai/sessions/${s.id}`,{},{})).turns[0].status,'CANCELLED');
 await request('POST',`/ai/sessions/${s.id}/turns`,{message:'结束前问题',clientRequestId:crypto.randomUUID()},{});endGuestSession();startGuestSession();assert.equal(pending[1].signal.aborted,true);pending[1].resolve(response({answer:'旧空间响应',sources:[],usage:{}}));await tick();
 assert.equal((await request('GET','/ai/sessions',{},{})).sessions.length,0);assert.equal(getGuestWorkspace().notes.length,0);
});
test('validated plan remains a preview until confirmation and duplicate confirmation adds no tasks',async()=>{
 fresh();const w=getGuestWorkspace(),course=w.courses[0];const date=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});
 global.fetch=async(url,options)=>url.endsWith('/catalog')?response({providers:[]}):response({result:{summary:'合成测试计划',tasks:[{title:'练习',description:'完成例题',date,minutes:25,sourceIds:[`kg:${w.nodes[0].id}`]}]},model:'test-chat'});
 const run=await request('POST','/agent/runs/start',{courseId:course.id,goal:'复习递归',examDate:date,dailyMinutes:30,mode:'plan'},{});await tick();
 assert.equal((await request('GET',`/agent/runs/${run.id}`,{},{})).status,'SUCCEEDED');assert.equal(w.tasks.length,0);
 await request('POST',`/agent/runs/${run.id}/confirm`,{},{});await request('POST',`/agent/runs/${run.id}/confirm`,{},{});assert.equal(w.tasks.length,1);assert.equal(w.tasks[0].courseId,course.id);assert.deepEqual(w.tasks[0].knowledgeNodeIds,[w.nodes[0].id]);
});

test('context fingerprint preparation serializes sends and coalesces identical request IDs',async()=>{
 fresh();let calls=0;global.fetch=async()=>{calls++;return response({answer:'合成回答',usage:{},sources:[]});};
 const note=(await crud('POST','/notes',{title:'并发资料',content:'正文'})).note;
 const context=await request('POST','/ai/context-preview',{kind:'note',id:note.id},{}),s=await makeSession();
 const digest=crypto.subtle.digest;let release;crypto.subtle.digest=(...args)=>new Promise(resolve=>{release=()=>digest.apply(crypto.subtle,args).then(resolve);});
 try{
  const body={message:'同一个问题',clientRequestId:crypto.randomUUID(),context:{...context.ref,fingerprint:context.fingerprint}};
  const first=request('POST',`/ai/sessions/${s.id}/turns`,body,{});
  const duplicate=request('POST',`/ai/sessions/${s.id}/turns`,body,{});
  await assert.rejects(request('POST',`/ai/sessions/${s.id}/turns`,{...body,clientRequestId:crypto.randomUUID(),message:'另一个问题'},{}),e=>e.response.data.code==='BUSY');
  await release();const result=await Promise.all([first,duplicate]);assert.equal(result[0].id,result[1].id);await tick();assert.equal(calls,1);
  assert.equal((await request('GET',`/ai/sessions/${s.id}`,{},{})).turns.length,1);
 }finally{crypto.subtle.digest=digest;}
});

test('cancel or delete during fingerprinting never submits the pending question to a model',async()=>{
 for(const action of ['cancel','delete']){
  fresh();global.fetch=()=>assert.fail('cancelled preparation must not reach transport');
  const note=(await crud('POST','/notes',{title:'资料',content:'正文'})).note;
  const context=await request('POST','/ai/context-preview',{kind:'note',id:note.id},{}),s=await makeSession();
  const digest=crypto.subtle.digest;let release;crypto.subtle.digest=(...args)=>new Promise(resolve=>{release=()=>digest.apply(crypto.subtle,args).then(resolve);});
  try{
   const pending=request('POST',`/ai/sessions/${s.id}/turns`,{message:'不应发送',clientRequestId:crypto.randomUUID(),context:{...context.ref,fingerprint:context.fingerprint}},{});
   const rejected=assert.rejects(pending,e=>e.response.data.code==='CANCELLED');
   await request(action==='delete'?'DELETE':'POST',`/ai/sessions/${s.id}${action==='cancel'?'/cancel':''}`,{},{});
   await release();await rejected;
   if(action==='cancel'){const state=await request('GET',`/ai/sessions/${s.id}`,{},{});assert.equal(state.session.activeRequestId,'');assert.equal(state.turns.length,0);}
   else assert.equal((await request('GET','/ai/sessions',{},{})).sessions.length,0);
  }finally{crypto.subtle.digest=digest;}
 }
});

test('plan confirmation refuses deleted or changed sources without creating tasks',async()=>{
 for(const action of ['delete','change']){
  fresh();const w=getGuestWorkspace(),course=w.courses[0],node=w.nodes[0],date=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});
  global.fetch=async url=>url.endsWith('/catalog')?response({providers:[]}):response({result:{summary:'合成计划',tasks:[{title:'练习',description:'具体步骤',date,minutes:25,sourceIds:[`kg:${node.id}`]}]}});
  const run=await request('POST','/agent/runs/start',{courseId:course.id,goal:'递归练习',examDate:date,dailyMinutes:30,mode:'plan'},{});await tick();
  await crud(action==='delete'?'DELETE':'PUT',`/knowledge/node/${node.id}`,action==='delete'?{}:{description:'资料已更新'});
  await assert.rejects(request('POST',`/agent/runs/${run.id}/confirm`,{},{}),e=>e.response.data.code==='CONTEXT_CHANGED');
  assert.equal(w.tasks.length,0);
 }
});

test('failed plan writes roll back and switching workspaces during confirmation preserves new records',async()=>{
 fresh();let w=getGuestWorkspace(),course=w.courses[0];const date=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});
 // Synthetic malformed second task proves partial writes are rolled back even if transport is invalid.
 global.fetch=async url=>url.endsWith('/catalog')?response({providers:[]}):response({result:{summary:'合成计划',tasks:[25,-1].map((minutes,i)=>({title:`练习${i}`,description:'步骤',date,minutes,sourceIds:[`kg:${w.nodes[0].id}`]}))}});
 let run=await request('POST','/agent/runs/start',{courseId:course.id,goal:'练习',examDate:date,dailyMinutes:60,mode:'plan'},{});await tick();
 await assert.rejects(request('POST',`/agent/runs/${run.id}/confirm`,{},{}));assert.equal(w.tasks.length,0);
 fresh();w=getGuestWorkspace();course=w.courses[0];
 global.fetch=async url=>url.endsWith('/catalog')?response({providers:[]}):response({result:{summary:'合成计划',tasks:[1,2].map(i=>({title:`练习${i}`,description:'步骤',date,minutes:25,sourceIds:[`kg:${w.nodes[0].id}`]}))}});
 run=await request('POST','/agent/runs/start',{courseId:course.id,goal:'练习',examDate:date,dailyMinutes:60,mode:'plan'},{});await tick();
 const confirming=request('POST',`/agent/runs/${run.id}/confirm`,{},{}),rejected=assert.rejects(confirming,e=>e.response.data.code==='CANCELLED');
 endGuestSession();startGuestSession();await crud('POST','/tasks',{title:'新空间记录'});await rejected;
 assert.deepEqual(getGuestWorkspace().tasks.map(t=>t.title),['新空间记录']);
});
