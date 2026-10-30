require('ts-node/register');
const {test}=require('node:test'), assert=require('node:assert/strict'), {randomUUID}=require('node:crypto');
const {prisma:db}=require('../src/database');
const service=require('../src/expedition/service');
const core=require('@keling/shared/expedition');
const fixtures=require('../../../packages/shared/src/expedition/fixtures.json');
const NOW=new Date(fixtures.now), fail=code=>error=>error.code===code;
function account(crystals=0){return {revision:0,level:1,exp:0,crystals,legacy:{level:1,exp:0,crystals,energy:100,capturedAt:NOW.toISOString()},world:core.emptyWorld(),quota:{day:'',cycleCount:0,crystalsGranted:0}};}
async function fixture(fn){const userId=randomUUID();await db.user.create({data:{id:userId,email:userId+'@expedition.test',passwordHash:'fixture',level:2,exp:13,crystals:8,energy:71}}); const course=await db.course.create({data:{userId,name:'原创树试验',code:'TEST',teacher:'fixture'}});try{return await fn(userId,course.id);}finally{for(const model of ['expeditionOperation','rewardGrant','questRun','expeditionProgress','expeditionAccount','materialVersion'])await db[model].deleteMany({where:{userId}});await db.user.delete({where:{id:userId}});}}
const open=(userId,courseId,extra={})=>service.startRun(db,userId,{opId:randomUUID(),courseId,questKind:'EXPLORE',objectiveKey:'bt.bfs.queue',mode:'TRAINING',deviceId:'web-device',...extra},NOW);
async function submit(userId,started,answer,extra={}){return service.commandRun(db,userId,started.run.id,{opId:randomUUID(),expectedRevision:started.run.revision,writer:started.writer,action:{type:'SUBMIT',answer},...extra},NOW);}
const answerFor=run=>core.expectedAnswer(core.CHAPTER.exercises.find(e=>e.id===run.exerciseIds[run.exerciseIndex]));

