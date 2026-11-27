require('ts-node/register');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {PrismaClient}=require('@prisma/client');
const jwt=require('jsonwebtoken');
const {saveKnowledgeLayout,getKnowledgeLayoutMetadata,layoutNoteId}=require('../src/services/knowledgeLayout');
const {resolveContext}=require('../src/ai/context');
const {retrieve}=require('../src/ai/retrieval');
if(process.env.NODE_ENV!=='test'||!/^file:.*keling-tests-/.test(process.env.DATABASE_URL||''))throw new Error('Use isolated test runner');

async function fixture(fn){const db=new PrismaClient(),owner=randomUUID(),other=randomUUID();try{
 for(const id of[owner,other])await db.user.create({data:{id,email:id+'@layout.test',passwordHash:'synthetic'}});
 const course=await db.course.create({data:{userId:owner,name:'图谱布局测试',code:'LAYOUT_TEST',teacher:''}});
 const foreign=await db.course.create({data:{userId:other,name:'其他账号课程',code:'LAYOUT_TEST',teacher:''}});
 const nodes=[];for(let i=0;i<3;i++)nodes.push(await db.knowledgeNode.create({data:{courseId:course.id,name:'知识点'+i,description:'保留的课文'+i,masteryLevel:0.3,parentIds:i?'["existing-parent"]':'[]'}}));
 const foreignNode=await db.knowledgeNode.create({data:{courseId:foreign.id,name:'不可访问节点'}});
 await fn({db,owner,other,course,foreign,foreignNode,nodes});
}finally{await db.user.deleteMany({where:{id:{in:[owner,other]}}});await db.$disconnect();}}
const position=(n,x,y)=>({id:n.id,positionX:x,positionY:y,expectedUpdatedAt:new Date(n.updatedAt).toISOString()});
const rows=(db,courseId)=>db.knowledgeNode.findMany({where:{courseId},orderBy:{id:'asc'}});

