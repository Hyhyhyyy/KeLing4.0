const {test}=require('node:test');const assert=require('node:assert/strict');const harness=require('./expeditionHarness.cjs');
const response=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
function material(text='原始资料'){return {title:'资料标题',sourceName:'手动',format:'TEXT',content:text,contentHash:require('node:crypto').createHash('sha256').update(text).digest('hex'),spans:[{ordinal:0,startUtf16:0,endUtf16:text.length,page:null,paragraphIndex:0,heading:'规则标题',textHash:'a'.repeat(64)}],warnings:[],parserVersion:'test',parseStatus:'READY'};}
const input=parsed=>({title:parsed.title,sourceName:parsed.sourceName,format:parsed.format,text:parsed.content});
const schedule=()=>({method:'CONSTRAINT_SCHEDULER',timezone:'Asia/Shanghai',tasks:[{title:'遍历练习',minutes:25,date:'2099-01-01',startTime:'18:30',scheduledAt:'2099-01-01T10:30:00.000Z'}],unallocated:[],diff:{added:1,changed:0,deleted:0,retainedExisting:0},warnings:[],note:'synthetic transport fixture'});
const request={startDate:'2099-01-01',examDate:'2099-01-02',dailyMinutes:50,dayStart:'18:30',dayEnd:'21:00',rest:[],excludedDates:[],units:[{title:'遍历练习',minutes:25}]};
test('public material tutor sends only reviewed source snippets without requiring a personal key',async()=>{
 const h=harness(),scope=h.guest(),course=h.getGuestWorkspace().courses[0].id,p=material('来自实际预览的原文');const saved=await h.saveLearningMaterial(scope,course,input(p),p,'tutor-source'),sources=await h.previewTutorSources(scope,course,[saved.id],'问题');
 h.setFetch(async(url,options)=>{assert.equal(url,'/api/trial/workspace/chat');assert.equal(options.headers.Authorization,undefined);const body=JSON.parse(options.body);assert.equal(body.credentials,undefined);assert.equal(body.model,'miaoda-chat');assert.equal(body.retrievalMode,'selected');assert.equal(body.sources[0].text,'来自实际预览的原文');return response({answer:'Synthetic source-based response'});});
 const result=await h.askMaterialTutor(scope,course,[saved.id],'问题',sources);assert.equal(result.answer,'Synthetic source-based response');assert.equal(result.sources[0].contentHash,p.contentHash);
});
test('material replacement during generation rejects the otherwise successful AI answer',async()=>{
 const h=harness(),scope=h.guest(),course=h.getGuestWorkspace().courses[0].id,p=material();const saved=await h.saveLearningMaterial(scope,course,input(p),p,'source'),sources=await h.previewTutorSources(scope,course,[saved.id],'问题');let complete;
 h.setFetch(()=>new Promise(resolve=>{complete=resolve;}));const pending=h.askMaterialTutor(scope,course,[saved.id],'问题',sources),rejected=assert.rejects(pending,/资料已变化/);await new Promise(resolve=>setImmediate(resolve));const changed=material('新的版本');await h.saveLearningMaterial(scope,course,input(changed),changed,'source-new',saved);complete(response({answer:'Old-version response'}));await rejected;
});
test('guest AI planning accepts a material-only course and refuses confirmation after that material changes',async()=>{
 const h=harness(),scope=h.guest(false),course=(await h.handleGuestData('POST','/courses',{name:'英语'})).course.id,p=material('Hello 与日常问候');const saved=await h.saveLearningMaterial(scope,course,input(p),p,'only-material');let captured;
 const date=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});
 h.setFetch(async(url,options)=>{if(url.endsWith('/catalog'))return response({providers:[{id:'public',name:'Public fixture',configured:true,chatModels:['miaoda-chat'],embeddingModels:[]}]});captured=JSON.parse(options.body);return response({result:{summary:'Synthetic source-grounded plan',tasks:[{title:'练习问候',description:'依据原文练习',date,minutes:10,sourceIds:[captured.sources[0].id]}]}});});
 const request={courseId:course,goal:'练习英语问候',examDate:date,dailyMinutes:20,mode:'plan'};
 const run=await h.handleGuestAI('POST','/agent/runs/start',request,{});await new Promise(resolve=>setImmediate(resolve));assert.equal(captured.sources[0].kind,'material');assert.match(captured.sources[0].text,/Hello/);assert.equal(h.getGuestWorkspace().nodes.length,0);
 await h.handleGuestAI('POST',`/agent/runs/${run.id}/confirm`,{},{});assert.equal(h.getGuestWorkspace().tasks.length,1);
 const next=await h.handleGuestAI('POST','/agent/runs/start',request,{});await new Promise(resolve=>setImmediate(resolve));const changed=material('已更新的英语资料');await h.saveLearningMaterial(scope,course,input(changed),changed,'new-only-material',saved);
 await assert.rejects(h.handleGuestAI('POST',`/agent/runs/${next.id}/confirm`,{},{}),error=>error.response.data.code==='CONTEXT_CHANGED');assert.equal(h.getGuestWorkspace().tasks.length,1);
});
test('material operation IDs bind all fields; immutable version replacement invalidates old map and tutor sources',async()=>{
 const h=harness(),scope=h.guest(),course=h.getGuestWorkspace().courses[0].id,p=material();const first=await h.saveLearningMaterial(scope,course,input(p),p,'save-1');
 await assert.rejects(h.saveLearningMaterial(scope,course,{...input(p),title:'different'},p,'save-1'));
 const candidates=await h.proposeMaterialMap(scope,course,[first.id]),sources=await h.previewTutorSources(scope,course,[first.id],'规则是什么');
 const changed=material('新版本资料');await h.saveLearningMaterial(scope,course,input(changed),changed,'save-2',first);
 await assert.rejects(h.confirmMaterialMap(scope,course,candidates,'map-old'));
 await assert.rejects(h.assertTutorSourcesCurrent(scope,course,sources));
 assert.equal((await h.readLearningMaterial(scope,first.id)).content,'原始资料');assert.equal((await h.listLearningMaterials(scope,course)).length,1);
});
test('explicit map confirmation is idempotent, writes original graph nodes and sources, never awards resources',async()=>{
 const h=harness(),scope=h.guest(),course=h.getGuestWorkspace().courses[0].id,p=material();const saved=await h.saveLearningMaterial(scope,course,input(p),p,'save');const candidates=await h.proposeMaterialMap(scope,course,[saved.id]);const before=h.getGuestWorkspace().nodes.length;
 await Promise.all([h.confirmMaterialMap(scope,course,candidates,'confirm'),h.confirmMaterialMap(scope,course,candidates,'confirm')]);assert.equal(h.getGuestWorkspace().nodes.length,before+1);assert.match(h.getGuestWorkspace().nodes.at(-1).description,/来源/);assert.equal(h.getGuestWorkspace().user.crystals,0);
 await h.deleteLearningMaterial(scope,saved.id);await assert.rejects(h.assertTutorSourcesCurrent(scope,course,candidates.map(x=>x.source)));
});
test('late parse or preview responses are rejected when guest identity has changed',async()=>{
 const h=harness(),scope=h.guest();let release;h.setFetch(()=>new Promise(resolve=>{release=resolve;}));const pending=h.parseLearningMaterial(scope,input(material()));const rejected=assert.rejects(pending);h.guest();release(response(material()));await rejected;assert.equal((await h.listLearningMaterials(h.currentExpeditionScope(),h.getGuestWorkspace().courses[0].id)).length,0);
});
test('schedule preview sends no authorization, leaves tasks unchanged until one atomic idempotent confirmation',async()=>{
 const h=harness(),scope=h.guest(),course=h.getGuestWorkspace().courses[0].id;h.setFetch(async(url,options)=>{assert.equal(options.credentials,'omit');assert.equal(options.headers.Authorization,undefined);assert.equal(url,'/api/learning/v1/schedule/preview');return response(schedule());});
 const preview=await h.previewLearningSchedule(scope,course,request);assert.equal(h.getGuestWorkspace().tasks.length,0);const receipt=await h.confirmLearningSchedule(scope,preview.previewId);assert.equal(receipt.added,1);assert.equal((await h.confirmLearningSchedule(scope,preview.previewId)).replayed,true);assert.equal(h.getGuestWorkspace().tasks.length,1);assert.equal(h.getGuestWorkspace().tasks[0].rewards.exp,0);
});
test('schedule refuses changed workspace and validates an entire batch before creating any task',async()=>{
 const h=harness(),scope=h.guest(),course=h.getGuestWorkspace().courses[0].id;h.setFetch(async()=>response(schedule()));const preview=await h.previewLearningSchedule(scope,course,request);
 await h.handleGuestData('POST','/tasks',{title:'新截止任务'});await assert.rejects(h.confirmLearningSchedule(scope,preview.previewId));assert.equal(h.getGuestWorkspace().tasks.length,1);
 const invalid=schedule();invalid.tasks.push({...invalid.tasks[0],title:'invalid',minutes:0});h.setFetch(async()=>response(invalid));const next=await h.previewLearningSchedule(scope,course,request);await assert.rejects(h.confirmLearningSchedule(scope,next.previewId));assert.equal(h.getGuestWorkspace().tasks.length,1);
});
test('explicit course AI preview includes only its current material/learning summary and never a lease credential',async()=>{
 const h=harness(),scope=h.guest(),course=h.getGuestWorkspace().courses[0].id,p=material();await h.saveLearningMaterial(scope,course,input(p),p,'source');
 const other=(await h.handleGuestData('POST','/courses',{name:'另一课程'})).course;const privateMaterial=material('不应跨课程发送的私有资料');await h.saveLearningMaterial(scope,other.id,input(privateMaterial),privateMaterial,'other-source');
 const run=await h.guestExpeditionRequest('POST','/runs',{opId:crypto.randomUUID(),courseId:course,questKind:'EXPLORE',objectiveKey:'bt.bfs.queue',mode:'TRAINING',deviceId:'this-device'});
 const first=await h.handleGuestAI('POST','/ai/context-preview',{kind:'course',id:course},{}),serialized=JSON.stringify(first);
 assert.ok(first.sources.some(source=>source.kind==='material'));assert.ok(first.sources.some(source=>source.kind==='evidence'));assert.equal(serialized.includes(run.writer.token),false);assert.equal(serialized.includes('不应跨课程发送'),false);
 await h.guestExpeditionRequest('POST',`/runs/${run.run.id}/commands`,{opId:crypto.randomUUID(),expectedRevision:run.run.revision,writer:run.writer,action:{type:'HINT'}});
 const second=await h.handleGuestAI('POST','/ai/context-preview',{kind:'course',id:course},{});assert.notEqual(first.fingerprint,second.fingerprint);
 const newer=material('换版后的资料');const old=(await h.listLearningMaterials(scope,course))[0];await h.saveLearningMaterial(scope,course,input(newer),newer,'new-source',old);
 const third=await h.handleGuestAI('POST','/ai/context-preview',{kind:'course',id:course},{});assert.notEqual(second.fingerprint,third.fingerprint);assert.equal(third.sources.filter(source=>source.kind==='material').length,1);
});