test('original seed and cross-platform judgment fixtures remain honest about review',()=>{
 assert.equal(core.CHAPTER.exercises.length,18);assert.equal(new Set(core.CHAPTER.exercises.map(x=>x.id)).size,18);
 for(const e of core.CHAPTER.exercises){core.validateTree(e.tree);assert.equal(e.review.humanStatus,'PENDING');assert.equal(e.review.reviewer,null);}
 const canonicalCase=fixtures.selfReportCases[0];assert.equal(core.selfReportCanonical(canonicalCase.input,canonicalCase.now),canonicalCase.canonical);assert.equal('self-report:'+service.digest(canonicalCase.canonical),canonicalCase.stableKey);
 for(const row of fixtures.judgmentCases){const exercise=core.CHAPTER.exercises.find(e=>e.id===row.exerciseId);if(row.expected.errorCode)assert.throws(()=>core.evaluate(exercise,row.answer),fail(row.expected.errorCode));else{const got=core.evaluate(exercise,row.answer);for(const [key,value]of Object.entries(row.expected))assert.deepEqual(got[key],value,row.id+':'+key);}}
});
test('pure core distinguishes human pending, hints, first mistake and delayed clock',()=>{
 const row=fixtures.sequenceCases[0];let next=core.createRun(row.input,core.createProgress());let result;
 row.actions.forEach((action,i)=>{result=core.reduceCommand(next.run,next.progress,action,{now:fixtures.now,operationId:'op-'+i});next=result;});
 assert.equal(result.run.status,'SETTLED');assert.equal(result.evidenceDelta[0].kind,'ATTEMPTED');assert.equal(result.evidenceDelta[0].strict,false);assert.equal(result.rewardCandidates[0].stableKey,row.expected.rewardKey);
 assert.equal(result.progress.objectives[0].review.dueAt,row.expected.dueAt);
 assert.throws(()=>core.createRun({...row.input,questKind:'REVIEW',now:fixtures.sequenceCases[1].now},result.progress),fail('REVIEW_NOT_DUE'));
 const chapter=JSON.parse(JSON.stringify(core.CHAPTER));for(const e of chapter.exercises)e.review={ruleVerified:true,humanStatus:'APPROVED',reviewer:'TEST_FIXTURE_ONLY',reviewedAt:fixtures.now};
 for(const intervention of ['HINT','WRONG_FIRST','HINT_AFTER']){
  let state=core.createRun({...row.input,mode:'INDEPENDENT'},core.createProgress(),chapter);const exercise=chapter.exercises.find(e=>e.id===state.run.exerciseIds[0]);
  const act=a=>{state=core.reduceCommand(state.run,state.progress,a,{now:fixtures.now,operationId:randomUUID(),chapter});};
  if(intervention==='HINT')act({type:'HINT'});if(intervention==='WRONG_FIRST')act({type:'SUBMIT',answer:{structure:'STACK',order:[]}});
  act({type:'SUBMIT',answer:core.expectedAnswer(exercise)});if(intervention==='HINT_AFTER')act({type:'HINT'});act({type:'ACK_FEEDBACK',nextStep:'继续理解条件'});
  assert.equal(state.evidenceDelta[0].strict,false,intervention);
 }
 let approved=core.createRun({...row.input,mode:'INDEPENDENT'},core.createProgress(),chapter);approved=core.reduceCommand(approved.run,approved.progress,{type:'SUBMIT',answer:core.expectedAnswer(chapter.exercises.find(e=>e.id===approved.run.exerciseIds[0]))},{now:fixtures.now,operationId:'approved-answer',chapter});approved=core.reduceCommand(approved.run,approved.progress,{type:'ACK_FEEDBACK',nextStep:'预约回访'},{now:fixtures.now,operationId:'approved-feedback',chapter});assert.equal(approved.evidenceDelta[0].kind,'INDEPENDENT');
 // An old practice-only follow-up must not be relabelled delayed verification after publication approval.
 let followup=core.createRun({...row.input,questKind:'REVIEW',mode:'INDEPENDENT',now:row.expected.dueAt},result.progress,chapter);
 followup=core.reduceCommand(followup.run,followup.progress,{type:'SUBMIT',answer:core.expectedAnswer(chapter.exercises.find(e=>e.id===followup.run.exerciseIds[0]))},{now:row.expected.dueAt,operationId:'first-reviewed-followup-answer',chapter});
 followup=core.reduceCommand(followup.run,followup.progress,{type:'ACK_FEEDBACK',nextStep:'在独立证据后重新预约24小时验证'},{now:row.expected.dueAt,operationId:'first-reviewed-followup-ack',chapter});
 assert.equal(followup.evidenceDelta[0].kind,'INDEPENDENT');assert.equal(followup.progress.objectives[0].review.dueAt,'2026-11-01T02:00:00.000Z');
});
test('stable economy caps daily loops and crystals and never reprices an existing grant',()=>{
 const candidates=Array.from({length:6},(_,i)=>({stableKey:'cycle:fixture:'+i,kind:'CYCLE',exp:10,crystals:2,reason:'test',sourceId:'e-'+i}));
 const result=core.settleRewards(account(),candidates,[],fixtures.now);assert.equal(result.account.exp,50);assert.equal(result.account.crystals,10);assert.equal(result.grants.length,6);assert.equal(result.grants[5].exp,0);
 const repeated=core.settleRewards(result.account,candidates,result.grants.map(g=>g.stableKey),'2026-10-31T02:00:00Z');assert.equal(repeated.grants.length,0);assert.equal(repeated.account.crystals,10);
 const before=account();before.quota={day:'2026-10-30',cycleCount:0,crystalsGranted:29};const capped=core.settleRewards(before,[fixtures.sequenceCases[4].candidate],[],fixtures.now);assert.equal(capped.account.crystals,1);assert.equal(capped.account.quota.crystalsGranted,30);
 assert.throws(()=>core.applyDecoration(account(5),'BUY','antenna'),fail('INSUFFICIENT_CRYSTALS'));const bought=core.applyDecoration(account(6),'BUY','antenna');assert.equal(bought.cost,6);assert.equal(core.applyDecoration(bought.account,'BUY','antenna').cost,0);
});
test('persisted learning is idempotent, scoped, source-linked and does not convert legacy balances',()=>fixture(async(userId,courseId)=>{
 const first=await service.getChapter(db,userId,courseId,NOW);assert.deepEqual(first.account.legacy,{level:2,exp:13,crystals:8,energy:71,capturedAt:fixtures.now});
 assert.ok(first.progress.state.objectives.every(o=>o.state==='UNEXPLORED'));
 const started=await open(userId,courseId);const submitted=await submit(userId,started,answerFor(started.run));
 const input={opId:randomUUID(),expectedRevision:submitted.run.revision,writer:started.writer,action:{type:'ACK_FEEDBACK',nextStep:'明天再练习'}};
 const [a,b]=await Promise.all([service.commandRun(db,userId,started.run.id,input,NOW),service.commandRun(db,userId,started.run.id,input,NOW)]);
 assert.equal(a.rewardGrants.length,1);assert.equal(a.account.crystals,10);assert.equal(b.account.crystals,10);assert.equal(a.evidenceDelta[0].strict,false);assert.ok(a.evidenceDelta[0].sources.length>0);
 assert.equal(await db.rewardGrant.count({where:{userId}}),1);assert.equal((await db.user.findUnique({where:{id:userId}})).energy,71);
 await assert.rejects(service.commandRun(db,userId,started.run.id,{...input,action:{type:'ACK_FEEDBACK',nextStep:'不同请求'}},NOW),fail('IDEMPOTENCY_CONFLICT'));
 const events=await db.expeditionOperation.findMany({where:{userId}});assert.ok(events.every(x=>!x.payload.includes(started.writer.token)&&!x.receipt.includes(started.writer.token)));
 const publicRun=await service.getRun(db,userId,started.run.id,NOW);assert.ok(!JSON.stringify(publicRun).includes(started.writer.token));
 assert.equal((await service.courseEvidence(db,userId,courseId)).evidence.length,1);
 await assert.rejects(service.getRun(db,randomUUID(),started.run.id,NOW),fail('NOT_FOUND'));
}));
test('two devices cannot overwrite; restart re-signing preserves queued operation identity',()=>fixture(async(userId,courseId)=>{
 const started=await open(userId,courseId);const queued={opId:randomUUID(),expectedRevision:0,writer:started.writer,action:{type:'SUBMIT',answer:answerFor(started.run)}};
 const rotated=await service.leaseRun(db,userId,started.run.id,{opId:randomUUID(),expectedRevision:0,deviceId:started.writer.deviceId,intent:'acquire'},NOW);
 assert.equal(rotated.writer.epoch,started.writer.epoch);assert.equal(rotated.run.revision,0);assert.notEqual(rotated.writer.token,started.writer.token);
 await assert.rejects(service.commandRun(db,userId,started.run.id,queued,NOW),fail('WRITER_CHANGED'));
 const submitted=await service.commandRun(db,userId,started.run.id,{...queued,writer:rotated.writer},NOW);
 const takeover=await service.leaseRun(db,userId,started.run.id,{opId:randomUUID(),expectedRevision:submitted.run.revision,deviceId:'phone-device',intent:'takeover'},NOW);
 assert.ok(takeover.writer.epoch>rotated.writer.epoch);
 const replay=await service.commandRun(db,userId,started.run.id,queued,NOW);assert.equal(replay.replayed,true);
 await assert.rejects(service.commandRun(db,userId,started.run.id,{...queued,opId:randomUUID(),expectedRevision:takeover.run.revision,action:{type:'HINT'}},NOW),fail('WRITER_CHANGED'));
 const won=await service.commandRun(db,userId,started.run.id,{opId:randomUUID(),expectedRevision:takeover.run.revision,writer:takeover.writer,action:{type:'ACK_FEEDBACK',nextStep:'保留解释下次继续'}},NOW);assert.equal(won.run.status,'SETTLED');
}));
test('copied courses and repeated runs share canonical reward keys; purchases charge once',()=>fixture(async(userId,courseId)=>{
 const copy=await db.course.create({data:{userId,name:'复制课程',code:'COPY',teacher:'test'}});
 for(const target of [courseId,copy.id]){const started=await open(userId,target),submitted=await submit(userId,started,answerFor(started.run));await service.commandRun(db,userId,started.run.id,{opId:randomUUID(),expectedRevision:submitted.run.revision,writer:started.writer,action:{type:'ACK_FEEDBACK',nextStep:'复习此学习目标'}},NOW);}
 assert.equal(await db.rewardGrant.count({where:{userId,kind:'CYCLE'}}),1);
 const before=(await service.rewards(db,userId,NOW)).account;const input={opId:randomUUID(),expectedRevision:before.revision,action:'BUY',decorationId:'antenna'};const bought=await service.baseCommand(db,userId,input,NOW);assert.equal(bought.account.crystals,4);
 const repeat=await service.baseCommand(db,userId,input,NOW);assert.equal(repeat.replayed,true);assert.equal(repeat.account.crystals,4);assert.equal(await db.rewardGrant.count({where:{userId,kind:'PURCHASE'}}),1);
 await db.course.delete({where:{id:copy.id}});assert.equal(await db.rewardGrant.count({where:{userId,kind:'CYCLE'}}),1);
}));
test('material versions invalidate unfinished runs without erasing original evidence',()=>fixture(async(userId,courseId)=>{
 const started=await open(userId,courseId);const source=started.run.sources[0],old=await db.materialVersion.findUnique({where:{id:source.materialVersionId}});
 await db.materialVersion.create({data:{userId,courseId,materialId:old.materialId,version:2,title:old.title,format:old.format,content:'新版内容',contentHash:service.digest('新版内容'),parserVersion:'fixture',sourceName:'fixture',supersedesId:old.id}});
 await assert.rejects(submit(userId,started,answerFor(started.run)),fail('CONTENT_STALE'));
 assert.equal(await service.invalidateMaterialRuns(db,userId,old.id),1);assert.equal((await service.getRun(db,userId,started.run.id,NOW)).run.status,'CONTENT_STALE');assert.equal(await db.rewardGrant.count({where:{userId}}),0);
}));