test('layout saves bounded normalized coordinates atomically and detects stale device snapshots',()=>fixture(async({db,owner,other,course,foreign,foreignNode,nodes})=>{
 assert.deepEqual(await getKnowledgeLayoutMetadata(db,owner,course.id,nodes),{layoutSaved:false,savedNodeIds:[],layoutUpdatedAt:null});
 const before=await rows(db,course.id),input={positions:[position(nodes[0],0,1),position(nodes[1],0.5,0.5),position(nodes[2],1024/4096,3072/4096)]};
 const saved=await saveKnowledgeLayout(db,owner,course.id,input);
 assert.equal(saved.layoutSaved,true);assert.deepEqual(saved.savedNodeIds.sort(),nodes.map(n=>n.id).sort());
 assert.deepEqual(saved.nodes.map(n=>[n.id,n.positionX,n.positionY]),input.positions.map(p=>[p.id,p.positionX,p.positionY]));
 for(const n of saved.nodes){const old=nodes.find(o=>o.id===n.id);assert.ok(n.updatedAt>old.updatedAt);for(const key of['name','description','masteryLevel','difficulty','isUnlocked'])assert.equal(n[key],old[key]);assert.deepEqual(n.parentIds,JSON.parse(old.parentIds));}
 const secondClient=new PrismaClient();try{const read=await rows(secondClient,course.id);assert.equal((await getKnowledgeLayoutMetadata(secondClient,owner,course.id,read)).layoutSaved,true);}finally{await secondClient.$disconnect();}
 const after=await rows(db,course.id),marker=await db.note.findUnique({where:{id:layoutNoteId(course.id)}});
 const stale={positions:[position(saved.nodes[0],0.8,0.8),position(nodes[1],0.2,0.2)]};
 await assert.rejects(()=>saveKnowledgeLayout(db,owner,course.id,stale),e=>e.code==='LAYOUT_CONFLICT'&&e.status===409);
 assert.deepEqual(await rows(db,course.id),after);assert.equal((await db.note.findUnique({where:{id:marker.id}})).content,marker.content);
 await assert.rejects(()=>saveKnowledgeLayout(db,other,course.id,input),e=>e.status===404);
 await assert.rejects(()=>saveKnowledgeLayout(db,owner,foreign.id,input),e=>e.status===404);
 await assert.rejects(()=>saveKnowledgeLayout(db,owner,course.id,{positions:[position(saved.nodes[0],0.7,0.7),position(foreignNode,0.2,0.2)]}),e=>e.status===404);
 assert.deepEqual(await rows(db,course.id),after);
 for(const bad of[-0.01,1.01,NaN,Infinity,'0.5',null])await assert.rejects(()=>saveKnowledgeLayout(db,owner,course.id,{positions:[position(saved.nodes[0],bad,0.5)]}),e=>e.code==='VALIDATION');
 for(const positions of[[],[position(saved.nodes[0],0,0),position(saved.nodes[0],1,1)],Array(501).fill(position(saved.nodes[0],0,0)),[{id:saved.nodes[0].id,positionX:0.5,positionY:0.5}]])await assert.rejects(()=>saveKnowledgeLayout(db,owner,course.id,{positions}),e=>e.code==='VALIDATION');
 assert.deepEqual(await rows(db,course.id),after);assert.equal(before.length,after.length);
 const added=await db.knowledgeNode.create({data:{courseId:course.id,name:'新节点'}});
 const partial=await getKnowledgeLayoutMetadata(db,owner,course.id,await rows(db,course.id));assert.equal(partial.layoutSaved,false);assert.ok(!partial.savedNodeIds.includes(added.id));assert.equal(partial.savedNodeIds.length,3);
 await db.knowledgeNode.update({where:{id:nodes[0].id},data:{positionX:0.1}});
 const changed=await getKnowledgeLayoutMetadata(db,owner,course.id,await rows(db,course.id));assert.ok(!changed.savedNodeIds.includes(nodes[0].id));assert.ok(changed.savedNodeIds.includes(nodes[1].id));
}));

test('layout and saved marker both roll back when marker persistence fails after coordinate writes',()=>fixture(async({db,owner,course,nodes})=>{
 await saveKnowledgeLayout(db,owner,course.id,{positions:nodes.map(n=>position(n,0.5,0.5))});
 const before=await rows(db,course.id),marker=await db.note.findUnique({where:{id:layoutNoteId(course.id)}});
 const broken={$transaction:(work,options)=>db.$transaction(tx=>work(new Proxy(tx,{get(target,key){if(key==='note')return{...target.note,upsert:async()=>{throw new Error('synthetic marker failure');}};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}})),options)};
 await assert.rejects(()=>saveKnowledgeLayout(broken,owner,course.id,{positions:before.map(n=>position(n,0.9,0.1))}),/synthetic marker failure/);
 assert.deepEqual(await rows(db,course.id),before);assert.equal((await db.note.findUnique({where:{id:marker.id}})).content,marker.content);
}));

