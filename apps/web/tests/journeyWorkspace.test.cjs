const {test}=require('node:test');
const assert=require('node:assert/strict');
const harness=require('./expeditionHarness.cjs');
test('visitor cannot equip locked rewards; first saved note unlocks exactly its frame,title,furniture',async()=>{
 const h=harness();h.guest(false);
 let p=await h.journeyAPI.profile();assert.equal(p.owned.furnitureIds.length,0);
 await assert.rejects(()=>h.journeyAPI.patch({expectedRevision:p.state.revision,frameId:'frame-9'}),/完成对应成就/);
 await h.handleGuestData('POST','/notes',{title:'我的发现',content:'先确定问题，再记录依据。'});
 p=await h.journeyAPI.profile();assert.deepEqual(Array.from(p.owned.furnitureIds),['furniture-2']);
 const slots=Array(10).fill(null);slots[3]='furniture-2';
 const equipped=await h.journeyAPI.patch({expectedRevision:p.state.revision,avatarId:'avatar-9',frameId:'frame-2',titleId:'title-2',furnitureSlots:slots});
 assert.equal(equipped.state.avatarId,'avatar-9');assert.equal(equipped.state.furnitureSlots[3],'furniture-2');
 assert.equal(h.getGuestWorkspace().user.avatarUrl,'journey:avatar-9');
 assert.equal((await h.journeyAPI.profile()).state.titleId,'title-2');
 await assert.rejects(()=>h.journeyAPI.patch({expectedRevision:p.state.revision,avatarId:'avatar-0'}),/另一端更新/);
 const repeated=await h.journeyAPI.patch({expectedRevision:equipped.state.revision,furnitureSlots:slots});
 assert.equal(repeated.state.revision,equipped.state.revision);
 h.guest(false);assert.equal((await h.journeyAPI.profile()).state.avatarId,'avatar-0');assert.equal((await h.journeyAPI.profile()).owned.furnitureIds.length,0);
});
test('calendar records completion minutes once and separates checks and notes on Beijing day',async()=>{
 const h=harness();h.guest(false);
 const {task}=await h.handleGuestData('POST','/tasks',{title:'阅读一次课程',estimatedMinutes:25});
 await h.handleGuestData('POST',`/tasks/${task.id}/complete`,{actualMinutes:3});
 await h.handleGuestData('POST',`/tasks/${task.id}/complete`,{actualMinutes:9});
 await h.handleGuestData('POST','/checkin');
 await h.handleGuestData('POST','/notes',{title:'轨迹笔记',content:'本次学习记录。'});
 const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
 const calendar=await h.journeyAPI.calendar(today.slice(0,7));
 const day=calendar.days.find(d=>d.date===today);
 assert.equal(day.studyMinutes,3);assert.equal(day.completedTasks,1);assert.equal(day.notesCreated,1);assert.equal(day.checkedIn,true);
 assert.equal(calendar.totals.studyMinutes,3);assert.equal((await h.journeyAPI.profile()).facts.studyMinutes,3);
 assert.equal((await h.journeyAPI.profile()).achievements.find(a=>a.id==='hundred_hours').unlocked,false);
 await assert.rejects(()=>h.journeyAPI.calendar('2026-13'),/月份无效/);
});
test('ordinary sample courses do not unlock the generated-planet achievement',async()=>{
 const h=harness();h.guest(true);let p=await h.journeyAPI.profile();assert.equal(p.facts.planetsCreated,0);
 await h.handleGuestData('POST','/courses',{name:'人工整理课程',code:'AI_PLANET'});
 p=await h.journeyAPI.profile();assert.equal(p.facts.planetsCreated,0);assert.equal(p.achievements.find(a=>a.id==='first_planet').unlocked,false);
});
test('untimed completion counts a task without treating its planned duration as study time',async()=>{
 const h=harness();h.guest(false);
 const {task}=await h.handleGuestData('POST','/tasks',{title:'尚未计时的整理任务',estimatedMinutes:120});
 const result=await h.handleGuestData('POST',`/tasks/${task.id}/complete`,{});
 assert.equal(result.task.actualMinutes,0);
 const p=await h.journeyAPI.profile();assert.equal(p.facts.tasksCompleted,1);assert.equal(p.facts.studyMinutes,0);
 assert.equal(p.achievements.find(a=>a.id==='first_hour').unlocked,false);
 const month=new Date(Date.now()+8*3600000).toISOString().slice(0,7);
 assert.equal((await h.journeyAPI.calendar(month)).totals.studyMinutes,0);
});
test('a pending journey read cannot unlock rewards in a replacement visitor workspace',async()=>{
 const h=harness();h.guest(false);
 await h.handleGuestData('POST','/notes',{title:'上一位探索者的记录',content:'这项成就只属于当前会话。'});
 const pending=h.journeyAPI.profile();h.guest(false);
 await assert.rejects(pending,/学习空间已切换/);
 const next=await h.journeyAPI.profile();assert.equal(next.owned.furnitureIds.length,0);assert.equal(next.facts.notesCreated,0);
});