test('different simultaneous commands conflict and failed reward writes roll back all projections',()=>fixture(async(userId,courseId)=>{
 const started=await open(userId,courseId);const base={expectedRevision:0,writer:started.writer,action:{type:'SUBMIT',answer:answerFor(started.run)}};
 const results=await Promise.allSettled([service.commandRun(db,userId,started.run.id,{...base,opId:randomUUID()},NOW),service.commandRun(db,userId,started.run.id,{...base,opId:randomUUID()},NOW)]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.find(x=>x.status==='rejected').reason.code,'VERSION_CONFLICT');
 const submitted=results.find(x=>x.status==='fulfilled').value,opId=randomUUID();const input={opId,expectedRevision:submitted.run.revision,writer:started.writer,action:{type:'ACK_FEEDBACK',nextStep:'保留草稿以后回访'}};
 const trigger='expedition_fail_'+userId.replaceAll('-','');await db.$executeRawUnsafe(`CREATE TRIGGER ${trigger} BEFORE INSERT ON RewardGrant WHEN NEW.userId = '${userId}' BEGIN SELECT RAISE(ABORT, 'fixture reward storage failure'); END`);
 try{await assert.rejects(service.commandRun(db,userId,started.run.id,input,NOW));}finally{await db.$executeRawUnsafe(`DROP TRIGGER ${trigger}`);}
 const unchanged=await service.getRun(db,userId,started.run.id,NOW);assert.equal(unchanged.run.status,'AWAITING_FEEDBACK');assert.equal(unchanged.account.crystals,8);assert.equal(await db.expeditionOperation.count({where:{userId,opId}}),0);assert.equal((await service.courseEvidence(db,userId,courseId)).evidence.length,0);
 const recovered=await service.commandRun(db,userId,started.run.id,input,NOW);assert.equal(recovered.run.status,'SETTLED');assert.equal(recovered.account.crystals,10);
}));

