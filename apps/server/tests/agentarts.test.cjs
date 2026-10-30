require('ts-node/register');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validatePlan } = require('../src/agentarts/contract');
const { readRuntimeStream } = require('../src/agentarts/runtime');
const { invokeRuntime } = require('../src/agentarts/runtime');
const { planningProvider } = require('../src/agentarts/deepseek');
const limits = { startDate: '2026-10-27', examDate: '2026-11-10', dailyMinutes: 60, sourceIds: ['kg:1'] };
const plan = () => ({ summary: '学习计划', tasks: [{ title: '二叉树练习', description: '完成遍历题', date: '2026-10-28', minutes: 30, sourceIds: ['kg:1'] }] });
test('rejects empty, impossible date, excess time and invented source', () => {
  assert.throws(() => validatePlan({ summary:'x', tasks: [] }, limits));
  for (const patch of [{date:'2026-02-30'}, {minutes:61}, {sourceIds:['unknown']}, {date:'2026-11-11'}]) {
    const value=plan(); Object.assign(value.tasks[0],patch); assert.throws(() => validatePlan(value,limits));
  }
  assert.equal(validatePlan(plan(),limits).tasks[0].minutes,30);
});
test('enforces combined daily budget', () => {
  const value=plan(); value.tasks.push({...value.tasks[0],minutes:40}); assert.throws(() => validatePlan(value,limits));
});
test('parses SSE across byte boundaries and ignores reasoning', async () => {
  const s='data: '+JSON.stringify({event:'summary_response',content:JSON.stringify(plan()),reasoning_content:'private'})+'\r\n\r\ndata: {"event":"end"}\n\n';
  const bytes=Buffer.from(s); const stream=new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=7)c.enqueue(bytes.subarray(i,i+7));c.close();}});
  const events=[]; const result=await readRuntimeStream(stream,e=>events.push(e));
  assert.equal(JSON.parse(result).summary,'学习计划'); assert.ok(!JSON.stringify(events).includes('private'));
});
test('does not accept a failed or truncated runtime as success', async () => {
  for (const s of ['data: {"event":"error","data":{"message":"fail"}}\n\n','data: {"event":"message","content":"partial"}\n\n']) {
    await assert.rejects(()=>readRuntimeStream(new Response(s).body,()=>{}));
  }
});

test('Huawei workflow and agent requests follow their distinct official input contracts', async () => {
 const names=['AGENTARTS_RUNTIME_URL','AGENTARTS_API_KEY','AGENTARTS_TOOL_SECRET','AGENTARTS_RUNTIME_KIND','AGENTARTS_INVOKE_MODE'];
 const saved=Object.fromEntries(names.map(k=>[k,process.env[k]]));
 Object.assign(process.env,{AGENTARTS_RUNTIME_URL:'https://runtime.example.test/invocations',AGENTARTS_API_KEY:'test-key',AGENTARTS_TOOL_SECRET:'test-tool',AGENTARTS_INVOKE_MODE:'published'});
 try{for(const kind of ['workflow','agent']){
  process.env.AGENTARTS_RUNTIME_KIND=kind;
  const input={goal:'复习',runId:'run-1'};
  await invokeRuntime(input,'run-1',()=>{},async(url,options)=>{
   assert.equal(options.headers['x-hw-agentarts-session-id'],'run-1');
   assert.equal(options.headers['X-Invoke-Mode'],'published');
   assert.equal(options.headers.Authorization,'Bearer test-key');
   const body=JSON.parse(options.body);assert.deepEqual(body.inputs,input);
   assert.equal(body.query,kind==='agent'?JSON.stringify(input):undefined);
   return new Response('data: '+JSON.stringify({event:'summary_response',content:'{}'})+'\n\ndata: {"event":"end"}\n\n');
  });
 }}finally{for(const key of names){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
});

test('explicit provider configuration never silently switches vendors',()=>{
 const names=['PLANNING_PROVIDER','DEEPSEEK_API_KEY','AGENTARTS_RUNTIME_URL','AGENTARTS_API_KEY','AGENTARTS_TOOL_SECRET'];
 const saved=Object.fromEntries(names.map(k=>[k,process.env[k]]));
 try{
  Object.assign(process.env,{PLANNING_PROVIDER:'deepseek',AGENTARTS_RUNTIME_URL:'https://example.test',AGENTARTS_API_KEY:'test',AGENTARTS_TOOL_SECRET:'test'});
  delete process.env.DEEPSEEK_API_KEY;assert.equal(planningProvider(),null);
  process.env.PLANNING_PROVIDER='auto';assert.equal(planningProvider(),'AgentArts');
  process.env.PLANNING_PROVIDER='unknown';assert.equal(planningProvider(),null);
 }finally{for(const key of names){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
});
