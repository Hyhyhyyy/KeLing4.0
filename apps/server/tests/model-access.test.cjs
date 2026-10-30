require('ts-node/register');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {accessCatalog, credentialProvider, accessQuestion, discoverAccess, completeAccess, modelAccessRouter}=require('../src/ai/modelAccess');
const {trialConfig,completeTrial,trialRouter}=require('../src/ai/trial');
const key='synthetic-key-not-a-real-credential';
const credentials={providerId:'openai',apiKey:key};

test('public model catalog never exposes deployment keys and user keys cannot redirect to arbitrary hosts',()=>{
 const catalog=accessCatalog({AI_OPENAI_API_KEY:'PRIVATE_DEPLOYMENT_KEY'});
 assert.equal(catalog.length,17);assert.ok(!JSON.stringify(catalog).includes('PRIVATE_DEPLOYMENT_KEY'));
 for(const baseUrl of ['http://127.0.0.1:11434/v1','https://api.openai.com.attacker.test/v1','https://attacker.test/v1','https://api.openai.com/v1?key=x','https://user:pass@api.openai.com/v1','https://api.openai.com:444/v1'])
  assert.throws(()=>credentialProvider({...credentials,baseUrl},{}),e=>e.code==='BASE_URL_NOT_ALLOWED');
 assert.equal(credentialProvider(credentials,{}).key,key);
 assert.throws(()=>credentialProvider({...credentials,providerId:'ollama'},{}));
 assert.throws(()=>credentialProvider({...credentials,providerId:'custom'},{}));
 assert.equal(credentialProvider({providerId:'huawei',apiKey:key,baseUrl:'https://api-ap-southeast-1.modelarts-maas.com/v2'},{}).protocol,'openai');
 assert.equal(credentialProvider({providerId:'bailian',apiKey:key,baseUrl:'https://workspace.cn-beijing.maas.aliyuncs.com/api/v1'},{}).id,'bailian');
 assert.equal(accessQuestion.safeParse({...credentials,model:'m',message:'x',context:Array(4).fill({title:'t',text:'x'})}).success,false);
 assert.equal(accessQuestion.safeParse({...credentials,model:'m',message:'x',context:[{title:'t',text:'x'.repeat(2001)}]}).success,false);
});
test('model discovery sends a key to one chosen vendor only, returns fresh uncached results and leaves unknown capabilities honest',async()=>{
 const urls=[];let version=0;
 const mock=async(url,opts)=>{urls.push(url);assert.equal(opts.headers.Authorization,'Bearer '+key);assert.equal(opts.redirect,'error');assert.equal(opts.method,'GET');assert.ok(!url.includes(key));return Response.json({data:[{id:'text-model-'+ ++version},{id:'bad id'}]});};
 const first=await discoverAccess(credentials,undefined,mock,{});
 const second=await discoverAccess(credentials,undefined,mock,{});
 assert.deepEqual(urls,['https://api.openai.com/v1/models','https://api.openai.com/v1/models']);
 assert.notEqual(first.models[0].id,second.models[0].id);assert.deepEqual(first.models[0].capabilities,[]);
 assert.ok(!JSON.stringify(first).includes(key));assert.ok(first.fetchedAt);
 await assert.rejects(()=>discoverAccess({...credentials,baseUrl:'https://attacker.test/v1'},undefined,mock,{}),e=>e.code==='BASE_URL_NOT_ALLOWED');
 assert.equal(urls.length,2);
});
test('Claude and Gemini discovery follow bounded pagination and native capability metadata',async()=>{
 let calls=0;
 const claude=await discoverAccess({providerId:'anthropic',apiKey:key},undefined,async(url,opts)=>{
  assert.equal(opts.headers['x-api-key'],key);assert.ok(url.startsWith('https://api.anthropic.com/v1/models'));
  calls++;return Response.json({data:[{id:'claude-'+calls}],has_more:calls===1,last_id:'cursor/one'});
 },{});
 assert.equal(calls,2);assert.equal(claude.models.length,2);assert.deepEqual(claude.models[0].capabilities,['chat']);
 calls=0;
 const gemini=await discoverAccess({providerId:'gemini',apiKey:key},undefined,async(url,opts)=>{
  assert.equal(opts.headers['x-goog-api-key'],key);assert.ok(!url.includes(key));calls++;
  if(calls===1)return Response.json({models:[{name:'models/text',supportedGenerationMethods:['generateContent']}],nextPageToken:'next/x'});
  assert.ok(url.includes('pageToken=next%2Fx'));return Response.json({models:[{name:'models/embed',supportedGenerationMethods:['embedContent']}]});
 },{});
 assert.deepEqual(gemini.models,[{id:'text',capabilities:['chat']},{id:'embed',capabilities:['embedding']}]);
 await assert.rejects(()=>discoverAccess({providerId:'huawei',apiKey:key},undefined,async()=>{throw Error('must not request');},{}),e=>e.code==='DISCOVERY_UNSUPPORTED');
});
test('temporary completion contains only explicit user material and never consumes a server key or saves a session',async()=>{
 let captured;
 const result=await completeAccess({...credentials,model:'my-model',message:'explain',context:[{title:'source',text:'selected fact'}]},undefined,async(p,model,messages)=>{
  captured={p,model,messages};return {content:'Synthetic answer',usage:{inputTokens:3}};
 },{AI_OPENAI_API_KEY:'PRIVATE_SERVER_KEY'});
 assert.equal(captured.p.key,key);assert.equal(captured.messages.length,2);
 assert.ok(captured.messages[1].content.includes('selected fact'));
 assert.ok(!JSON.stringify(captured.messages).includes(key));
 assert.deepEqual(result,{answer:'Synthetic answer',model:'my-model',usage:{inputTokens:3}});
 assert.ok(!JSON.stringify(result).includes(key));
});
test('public trial stays disabled without explicit opt-in even when an account model is configured',async()=>{
 const env={AI_CUSTOM_BASE_URL:'https://model.example/v1',AI_CUSTOM_API_KEY:'server-test',AI_CUSTOM_CHAT_MODELS:'model',TRIAL_AI_PROVIDER:'custom',TRIAL_AI_MODEL:'model'};
 assert.equal(trialConfig(env).ai.available,false);
 let calls=0;
 await assert.rejects(()=>completeTrial({message:'question'},undefined,async()=>{calls++;},{...env}),e=>e.code==='NOT_CONFIGURED');
 assert.equal(calls,0);
 const enabled={...env,TRIAL_AI_ENABLED:'true'};
 assert.equal(trialConfig(enabled).ai.available,true);
 const result=await completeTrial({message:'question'},undefined,async()=>({content:'Synthetic',usage:{}}),enabled);
 assert.equal(result.answer,'Synthetic');
 assert.ok(!JSON.stringify(trialConfig(enabled)).includes('server-test'));
});
test('anonymous HTTP access works with no cookies or authentication; invalid credentials cannot trigger external calls',async()=>{
 const app=express();app.use(express.json());app.use('/model-access',modelAccessRouter());app.use('/trial',trialRouter());
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 try{
  const catalog=await fetch(base+'/model-access/catalog');assert.equal(catalog.status,200);assert.equal(catalog.headers.get('cache-control'),'no-store');assert.equal(catalog.headers.get('set-cookie'),null);
  assert.equal((await catalog.json()).providers.length,17);
  const trial=await fetch(base+'/trial/config');assert.equal(trial.status,200);assert.equal(trial.headers.get('cache-control'),'no-store');
  const bad=await fetch(base+'/model-access/discover',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({providerId:'unknown',apiKey:key})});
  assert.equal(bad.status,400);assert.ok(!(await bad.text()).includes(key));
 }finally{await new Promise(resolve=>server.close(resolve));}
});