test('HTTP contracts reject authority injection and preserve owned state on lease conflicts',()=>fixture(async(userId,courseId)=>{
 const express=require('express'),jwt=require('jsonwebtoken'),{expeditionRouter}=require('../src/expedition/routes');const app=express();app.use(express.json());app.use('/api/expedition/v1',expeditionRouter(db));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));}),base='http://127.0.0.1:'+server.address().port+'/api/expedition/v1';
 const auth='Bearer '+jwt.sign({userId},process.env.JWT_SECRET,{algorithm:'HS256',issuer:'keling-server',audience:'keling-clients'});
 const post=(path,body)=>fetch(base+path,{method:'POST',headers:{Authorization:auth,'Content-Type':'application/json'},body:JSON.stringify(body)});
 try{
  assert.equal((await fetch(base+'/catalog')).status,401);
  assert.equal((await post('/runs',{opId:randomUUID(),courseId,deviceId:'web',questKind:'EXPLORE',mode:'TRAINING',humanReviewed:true})).status,400);
  const response=await post('/runs',{opId:randomUUID(),courseId,deviceId:'web',questKind:'EXPLORE',mode:'TRAINING'});assert.equal(response.status,200);const start=await response.json();
  const injected=await post('/runs/'+start.run.id+'/commands',{opId:randomUUID(),expectedRevision:0,writer:start.writer,action:{type:'SUBMIT',answer:answerFor(start.run),crystals:999}});assert.equal(injected.status,400);
  const stale=await post('/runs/'+start.run.id+'/commands',{opId:randomUUID(),expectedRevision:99,writer:start.writer,action:{type:'HINT'}});assert.equal(stale.status,409);const body=await stale.json();assert.equal(body.code,'VERSION_CONFLICT');assert.equal(body.current.run.revision,0);assert.ok(!JSON.stringify(body).includes(start.writer.token));
  const before=await db.user.findUnique({where:{id:userId}});assert.equal(before.crystals,8);
 }finally{await new Promise(resolve=>server.close(resolve));}
}));