test('active HTTP route saves layout, hides its marker and removes only the deleted course marker',()=>fixture(async({db,owner,other,course,nodes})=>{
 const {app}=require('../src/index');const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const base='http://127.0.0.1:'+server.address().port+'/api';const token=id=>jwt.sign({userId:id},process.env.JWT_SECRET,{algorithm:'HS256',issuer:'keling-server',audience:'keling-clients'});
 const request=(path,method='GET',body,user=owner)=>fetch(base+path,{method,headers:{'Content-Type':'application/json',...(user?{Authorization:'Bearer '+token(user)}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 try{
  const payload={positions:nodes.map(n=>position(n,0.5,0.5))};
  assert.equal((await request('/knowledge/'+course.id+'/layout','PUT',payload,null)).status,401);
  assert.equal((await request('/knowledge/'+course.id+'/layout','PUT',payload,other)).status,404);
  const response=await request('/knowledge/'+course.id+'/layout','PUT',payload);assert.equal(response.status,200);assert.equal((await response.json()).layoutSaved,true);
  const reload=await(await request('/knowledge/'+course.id+'/nodes')).json();assert.equal(reload.layoutSaved,true);assert.equal(reload.savedNodeIds.length,3);
  const conflict=await request('/knowledge/'+course.id+'/layout','PUT',payload);assert.equal(conflict.status,409);assert.equal((await conflict.json()).code,'LAYOUT_CONFLICT');
  const markerId=layoutNoteId(course.id),normal=await db.note.create({data:{userId:owner,title:'普通笔记',content:'保留',sourceType:'USER_CREATED'}});
  const notes=await(await request('/notes')).json();assert.ok(!notes.notes.some(n=>n.id===markerId));assert.ok(notes.notes.some(n=>n.id===normal.id));
  for(const method of['PUT','DELETE'])assert.equal((await request('/notes/'+markerId,method,method==='PUT'?{content:'不应覆盖'}:undefined)).status,404);
  await assert.rejects(()=>resolveContext(db,owner,{kind:'note',id:markerId}),e=>e.code==='CONTEXT_NOT_FOUND');assert.ok(!(await retrieve(db,owner,'知识图谱布局','keyword')).some(s=>s.id===markerId));
  const another=await db.course.create({data:{userId:owner,name:'保留课程',code:'LAYOUT_TEST',teacher:''}});const keep=await db.knowledgeNode.create({data:{courseId:another.id,name:'保留节点'}});await saveKnowledgeLayout(db,owner,another.id,{positions:[position(keep,0.5,0.5)]});
  assert.equal((await request('/courses/'+course.id,'DELETE')).status,200);
  assert.equal(await db.note.findUnique({where:{id:markerId}}),null);assert.ok(await db.note.findUnique({where:{id:layoutNoteId(another.id)}}));assert.ok(await db.note.findUnique({where:{id:normal.id}}));
 }finally{await new Promise(resolve=>server.close(resolve));}
}));

test('the maximum 500-node layout is saved with exact boundary coordinates',()=>fixture(async({db,owner,course,nodes})=>{
 await db.knowledgeNode.createMany({data:Array.from({length:497},(_,i)=>({courseId:course.id,name:'扩展节点'+i}))});
 const all=await rows(db,course.id);assert.equal(all.length,500);
 const saved=await saveKnowledgeLayout(db,owner,course.id,{positions:all.map((n,i)=>position(n,i/499,(499-i)/499))});
 assert.equal(saved.nodes.length,500);assert.equal(saved.layoutSaved,true);assert.equal(saved.nodes[0].positionX,0);assert.equal(saved.nodes.at(-1).positionX,1);assert.equal(await db.knowledgeNode.count({where:{courseId:course.id}}),500);
}));

test('simultaneous device layout writes cannot silently overwrite each other',()=>fixture(async({db,owner,course,nodes})=>{
 const first={positions:nodes.map(n=>position(n,0.2,0.8))},second={positions:nodes.map(n=>position(n,0.8,0.2))};
 const outcomes=await Promise.allSettled([saveKnowledgeLayout(db,owner,course.id,first),saveKnowledgeLayout(db,owner,course.id,second)]);
 assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);
 const rejected=outcomes.find(o=>o.status==='rejected');assert.equal(rejected.reason.code,'LAYOUT_CONFLICT');
 const winner=outcomes.find(o=>o.status==='fulfilled').value;
 const persisted=await rows(db,course.id);for(const n of persisted){const expected=winner.nodes.find(p=>p.id===n.id);assert.equal(n.positionX,expected.positionX);assert.equal(n.positionY,expected.positionY);}
 assert.equal((await getKnowledgeLayoutMetadata(db,owner,course.id,persisted)).layoutSaved,true);
}));
