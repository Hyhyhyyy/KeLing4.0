require('ts-node/register');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {PrismaClient}=require('@prisma/client');
const jwt=require('jsonwebtoken');
const {editKnowledgeNode}=require('../src/services/knowledgeNodeEdits');
if(process.env.NODE_ENV!=='test'||!/^file:.*keling-tests-/.test(process.env.DATABASE_URL||''))throw new Error('Use isolated test runner');

async function fixture(fn){const db=new PrismaClient(),owner=randomUUID(),other=randomUUID();try{
 for(const id of[owner,other])await db.user.create({data:{id,email:id+'@node-edit.test',passwordHash:'synthetic'}});
 const course=await db.course.create({data:{userId:owner,name:'编辑关系测试',code:'NODE_EDIT_TEST',teacher:''}});
 const sameOwnerCourse=await db.course.create({data:{userId:owner,name:'另一个课程',code:'NODE_EDIT_TEST',teacher:''}});
 const foreignCourse=await db.course.create({data:{userId:other,name:'其他账号课程',code:'NODE_EDIT_TEST',teacher:''}});
 const elsewhere=[];for(const c of[sameOwnerCourse,foreignCourse])elsewhere.push(await db.knowledgeNode.create({data:{courseId:c.id,name:'不可关联'}}));
 await fn({db,owner,other,course,elsewhere});
}finally{await db.user.deleteMany({where:{id:{in:[owner,other]}}});await db.$disconnect();}}

