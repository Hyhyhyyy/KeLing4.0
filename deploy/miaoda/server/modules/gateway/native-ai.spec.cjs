const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module');
const file=require.resolve('./native-ai.service.ts');
const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText;
const mod=new Module(file,module);mod.filename=file;mod.paths=module.paths;
const real=mod.require.bind(mod);mod.require=name=>name.includes('keling-server.cjs')?{registerNativeAiBridge:()=>{}}:real(name);
mod._compile(source,file);const {collectNativeText,nativePlanContent,NativeAiService}=mod.exports;
async function* events(items){for(const event of items)yield event;}
const done={type:'done',metadata:{chunks:2,duration:5}};
test('only explicit completed incremental native text becomes a result',async()=>{
 const signal=new AbortController().signal;
 assert.equal(await collectNativeText(events([{type:'data',data:{content:'知识'}},{type:'data',data:{content:'连起来。'}},done]),signal),'知识连起来。');
 for(const incomplete of [[],[{type:'data',data:{content:'半句话'}}],[done],[{type:'data',data:{content:'部分'}},{type:'error',error:{code:'STOP',message:'failed'}}]])await assert.rejects(collectNativeText(events(incomplete),signal));
});
test('aborted, malformed and over-limit native streams cannot become success',async()=>{
 const c=new AbortController();c.abort();await assert.rejects(collectNativeText(events([done]),c.signal));
 for(const value of [{content:17},{response:'deprecated'}, {content:'x'.repeat(32001)}])await assert.rejects(collectNativeText(events([{type:'data',data:value},done]),new AbortController().signal));
});
test('structured plans preserve actual objects and reject prose or broken tasks',()=>{
 const valid={summary:'依据课程安排一次练习。',tasks:[{title:'问候练习',description:'用三句话介绍自己',date:'2026-11-27',minutes:15,sourceIds:['material:1']}]};
 assert.deepEqual(JSON.parse(nativePlanContent(valid)),valid);
 for(const value of [JSON.stringify(valid),{summary:'',tasks:valid.tasks},{...valid,tasks:[]},{...valid,tasks:[{...valid.tasks[0],minutes:0}]},{...valid,tasks:[{...valid.tasks[0],sourceIds:[]}]}])assert.throws(()=>nativePlanContent(value));
});
test('adapter routes conversational and structural requests to distinct real-capability interfaces',async()=>{
 const calls=[],capabilities={load(id){return {call:async(action,input)=>{calls.push({id,action,input});return {summary:'学习安排',tasks:[{title:'练习',description:'依据讲义作答',date:'2026-11-27',minutes:10,sourceIds:['s1']}]};},callStreamWithEvents(action,input){calls.push({id,action,input});return events([{type:'data',data:{content:'确切答案。'}},done]);}};}};
 const service=new NativeAiService(capabilities),request={messages:[{role:'user',content:'怎样理解队列？'}],maxOutputTokens:600,signal:new AbortController().signal};
 assert.equal((await service.complete(request)).content,'确切答案。');assert.equal(JSON.parse((await service.complete({...request,purpose:'study-plan'})).content).tasks.length,1);
 assert.deepEqual(calls.map(({id,action})=>[id,action]),[['keling-study-assistant','textGenerate'],['keling-study-plan','textToJson']]);
 assert.deepEqual(JSON.parse(calls[0].input.conversation),request.messages);
});
