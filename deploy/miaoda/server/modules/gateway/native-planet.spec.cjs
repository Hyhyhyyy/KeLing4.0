const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module');
const file=require.resolve('./native-planet.service.ts'),mod=new Module(file,module);mod.filename=file;mod.paths=module.paths;const registrations={};
mod.require=name=>name==='@nestjs/common'?{Inject:()=>()=>{},Injectable:()=>x=>x,Logger:class{log(){}warn(){}}}:name.includes('keling-server.cjs')?{registerTopicResearchProvider:f=>registrations.search=f,registerLearningPlanetGenerator:f=>registrations.planet=f,registerLearningQuestionGenerator:f=>registrations.question=f,registerLearningSimilarQuestionsGenerator:f=>registrations.similar=f,registerPlanetContentReviewer:f=>registrations.review=f}:name==='jsonrepair'?require(name):{};
mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText,file);const {NativePlanetService,isJsonOutputParseFailure,repairReviewJson}=mod.exports;
const signal=()=>new AbortController().signal;
test('native JSON instance descriptions satisfy the official 500-character input limit',()=>{
 const directory=require('node:path').join(__dirname,'../../capabilities');
 for(const name of fs.readdirSync(directory).filter(x=>x.endsWith('.json'))){
  const instance=JSON.parse(fs.readFileSync(require('node:path').join(directory,name),'utf8'));
  for(const field of instance.formValue?.jsonStructure??[])assert.ok(field.paramDescription.length<=500,`${name}:${field.name} exceeds the plugin's 500-character limit`);
 }
});
test('full review and initial visual design permit the genuinely empty optional inputs rejected by required plugin fields',()=>{
 const directory=require('node:path').join(__dirname,'../../capabilities');
 for(const [name,field]of [['keling-planet-content-review','scopeQuestionId'],['keling-planet-visual-design','instruction']]){
  const instance=JSON.parse(fs.readFileSync(require('node:path').join(directory,name+'.json'),'utf8'));
  assert.ok(instance.paramsSchema.properties[field]);assert.ok(!instance.paramsSchema.required.includes(field));assert.ok(instance.formValue.prompt.includes('{{input.'+field+'}}'));
 }
});
test('native review receives full unmodified draft and exact optional question scope',async()=>{
 const calls=[],response={reviewedQuestionIds:['q1'],issues:[],orderingChecks:[]},caps={load:id=>({call:async(action,input)=>{calls.push({id,action,input});return response;}})};
 new NativePlanetService(caps,{},{}).onModuleInit();const draft={regions:[{id:'r1',questions:[{id:'q1'}]}],research:{sources:[]}};
 assert.equal(await registrations.review(draft,signal(),'q1'),response);assert.equal(calls[0].id,'keling-planet-content-review');assert.equal(calls[0].input.scopeQuestionId,'q1');assert.deepEqual(JSON.parse(calls[0].input.draft),draft);
 await registrations.review(draft,signal());assert.equal(calls[1].input.scopeQuestionId,'');
 assert.equal(calls[1].input.previousOutput,'');await registrations.review(draft,signal(),undefined,{previousOutput:response,validationFeedback:'issues[0].evidence[0].quote is missing'});
 assert.deepEqual(JSON.parse(calls[2].input.previousOutput),response);assert.equal(calls[2].input.validationFeedback,'issues[0].evidence[0].quote is missing');assert.equal(calls[2].input.draft,calls[0].input.draft);
});
test('native review never nests a model retry inside the server review budget and rejects opaque, permission and quota errors',async()=>{
 const parseError={name:'PluginError',code:'EXECUTION_ERROR',details:{raw:'{"x":function(){}}',error:"SyntaxError: Unexpected token in JSON at position 9"}};
 assert.equal(isJsonOutputParseFailure(parseError),true);
 for(const failure of [{name:'PluginError',message:'[object Object]'}, {name:'PluginError',code:'UNAUTHORIZED'}, {name:'RateLimitError'}]){
  let count=0;new NativePlanetService({load:()=>({call:async()=>{count++;throw failure;}})},{},{}).onModuleInit();
  await assert.rejects(()=>registrations.review({},signal()));assert.equal(count,1);
 }
 let rawCalls=0;new NativePlanetService({load:()=>({call:async()=>{rawCalls++;throw parseError;}})},{},{}).onModuleInit();assert.equal(await registrations.review({},signal()),parseError.details.raw);assert.equal(rawCalls,1);
 const controller=new AbortController();let count=0;new NativePlanetService({load:()=>({call:async()=>{count++;controller.abort();throw parseError;}})},{},{}).onModuleInit();await assert.rejects(()=>registrations.review({},controller.signal));assert.equal(count,1);
});
test('deterministic JSON syntax repair keeps quoted evidence and avoids a second model call without treating content as verified',async()=>{
 const expected={reviewedQuestionIds:['q1'],reviewedRegionIds:['r1'],reviewedNodeIds:[],issues:[{reason:'材料说"混乱"，不等于可比尺度',evidence:[{kind:'source',id:'s1',quote:'原文第一行\n第二行'}]}],orderingChecks:[]};
 const valid=JSON.stringify(expected),broken=valid.replace('"orderingChecks":[]','"orderingChecks":[],').replace('原文第一行\\n第二行','原文第一行\n第二行');
 const error={name:'PluginError',code:'EXECUTION_ERROR',details:{raw:broken,error:'SyntaxError: Bad control character in string literal in JSON at position 9'}};
 assert.deepEqual(repairReviewJson(error),expected);assert.equal(repairReviewJson({...error,code:'UNAUTHORIZED'}),undefined);assert.equal(repairReviewJson({name:'PluginError'}),undefined);
 let count=0;new NativePlanetService({load:()=>({call:async()=>{count++;throw error;}})},{},{}).onModuleInit();
 assert.deepEqual(await registrations.review({},signal()),expected);assert.equal(count,1);
 // Malformed semantic shape remains malformed: the adapter must not invent coverage, citations or a pass flag.
 const partial=repairReviewJson({...error,details:{...error.details,raw:'{"issues":[],}'}});assert.deepEqual(partial,{issues:[]});assert.ok(!('reviewedQuestionIds'in partial));
});
test('raw search uses official request contract and current user context, not model fabricated citations',async()=>{
 let request;const http={instance:{post:async(...args)=>{request=args;return new Response(JSON.stringify({data:{output:{results:[{title:'原始来源',url:'https://example.org',summary:'原始搜索摘要'}]}}}));}}};
 new NativePlanetService({},http,{get:key=>key==='userId'?'test-platform-user':undefined}).onModuleInit();
 const out=await registrations.search('抽象词语 含义',signal());assert.equal(out.results.length,1);assert.equal(request[0],'/api/v1/studio/innerapi/integration_apis/call');assert.deepEqual(request[1],{apiName:'tool.web_search',userID:'test-platform-user',input:{query:'抽象词语 含义'}});assert.equal(request[2].timeout,30000);assert.ok(request[2].signal);
});
test('authorization errors and malformed search output fail without leaking provider text',async()=>{
 for(const response of [()=>new Response('private credential details',{status:403}),()=>new Response(JSON.stringify({data:{output:{summary:'fake citation'}}}))]){
  new NativePlanetService({},{instance:{post:async()=>response()}},{get:()=>''}).onModuleInit();await assert.rejects(()=>registrations.search('term',signal()),e=>e.message==='Topic web search failed');
 }
});
test('planet and single-question capabilities receive the selected lesson, count and original research',async()=>{
 const calls=[],caps={load:id=>({call:async(action,input)=>{calls.push({id,action,input});return id==='keling-learning-question'?{question:{id:'q1',kind:'multiple_choice'}}:{title:'主题',story:'开场',planetStyleIndex:1,regions:[]};}})};
 new NativePlanetService(caps,{},{}).onModuleInit();const input={subject:'抽象主题',level:'入门',goal:'比较两义',contextMode:'auto',questionCount:18,research:{status:'grounded',sources:[{id:'s1'}]}};
 await registrations.planet(input,signal());await registrations.question({...input,lesson:'既有课文',question:{id:'q1'},instruction:'改成多选题'},signal());
 assert.equal(calls[0].input.questionCount,'18');assert.deepEqual(JSON.parse(calls[0].input.research),input.research);assert.equal(calls[1].id,'keling-learning-question');assert.equal(calls[1].input.lesson,'既有课文');assert.equal(calls[1].input.instruction,'改成多选题');
 assert.equal(calls[0].input.previousOutput,'');assert.equal(calls[0].input.validationFeedback,'');
 await registrations.planet({...input,previousOutput:'{"regions":[]}',validationFeedback:'wrong total count'},signal());
 assert.equal(calls[2].input.previousOutput,'{"regions":[]}');assert.equal(calls[2].input.validationFeedback,'wrong total count');assert.equal(calls[2].input.research,calls[0].input.research);
});
test('similar questions use the fresh research and only necessary parent fields, returning exactly two',async()=>{
 let request;const output={questions:[{kind:'multiple_choice'},{kind:'multiple_choice'}],error:''};
 new NativePlanetService({load:id=>({call:async(action,input)=>{request={id,action,input};return output;}})},{},{}).onModuleInit();
 const input={subject:'主题',level:'入门',goal:'',contextMode:'auto',research:{sources:[{id:'s1',url:'https://fresh.example.org'}]},lesson:'原课文',question:{id:'q1',kind:'multiple_choice',prompt:'原题',options:['甲','乙','丙','丁'],answerIndex:0,answerIndices:[0,2],explanation:'解释',practiceResearch:{privateMarker:'do-not-copy'},similarTo:'old'},instruction:''};
 assert.deepEqual(await registrations.similar(input,signal()),{questions:output.questions});assert.equal(request.id,'keling-learning-similar-questions');assert.deepEqual(JSON.parse(request.input.research),input.research);const parent=JSON.parse(request.input.question);assert.deepEqual(Object.keys(parent).sort(),['kind','options','prompt']);assert.equal(parent.kind,'multiple_choice');assert.ok(!('practiceResearch'in parent));assert.ok(!('similarTo'in parent));assert.ok(request.input.instruction);
 output.questions=[];output.error='来源没有共同排序尺度';await assert.rejects(()=>registrations.similar(input,signal()),/Native similar-question generation failed/);
});
