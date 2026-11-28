const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module');
const file=require.resolve('../src/learning/visualReferences.ts'),mod=new Module(file,module);mod.filename=file;mod.paths=module.paths;
mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
const {isPublicAddress,extractImageCandidates,collectVisualReferences,fetchPublicReference}=mod.exports;
test('visual reference DNS policy excludes local, reserved, multicast and mapped addresses',()=>{
 for(const ip of ['127.0.0.1','0.0.0.0','10.0.0.1','169.254.169.254','172.16.0.1','192.168.0.1','100.64.0.1','192.0.2.1','198.51.100.1','203.0.113.1','224.0.0.1','::1','::ffff:127.0.0.1','fd00::1','fe80::1','2001:db8::1','2002:7f00:1::'])assert.equal(isPublicAddress(ip),false,ip);
 for(const ip of ['8.8.8.8','1.1.1.1','2606:4700:4700::1111'])assert.equal(isPublicAddress(ip),true,ip);
});
test('reference candidates come only from real image metadata and img URLs, prefer metadata and decode attributes',()=>{
 const html='<script>"https://invented.example/model.png"</script><img src="/logo.png"><img src="/button_more_purple.png"><img class="logo_title" src="/heading.png"><img src="/actual.png" alt="character"><meta property="og:image" content="https://cdn.example/hero.png?x=1&amp;y=2"><img src="http://127.0.0.1/x"><img src="data:image/png,x"><img src="/actual.png">';
 assert.deepEqual(extractImageCandidates(html,'https://official.example/character'),[{url:'https://cdn.example/hero.png?x=1&y=2',alt:''},{url:'https://official.example/actual.png',alt:'character'}]);
});
test('reference collection caps pages and verified images, preserves source attribution and rejects unavailable candidates',async()=>{
 const calls=[],sources=[1,2,3].map(i=>({id:'s'+i,url:'https://official.example/'+i,title:'Page '+i}));
 const out=await collectVisualReferences(sources,new AbortController().signal,async(url,kind)=>{
  calls.push([url,kind]);if(url.includes('bad.png'))throw new Error('invalid MIME');
  if(kind==='page')return{url,contentType:'text/html',body:Buffer.from('<img src="/bad.png"><img src="/good'+url.slice(-1)+'.png" alt="visible subject">')};
  return{url,contentType:'image/png',body:Buffer.from('contract test only')};
 });
 assert.equal(out.length,2);assert.deepEqual(out.map(x=>x.sourceId),['s1','s2']);assert.ok(out.every(x=>x.imageUrl.includes('/good')));assert.equal(calls.filter(x=>x[1]==='page').length,2);assert.ok(!calls.some(x=>x[0]===sources[2].url));
});
test('same-page image checks overlap in pairs and selection follows rank, not completion order',async()=>{
 const source={id:'s1',url:'https://official.example/character',title:'Character'},pending=new Map(),started=[];
 let active=0,peak=0,firstReady,secondReady;
 const firstPair=new Promise(resolve=>{firstReady=resolve;}),secondPair=new Promise(resolve=>{secondReady=resolve;});
 const work=collectVisualReferences([source,{id:'s2',url:'https://other.example/',title:'Unused'}],new AbortController().signal,async(url,kind)=>{
  if(kind==='page'){assert.equal(url,source.url);return{url,contentType:'text/html',body:Buffer.from([1,2,3,4,5].map(i=>'<img src="/subject'+i+'.png" alt="rank '+i+'">').join(''))};}
  const rank=Number(url.match(/subject(\d)/)[1]);started.push(rank);active++;peak=Math.max(peak,active);
  const response=new Promise((resolve,reject)=>{pending.set(rank,{resolve,reject});});
  if(started.length===2)firstReady();if(started.length===4)secondReady();
  try{await response;return{url,contentType:'image/png',body:Buffer.from('controlled contract result')};}finally{active--;}
 });
 await firstPair;assert.equal(active,2);assert.deepEqual(started,[1,2]);
 pending.get(2).reject(new Error('invalid MIME'));await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(started,[1,2],'Do not outrank an unresolved earlier candidate');
 pending.get(1).resolve();await secondPair;assert.equal(active,2);
 pending.get(4).resolve();await new Promise(resolve=>setImmediate(resolve));pending.get(3).resolve();
 const refs=await work;
 assert.equal(peak,2);assert.deepEqual(started,[1,2,3,4]);assert.deepEqual(refs.map(r=>r.alt),['rank 1','rank 3']);
 assert.ok(refs.every(r=>r.sourceId==='s1'&&r.pageUrl===source.url));
});
test('two delayed independent candidates have the same output as sequential checks with overlapping wait',async t=>{
 const {performance}=require('node:perf_hooks'),delay=120,source={id:'s1',url:'https://official.example/character',title:'Character'};
 const candidates=[{url:'https://official.example/first.png',alt:'first'},{url:'https://official.example/second.png',alt:'second'}];
 let active=0,peak=0;const image=async url=>{active++;peak=Math.max(peak,active);try{await new Promise(resolve=>setTimeout(resolve,delay));return{url,contentType:'image/png',body:Buffer.from('synthetic delay; no network or AI')};}finally{active--;}};
 const serialStart=performance.now(),serial=[];
 for(const c of candidates){const result=await image(c.url);serial.push({sourceId:source.id,pageUrl:source.url,imageUrl:result.url,alt:c.alt});}
 const sequentialMs=performance.now()-serialStart;assert.equal(peak,1);peak=0;
 const parallelStart=performance.now();
 const parallel=await collectVisualReferences([source],new AbortController().signal,async(url,kind)=>kind==='page'?{url,contentType:'text/html',body:Buffer.from(candidates.map(c=>'<img src="'+c.url+'" alt="'+c.alt+'">').join(''))}:image(url));
 const parallelMs=performance.now()-parallelStart;
 assert.equal(peak,2);assert.deepEqual(parallel,serial);
 // Wall-clock numbers are diagnostics, not a flaky timing assertion on a busy host.
 t.diagnostic(JSON.stringify({synthetic:true,perImageDelayMs:delay,sequentialMs:+sequentialMs.toFixed(1),parallelMs:+parallelMs.toFixed(1),peakConcurrentImages:peak,outputIdentical:true,modelCalls:0}));
});
test('cancelling an in-flight image pair aborts both checks without scheduling more candidates',async()=>{
 const controller=new AbortController(),started=[],aborted=[];let pairReady;
 const ready=new Promise(resolve=>{pairReady=resolve;});
 const work=collectVisualReferences([{id:'s1',url:'https://official.example/character',title:'Character'}],controller.signal,async(url,kind,signal)=>{
  if(kind==='page')return{url,contentType:'text/html',body:Buffer.from('<img src="/first.png"><img src="/second.png"><img src="/third.png">')};
  started.push(url);if(started.length===2)pairReady();
  await new Promise((_,reject)=>{signal.addEventListener('abort',()=>{aborted.push(url);reject(signal.reason);},{once:true});});
  throw new Error('aborted image cannot return');
 });
 await ready;controller.abort();await assert.rejects(work);
 assert.equal(started.length,2);assert.deepEqual(aborted,started);
});
test('private URLs fail before a network request and an aborted collection is never success',async()=>{
 for(const u of ['https://127.0.0.1/x','https://[::1]/x','https://user:pass@example.com/x','http://example.com/x','https://a.internal/x'])await assert.rejects(()=>fetchPublicReference(u,'page',new AbortController().signal));
 const c=new AbortController();c.abort();await assert.rejects(()=>collectVisualReferences([],c.signal));
});
test('only an actual 404/410 may spend the remaining page budget on the same-origin home, with honest page attribution',async()=>{
 const sources=[{id:'s1',url:'https://official.example/old/path/',title:'Old page'},{id:'s2',url:'https://elsewhere.example/',title:'Other page'}];
 for(const status of [404,410,403,500]){
  const calls=[];const refs=await collectVisualReferences(sources,new AbortController().signal,async(url,kind)=>{
   calls.push([url,kind]);if(url===sources[0].url)throw Object.assign(new Error('HTTP failure'),{status});
   if(kind==='page')return{url,contentType:'text/html',body:Buffer.from('<img src="/character.png">')};return{url,contentType:'image/png',body:Buffer.from('test only')};
  });
  assert.equal(calls.filter(x=>x[1]==='page').length,2);
  if(status===404||status===410){assert.equal(refs[0].pageUrl,'https://official.example/');assert.equal(refs[0].sourceId,'s1');assert.ok(!calls.some(x=>x[0]===sources[1].url));}
  else{assert.ok(!calls.some(x=>x[0]==='https://official.example/'));assert.equal(refs[0].sourceId,'s2');}
 }
});
test('network transport pins a verified DNS address and rejects a redirected private host before connecting',async()=>{
 const {EventEmitter}=require('node:events'),network=new Module(file,module);network.filename=file;network.paths=module.paths;const lookups=[],requests=[];
 network.require=name=>name==='node:dns/promises'?{lookup:async(host,options)=>{lookups.push({host,options});return[{address:host==='public.example'?'8.8.8.8':'127.0.0.1',family:4}];}}:name==='node:https'?{request:(url,options,callback)=>{
  requests.push({url:url.href,options});const req=new EventEmitter();req.setTimeout=()=>{};req.destroy=()=>{};req.end=()=>{const res=new EventEmitter();res.statusCode=302;res.headers={location:'https://rebind.example/private'};res.destroy=()=>{};callback(res);};return req;
 }}:require(name);
 network._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
 await assert.rejects(()=>network.exports.fetchPublicReference('https://public.example/image','page',new AbortController().signal),/not public/);
 assert.equal(requests.length,1);assert.deepEqual(lookups.map(x=>x.host),['public.example','rebind.example']);assert.equal(requests[0].options.family,4);assert.equal(requests[0].options.agent,false);
 requests[0].options.lookup('public.example',{},(error,address,family)=>{assert.equal(error,null);assert.equal(address,'8.8.8.8');assert.equal(family,4);});
});
