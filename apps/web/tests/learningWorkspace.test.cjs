const {test}=require('node:test');const assert=require('node:assert/strict');const harness=require('./expeditionHarness.cjs');
const response=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
function material(text='原始资料'){return {title:'资料标题',sourceName:'手动',format:'TEXT',content:text,contentHash:require('node:crypto').createHash('sha256').update(text).digest('hex'),spans:[{ordinal:0,startUtf16:0,endUtf16:text.length,page:null,paragraphIndex:0,heading:'规则标题',textHash:'a'.repeat(64)}],warnings:[],parserVersion:'test',parseStatus:'READY'};}
const input=parsed=>({title:parsed.title,sourceName:parsed.sourceName,format:parsed.format,text:parsed.content});
const schedule=()=>({method:'CONSTRAINT_SCHEDULER',timezone:'Asia/Shanghai',tasks:[{title:'遍历练习',minutes:25,date:'2099-01-01',startTime:'18:30',scheduledAt:'2099-01-01T10:30:00.000Z'}],unallocated:[],diff:{added:1,changed:0,deleted:0,retainedExisting:0},warnings:[],note:'synthetic transport fixture'});
const request={startDate:'2099-01-01',examDate:'2099-01-02',dailyMinutes:50,dayStart:'18:30',dayEnd:'21:00',rest:[],excludedDates:[],units:[{title:'遍历练习',minutes:25}]};
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
