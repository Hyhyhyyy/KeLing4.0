require('ts-node/register');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {PrismaClient}=require('@prisma/client');
const jwt=require('jsonwebtoken');
const shared=require('@keling/shared');
const {journeyNoteId,getJourneyProfile,updateJourneyProfile,getJourneyCalendar,calendarBounds}=require('../src/services/journey');
const {completeOwnedTask}=require('../src/services/taskCompletion');
const {resolveContext}=require('../src/ai/context');
const {retrieve}=require('../src/ai/retrieval');
if(process.env.NODE_ENV!=='test'||!/^file:.*keling-tests-/.test(process.env.DATABASE_URL||''))throw new Error('Use isolated test runner');
async function fixture(fn){const db=new PrismaClient(),owner=randomUUID(),other=randomUUID();try{
 for(const id of [owner,other])await db.user.create({data:{id,email:id+'@journey.test',passwordHash:'synthetic'}});
 await fn({db,owner,other});
}finally{await db.user.deleteMany({where:{id:{in:[owner,other]}}});await db.$disconnect();}}

test('journey catalog has ten unique appearances and ten matched achievement reward sets, including 6000 minute threshold',()=>{
 const c=shared.JOURNEY_CATALOG;
 assert.deepEqual(c,require('../../../packages/shared/src/journey-catalog.json'));
 for(const list of [c.avatars,c.frames,c.titles,c.furniture,c.achievements]){assert.equal(list.length,10);assert.equal(new Set(list.map(x=>x.id)).size,10);assert.deepEqual(list.map(x=>x.index),[0,1,2,3,4,5,6,7,8,9]);}
 c.achievements.forEach(a=>{for(const [list,key] of [[c.frames,'frameId'],[c.titles,'titleId'],[c.furniture,'furnitureId']])assert.equal(list.find(x=>x.id===a[key]).achievementId,a.id);});
 const facts=shared.emptyJourneyFacts();facts.studyMinutes=5999;
 const before=shared.journeyProfile(shared.emptyJourneyState(),facts);assert.equal(before.achievements.find(a=>a.id==='hundred_hours').unlocked,false);
 const after=shared.journeyProfile(before.state,{...facts,studyMinutes:6000});assert.equal(after.achievements.find(a=>a.id==='hundred_hours').unlocked,true);assert.ok(after.owned.furnitureIds.includes('furniture-9'));
 assert.equal(shared.journeyProfile(after.state,{...facts,studyMinutes:0}).achievements.find(a=>a.id==='hundred_hours').unlocked,true);
});

test('new account is empty, locked rewards cannot be equipped, first real planet record unlocks matching set once',()=>fixture(async({db,owner})=>{
 let p=await getJourneyProfile(db,owner);assert.equal(p.state.unlockedAchievementIds.length,0);assert.deepEqual(p.state.furnitureSlots,Array(10).fill(null));
 await assert.rejects(()=>updateJourneyProfile(db,owner,{expectedRevision:p.state.revision,frameId:'frame-9'}),e=>e.code==='LOCKED_REWARD');
 const course=await db.course.create({data:{userId:owner,name:'普通课程',code:'MANUAL',teacher:''}});
 assert.equal((await getJourneyProfile(db,owner)).facts.planetsCreated,0);
 const planet=await db.note.create({data:{userId:owner,title:'实际确认的星球内部记录',content:'{}',sourceType:shared.PLANET_NOTE_TYPE}});
 p=await getJourneyProfile(db,owner);assert.deepEqual(p.state.unlockedAchievementIds,['first_planet']);assert.deepEqual(p.owned.furnitureIds,['furniture-0']);
 const repeated=await getJourneyProfile(db,owner);assert.equal(repeated.state.revision,p.state.revision);assert.equal(await db.note.count({where:{userId:owner,sourceType:shared.JOURNEY_NOTE_TYPE}}),1);
 await db.note.delete({where:{id:planet.id}});assert.deepEqual((await getJourneyProfile(db,owner)).state.unlockedAchievementIds,['first_planet']);
 assert.ok(await db.course.findUnique({where:{id:course.id}}));
}));

