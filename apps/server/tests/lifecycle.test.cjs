require('ts-node/register');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {PrismaClient}=require('@prisma/client');
const {AgentService}=require('../src/agentarts/service');
const {today}=require('../src/agentarts/contract');
const {completeOwnedTask}=require('../src/services/taskCompletion');

async function fixture(fn){
 const db=new PrismaClient(),id=randomUUID();
 try{
  await db.user.create({data:{id,email:id+'@test.local',passwordHash:'test-only'}});
  const course=await db.course.create({data:{userId:id,name:'数据结构',code:'DS',teacher:'教师'}});
  const node=await db.knowledgeNode.create({data:{courseId:course.id,name:'二叉树',description:'学习前序、中序、后序遍历'}});
  await fn(db,id,course,node);
 }finally{await db.agentRun.deleteMany({where:{userId:id}});await db.user.deleteMany({where:{id}});await db.$disconnect();}
}

test('background run returns immediately, persists live events, and retains retrieval evidence on failure',()=>fixture(async(db,id,course)=>{
 let release,retained;const gate=new Promise(resolve=>release=resolve);
 const svc=new AgentService(db,async(input,_session,event)=>{
  await svc.tool(input.runId,input.toolToken,'二叉树');
  event({name:'规划中',type:'runtime',status:'node_started',at:new Date().toISOString()});
  await gate;throw new Error('test provider failed');
 },work=>{retained=work;});
 const run=await svc.start(id,{courseId:course.id,goal:'复习二叉树',examDate:today(),dailyMinutes:60});
 assert.ok(retained instanceof Promise);
 assert.equal(run.status,'RUNNING');assert.ok(!('toolTokenHash' in run));
 async function until(predicate){for(let i=0;i<200;i++){const value=await svc.get(id,run.id);if(predicate(value))return value;await new Promise(r=>setTimeout(r,10));}assert.fail('background run did not progress');}
 try{
  const live=await until(r=>r.events.length===2);assert.equal(live.status,'RUNNING');
  release();await retained;const failed=await until(r=>r.status==='FAILED');
  assert.ok(failed.events.some(e=>e.status==='sources_retrieved'));
  assert.ok(!failed.error.includes('test provider'));
  assert.equal(await db.task.count({where:{userId:id}}),0);
 }finally{release();}
}));

test('stale runs are recovered without creating tasks or exposing tool authorization',()=>fixture(async(db,id,course)=>{
 const run=await db.agentRun.create({data:{userId:id,courseId:course.id,goal:'旧计划',mode:'plan',startDate:today(),examDate:today(),dailyMinutes:30,toolTokenHash:'test',expiresAt:new Date(Date.now()-1)}});
 const svc=new AgentService(db);assert.equal((await svc.list(id))[0].status,'FAILED');
 await assert.rejects(()=>svc.confirm(id,run.id));
 await assert.rejects(()=>svc.tool(run.id,'test','复习'));
 assert.equal(await db.task.count({where:{userId:id}}),0);
}));

test('two devices complete once, zero minutes stays zero and invalid/cross-user calls do not mutate',()=>fixture(async(db,id,course)=>{
 const task=await db.task.create({data:{userId:id,courseId:course.id,title:'练习',description:'遍历练习',type:'DEEP_EXPLORATION',estimatedMinutes:30,rewardsExp:20}});
 await assert.rejects(()=>completeOwnedTask(db,'other',task.id,10),e=>e.status===404);
 for(const minutes of [-1,1.5,1441,'30'])await assert.rejects(()=>completeOwnedTask(db,id,task.id,minutes),e=>e.status===400);
 const before=await db.user.findUniqueOrThrow({where:{id}});
 const results=await Promise.all([completeOwnedTask(db,id,task.id,0),completeOwnedTask(db,id,task.id,0)]);
 assert.equal(results.filter(r=>!r.alreadyCompleted).length,1);
 const after=await db.user.findUniqueOrThrow({where:{id}});
 assert.equal(after.exp-before.exp,0);assert.equal(after.crystals,before.crystals);assert.equal(after.energy,before.energy);assert.equal(after.totalStudyMinutes-before.totalStudyMinutes,0);
 assert.equal((await db.task.findUniqueOrThrow({where:{id:task.id}})).actualMinutes,0);
 assert.equal((await db.course.findUniqueOrThrow({where:{id:course.id}})).studySessionCount,1);
}));

test('reward persistence failure rolls back completion so it can safely be retried',()=>fixture(async(db,id,course)=>{
 const task=await db.task.create({data:{userId:id,courseId:course.id,title:'练习',description:'遍历练习',type:'DAILY_CARE'}});
 const broken={$transaction:(fn,options)=>db.$transaction(tx=>fn({...tx,user:{...tx.user,update:async()=>{throw new Error('simulated persistence failure');}}}),options)};
 await assert.rejects(()=>completeOwnedTask(broken,id,task.id,15));
 assert.equal((await db.task.findUniqueOrThrow({where:{id:task.id}})).status,'PENDING');
 assert.equal((await completeOwnedTask(db,id,task.id,15)).alreadyCompleted,false);
 assert.equal((await db.user.findUniqueOrThrow({where:{id}})).totalStudyMinutes,15);
}));
