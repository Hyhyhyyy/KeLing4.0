require('ts-node/register');
const {test}=require('node:test'); const assert=require('node:assert/strict'); const {randomUUID}=require('node:crypto');
const {providers,validBaseUrl,AIError}=require('../src/ai/catalog');
const {complete,embed}=require('../src/ai/transport'); const {cosine,retrieve}=require('../src/ai/retrieval');
const {AssistantService}=require('../src/ai/service'); const {prisma:db}=require('../src/database');
const p=(protocol='openai')=>({...providers({})[0],protocol,baseUrl:'https://model.example/v1',key:'test-only',configured:true,chatModels:['chat'],embeddingModels:['embed']});
test('model endpoints are deployment-only; HTTP restricted to loopback Ollama',()=>{
 assert.throws(()=>validBaseUrl('http://example.com/v1',true)); assert.throws(()=>validBaseUrl('https://user:secret@example.com',false));
 assert.equal(validBaseUrl('http://127.0.0.1:11434/v1/',true),'http://127.0.0.1:11434/v1');
 const list=providers({AI_ANTHROPIC_API_KEY:'test',AI_ANTHROPIC_CHAT_MODELS:'a,b,a',AI_ANTHROPIC_EMBEDDING_MODELS:'bad'});
 assert.deepEqual(list.find(x=>x.id==='anthropic').embeddingModels,[]); assert.equal(list.length,14);
 assert.equal(providers({AI_OPENAI_API_KEY:'test',AI_OPENAI_CHAT_MODELS:'chat',AI_OPENAI_EMBEDDING_MODELS:'invalid model'}).find(x=>x.id==='openai').configured,false);
 assert.equal(providers({AI_OPENAI_TOKEN_PARAMETER:'max_tokens'}).find(x=>x.id==='openai').tokenParameter,'max_tokens');
});
test('three chat protocols preserve roles, require complete answers, and only report real usage',async()=>{
 for(const protocol of ['openai','anthropic','gemini']) {
  let body; const transport=async(url,opts)=>{body=JSON.parse(opts.body);assert.equal(opts.redirect,'error');
   return Response.json(protocol==='openai'?{choices:[{finish_reason:'stop',message:{content:'答案'}}],usage:{prompt_tokens:8,completion_tokens:3}}:
    protocol==='anthropic'?{stop_reason:'end_turn',content:[{type:'thinking',thinking:'private'},{type:'text',text:'答案'}]}:
    {candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'private'},{text:'答案'}]}}]});};
  const answer=await complete(p(protocol),'chat',[{role:'system',content:'system'},{role:'user',content:'问题'}],undefined,transport);
  assert.equal(answer.content,'答案'); assert.equal(answer.usage.inputTokens,protocol==='openai'?8:undefined);
  if(protocol==='gemini')assert.equal(body.contents[0].role,'user'); else assert.equal(body.messages[0].role,protocol==='openai'?'system':'user');
 }
 await assert.rejects(()=>complete(p(),'chat',[],undefined,async()=>Response.json({choices:[{finish_reason:'length',message:{content:'截断'}}]})),e=>e.code==='INCOMPLETE');
 await assert.rejects(()=>complete(p(),'chat',[],undefined,async()=>new Response('secret', {status:401})),e=>e.code==='PROVIDER_AUTH'&&!e.message.includes('secret'));
});
test('embedding adapters reorder indices and reject incomplete, zero or mismatched vectors',async()=>{
 assert.deepEqual(await embed(p(),'embed',['a','b'],undefined,async()=>Response.json({data:[{index:1,embedding:[0,1]},{index:0,embedding:[1,0]}]})),[[1,0],[0,1]]);
 for(const vectors of [[{index:0,embedding:[0,0]}],[{index:0,embedding:[1,0]},{index:1,embedding:[1]}]]) {
  await assert.rejects(()=>embed(p(),'embed',['a','b'],undefined,async()=>Response.json({data:vectors})),e=>e.code==='INVALID_EMBEDDING');
 }
 assert.equal(cosine([1,0],[1,0]),1); assert.throws(()=>cosine([1],[1,2]));
 const gemini=await embed(p('gemini'),'embed',['a'],undefined,async(url,opts)=>{assert.ok(url.endsWith(':batchEmbedContents'));assert.equal(JSON.parse(opts.body).requests[0].model,'models/embed');return Response.json({embeddings:[{values:[.5,1]}]});}); assert.equal(gemini.length,1);
});
test('shared sessions enforce ownership, idempotency, atomic turns, cancellation and explicit note saves',async()=>{
 const id=randomUUID(), other=randomUUID(); process.env.AI_CUSTOM_BASE_URL='https://test.example/v1'; process.env.AI_CUSTOM_API_KEY='test-only';process.env.AI_CUSTOM_CHAT_MODELS='test-model';
 let release; let calls=0;const retained=[];
 const service=new AssistantService(db,async()=>{calls++;await new Promise(r=>release=r);return {content:'模型建议，不自动执行',usage:{inputTokens:12,outputTokens:6}};},undefined,work=>retained.push(work));
 try {
  await db.user.create({data:{id,email:id+'@test.local',passwordHash:'test'}});
  const session=await service.create(id,{providerId:'custom',modelId:'test-model'});
  await assert.rejects(()=>service.get(other,session.id),e=>e.status===404);
  const request={message:'解释极限',clientRequestId:randomUUID()}; const start=await service.start(id,session.id,request);
  assert.equal(retained.length,1);assert.ok(retained[0] instanceof Promise);
  assert.equal((await service.start(id,session.id,request)).id,start.id);
  assert.equal(retained.length,1);
  await assert.rejects(()=>service.start(id,session.id,{...request,message:'不同内容'}),e=>e.code==='IDEMPOTENCY_CONFLICT');
  await assert.rejects(()=>service.start(id,session.id,{message:'并发',clientRequestId:randomUUID()}),e=>e.code==='BUSY');
  for(let n=0;n<100&&!release;n++)await new Promise(r=>setTimeout(r,10)); release();
  let result;for(let n=0;n<100;n++){result=await service.get(id,session.id);if(result.turns[0]?.status==='SUCCEEDED')break;await new Promise(r=>setTimeout(r,10));}
  await retained[0];assert.equal(result.turns[0].status,'SUCCEEDED');assert.equal(calls,1);assert.equal(result.turns[0].sources.length,0);
  assert.equal(await db.note.count({where:{userId:id}}),0);
  const note=await service.saveNote(id,start.id); assert.equal((await service.saveNote(id,start.id)).id,note.id);
  await assert.rejects(()=>service.saveNote(other,start.id),e=>e.status===404);
  release=null;const second=await service.start(id,session.id,{message:'停止测试',clientRequestId:randomUUID()});
  for(let n=0;n<100&&!release;n++)await new Promise(r=>setTimeout(r,10));
  await service.cancel(id,session.id);release();await new Promise(r=>setTimeout(r,50));
  assert.equal((await db.aiTurn.findUnique({where:{id:second.id}})).status,'CANCELLED');
  assert.equal((await service.list(id))[0].activeRequestId,'');
  await service.remove(id,session.id);assert.equal((await service.list(id)).length,0);assert.equal(await db.note.count({where:{userId:id}}),1);
 } finally {await db.aiTurn.deleteMany({where:{userId:id}});await db.aiSession.deleteMany({where:{userId:id}});await db.user.deleteMany({where:{id}});await db.$disconnect();delete process.env.AI_CUSTOM_API_KEY;delete process.env.AI_CUSTOM_CHAT_MODELS;delete process.env.AI_CUSTOM_BASE_URL;}
});