test('equipment persists, second client reads it, duplicate furniture and stale snapshots do not overwrite',()=>fixture(async({db,owner,other})=>{
 await db.note.create({data:{userId:owner,title:'星球',content:'{}',sourceType:shared.PLANET_NOTE_TYPE}});
 const before=await getJourneyProfile(db,owner),slots=Array(10).fill(null);slots[2]='furniture-0';
 const saved=await updateJourneyProfile(db,owner,{expectedRevision:before.state.revision,avatarId:'avatar-9',frameId:'frame-0',titleId:'title-0',furnitureSlots:slots});
 assert.equal(saved.state.revision,before.state.revision+1);assert.equal((await db.user.findUnique({where:{id:owner}})).avatarUrl,'journey:avatar-9');
 const second=new PrismaClient();try{assert.deepEqual((await getJourneyProfile(second,owner)).state,saved.state);}finally{await second.$disconnect();}
 const noOp=await updateJourneyProfile(db,owner,{expectedRevision:saved.state.revision,avatarId:'avatar-9',furnitureSlots:slots});assert.equal(noOp.state.revision,saved.state.revision);
 await assert.rejects(()=>updateJourneyProfile(db,owner,{expectedRevision:before.state.revision,avatarId:'avatar-2'}),e=>e.code==='REVISION_CONFLICT');
 slots[1]='furniture-0';await assert.rejects(()=>updateJourneyProfile(db,owner,{expectedRevision:saved.state.revision,furnitureSlots:slots}),e=>e.code==='DUPLICATE_FURNITURE');
 slots[1]='furniture-1';await assert.rejects(()=>updateJourneyProfile(db,owner,{expectedRevision:saved.state.revision,furnitureSlots:slots}),e=>e.code==='LOCKED_REWARD');
 const stranger=await getJourneyProfile(db,other);assert.equal(stranger.state.avatarId,'avatar-0');assert.equal(stranger.owned.furnitureIds.length,0);
 await assert.rejects(()=>updateJourneyProfile(db,other,{expectedRevision:stranger.state.revision,frameId:'frame-0'}),e=>e.code==='LOCKED_REWARD');
 assert.deepEqual((await getJourneyProfile(db,owner)).state,saved.state);
}));

test('calendar uses Shanghai dates, valid month bounds and no invented historical minutes or duplicated task mirrors',()=>fixture(async({db,owner,other})=>{
 const createTask=(userId,title,at,minutes)=>db.task.create({data:{userId,title,description:'测试资料',type:'STUDY',status:'COMPLETED',estimatedMinutes:minutes,actualMinutes:minutes,completedAt:new Date(at)}});
 const task=await createTask(owner,'月初记录','2026-10-31T16:00:00Z',7);
 await createTask(owner,'月末记录','2026-11-30T15:59:59Z',11);
 await createTask(owner,'下月记录','2026-11-30T16:00:00Z',13);
 await createTask(other,'别人的记录','2026-11-01T01:00:00Z',101);
 await db.studyRecord.create({data:{userId:owner,taskId:task.id,type:'TASK_MIRROR',durationMinutes:7,createdAt:new Date('2026-10-31T16:00:00Z')}});
 await db.studyRecord.create({data:{userId:owner,type:'SELF_REPORTED',durationMinutes:5,createdAt:new Date('2026-11-01T16:00:00Z')}});
 await db.checkInRecord.create({data:{userId:owner,date:'20261101'}});
 await db.checkInRecord.create({data:{userId:other,date:'20261102'}});
 await db.note.create({data:{userId:owner,title:'普通笔记',content:'保存的发现',sourceType:'USER_CREATED',createdAt:new Date('2026-11-01T16:00:00Z')}});
 await db.note.create({data:{userId:owner,title:'内部布局',content:'{}',sourceType:'KNOWLEDGE_LAYOUT_INTERNAL',createdAt:new Date('2026-11-01T16:00:00Z')}});
 await db.user.update({where:{id:owner},data:{totalStudyMinutes:9000}});
 const result=await getJourneyCalendar(db,owner,'2026-11');assert.equal(result.days.length,30);assert.equal(result.timezone,'Asia/Shanghai');
 assert.deepEqual(result.totals,{studyMinutes:23,completedTasks:2,checkinDays:1,notesCreated:1});
 assert.equal(result.days[0].studyMinutes,7);assert.equal(result.days[1].studyMinutes,5);assert.equal(result.days[1].checkedIn,false);assert.equal(result.days[29].studyMinutes,11);
 assert.equal(calendarBounds('2028-02').count,29);assert.equal(calendarBounds('2027-02').count,28);
 for(const month of ['2026-13','2026-00','2026-2','1999-12','2101-01','2026-11 extra'])assert.throws(()=>calendarBounds(month),e=>e.code==='INVALID_MONTH');
}));

