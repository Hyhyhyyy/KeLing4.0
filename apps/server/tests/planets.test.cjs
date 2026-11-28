const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const jwt=require('jsonwebtoken');
const {PrismaClient}=require('@prisma/client');
const {validatePlanetDraft,emptyPlanetProgress,answerPlanetQuestion,PLANET_NOTE_TYPE}=require('@keling/shared');
const {generatePlanet,confirmPlanet,listPlanets,getPlanet,submitPlanetAnswer,planetCatalog}=require('../src/learning/planets');
const {retrieve}=require('../src/ai/retrieval');
const {resolveContext}=require('../src/ai/context');
const {complete}=require('../src/ai/transport');
const {registerLearningPlanetGenerator,generateNativePlanet}=require('../src/learning/planets');
const {registerPlanetContentReviewer,planetContentReviewInstructions}=require('../src/learning/planetReview');
const {registerTopicResearchProvider}=require('../src/learning/topicResearch');
const {registerLearningQuestionGenerator,registerLearningSimilarQuestionsGenerator,registerPlanetArtworkGenerator}=require('../src/learning/planetEnhancement');
const mockSearch=async()=>({results:[1,2].map(i=>({title:'合成测试来源'+i,url:'https://example.org/source/'+i,summary:'这条合成来源只用于检验引用合同，不代表联网检索或真实知识。'}))});
registerTopicResearchProvider(mockSearch);
async function waitUntilReady(test){for(let i=0;i<100&&!test();i++)await new Promise(r=>setTimeout(r,5));assert.ok(test(),'native generator should have been invoked after research');}
const {startPlanetGenerationJob,getPlanetGenerationJob}=require('../src/learning/planetJobs');
const {regeneratePlanetPreview,regenerateStoredPlanet}=require('../src/learning/planets');
if(process.env.NODE_ENV!=='test'||!/^file:.*keling-tests-/.test(process.env.DATABASE_URL||''))throw new Error('Use disposable SQLite runner');
const env={TRIAL_AI_ENABLED:'true',TRIAL_AI_PROVIDER:'deepseek',TRIAL_AI_MODEL:'test-chat',AI_DEEPSEEK_API_KEY:'synthetic-testing-key',AI_DEEPSEEK_CHAT_MODELS:'test-chat'};
function question(id,kind){const base={id,kind,prompt:id+'的合成问题',options:['一','二','三','四'],answerIndex:1,explanation:'合成测试说明，仅验证题型与保存规则。',sourceIds:['s1']};if(kind==='multiple_choice')return {...base,answerIndex:0,answerIndices:[0,2]};if(kind==='true_false')return {...base,options:['正确','错误'],answerIndex:0};if(kind==='ordering')return {...base,options:['第二步','第一步','第三步'],answerIndex:0,answerIndices:[1,0,2]};if(kind==='fill_blank')return {...base,options:[],answerIndex:0,acceptedAnswers:['二','2']};if(kind==='short_answer')return {...base,options:[],answerIndex:0,referenceAnswer:'用自己的话解释合成规则',rubric:['说明规则','说明例子']};return base;}
const graph=()=>({nodes:[1,2,3,4].map(i=>({id:'n'+i,title:'概念'+i,summary:'仅用于图谱合同测试的合成节点说明。',sourceIds:['s1']})),edges:[{source:'n1',target:'n2',label:'包含',kind:'hierarchy'},{source:'n1',target:'n3',label:'包含',kind:'hierarchy'},{source:'n3',target:'n4',label:'先修',kind:'hierarchy'},{source:'n2',target:'n4',label:'对照',kind:'related'}]});
const content=(count=12)=>({knowledgeGraph:graph(),title:'测试数学星球',story:'合成内容，仅验证接口。',planetStyleIndex:2,meaningAnalysis:{overview:'这里是合成语境分析。',interpretations:[{label:'测试语义',description:'仅用于测试',context:'自动化测试'}],contrasts:['测试内容不是事实课程'],caveats:['未调用真实模型']},regions:[1,2,3].map(i=>({id:'r'+i,title:'区域'+i,description:'认识数量关系',prerequisiteIds:i===1?[]:['r'+(i-1)],estimatedMinutes:15,lesson:'本题为接口测试：一加一等于二。合成步骤：第一步、第二步、第三步。此为合成内容，不用于学习。',objectives:['核对数量'],sourceIds:['s1','s2'],questions:Array.from({length:count/3},(_,j)=>{const kinds=count===12?[['single_choice','multiple_choice','true_false','fill_blank'],['single_choice','ordering','short_answer','multiple_choice'],['single_choice','true_false','short_answer','fill_blank']][i-1]:Array.from({length:count/3},(_,k)=>['single_choice','multiple_choice','true_false','fill_blank','ordering','short_answer'][((i-1)*(count/3)+k)%6]);return question('q'+i+(j?'b'+j:''),kinds[j]);})}))});
// Explicit synthetic reviewer: validates integration and failure paths, never model effectiveness.
function syntheticReview(draft,scope){
 const regions=scope?draft.regions.filter(r=>r.questions.some(q=>q.id===scope)):draft.regions,questions=regions.flatMap(r=>r.questions).filter(q=>!scope||q.id===scope);
 return {reviewedQuestionIds:questions.map(q=>q.id),reviewedRegionIds:regions.map(r=>r.id),reviewedNodeIds:scope?[]:(draft.knowledgeGraph?.nodes||[]).map(n=>n.id),issues:[],orderingChecks:questions.filter(q=>q.kind==='ordering').map(q=>({questionId:q.id,basis:'explicit_sequence',direction:'ascending',unit:'position',items:q.options.map((option,optionIndex)=>({optionIndex,value:['第一步','第二步','第三步'].indexOf(option)+1,evidence:[{kind:'lesson',id:regions.find(r=>r.questions.some(item=>item.id===q.id)).id,quote:'合成步骤：第一步、第二步、第三步。'}]}))}))};
}
const syntheticReviewer=async(draft,_signal,scope)=>syntheticReview(draft,scope);
function syntheticCompletion(body,onGenerate){return async(...args)=>{const data=JSON.parse(args[2][1].content),reviewing=args[2][0].content===planetContentReviewInstructions;if(!reviewing)onGenerate?.(data,args);return {content:JSON.stringify(reviewing?syntheticReview(data.draft,data.scopeQuestionId):body),usage:{}};};}
registerPlanetContentReviewer(syntheticReviewer);
afterEach(()=>{registerPlanetContentReviewer(syntheticReviewer);registerLearningPlanetGenerator(undefined);registerLearningSimilarQuestionsGenerator(undefined);registerTopicResearchProvider(mockSearch);});
async function completeQuestion(db,owner,planet,q){const request={questionId:q.id,clientRequestId:randomUUID()};if(q.kind==='multiple_choice')request.selectedIndices=q.answerIndices;else if(q.kind==='ordering')request.orderedIndices=q.answerIndices;else if(q.kind==='fill_blank')request.text=q.acceptedAnswers[0];else if(q.kind==='short_answer')request.text='我对合成内容的解释';else request.selectedIndex=q.answerIndex;let out=await submitPlanetAnswer(db,owner,planet.id,request);if(q.kind==='short_answer')out=await submitPlanetAnswer(db,owner,planet.id,{...request,clientRequestId:randomUUID(),selfReview:true});return out;}
async function generated(owner,body=content()){return generatePlanet({subject:'数学',level:'入门',goal:'分数'},owner,undefined,syntheticCompletion(body,(_data,args)=>assert.equal(args[5],8192)),env);}
async function fixture(fn){const db=new PrismaClient(),owner=randomUUID(),other=randomUUID();try{for(const id of[owner,other])await db.user.create({data:{id,email:id+'@planet.test',passwordHash:'synthetic'}});await fn({db,owner,other});}finally{await db.user.deleteMany({where:{id:{in:[owner,other]}}});await db.$disconnect();}}
test('planet generator accepts different subjects and preserves source model provenance',async()=>{for(const subject of ['英语语法','世界历史','大学物理']){let got;const result=await generatePlanet({subject},undefined,undefined,syntheticCompletion(content(),data=>{got=data;}),env);assert.equal(got.subject,subject);assert.equal(result.draft.subject,subject);assert.equal(result.draft.generatedBy.model,'test-chat');assert.equal(result.draft.reviewStatus,'UNREVIEWED');assert.ok(result.draftToken);}});
test('no configured model fails before any generation and never returns sample planet',async()=>{let called=false;await assert.rejects(()=>generatePlanet({subject:'化学'},undefined,undefined,async()=>{called=true;return{};},{}),e=>e.code==='NOT_CONFIGURED'&&e.status===503);assert.equal(called,false);assert.deepEqual(planetCatalog(undefined,{}),{providers:[]});});
test('malformed, cyclic, duplicate and invalid-answer generated content is rejected',async()=>{for(const mutate of[b=>b.regions[0].prerequisiteIds=['r3'],b=>b.regions[1].questions[0].id='q1',b=>b.regions[0].questions[0].answerIndex=9,b=>b.regions[0].questions[0].options=['同','同'],b=>b.regions[0].id='constructor']){const b=content();mutate(b);await assert.rejects(()=>generated(undefined,b),e=>e.code==='INVALID_PLANET');}await assert.rejects(()=>generatePlanet({subject:'生物'},undefined,undefined,async()=>({content:'{"regions":[',usage:{}}),env),e=>e.code==='INVALID_PLANET');});
test('rejected generated content logs a fixed diagnosis without personal content or credentials',async()=>{const logs=[],warn=console.warn,b=content();b.story='private-user-supplied-story';b.regions[0].questions[0].answerIndex=99;console.warn=(...args)=>logs.push(args);try{await assert.rejects(()=>generated(undefined,b),e=>e.code==='INVALID_PLANET');}finally{console.warn=warn;}assert.equal(logs[0][0],'PLANET_STRUCTURE_REJECTED');assert.equal(logs[0][1].reason,'星球数值无效');assert.deepEqual(logs[0][1].questions,[4,4,4]);assert.ok(!JSON.stringify(logs).includes('private-user'));assert.ok(!JSON.stringify(logs).includes(env.AI_DEEPSEEK_API_KEY));});
test('structural repair receives the fixed validator reason and counts instead of losing the cause',async()=>{
 let calls=0;registerLearningPlanetGenerator(async input=>{calls++;const b=content();b.story='private-content-must-not-enter-diagnostic';if(calls===1)b.regions[0].questions[0].answerIndex=99;else{assert.match(input.validationFeedback,/星球数值无效/);assert.match(input.validationFeedback,/"questions":\[4,4,4\]/);assert.ok(!input.validationFeedback.includes('private-content'));}return b;});
 const out=await generateNativePlanet({subject:'合成诊断',generateArtwork:false},undefined,new AbortController().signal);assert.equal(calls,2);assert.ok(out.draftToken);
});
test('failed jobs retain only safe structure diagnostics and redact unexpected provider errors',async()=>fixture(async({db,owner})=>{
 let work;registerLearningPlanetGenerator(async()=>{const b=content();b.story='synthetic-private-story';b.regions[0].questions[0].answerIndex=99;return b;});
 const job=await startPlanetGenerationJob(db,{subject:'诊断测试',generateArtwork:false},owner,p=>{work=p;});await work;
 const result=await getPlanetGenerationJob(db,job.jobId,owner);assert.equal(result.status,'FAILED');assert.equal(result.diagnostic.stage,'structure');assert.equal(result.diagnostic.reason,'星球数值无效');assert.deepEqual(result.diagnostic.shape.questions,[4,4,4]);assert.ok(!JSON.stringify(result).includes('synthetic-private-story'));
 registerLearningPlanetGenerator(async()=>{throw new Error('synthetic-provider-secret');});const second=await startPlanetGenerationJob(db,{subject:'不透明错误',generateArtwork:false},owner,p=>{work=p;});await work;const failed=await getPlanetGenerationJob(db,second.jobId,owner);assert.equal(failed.code,'MODEL_FAILED');assert.equal(failed.diagnostic,undefined);assert.ok(!JSON.stringify(failed).includes('synthetic-provider-secret'));
}));
test('transport requested token budget is bounded and incomplete output fails',async()=>{const p={id:'test',key:'',protocol:'openai',baseUrl:'https://example.invalid',tokenParameter:'max_tokens'};let body;await complete(p,'test',[],undefined,async(_u,o)=>{body=JSON.parse(o.body);return new Response(JSON.stringify({choices:[{message:{content:'ok'},finish_reason:'stop'}]}));},6000);assert.equal(body.max_tokens,6000);await assert.rejects(()=>complete(p,'test',[],undefined,async()=>new Response(JSON.stringify({choices:[{message:{content:'{"x"'},finish_reason:'length'}]})),6000),e=>e.code==='INCOMPLETE');await assert.rejects(()=>complete(p,'test',[],undefined,undefined,100000),e=>e.code==='VALIDATION');});
test('confirmation is signed, owner-bound and atomic across concurrent retries',async()=>fixture(async({db,owner,other})=>{const output=await generated(owner),request={...output,clientRequestId:randomUUID()};const tampered=structuredClone(request);tampered.draft.subject='替换学科';await assert.rejects(()=>confirmPlanet(db,owner,tampered),e=>e.code==='DRAFT_EXPIRED');await assert.rejects(()=>confirmPlanet(db,other,request),e=>e.code==='DRAFT_EXPIRED');assert.equal(await db.course.count({where:{userId:owner}}),0);const results=await Promise.all([confirmPlanet(db,owner,request),confirmPlanet(db,owner,request)]);assert.equal(results[0].id,results[1].id);assert.equal(await db.course.count({where:{userId:owner}}),1);assert.equal(await db.knowledgeNode.count({where:{courseId:results[0].courseId}}),graph().nodes.length);const tasks=await db.task.findMany({where:{userId:owner}});assert.equal(tasks.length,1);assert.equal(tasks[0].rewardsExp,0);assert.equal(tasks[0].rewardsEnergy,0);assert.deepEqual(await listPlanets(db,other),[]);await assert.rejects(()=>getPlanet(db,other,results[0].id),e=>e.status===404);}));
test('answer progression persists, enforces prerequisites, retries once and never awards mastery',async()=>fixture(async({db,owner,other})=>{const planet=await confirmPlanet(db,owner,{...await generated(owner),clientRequestId:randomUUID()});await assert.rejects(()=>submitPlanetAnswer(db,owner,planet.id,{questionId:'q2',selectedIndex:1,clientRequestId:randomUUID()}),e=>e.code==='INVALID_ANSWER');const first={questionId:'q1',selectedIndex:0,clientRequestId:randomUUID()};const wrong=await submitPlanetAnswer(db,owner,planet.id,first);assert.equal(wrong.feedback.correct,false);assert.equal(wrong.planet.progress.completedRegionIds.length,0);const repeated=await submitPlanetAnswer(db,owner,planet.id,first);assert.equal(repeated.planet.progress.answers.q1.attempts,1);await assert.rejects(()=>submitPlanetAnswer(db,owner,planet.id,{...first,selectedIndex:1}),e=>e.code==='IDEMPOTENCY_CONFLICT');for(const q of planet.draft.regions.flatMap(r=>r.questions))await completeQuestion(db,owner,planet,q);const otherClient=new PrismaClient();try{const read=await getPlanet(otherClient,owner,planet.id);assert.deepEqual(read.progress.completedRegionIds,['r1','r2','r3']);assert.equal(read.progress.answers.q1.attempts,2);}finally{await otherClient.$disconnect();}const course=await db.course.findUnique({where:{id:planet.courseId}});assert.equal(course.masteryLevel,0);assert.equal((await db.user.findUnique({where:{id:owner}})).exp,0);await assert.rejects(()=>submitPlanetAnswer(db,other,planet.id,{questionId:'q1',selectedIndex:1,clientRequestId:randomUUID()}),e=>e.status===404);}));
test('internal planet storage stays out of notes, AI context and retrieval; API enforces owner',async()=>fixture(async({db,owner,other})=>{const planet=await confirmPlanet(db,owner,{...await generated(owner),clientRequestId:randomUUID()});const record=await db.note.findUnique({where:{id:planet.id}});assert.equal(record.sourceType,PLANET_NOTE_TYPE);await assert.rejects(()=>resolveContext(db,owner,{kind:'note',id:planet.id}),e=>e.code==='CONTEXT_NOT_FOUND');const sources=await retrieve(db,owner,'数学','keyword');assert.ok(!sources.some(s=>s.id===planet.id));const {app}=require('../src/index');const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const origin='http://127.0.0.1:'+server.address().port;const token=id=>jwt.sign({userId:id},process.env.JWT_SECRET,{issuer:'keling-server',audience:'keling-clients',expiresIn:'1h'});const headers={Authorization:'Bearer '+token(owner),'Content-Type':'application/json'};try{const notes=await(await fetch(origin+'/api/notes',{headers})).json();assert.ok(!notes.notes.some(n=>n.id===planet.id));for(const method of['PUT','DELETE']){const r=await fetch(origin+'/api/notes/'+planet.id,{method,headers,...(method==='PUT'?{body:JSON.stringify({content:'overwrite'})}:{})});assert.equal(r.status,404);}const otherResponse=await fetch(origin+'/api/learning/v1/planets/'+planet.id,{headers:{Authorization:'Bearer '+token(other)}});assert.equal(otherResponse.status,404);const anonymousCatalog=await fetch(origin+'/api/learning/v1/planets/catalog');assert.equal(anonymousCatalog.status,200);const anonGenerate=await fetch(origin+'/api/learning/v1/planets/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subject:'天文学'})});assert.equal(anonGenerate.status,503);assert.equal((await anonGenerate.json()).code,'NOT_CONFIGURED');const invalidToken=await fetch(origin+'/api/learning/v1/planets/catalog',{headers:{Authorization:'Bearer invalid'}});assert.equal(invalidToken.status,401);}finally{await new Promise(resolve=>server.close(resolve));}}));

test('native generation returns immediately, persists terminal state and protects guest polling tokens',async()=>fixture(async({db,owner,other})=>{
 let finish;registerLearningPlanetGenerator(async()=>new Promise(resolve=>{finish=resolve;}));
 let background;const job=await startPlanetGenerationJob(db,{subject:'历史'},owner,p=>{background=p;});
 assert.equal((await getPlanetGenerationJob(db,job.jobId,owner)).status,'RUNNING');
 await assert.rejects(()=>getPlanetGenerationJob(db,job.jobId,other),e=>e.status===404);
 await waitUntilReady(()=>finish);finish(content());await background;
 const nextClient=new PrismaClient();try{const done=await getPlanetGenerationJob(nextClient,job.jobId,owner);assert.equal(done.status,'SUCCEEDED');assert.equal(done.draft.subject,'历史');assert.equal(done.draft.generatedBy.providerId,'miaoda');const saved=await confirmPlanet(db,owner,{draft:done.draft,draftToken:done.draftToken,clientRequestId:randomUUID()});assert.equal(saved.draft.subject,'历史');}finally{await nextClient.$disconnect();}
 registerLearningPlanetGenerator(async()=>{throw new Error('internal credential value must not be exposed');});
 const guest=await startPlanetGenerationJob(db,{subject:'化学'},undefined,p=>{background=p;});await background;
 await assert.rejects(()=>getPlanetGenerationJob(db,guest.jobId,undefined,'0'.repeat(64)),e=>e.status===404);
 const failed=await getPlanetGenerationJob(db,guest.jobId,undefined,guest.jobToken);assert.equal(failed.status,'FAILED');assert.equal(failed.code,'MODEL_FAILED');assert.ok(!JSON.stringify(failed).includes('credential'));
 registerLearningPlanetGenerator(undefined);
 await db.agentRun.deleteMany({where:{id:{in:[job.jobId,guest.jobId]}}});
}));

test('native HTTP generation returns 202 and a guest token before model completion',async()=>fixture(async({db})=>{
 let finish;registerLearningPlanetGenerator(async()=>new Promise(resolve=>{finish=resolve;}));
 const {app}=require('../src/index');const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const origin='http://127.0.0.1:'+server.address().port;
 let job;
 try{
  const response=await fetch(origin+'/api/learning/v1/planets/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subject:'地理',providerId:'miaoda',model:'miaoda-learning'})});assert.equal(response.status,202);job=await response.json();assert.equal(job.status,'RUNNING');assert.equal(job.jobToken.length,64);
  assert.equal((await fetch(origin+'/api/learning/v1/planets/generation-jobs/'+job.jobId)).status,404);
  const pending=await(await fetch(origin+'/api/learning/v1/planets/generation-jobs/'+job.jobId,{headers:{'X-Planet-Job-Token':job.jobToken}})).json();assert.equal(pending.status,'RUNNING');
  await waitUntilReady(()=>finish);finish(content());
  for(let i=0;i<50;i++){const result=await getPlanetGenerationJob(db,job.jobId,undefined,job.jobToken);if(result.status==='SUCCEEDED'){assert.equal(result.draft.subject,'地理');return;}await new Promise(resolve=>setTimeout(resolve,10));}assert.fail('Native job did not reach success');
 }finally{registerLearningPlanetGenerator(undefined);await new Promise(resolve=>server.close(resolve));if(job)await db.agentRun.deleteMany({where:{id:job.jobId}});}
}));

test('research is mandatory and only actual provider rows enter generated references',async()=>{
 let generatedCalls=0;
 try{
  for(const [search,code] of [[async()=>{throw new Error('private dependency details');},'RESEARCH_UNAVAILABLE'],[async()=>({results:[]}),'RESEARCH_INSUFFICIENT']]){
   registerTopicResearchProvider(search);
   await assert.rejects(()=>generatePlanet({subject:'抽象词语'},undefined,undefined,async()=>{generatedCalls++;return {content:JSON.stringify(content())};},env),e=>e.code===code);
  }
  assert.equal(generatedCalls,0);
 }finally{registerTopicResearchProvider(mockSearch);}
 const result=await generated();assert.equal(result.draft.research.status,'grounded');assert.deepEqual(result.draft.research.sources.map(s=>s.url),['https://example.org/source/1','https://example.org/source/2']);
});
test('selected quantities preserve varied question types and a complete sourced knowledge graph',async()=>{
 for(const count of [6,12,18]){const output=await generatePlanet({subject:'概念辨析',questionCount:count},undefined,undefined,syntheticCompletion(content(count)),env);assert.equal(output.draft.regions.flatMap(r=>r.questions).length,count);assert.equal(new Set(output.draft.regions.flatMap(r=>r.questions.map(q=>q.kind))).size,6);assert.equal(output.draft.knowledgeGraph.nodes.length,4);}
 for(const mutate of [b=>b.regions[0].questions.pop(),b=>{delete b.meaningAnalysis;},b=>{delete b.knowledgeGraph;},b=>b.regions[0].questions[0].sourceIds=['invented-source'],b=>b.knowledgeGraph.edges.push({source:'n4',target:'n1',label:'错误环',kind:'hierarchy'})]){const raw=content();mutate(raw);await assert.rejects(()=>generated(undefined,raw),e=>e.code==='INVALID_PLANET');}
});
test('unrelated search hits cannot turn an unsupported topic into an invented course',async()=>{
 await assert.rejects(()=>generated(undefined,{topicSupported:false,unsupportedReason:'检索摘要与这个造词没有可核实的关联。'}),e=>e.code==='RESEARCH_INSUFFICIENT');
 const result=await generated(undefined,{...content(),topicSupported:true,unsupportedReason:''});assert.equal(result.draft.regions.length,3);assert.equal('topicSupported' in result.draft,false);
});
test('valid questions can follow topic depth without equal per-region counts',async()=>{const raw=content();raw.regions[2].questions.push(...raw.regions[0].questions.splice(2));const output=await generated(undefined,raw);assert.deepEqual(output.draft.regions.map(r=>r.questions.length),[2,4,6]);assert.equal(output.draft.regions.flatMap(r=>r.questions).length,12);});
test('single-question regeneration preserves all other content and signed preview ownership',async()=>fixture(async({db,owner,other})=>{
 const output=await generated(owner),before=structuredClone(output.draft);let calls=0;
 registerLearningQuestionGenerator(async input=>{calls++;assert.equal(input.question.id,'q1');assert.equal(input.lesson,before.regions[0].lesson);assert.equal(input.instruction,'改成填空题');return question('ignored-model-id','fill_blank');});
 try{
  const request={...output,kind:'question',questionId:'q1',instruction:'改成填空题',clientRequestId:randomUUID()};
  await assert.rejects(()=>regeneratePlanetPreview(request,other,new AbortController().signal),e=>e.code==='DRAFT_EXPIRED');assert.equal(calls,0);
  const revised=await regeneratePlanetPreview(request,owner,new AbortController().signal);assert.notEqual(revised.draft.regions[0].questions[0].id,'q1');assert.equal(revised.draft.regions[0].questions[0].kind,'fill_blank');assert.deepEqual(revised.draft.regions.slice(1),before.regions.slice(1));assert.deepEqual(revised.draft.knowledgeGraph,before.knowledgeGraph);assert.deepEqual(revised.draft.regions[0].questions.slice(1),before.regions[0].questions.slice(1));
  await confirmPlanet(db,owner,{...revised,clientRequestId:randomUUID()});
 }finally{registerLearningQuestionGenerator(undefined);}
}));
test('stored regeneration is owned, idempotent, clears only replaced answer and preserves old image on failure',async()=>fixture(async({db,owner,other})=>{
 const planet=await confirmPlanet(db,owner,{...await generated(owner),clientRequestId:randomUUID()});await completeQuestion(db,owner,planet,planet.draft.regions[0].questions[0]);await completeQuestion(db,owner,planet,planet.draft.regions[0].questions[1]);let calls=0;
 registerLearningQuestionGenerator(async()=>{calls++;return question('model-id','fill_blank');});
 try{
  const request={kind:'question',questionId:'q1',instruction:'换一道填空',clientRequestId:randomUUID()},signal=new AbortController().signal;
  await assert.rejects(()=>regenerateStoredPlanet(db,other,planet.id,request,signal),e=>e.status===404);
  const result=await regenerateStoredPlanet(db,owner,planet.id,request,signal);assert.equal(result.planet.progress.answers.q1,undefined);assert.ok(result.planet.progress.answers.q1b1.correct);assert.equal(calls,1);
  const repeated=await regenerateStoredPlanet(db,owner,planet.id,request,signal);assert.equal(calls,1);assert.deepEqual(repeated.planet.draft,result.planet.draft);
  await assert.rejects(()=>regenerateStoredPlanet(db,owner,planet.id,{...request,instruction:'不同要求'},signal),e=>e.code==='IDEMPOTENCY_CONFLICT');
  registerPlanetArtworkGenerator(async()=>{throw new Error('private image error');});
  await assert.rejects(()=>regenerateStoredPlanet(db,owner,planet.id,{kind:'artwork',instruction:'增加绿洲',clientRequestId:randomUUID()},signal),e=>e.code==='ARTWORK_FAILED');assert.deepEqual((await getPlanet(db,owner,planet.id)).draft.artwork,result.planet.draft.artwork);
 }finally{registerLearningQuestionGenerator(undefined);registerPlanetArtworkGenerator(undefined);}
}));

function addSyntheticIssue(review,questionId){review.issues.push({targetType:'question',targetId:questionId,code:'SOURCE_SUPPORT_MISSING',reason:'合成审查发现该断言缺少依据，仅用于验证修复流程。',evidence:[]});return review;}
const similarPair=(kind='single_choice')=>({questions:[question('similar-model-a',kind),question('similar-model-b',kind)]});
test('similar search retrieves fresh evidence and appends exactly two independently sourced same-kind questions',async()=>fixture(async({db,owner,other})=>{
 const original=await generated(owner);let searches=0,calls=0;const queries=[];
 registerTopicResearchProvider(async query=>{searches++;queries.push(query);return {results:[1,2].map(i=>({title:'相似练习合成来源'+i,url:'https://example.org/fresh/'+i,summary:'新检索合成证据，仅用于接口测试，与原星球来源编号局部隔离。'}))};});
 registerLearningSimilarQuestionsGenerator(async input=>{calls++;assert.equal(input.question.id,'q1');assert.ok(input.research.sources.every(s=>s.url.includes('/fresh/')));return similarPair();});
 const req={...original,kind:'similar',questionId:'q1',instruction:'搜索同型新情境',clientRequestId:randomUUID()};
 await assert.rejects(()=>regeneratePlanetPreview(req,other,new AbortController().signal),e=>e.code==='DRAFT_EXPIRED');assert.equal(searches,0);
 const out=await regeneratePlanetPreview(req,owner,new AbortController().signal),added=out.draft.regions[0].questions.slice(4);
 assert.equal(calls,1);assert.equal(searches,2);assert.ok(queries.some(q=>q.includes('q1的合成问题')));assert.equal(added.length,2);assert.ok(added.every(q=>q.similarTo==='q1'&&q.kind==='single_choice'&&q.practiceResearch.sources[0].url.includes('/fresh/')));
 assert.deepEqual(out.draft.regions[0].questions.slice(0,4),original.draft.regions[0].questions);assert.deepEqual(out.draft.research,original.draft.research);assert.deepEqual(out.draft.knowledgeGraph,original.draft.knowledgeGraph);
 assert.notEqual(added[0].id,'similar-model-a');await confirmPlanet(db,owner,{...out,clientRequestId:randomUUID()});
}));
test('stored similar practice preserves completion and answers, is idempotent and supports later independent regeneration',async()=>fixture(async({db,owner})=>{
 let planet=await confirmPlanet(db,owner,{...await generated(owner),clientRequestId:randomUUID()});
 for(const q of planet.draft.regions[0].questions)planet=(await completeQuestion(db,owner,planet,q)).planet;
 const before=structuredClone(planet.progress);let calls=0;
 registerTopicResearchProvider(async()=>({results:[1,2].map(i=>({title:'补充来源'+i,url:'https://example.org/local-practice/'+i,summary:'本题独立新检索的合成材料，不得覆盖原星球来源；只用于接口测试。'}))}));
 registerLearningSimilarQuestionsGenerator(async()=>{calls++;return similarPair();});
 const req={kind:'similar',questionId:'q1',instruction:'再做两道',clientRequestId:randomUUID()},signal=new AbortController().signal;
 let out=(await regenerateStoredPlanet(db,owner,planet.id,req,signal)).planet;assert.deepEqual(out.progress,before);
 await regenerateStoredPlanet(db,owner,planet.id,req,signal);assert.equal(calls,1);
 await assert.rejects(()=>regenerateStoredPlanet(db,owner,planet.id,{...req,instruction:'不同要求'},signal),e=>e.code==='IDEMPOTENCY_CONFLICT');
 const added=out.draft.regions[0].questions.slice(4),global=out.draft.research;
 out=(await completeQuestion(db,owner,out,added[0])).planet;assert.ok(out.progress.answers[added[0].id].correct);assert.deepEqual(out.progress.completedRegionIds,before.completedRegionIds);
 registerLearningQuestionGenerator(async input=>{assert.deepEqual(input.research,added[0].practiceResearch);return question('unused','fill_blank');});
 out=(await regenerateStoredPlanet(db,owner,planet.id,{kind:'question',questionId:added[0].id,instruction:'改填空',clientRequestId:randomUUID()},signal)).planet;
 const changed=out.draft.regions[0].questions[4];assert.equal(changed.similarTo,'q1');assert.equal(changed.kind,'fill_blank');assert.deepEqual(changed.practiceResearch,added[0].practiceResearch);assert.deepEqual(out.draft.research,global);assert.deepEqual(out.progress.completedRegionIds,before.completedRegionIds);
 registerLearningQuestionGenerator(async()=>question('unused','multiple_choice'));
 out=(await regenerateStoredPlanet(db,owner,planet.id,{kind:'question',questionId:'q1',instruction:'改多选',clientRequestId:randomUUID()},signal)).planet;
 assert.equal(out.draft.regions[0].questions[4].similarTo,out.draft.regions[0].questions[0].id);assert.equal(out.draft.regions[0].questions[5].similarTo,out.draft.regions[0].questions[0].id);assert.equal(out.draft.regions[0].questions[4].kind,'fill_blank');
 registerLearningQuestionGenerator(undefined);
}));
test('similar failures never overwrite originals; invalid pair repair is bounded and failed research calls no generator',async()=>fixture(async({db,owner})=>{
 const planet=await confirmPlanet(db,owner,{...await generated(owner),clientRequestId:randomUUID()}),before=await db.note.findUnique({where:{id:planet.id}}),signal=new AbortController().signal;
 for(const invalid of [{questions:[question('one','single_choice')]},similarPair('multiple_choice'),{questions:[question('q1','single_choice'),question('new','single_choice')]}]){
  let calls=0;registerLearningSimilarQuestionsGenerator(async()=>{calls++;return invalid;});
  await assert.rejects(()=>regenerateStoredPlanet(db,owner,planet.id,{kind:'similar',questionId:'q1',instruction:'再做两道',clientRequestId:randomUUID()},signal),e=>e.code==='INVALID_QUESTION');assert.equal(calls,2);
 }
 let calls=0;registerLearningSimilarQuestionsGenerator(async()=>{calls++;return similarPair();});registerTopicResearchProvider(async()=>{throw new Error('synthetic search unavailable');});
 await assert.rejects(()=>regenerateStoredPlanet(db,owner,planet.id,{kind:'similar',questionId:'q1',instruction:'再做两道',clientRequestId:randomUUID()},signal),e=>e.code==='RESEARCH_UNAVAILABLE');assert.equal(calls,0);
 assert.deepEqual(await db.note.findUnique({where:{id:planet.id}}),before);
}));
test('similar content review rejects both new questions atomically after one bounded repair',async()=>fixture(async({db,owner})=>{
 const planet=await confirmPlanet(db,owner,{...await generated(owner),clientRequestId:randomUUID()}),before=await db.note.findUnique({where:{id:planet.id}});let calls=0,reviews=0;
 registerLearningSimilarQuestionsGenerator(async input=>{calls++;if(calls===2)assert.match(input.instruction,/SOURCE_SUPPORT_MISSING/);return similarPair();});
 registerPlanetContentReviewer(async(draft,_signal,scope)=>{reviews++;return addSyntheticIssue(syntheticReview(draft,scope),scope);});
 await assert.rejects(()=>regenerateStoredPlanet(db,owner,planet.id,{kind:'similar',questionId:'q1',instruction:'再做两道',clientRequestId:randomUUID()},new AbortController().signal),e=>e.code==='CONTENT_REVIEW_FAILED');
 assert.equal(calls,2);assert.equal(reviews,4);assert.deepEqual(await db.note.findUnique({where:{id:planet.id}}),before);
}));
test('a repeated instruction with genuinely different choice material is not an identical practice item',async()=>{
 const original=await generated();let calls=0;registerLearningSimilarQuestionsGenerator(async()=>{calls++;const pair=similarPair();pair.questions[0].prompt=original.draft.regions[0].questions[0].prompt;pair.questions[0].options=['两个','三个','四个','五个'];return pair;});
 const result=await regeneratePlanetPreview({...original,kind:'similar',questionId:'q1',instruction:'换选项材料',clientRequestId:randomUUID()},undefined,new AbortController().signal);
 assert.equal(calls,1);assert.equal(result.draft.regions[0].questions.length,6);
});
test('one content repair is reviewed again before a signed native preview is returned',async()=>{
 let generations=0,reviews=0;registerLearningPlanetGenerator(async input=>{generations++;const body=content();if(generations===1)body.regions[0].questions[0].prompt='合成未核实断言';else{assert.ok(input.previousOutput);assert.match(input.validationFeedback,/SOURCE_SUPPORT_MISSING/);body.regions[0].questions[0].prompt='合成修复后的问题';}return body;});
 registerPlanetContentReviewer(async(draft,_signal,scope)=>{reviews++;const review=syntheticReview(draft,scope);return draft.regions[0].questions[0].prompt==='合成未核实断言'?addSyntheticIssue(review,'q1'):review;});
 const result=await generateNativePlanet({subject:'修复测试',generateArtwork:false},undefined,new AbortController().signal);assert.equal(generations,2);assert.equal(reviews,2);assert.equal(result.draft.regions[0].questions[0].prompt,'合成修复后的问题');assert.ok(result.draftToken);assert.equal(result.draft.reviewStatus,'UNREVIEWED');
});
test('structural repair consumes the same single repair budget as content repair',async()=>{
 let generations=0,reviews=0;registerLearningPlanetGenerator(async input=>{generations++;const body=content();if(generations===1)delete body.knowledgeGraph;else assert.match(input.validationFeedback,/结构校验/);return body;});
 registerPlanetContentReviewer(async(draft,_signal,scope)=>{reviews++;return addSyntheticIssue(syntheticReview(draft,scope),'q1');});
 await assert.rejects(()=>generateNativePlanet({subject:'一次预算',generateArtwork:false},undefined,new AbortController().signal),e=>e.code==='CONTENT_REVIEW_FAILED');assert.equal(generations,2);assert.equal(reviews,1);
});
test('native generation without a reviewer fails closed instead of signing an unchecked draft',async()=>{
 let calls=0;registerLearningPlanetGenerator(async()=>{calls++;return content();});registerPlanetContentReviewer(undefined);
 await assert.rejects(()=>generateNativePlanet({subject:'审核缺失',generateArtwork:false},undefined,new AbortController().signal),e=>e.code==='NOT_CONFIGURED');assert.equal(calls,1);
});
test('a second failed single-question review preserves the complete stored record and answers',async()=>fixture(async({db,owner})=>{
 const planet=await confirmPlanet(db,owner,{...await generated(owner),clientRequestId:randomUUID()});await completeQuestion(db,owner,planet,planet.draft.regions[0].questions[0]);const before=await db.note.findUnique({where:{id:planet.id}});let generatedCount=0,reviewedCount=0;
 registerLearningQuestionGenerator(async input=>{generatedCount++;if(generatedCount===2)assert.match(input.instruction,/内容审核需修复/);return question('ignored','fill_blank');});
 registerPlanetContentReviewer(async(draft,_signal,scope)=>{reviewedCount++;assert.ok(scope);return addSyntheticIssue(syntheticReview(draft,scope),scope);});
 try{await assert.rejects(()=>regenerateStoredPlanet(db,owner,planet.id,{kind:'question',questionId:'q1',instruction:'合成修改',clientRequestId:randomUUID()},new AbortController().signal),e=>e.code==='CONTENT_REVIEW_FAILED');assert.equal(generatedCount,2);assert.equal(reviewedCount,2);const after=await db.note.findUnique({where:{id:planet.id}});assert.deepEqual(after,before);const read=await getPlanet(db,owner,planet.id);assert.equal(read.progress.answers.q1.correct,true);assert.deepEqual(read.draft,planet.draft);}finally{registerLearningQuestionGenerator(undefined);}
}));
test('BYOK generation, repair and both reviews stay on the selected provider without serializing credentials',async()=>{
 let globalCalls=0;registerPlanetContentReviewer(async()=>{globalCalls++;throw new Error('A BYOK draft must not reach the global reviewer');});
 for(const providerId of ['deepseek','openai']){
  const key='synthetic-byok-credential-'+providerId,model='synthetic-'+providerId;let generations=0,reviews=0;
  const generate=async(provider,selectedModel,messages)=>{
   assert.equal(provider.id,providerId);assert.equal(provider.key,key);assert.equal(selectedModel,model);assert.ok(!messages.some(m=>m.content.includes(key)),'credentials are transport-only, not prompt data');
   const data=JSON.parse(messages[1].content);assert.ok(!JSON.stringify(data).includes('"credentials"'));assert.ok(!JSON.stringify(data).includes('"apiKey"'));
   if(messages[0].content===planetContentReviewInstructions){reviews++;const review=syntheticReview(data.draft,data.scopeQuestionId);if(data.draft.regions[0].questions[0].prompt==='合成未核实断言')addSyntheticIssue(review,'q1');return {content:JSON.stringify(review),usage:{}};}
   generations++;assert.deepEqual(Object.keys(data).filter(k=>!['previousOutput','validationFeedback'].includes(k)).sort(),['subject','level','goal','contextMode','questionCount','research'].sort());const body=content();body.regions[0].questions[0].prompt=generations===1?'合成未核实断言':'合成已修复问题';if(generations===2)assert.match(data.validationFeedback,/SOURCE_SUPPORT_MISSING/);return {content:JSON.stringify(body),usage:{}};
  };
  const result=await generatePlanet({subject:'密钥隔离',model,credentials:{providerId,apiKey:key},generateArtwork:false},undefined,undefined,generate,{});assert.equal(generations,2);assert.equal(reviews,2);assert.equal(result.draft.generatedBy.providerId,providerId);assert.ok(!JSON.stringify(result.draft).includes(key));
 }
 assert.equal(globalCalls,0);
});
test('bad JSON is redacted and receives exactly one structural repair before review',async()=>{
 let generations=0,reviews=0;
 const generate=async(_provider,_model,messages)=>{
  const data=JSON.parse(messages[1].content);
  if(messages[0].content===planetContentReviewInstructions){reviews++;return {content:JSON.stringify(syntheticReview(data.draft,data.scopeQuestionId)),usage:{}};}
  generations++;
  if(generations===1)return {content:'{"regions":['+env.AI_DEEPSEEK_API_KEY,usage:{}};
  assert.equal(generations,2);assert.equal(typeof data.previousOutput,'string');assert.ok(!data.previousOutput.includes(env.AI_DEEPSEEK_API_KEY));assert.match(data.previousOutput,/密钥已隐藏/);assert.match(data.validationFeedback,/结构校验/);
  return {content:JSON.stringify(content()),usage:{}};
 };
 const result=await generatePlanet({subject:'JSON修复',generateArtwork:false},undefined,undefined,generate,env);assert.ok(result.draftToken);assert.equal(generations,2);assert.equal(reviews,1);assert.equal(result.draft.regions.flatMap(r=>r.questions).length,12);
});
test('six questions with three applicable types pass without ordering, while one type is rejected',async()=>{
 const body=content(6),kinds=['single_choice','true_false','short_answer'];let index=0;
 for(const region of body.regions)region.questions=region.questions.map(q=>question(q.id,kinds[index++%kinds.length]));
 const output=await generatePlanet({subject:'不强凑排序',questionCount:6,generateArtwork:false},undefined,undefined,syntheticCompletion(body),env);
 assert.deepEqual([...new Set(output.draft.regions.flatMap(r=>r.questions.map(q=>q.kind)))],kinds);assert.equal(output.draft.regions.flatMap(r=>r.questions).length,6);
 const uniform=structuredClone(body);for(const region of uniform.regions)region.questions=region.questions.map(q=>question(q.id,'single_choice'));let generations=0;
 await assert.rejects(()=>generatePlanet({subject:'单一题型',questionCount:6,generateArtwork:false},undefined,undefined,syntheticCompletion(uniform,()=>{generations++;}),env),e=>e.code==='INVALID_PLANET');assert.equal(generations,2);
});
