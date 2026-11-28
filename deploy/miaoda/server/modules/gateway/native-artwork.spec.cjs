const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module');
const file=require.resolve('./native-artwork.service.ts'),mod=new Module(file,module);mod.filename=file;mod.paths=module.paths;let generator,designer;
mod.require=name=>name==='@nestjs/common'?{Inject:()=>()=>{},Injectable:()=>x=>x,Logger:class{warn(){}}}:name.includes('keling-server.cjs')?{registerPlanetArtworkGenerator:f=>{generator=f;},registerPlanetVisualDesigner:f=>{designer=f;}}:{};
mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText,file);
const {NativeArtworkService,normalizePlanetArtworkUrl}=mod.exports;
const prefix='/spark/app/app_17h4dw5jwdg/runtime/api/v1/storage/object/bucket_aadk4xawzf4xg_static/';
test('only the current application public static plugin object path becomes a stable HTTPS URL',()=>{
 for(const p of [prefix+'plugin%2F2026%2Fimage_123',prefix.replace('/spark/app/','/app/')+'plugin/image_123.jpg'])assert.equal(normalizePlanetArtworkUrl(p),'https://ucn5aajxnx7f.feishuapp.com'+p);
 assert.equal(normalizePlanetArtworkUrl('https://images.example.org/planet.jpg'),'https://images.example.org/planet.jpg');
});
test('verified external references use imageToImage array passthrough; raw stored URLs never enter AI',async()=>{
 const calls=[];new NativeArtworkService({load:id=>({call:async(action,input)=>{calls.push({id,action,input});return{images:['https://images.example.org/planet.jpg']};}})}).onModuleInit();
 const references=['https://official.example.org/character.png'];await generator('sourced body design',new AbortController().signal,references);
 assert.equal(calls[0].id,'keling-planet-artwork-reference');assert.equal(calls[0].action,'imageToImage');assert.deepEqual(calls[0].input.referenceImages,references);
 await assert.rejects(()=>generator('topic',new AbortController().signal,['https://ucn5aajxnx7f.feishuapp.com'+prefix+'plugin/a']));assert.equal(calls.length,1);
});
test('native visual planner preserves original research and verified reference metadata',async()=>{
 let call;const output={kind:'character',features:[]};new NativeArtworkService({load:id=>({call:async(action,input)=>{call={id,action,input};return output;}})}).onModuleInit();
 const input={subject:'角色主题',meaning:'原角色形象',instruction:'把本体变为球体',research:{sources:[{id:'s1'}]},references:[{sourceId:'s1',imageUrl:'https://official.example.org/a.png'}]};
 assert.equal(await designer(input,new AbortController().signal),output);assert.equal(call.id,'keling-planet-visual-design');assert.deepEqual(JSON.parse(call.input.research),input.research);assert.deepEqual(JSON.parse(call.input.references),input.references);
});
test('relative image normalization rejects other apps, private buckets, traversal and unsafe protocols',()=>{
 for(const p of ['//evil.example/a',prefix.replace('app_17h4dw5jwdg','app_other')+'plugin/a',prefix.replace('_static','')+'plugin/a',prefix+'private/a',prefix+'plugin/../a',prefix+'plugin%2F..%2Fa',prefix+'plugin%252Fa',prefix+'plugin%2Fa%5Cb',prefix+'plugin/a?token=x',prefix+'plugin/a#top',prefix+'plugin//a',prefix+'plugin/a\n','javascript:alert(1)','http://example.org/a','https://user:pass@example.org/a','https://127.0.0.1/a','https://a.internal/a'])assert.throws(()=>normalizePlanetArtworkUrl(p),undefined,p);
});
test('native artwork preserves the generated prompt and normalizes only successful plugin output',async()=>{
 let request;new NativeArtworkService({load:id=>({call:async(action,input)=>{request={id,action,input};return{images:[prefix+'plugin%2Factual_generated_image']};}})}).onModuleInit();
 const url=await generator('actual topic prompt',new AbortController().signal);assert.equal(request.id,'keling-planet-artwork');assert.equal(request.action,'textToImage');assert.deepEqual(request.input,{prompt:'actual topic prompt'});assert.equal(url,'https://ucn5aajxnx7f.feishuapp.com'+prefix+'plugin%2Factual_generated_image');
 new NativeArtworkService({load:()=>({call:async()=>({images:[prefix+'private/a']})})}).onModuleInit();await assert.rejects(()=>generator('topic',new AbortController().signal),e=>e.message==='Planet artwork generation failed');
});