test('real completion service counts recorded minutes once toward achievements and daily trail',()=>fixture(async({db,owner})=>{
 const task=await db.task.create({data:{userId:owner,title:'完成一项真实接口测试任务',description:'测试资料',type:'STUDY',status:'PENDING',estimatedMinutes:25}});
 const result=await completeOwnedTask(db,owner,task.id,60);assert.equal(result.task.actualMinutes,60);
 await completeOwnedTask(db,owner,task.id,60);
 const p=await getJourneyProfile(db,owner);assert.equal(p.facts.studyMinutes,60);assert.equal(p.facts.tasksCompleted,1);assert.ok(p.state.unlockedAchievementIds.includes('first_hour'));assert.ok(!p.state.unlockedAchievementIds.includes('hundred_hours'));
 const calendar=await getJourneyCalendar(db,owner,shared.journeyDate(new Date()).slice(0,7));assert.equal(calendar.totals.studyMinutes,60);assert.equal(calendar.totals.completedTasks,1);
}));

test('untimed completion never credits estimated minutes, explicit one minute and repeated completion stay at one',()=>fixture(async({db,owner})=>{
 const make=title=>db.task.create({data:{userId:owner,title,description:'完成接口回归夹具',type:'STUDY',status:'PENDING',estimatedMinutes:120}});
 const untimed=await make('只标记完成');
 const completed=await completeOwnedTask(db,owner,untimed.id);assert.equal(completed.task.actualMinutes,0);
 const repeatedUntimed=await completeOwnedTask(db,owner,untimed.id,120);assert.equal(repeatedUntimed.alreadyCompleted,true);assert.equal(repeatedUntimed.task.actualMinutes,0);
 let profile=await getJourneyProfile(db,owner);assert.equal(profile.facts.studyMinutes,0);assert.equal(profile.achievements.find(a=>a.id==='first_hour').unlocked,false);
 const timed=await make('提交已记录的一分钟');
 const first=await completeOwnedTask(db,owner,timed.id,1);assert.equal(first.task.actualMinutes,1);
 const repeated=await completeOwnedTask(db,owner,timed.id,99);assert.equal(repeated.alreadyCompleted,true);assert.equal(repeated.task.actualMinutes,1);
 profile=await getJourneyProfile(db,owner);assert.equal(profile.facts.studyMinutes,1);assert.equal(profile.facts.tasksCompleted,2);assert.equal(profile.achievements.find(a=>a.id==='first_hour').unlocked,false);
 const calendar=await getJourneyCalendar(db,owner,shared.journeyDate(new Date()).slice(0,7));assert.equal(calendar.totals.studyMinutes,1);assert.equal(calendar.totals.completedTasks,2);
}));

test('HTTP profile enforces auth and strict inputs; internal state cannot enter notes, AI retrieval or source context',()=>fixture(async({db,owner,other})=>{
 const {app}=require('../src/index');const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const base='http://127.0.0.1:'+server.address().port+'/api';
 const token=id=>jwt.sign({userId:id},process.env.JWT_SECRET,{algorithm:'HS256',issuer:'keling-server',audience:'keling-clients'});
 const request=(path,method='GET',body,user=owner)=>fetch(base+path,{method,headers:{'Content-Type':'application/json',...(user?{Authorization:'Bearer '+token(user)}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 try{
  assert.equal((await request('/journey/catalog','GET',undefined,null)).status,200);
  assert.equal((await request('/journey/profile','GET',undefined,null)).status,401);
  const p=await(await request('/journey/profile')).json();assert.equal(p.facts.notesCreated,0);
  assert.equal((await request('/journey/profile','PATCH',{expectedRevision:p.state.revision,unlockedAchievementIds:['hundred_hours']})).status,400);
  assert.equal((await request('/journey/profile','PATCH',{expectedRevision:p.state.revision,userId:other,avatarId:'avatar-1'})).status,400);
  assert.equal((await request('/journey/profile','PATCH',{expectedRevision:p.state.revision,avatarId:'avatar-10'})).status,400);
  const id=journeyNoteId(owner);const notes=await(await request('/notes')).json();assert.ok(!notes.notes.some(n=>n.id===id));
  for(const method of ['PUT','DELETE'])assert.equal((await request('/notes/'+id,method,method==='PUT'?{content:'不应覆盖'}:undefined)).status,404);
  await assert.rejects(()=>resolveContext(db,owner,{kind:'note',id}),e=>e.code==='CONTEXT_NOT_FOUND');assert.ok(!(await retrieve(db,owner,'探索者装扮与家园','keyword')).some(s=>s.id===id));
  assert.equal((await(await request('/user/profile')).json()).user._count.notes,0);
  assert.equal((await request('/journey/calendar?month=2026-13')).status,400);
  const course=await db.course.create({data:{userId:owner,name:'学习时长记录',code:'MANUAL',teacher:''}});
  const response=await request('/courses/'+course.id+'/mastery','POST',{studyMinutes:5});assert.equal(response.status,200);
  const calendar=await(await request('/journey/calendar')).json();assert.equal(calendar.totals.studyMinutes,5);
 }finally{await new Promise(resolve=>server.close(resolve));}
}));
