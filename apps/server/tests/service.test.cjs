require('ts-node/register');
const {test}=require('node:test'); const assert=require('node:assert/strict');
const {PrismaClient}=require('@prisma/client');
const {AgentService}=require('../src/agentarts/service');
test('real database isolates users, preserves sources and confirms only once',async()=>{
 const db=new PrismaClient();const id='test-'+Date.now();
 try{
  await db.user.create({data:{id,email:id+'@test.local',passwordHash:'not-a-login'}});
  const course=await db.course.create({data:{userId:id,name:'数据结构',code:'DS',teacher:'教师'}});
  const node=await db.knowledgeNode.create({data:{courseId:course.id,name:'二叉树',description:'前序、中序、后序遍历'}});
  const svc=new AgentService(db,async(input,sessionId,onEvent)=>{await assert.rejects(()=>svc.tool(input.runId,'wrong','二叉树'));const retrieved=await svc.tool(input.runId,input.toolToken,'二叉树');assert.equal(retrieved.sources[0].id,'kg:'+node.id);onEvent({name:'知识检索',type:'Http',status:'node_finished',at:new Date().toISOString()});return JSON.stringify({summary:'复习二叉树',tasks:[{title:'遍历练习',description:'完成三种遍历',date:input.startDate,minutes:30,sourceIds:['kg:'+node.id]}]});});
  const run=await svc.run(id,{courseId:course.id,goal:'准备数据结构考试',examDate:require('../src/agentarts/contract').today(),dailyMinutes:60,mode:'plan'});
  assert.equal(run.status,'SUCCEEDED',run.error);assert.equal((await svc.get(id,run.id)).events.length,2);
  await assert.rejects(()=>svc.get('other',run.id));
  await assert.rejects(()=>svc.confirm('other',run.id));
  await svc.confirm(id,run.id);await svc.confirm(id,run.id);
  assert.equal(await db.task.count({where:{userId:id}}),1);
  const fail=new AgentService(db,async()=>{throw new Error('offline');});
  const failed=await fail.run(id,{courseId:course.id,goal:'复盘学习',examDate:require('../src/agentarts/contract').today(),dailyMinutes:60,mode:'review'});
  assert.equal(failed.status,'FAILED');await assert.rejects(()=>svc.confirm(id,failed.id));
  const ungrounded=new AgentService(db,async(input)=>JSON.stringify({summary:'未检索',tasks:[{title:'遍历',description:'练习',date:input.startDate,minutes:30,sourceIds:['kg:'+node.id]}]}));
  const invented=await ungrounded.run(id,{courseId:course.id,goal:'准备考试',examDate:require('../src/agentarts/contract').today(),dailyMinutes:60,mode:'plan'});
  assert.equal(invented.status,'FAILED','不得接受未实际检索过的来源');
 }finally{await db.agentRun.deleteMany({where:{userId:id}});await db.user.deleteMany({where:{id}});await db.$disconnect();}
});


