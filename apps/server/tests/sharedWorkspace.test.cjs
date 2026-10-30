require('ts-node/register');
const {test}=require('node:test');const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');const jwt=require('jsonwebtoken');
const {app}=require('../src/index');const {prisma:db}=require('../src/database');const {checkInOnce,studyDate}=require('../src/services/checkin');
test('web and mobile sessions share profile/notes; stale writes conflict; check-in rewards are atomic',async()=>{
 const id=randomUUID(),other=randomUUID();const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const base='http://127.0.0.1:'+server.address().port+'/api';
 const token=(userId)=>jwt.sign({userId},process.env.JWT_SECRET,{algorithm:'HS256',issuer:'keling-server',audience:'keling-clients'});
 const call=(path,body,method='GET',user=id)=>fetch(base+path,{method,headers:{Authorization:'Bearer '+token(user),'Content-Type':'application/json'},body:method==='GET'?undefined:JSON.stringify(body)});
 try{
  for(const userId of [id,other])await db.user.create({data:{id:userId,email:userId+'@test.local',passwordHash:'test'}});
  assert.equal(studyDate(new Date('2026-10-28T16:01:00Z')),'20261029');
  const initial=await db.user.findUnique({where:{id}});const a=await checkInOnce(db,id,new Date('2026-10-29T03:00:00Z'));const b=await checkInOnce(db,id,new Date('2026-10-29T04:00:00Z'));
  assert.equal(a.rewards.energy,0);assert.equal(b.alreadyCheckedIn,true);assert.equal(b.rewards.energy,0);
  assert.equal((await db.user.findUnique({where:{id}})).energy,initial.energy);
  assert.equal((await call('/user/profile',{avatarUrl:'stellar:avatar-7'},'PUT')).status,200);
  assert.equal((await (await call('/auth/me')).json()).user.avatarUrl,'stellar:avatar-7');
  assert.equal((await call('/user/profile',{avatarUrl:'javascript:alert(1)'},'PUT')).status,400);
  assert.equal((await call('/user/energy',{energy:999999},'POST')).status,410);
  assert.equal((await call('/user/crystals',{change:999999},'POST')).status,410);
  assert.equal((await (await call('/user/profile')).json()).user.energy,initial.energy);
  const created=await (await call('/notes',{title:'两端笔记',content:'初稿'},'POST')).json();const note=created.note;
  assert.equal((await (await call('/notes')).json()).notes[0].id,note.id);
  assert.equal((await call('/notes/'+note.id,{title:'另一用户'},'PUT',other)).status,404);
  await new Promise(r=>setTimeout(r,5));
  assert.equal((await call('/notes/'+note.id,{content:'网页编辑',expectedUpdatedAt:note.updatedAt},'PUT')).status,200);
  assert.equal((await call('/notes/'+note.id,{content:'手机旧稿',expectedUpdatedAt:note.updatedAt},'PUT')).status,409);
  assert.equal((await (await call('/notes')).json()).notes[0].content,'网页编辑');
  const catalog=await (await call('/ai/catalog')).json();assert.equal(catalog.providers.length,14);assert.ok(catalog.providers.every(p=>!('key'in p)&&!('baseUrl'in p)));
  assert.equal((await call('/ai/chat',{message:'自动写入'},'POST')).status,410);
 }finally{await new Promise(r=>server.close(r));await db.user.deleteMany({where:{id:{in:[id,other]}}});await db.$disconnect();}
});