test('explicit self-report is capped, content-idempotent, records minutes once and creates no knowledge evidence',()=>fixture(async(userId,courseId)=>{
 const input={opId:randomUUID(),courseId,title:'线下课堂练习',notes:'这是自己的学习记录，没有独立验证。',durationMinutes:3};
 const [first,duplicate]=await Promise.all([service.selfReport(db,userId,input,NOW),service.selfReport(db,userId,{...input,opId:randomUUID()},NOW)]);
 assert.equal([first,duplicate].filter(r=>r.alreadyRecorded).length,1);assert.equal(await db.studyRecord.count({where:{userId}}),1);
 const replay=await service.selfReport(db,userId,input,new Date('2026-10-31T02:00:00Z'));assert.equal(replay.replayed,true);assert.equal(await db.studyRecord.count({where:{userId}}),1);
 for(let i=1;i<6;i++)await service.selfReport(db,userId,{...input,opId:randomUUID(),title:'另一学习记录'+i},NOW);
 const current=(await service.rewards(db,userId,NOW)).account;assert.equal(current.exp,23);assert.equal(current.crystals,8);assert.equal(current.quota.selfReportCount,5);
 const user=await db.user.findUnique({where:{id:userId}});assert.equal(user.totalStudyMinutes,18);assert.equal(user.energy,71);
 assert.equal(await db.rewardGrant.count({where:{userId,kind:'SELF_REPORT'}}),6);assert.equal(await db.rewardGrant.count({where:{userId,kind:'SELF_REPORT',exp:0}}),1);
 assert.equal(await db.expeditionProgress.count({where:{userId}}),0);
 const history=await service.selfReportHistory(db,userId);assert.equal(history.records.length,6);assert.equal(history.nextCursor,null);assert.ok(history.records.every(r=>r.type==='SELF_REPORTED'));await assert.rejects(service.selfReportHistory(db,randomUUID(),history.records[0].id),fail('NOT_FOUND'));
 await assert.rejects(service.selfReport(db,userId,{...input,opId:randomUUID(),durationMinutes:0},NOW),fail('VALIDATION'));
}));

test('expired leases preserve drafts as conflicts and require explicit new epoch',()=>fixture(async(userId,courseId)=>{
 const started=await open(userId,courseId);const now=new Date(NOW.getTime()+120001);const input={opId:randomUUID(),expectedRevision:0,writer:started.writer,action:{type:'SUBMIT',answer:answerFor(started.run)}};
 await assert.rejects(service.commandRun(db,userId,started.run.id,input,now),fail('WRITER_CHANGED'));
 const renewed=await service.leaseRun(db,userId,started.run.id,{opId:randomUUID(),expectedRevision:0,deviceId:started.writer.deviceId,intent:'acquire'},now);
 assert.equal(renewed.writer.epoch,2);assert.equal(renewed.run.revision,1);
 await assert.rejects(service.commandRun(db,userId,started.run.id,{...input,writer:renewed.writer},now),fail('VERSION_CONFLICT'));
 assert.equal((await service.getRun(db,userId,started.run.id,now)).run.attempts.length,0);
}));

test('authoritative pause intervals survive recovery and cancellation without minting study time',()=>fixture(async(userId,courseId)=>{
 const started=await open(userId,courseId);const at=ms=>new Date(NOW.getTime()+ms);let revision=0;
 const command=async(type,ms)=>{const result=await service.commandRun(db,userId,started.run.id,{opId:randomUUID(),expectedRevision:revision,writer:started.writer,action:{type}},at(ms));revision=result.run.revision;return result;};
 const paused=await command('PAUSE',10000);assert.equal(paused.run.pausedAt,at(10000).toISOString());
 const recovered=await service.getRun(db,userId,started.run.id,at(40000));assert.deepEqual(recovered.run.timing,{asOf:at(40000).toISOString(),elapsedMs:40000,pausedMs:30000,runningMs:10000,label:'SESSION_TIME_NOT_STUDY'});
 const resumed=await command('RESUME',70000);assert.equal(resumed.run.pausedMs,60000);assert.equal(resumed.run.pausedAt,null);
 const cancelled=await command('CANCEL',90000);assert.equal(cancelled.run.timing.runningMs,30000);assert.equal(cancelled.run.endedAt,at(90000).toISOString());
 const later=await service.getRun(db,userId,started.run.id,at(600000));assert.equal(later.run.timing.elapsedMs,90000);assert.equal(later.run.timing.runningMs,30000);
 assert.equal((await db.user.findUnique({where:{id:userId}})).totalStudyMinutes,0);assert.equal(await db.rewardGrant.count({where:{userId}}),0);
}));
