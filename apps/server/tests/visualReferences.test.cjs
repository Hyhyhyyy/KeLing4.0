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
