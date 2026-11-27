require('ts-node/register');
const{test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{PrismaClient}=require('@prisma/client'),jwt=require('jsonwebtoken');
const{registerNativeAiBridge}=require('../src/ai/native');
const{providers,selectedProvider,publicChatModel}=require('../src/ai/catalog');
const{complete,embed}=require('../src/ai/transport');
const{guestCatalog}=require('../src/ai/guest');
const{accessCatalog}=require('../src/ai/modelAccess');
const{planningProvider}=require('../src/agentarts/deepseek');
const{startAiJob,getAiJob}=require('../src/ai/jobs');
const{parseMaterial}=require('../src/learning/materials');
const{today}=require('../src/agentarts/contract');
const bridge=complete=>({providerId:'miaoda',name:'妙搭公共模型',modelId:'miaoda-chat',publicEnabled:true,complete});
if(process.env.NODE_ENV!=='test'||!/^file:.*keling-tests-/.test(process.env.DATABASE_URL||''))throw new Error('Use isolated test runner');
async function fixture(fn){const db=new PrismaClient(),owner=randomUUID(),other=randomUUID();try{for(const id of[owner,other])await db.user.create({data:{id,email:id+'@native-ai.test',passwordHash:'synthetic'}});const course=await db.course.create({data:{userId:owner,name:'队列学习',code:'',teacher:''}});const{warnings,spans,...data}=await parseMaterial({title:'队列讲义',format:'TEXT',text:'队列采用先进先出顺序；先进入队列的元素先离开。'});const material=await db.materialVersion.create({data:{...data,userId:owner,courseId:course.id,materialId:randomUUID(),version:1,spans:{create:spans}},include:{spans:true}});await fn({db,owner,other,course,material});}finally{registerNativeAiBridge(undefined);await db.agentRun.deleteMany({where:{OR:[{userId:{in:[owner,other,'native-ai:user:'+owner,'native-ai:user:'+other]}},{mode:'NATIVE_AI_REQUEST',userId:{startsWith:'native-ai:guest:'}}]}});await db.user.deleteMany({where:{id:{in:[owner,other]}}});await db.$disconnect();}}

test('native bridge is explicitly registered, public-opted-in and never offered as BYOK or embedding',async()=>{
 let captured;try{
  assert.equal(providers({}).some(p=>p.protocol==='native'),false);
  registerNativeAiBridge(bridge(async request=>{captured=request;return{content:'合成测试回答'};}));
  const p=selectedProvider('miaoda','miaoda-chat','chat');assert.equal(p.protocol,'native');assert.equal(publicChatModel({}).model,'miaoda-chat');assert.equal(publicChatModel({TRIAL_AI_ENABLED:'false'}),undefined);
  assert.equal(guestCatalog({}).providers[0].id,'public');assert.equal(guestCatalog({}).providers[0].chatModels[0],'miaoda-chat');assert.ok(!accessCatalog({}).some(p=>p.id==='miaoda'));
  const messages=[{role:'system',content:'说明规则'},{role:'user',content:'实际输入'}];const result=await complete(p,'miaoda-chat',messages,undefined,()=>assert.fail('native must not invent a network endpoint'),4000,'study-plan');
  assert.deepEqual(captured.messages,messages);assert.equal(captured.purpose,'study-plan');assert.equal(captured.maxOutputTokens,4000);assert.equal(result.usage.inputTokens,undefined);
  await assert.rejects(()=>embed(p,'invented-vector',['内容']),e=>e.code==='UNSUPPORTED');
  const original=process.env.PLANNING_PROVIDER;try{process.env.PLANNING_PROVIDER='auto';assert.equal(planningProvider(),'Miaoda');process.env.PLANNING_PROVIDER='agentarts';assert.notEqual(planningProvider(),'Miaoda');}finally{if(original===undefined)delete process.env.PLANNING_PROVIDER;else process.env.PLANNING_PROVIDER=original;}
 }finally{registerNativeAiBridge(undefined);}
});
test('native generation fails closed for provider errors, empty output and cancellation',async()=>{
 try{
  registerNativeAiBridge(bridge(async()=>{throw new Error('private plugin credential must not escape');}));const p=selectedProvider('miaoda','miaoda-chat','chat');
  await assert.rejects(()=>complete(p,'miaoda-chat',[{role:'user',content:'测试'}]),e=>e.code==='NATIVE_MODEL_FAILED'&&!e.message.includes('credential'));
  registerNativeAiBridge(bridge(async()=>({content:''})));await assert.rejects(()=>complete(p,'miaoda-chat',[{role:'user',content:'测试'}]),e=>e.code==='INVALID_RESPONSE');
  const controller=new AbortController();controller.abort();let called=false;registerNativeAiBridge(bridge(async()=>{called=true;return{content:'不得执行'};}));await assert.rejects(()=>complete(p,'miaoda-chat',[{role:'user',content:'测试'}],controller.signal),e=>e.code==='CANCELLED');assert.equal(called,false);
 }finally{registerNativeAiBridge(undefined);}
});
test('generic AI jobs return before completion and isolate accounts and guest polling secrets',()=>fixture(async({db,owner,other})=>{
 let finish,background;const job=await startAiJob(db,owner,async()=>new Promise(resolve=>{finish=resolve;}),p=>{background=p;});assert.equal((await getAiJob(db,job.jobId,owner)).status,'RUNNING');await assert.rejects(()=>getAiJob(db,job.jobId,other),e=>e.status===404);finish({answer:'合成测试结果',providerId:'miaoda'});await background;
 assert.equal((await getAiJob(db,job.jobId,owner)).result.answer,'合成测试结果');
 const guest=await startAiJob(db,undefined,async()=>{throw new Error('untrusted details');},p=>{background=p;});await background;await assert.rejects(()=>getAiJob(db,guest.jobId,undefined,'0'.repeat(64)),e=>e.status===404);const failed=await getAiJob(db,guest.jobId,undefined,guest.jobToken);assert.equal(failed.status,'FAILED');assert.equal(failed.code,'NATIVE_MODEL_FAILED');assert.ok(!JSON.stringify(failed).includes('untrusted'));
 const late=await startAiJob(db,owner,async()=>new Promise(resolve=>{finish=resolve;}),p=>{background=p;});await db.agentRun.update({where:{id:late.jobId},data:{expiresAt:new Date(0)}});assert.equal((await getAiJob(db,late.jobId,owner)).status,'FAILED');finish({answer:'迟到结果'});await background;assert.equal((await getAiJob(db,late.jobId,owner)).status,'FAILED');
}));

test('active native HTTP paths support account chat, guest chat, structured plan/review, tutor sources and explicit confirmation',()=>fixture(async({db,owner,other,course,material})=>{
 const calls=[];registerNativeAiBridge(bridge(async request=>{calls.push(request);if(request.purpose==='study-plan'){const data=JSON.parse(request.messages.at(-1).content),sources=data.retrievedContext?.sources||data.sources;return{content:JSON.stringify({summary:'合成测试结构计划',tasks:[{title:'队列规则练习',description:'按讲义解释先进先出',date:data.request.startDate,minutes:15,sourceIds:[sources[0].id]}]})};}return{content:request.messages[0].content.includes('学习教练')?'合成资料提示 [S1]':'合成模型回答 [资料1]'};}));
 const{app}=require('../src/index');const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));}),base='http://127.0.0.1:'+server.address().port+'/api';
 const token=id=>jwt.sign({userId:id},process.env.JWT_SECRET,{issuer:'keling-server',audience:'keling-clients'});
 const req=async(path,method='GET',body,user=owner,headers={})=>{const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(user?{Authorization:'Bearer '+token(user)}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,data:await r.json()};};
 const poll=async(job,user=owner)=>{for(let i=0;i<100;i++){const r=await req('/ai-jobs/'+job.jobId,'GET',undefined,user,job.jobToken?{'X-AI-Job-Token':job.jobToken}:{});assert.equal(r.status,200);if(r.data.status!=='RUNNING')return r.data;await new Promise(resolve=>setTimeout(resolve,10));}assert.fail('job timeout');};
 try{
  assert.equal((await req('/ai/catalog')).data.providers.find(p=>p.id==='miaoda').configured,true);assert.equal((await req('/trial/workspace/catalog','GET',undefined,null)).data.providers[0].id,'public');
  const session=(await req('/ai/sessions','POST',{providerId:'miaoda',modelId:'miaoda-chat',scenario:'CONCEPT_EXPLAIN'})).data.session;
  const turn=await req('/ai/sessions/'+session.id+'/turns','POST',{message:'说明队列',clientRequestId:randomUUID()});assert.equal(turn.status,202);let result;for(let i=0;i<100;i++){result=(await req('/ai/sessions/'+session.id)).data;if(result.turns[0]?.status==='SUCCEEDED')break;await new Promise(r=>setTimeout(r,10));}assert.equal(result.turns[0].status,'SUCCEEDED');assert.equal(result.turns[0].providerId,'miaoda');assert.equal((await req('/ai/sessions/'+session.id,'GET',undefined,other)).status,404);
  const guest=await req('/trial/workspace/chat','POST',{providerId:'public',model:'miaoda-chat',message:'根据讲义解释队列',scenario:'CONCEPT_EXPLAIN',sources:[{id:'s1',title:'队列',text:'先进先出',kind:'material'}]},null);assert.equal(guest.status,202);assert.equal((await req('/ai-jobs/'+guest.data.jobId,'GET',undefined,null)).status,404);assert.equal((await poll(guest.data,null)).result.providerId,'miaoda');
  const tutor=await req('/learning/v1/courses/'+course.id+'/tutor','POST',{message:'解释队列',materialVersionIds:[material.id]});assert.equal(tutor.status,202);assert.equal((await req('/ai-jobs/'+tutor.data.jobId,'GET',undefined,other)).status,404);const coached=await poll(tutor.data);assert.equal(coached.status,'SUCCEEDED');assert.equal(coached.result.sources[0].materialVersionId,material.id);assert.match(coached.result.answer,/\[S1\]/);
  const plan=await req('/trial/workspace/plan','POST',{model:'miaoda-chat',courseName:'队列',request:{courseId:course.id,goal:'复习队列',examDate:today(),dailyMinutes:20,mode:'review'},sources:[{id:'s1',title:'讲义',text:'先进先出',kind:'material'}],tasks:[]},null);assert.equal(plan.status,202);assert.equal((await poll(plan.data,null)).result.result.tasks[0].sourceIds[0],'s1');
  assert.equal((await req('/agent/status')).data.provider,'Miaoda');
  const run=await req('/agent/runs/start','POST',{courseId:course.id,goal:'复习队列',examDate:today(),dailyMinutes:20,mode:'plan'});assert.equal(run.status,202);let done;for(let i=0;i<100;i++){done=(await req('/agent/runs/'+run.data.id)).data;if(done.status!=='RUNNING')break;await new Promise(r=>setTimeout(r,10));}assert.equal(done.status,'SUCCEEDED',done.error);assert.ok(done.events.some(e=>e.type==='model'&&e.status==='node_finished'&&e.providerId==='miaoda'));assert.equal(await db.task.count({where:{userId:owner}}),0);assert.equal((await req('/agent/runs/'+done.id+'/confirm','POST',{})).status,200);assert.equal(await db.task.count({where:{userId:owner}}),1);
  assert.ok(calls.some(c=>c.purpose==='study-plan'));assert.ok(calls.some(c=>!c.purpose));
 }finally{await new Promise(resolve=>server.close(resolve));}
}));
