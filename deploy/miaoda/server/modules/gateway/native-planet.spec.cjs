const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module');
const file=require.resolve('./native-planet.service.ts'),mod=new Module(file,module);mod.filename=file;mod.paths=module.paths;const registrations={};
mod.require=name=>name==='@nestjs/common'?{Inject:()=>()=>{},Injectable:()=>x=>x,Logger:class{log(){}warn(){}}}:name.includes('keling-server.cjs')?{registerTopicResearchProvider:f=>registrations.search=f,registerLearningPlanetGenerator:f=>registrations.planet=f,registerLearningQuestionGenerator:f=>registrations.question=f}:{};
mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText,file);const {NativePlanetService}=mod.exports;
const signal=()=>new AbortController().signal;
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
});
