require('ts-node/register');
const{test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{PrismaClient}=require('@prisma/client'),jwt=require('jsonwebtoken');
const{CHAPTER,createProgress}=require('@keling/shared/expedition');
const{currentMaterials}=require('../src/learning/currentMaterials');const{resolveContext}=require('../src/ai/context');const{retrieve}=require('../src/ai/retrieval');
const{parseMaterial}=require('../src/learning/materials');
if(process.env.NODE_ENV!=='test'||!/^file:.*keling-tests-/.test(process.env.DATABASE_URL||''))throw new Error('Use isolated test runner');
test('ordinary subjects cannot seed binary-tree material; genuine old progress stays accessible and erroneous seed never enters AI sources',async()=>{
 const db=new PrismaClient(),owner=randomUUID();let server;
 try{
  await db.user.create({data:{id:owner,email:owner+'@example-isolation.test',passwordHash:'synthetic'}});
  const make=code=>db.course.create({data:{userId:owner,name:'任意名称，包括二叉树字样也不能代替授权',code,teacher:''}});
  const ordinary=await make(''),generated=await make('AI_PLANET'),sample=await make('SAMPLE'),legacy=await make('OLD_CODE');
  const progress=async(course,state)=>db.expeditionProgress.create({data:{userId:owner,courseId:course.id,chapterId:CHAPTER.id,contentVersion:CHAPTER.version,state:JSON.stringify(state)}});
  await progress(ordinary,createProgress());const learned=createProgress();learned.seenExerciseIds.push(CHAPTER.exercises[0].id);await progress(legacy,learned);await progress(generated,learned);
  const{warnings,spans,...parsed}=await parseMaterial({title:'错误混入的二叉树SEED',format:'TEXT',text:'MISPLACED_BINARY_TREE_SEED 二叉树规则'});
  const misplaced=await db.materialVersion.create({data:{...parsed,format:'SEED',userId:owner,courseId:ordinary.id,materialId:randomUUID(),version:1,spans:{create:spans}},include:{spans:true}});
  const{app}=require('../src/index');server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const base='http://127.0.0.1:'+server.address().port+'/api';
  const headers={Authorization:'Bearer '+jwt.sign({userId:owner},process.env.JWT_SECRET,{issuer:'keling-server',audience:'keling-clients'}),'Content-Type':'application/json'};
  const req=async(path,method='GET',body)=>{const response=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});return{status:response.status,data:await response.json()};};
  const list=(await req('/courses')).data.courses;assert.equal(list.find(c=>c.id===ordinary.id).hasBinaryTreeHistory,false);assert.equal(list.find(c=>c.id===legacy.id).hasBinaryTreeHistory,true);assert.equal(list.find(c=>c.id===generated.id).hasBinaryTreeHistory,false);
  for(const course of[ordinary,generated]){
   const result=await req('/expedition/v1/courses/'+course.id+'/chapters/binary-tree');assert.equal(result.status,409);assert.equal(result.data.code,'SAMPLE_REQUIRED');
   const run=await req('/expedition/v1/runs','POST',{opId:randomUUID(),courseId:course.id,questKind:'EXPLORE',mode:'TRAINING',deviceId:'test-device'});assert.equal(run.status,409);assert.equal(run.data.code,'SAMPLE_REQUIRED');
  }
  assert.equal(await db.materialVersion.count({where:{userId:owner,courseId:generated.id}}),0);assert.equal(await db.materialVersion.count({where:{userId:owner,courseId:ordinary.id}}),1);
  assert.deepEqual((await req('/learning/v1/courses/'+ordinary.id+'/materials')).data.materials,[]);assert.equal((await req('/learning/v1/materials/'+misplaced.id)).status,404);
  assert.deepEqual(await currentMaterials(db,owner,ordinary.id),[]);assert.ok(!(await retrieve(db,owner,'二叉树','keyword')).some(s=>s.title.includes('错误混入')));assert.ok(!JSON.stringify(await resolveContext(db,owner,{kind:'course',id:ordinary.id})).includes('MISPLACED_BINARY_TREE_SEED'));
  assert.ok(await db.materialVersion.findUnique({where:{id:misplaced.id}}),'historical records must not be deleted');
  for(const course of[sample,legacy]){assert.equal((await req('/expedition/v1/courses/'+course.id+'/chapters/binary-tree')).status,200);assert.ok((await req('/learning/v1/courses/'+course.id+'/materials')).data.materials.some(m=>m.format==='SEED'));}
  const started=await req('/expedition/v1/runs','POST',{opId:randomUUID(),courseId:sample.id,questKind:'EXPLORE',mode:'TRAINING',deviceId:'test-device'});assert.equal(started.status,200);await db.course.update({where:{id:sample.id},data:{code:''}});assert.equal((await req('/courses/'+sample.id)).data.course.hasBinaryTreeHistory,true);assert.equal((await req('/expedition/v1/courses/'+sample.id+'/chapters/binary-tree')).status,200);
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await db.user.deleteMany({where:{id:owner}});await db.$disconnect();}
});