test('active HTTP node edit persists prerequisite and difficulty, keeps inverse relations and existing fields on reload',()=>fixture(async({db,owner,other,course,elsewhere})=>{
 const {app}=require('../src/index');const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const base='http://127.0.0.1:'+server.address().port+'/api';const token=id=>jwt.sign({userId:id},process.env.JWT_SECRET,{algorithm:'HS256',issuer:'keling-server',audience:'keling-clients'});
 const request=(path,method='GET',body,user=owner)=>fetch(base+path,{method,headers:{'Content-Type':'application/json',...(user?{Authorization:'Bearer '+token(user)}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const create=async body=>{const r=await request('/knowledge/'+course.id+'/nodes','POST',body);assert.equal(r.status,201);return(await r.json()).node;};
 const get=async id=>(await(await request('/knowledge/node/'+id)).json()).node;
 const snapshot=()=>db.knowledgeNode.findMany({where:{courseId:course.id},orderBy:{id:'asc'}});
 try{
  const a=await create({name:'起点',positionX:0,positionY:1}),b=await create({name:'中间',parentIds:[a.id],difficulty:2}),c=await create({name:'终点',masteryLevel:.25});
  assert.equal(a.positionX,0);assert.equal(a.positionY,1);assert.deepEqual((await get(a.id)).childIds,[b.id]);assert.equal(c.masteryLevel,.25);
  const payload={name:'新的终点',description:'编辑后保留的完整描述',parentIds:[b.id],difficulty:5,masteryLevel:.75,isUnlocked:true,positionX:0,positionY:1};
  assert.equal((await request('/knowledge/node/'+c.id,'PUT',payload)).status,200);
  const reloaded=await get(c.id);for(const[key,value]of Object.entries(payload))assert.deepEqual(reloaded[key],value);
  assert.ok(Date.parse(reloaded.updatedAt)>Date.parse(c.updatedAt));assert.deepEqual((await get(b.id)).childIds,[c.id]);
  assert.equal((await request('/knowledge/node/'+c.id,'PUT',{parentIds:[a.id],difficulty:1})).status,200);
  assert.deepEqual((await get(b.id)).childIds,[]);assert.deepEqual(new Set((await get(a.id)).childIds),new Set([b.id,c.id]));
  const before=await snapshot();
  for(const body of[{parentIds:[c.id]},{parentIds:[a.id,a.id]},{difficulty:0},{difficulty:6},{difficulty:1.5},{positionX:1.1},{masteryLevel:-1},{name:' '}] ){
   const r=await request('/knowledge/node/'+c.id,'PUT',body);assert.equal(r.status,400);assert.equal((await r.json()).code,'VALIDATION');assert.deepEqual(await snapshot(),before);
  }
  // c depends on a. Making a depend on c must reject the entire combined content/relation edit.
  const cycle=await request('/knowledge/node/'+a.id,'PUT',{parentIds:[c.id],description:'不能被部分保存',difficulty:4});assert.equal(cycle.status,400);assert.deepEqual(await snapshot(),before);
  for(const node of elsewhere){assert.equal((await request('/knowledge/node/'+c.id,'PUT',{parentIds:[node.id]})).status,404);assert.equal((await request('/knowledge/'+course.id+'/nodes','POST',{name:'非法前置',parentIds:[node.id]})).status,404);}
  assert.equal((await request('/knowledge/node/'+c.id,'PUT',{difficulty:3},other)).status,404);assert.equal((await request('/knowledge/node/'+c.id,'PUT',{difficulty:3},null)).status,401);
  assert.deepEqual(await snapshot(),before);
  const list=await(await request('/knowledge/'+course.id+'/nodes')).json();assert.deepEqual(list.nodes.find(n=>n.id===c.id).parentIds,[a.id]);assert.equal(list.nodes.find(n=>n.id===c.id).difficulty,1);
  // Deletion must leave remaining nodes editable, and must never rewrite a different course.
  const untouched=await db.knowledgeNode.update({where:{id:elsewhere[0].id},data:{parentIds:JSON.stringify([a.id])}});
  assert.equal((await request('/knowledge/node/'+a.id,'DELETE',undefined,other)).status,404);
  assert.equal((await request('/knowledge/node/'+a.id,'DELETE')).status,200);
  assert.equal((await request('/knowledge/node/'+a.id)).status,404);
  const afterDelete=await(await request('/knowledge/'+course.id+'/nodes')).json();
  for(const node of afterDelete.nodes){assert.ok(!node.parentIds.includes(a.id)&&!node.childIds.includes(a.id));assert.ok(Date.parse(node.updatedAt)>Date.parse(list.nodes.find(old=>old.id===node.id).updatedAt));}
  assert.deepEqual(await db.knowledgeNode.findUnique({where:{id:untouched.id}}),untouched);
  assert.equal((await request('/knowledge/node/'+c.id,'PUT',{parentIds:[],difficulty:2,description:'删除前置节点后仍可编辑'})).status,200);
  assert.equal((await get(c.id)).difficulty,2);assert.equal((await get(c.id)).description,'删除前置节点后仍可编辑');
 }finally{await new Promise(resolve=>server.close(resolve));}
}));

test('legacy create childIds maintains both directions and rejects a cycle before any writes',()=>fixture(async({db,owner,course})=>{
 const create=input=>editKnowledgeNode(db,owner,{courseId:course.id},input);
 const a=await create({name:'A'}),b=await create({name:'B',parentIds:[a.id]}),c=await create({name:'C',childIds:[a.id]});
 assert.deepEqual(c.childIds,[a.id]);assert.deepEqual(JSON.parse((await db.knowledgeNode.findUnique({where:{id:a.id}})).parentIds),[c.id]);
 await assert.rejects(()=>create({name:'形成环',parentIds:[b.id],childIds:[c.id]}),e=>e.code==='VALIDATION');
 assert.equal(await db.knowledgeNode.count({where:{courseId:course.id}}),3);
}));

test('concurrent prerequisite edits serialize validation so they cannot create a cycle',()=>fixture(async({db,owner,course})=>{
 const a=await editKnowledgeNode(db,owner,{courseId:course.id},{name:'A'}),b=await editKnowledgeNode(db,owner,{courseId:course.id},{name:'B'});
 const results=await Promise.allSettled([editKnowledgeNode(db,owner,{nodeId:a.id},{parentIds:[b.id]}),editKnowledgeNode(db,owner,{nodeId:b.id},{parentIds:[a.id]})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'VALIDATION');
 const nodes=await db.knowledgeNode.findMany({where:{courseId:course.id}});assert.equal(nodes.filter(n=>JSON.parse(n.parentIds).length===1).length,1);
}));
