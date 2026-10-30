require('ts-node/register');
const {test}=require('node:test');const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');const jwt=require('jsonwebtoken');
const {app}=require('../src/index');const {prisma:db}=require('../src/database');
test('HTTP enforces ownership and fixed rewards; account reads do not exhaust the login quota',async()=>{
 const id=randomUUID(),other=randomUUID();
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const base='http://127.0.0.1:'+server.address().port+'/api';
 const token=jwt.sign({userId:id},process.env.JWT_SECRET,{algorithm:'HS256',issuer:'keling-server',audience:'keling-clients'});
 const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
 const post=(path,body,method='POST')=>fetch(base+path,{method,headers,body:JSON.stringify(body)});
 try{
  for(const userId of [id,other])await db.user.create({data:{id:userId,email:userId+'@test.local',passwordHash:'test-only'}});
  const foreign=await db.course.create({data:{userId:other,name:'私有课程',code:'test',teacher:'test'}});
  assert.equal((await post('/tasks',{title:'越权任务',courseId:foreign.id})).status,404);
  const response=await post('/tasks',{title:'复习',description:'练习',type:'REVIEW_RITUAL',estimatedMinutes:30,rewards:{energy:999999,crystals:999999,exp:999999}});
  assert.equal(response.status,201);const {task}=await response.json();assert.equal(task.rewards.energy,0);
  assert.equal((await post('/tasks/'+task.id,{status:'COMPLETED'},'PUT')).status,400);
  assert.equal((await post('/tasks/'+task.id+'/complete',{actualMinutes:15})).status,200);
  const again=await (await post('/tasks/'+task.id+'/complete',{actualMinutes:99})).json();assert.equal(again.alreadyCompleted,true);assert.equal(again.rewards.exp,0);
  assert.equal((await post('/tasks/'+task.id,{status:'PENDING'},'PUT')).status,409);
  for(let i=0;i<22;i++)assert.equal((await fetch(base+'/auth/me',{headers})).status,200);
  // Login attempts remain limited even though ordinary account reads are not.
  for(let i=0;i<20;i++)await post('/auth/login',{email:'missing@local.test',password:'invalid-password'});
  assert.equal((await post('/auth/login',{email:'missing@local.test',password:'invalid-password'})).status,429);
 }finally{await new Promise(resolve=>server.close(resolve));await db.user.deleteMany({where:{id:{in:[id,other]}}});await db.$disconnect();}
});
