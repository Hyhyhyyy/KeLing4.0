const {test}=require('node:test');
const assert=require('node:assert/strict');
const harness=require('./expeditionHarness.cjs');
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const fixture=(subject='天文学')=>({draft:{id:'planet-astronomy',subject,level:'初学者',goal:'理解恒星',title:'星光探索站',story:'从观测到理解，探索恒星的世界。',planetStyleIndex:2,reviewStatus:'UNREVIEWED',generatedBy:{providerId:'fixture',model:'test-model',at:'2026-11-27T00:00:00Z'},regions:Array.from({length:3},(_,i)=>({id:'region-'+i,title:'恒星区域 '+i,description:'观察与比较',prerequisiteIds:i?['region-'+(i-1)]:[],estimatedMinutes:10,lesson:'恒星通过内部过程释放能量。',objectives:['辨别恒星'],questions:[{id:'question-'+i,prompt:'哪一个是恒星？',options:['太阳','月球'],answerIndex:0,explanation:'太阳是恒星，月球是地球的天然卫星。'}]}))},draftToken:'signed-fixture'});

test('fresh workspace is empty; explicit sample and repeated guest setup preserve user records',async()=>{
 const h=harness();h.guest(false);
 for(const key of ['courses','tasks','notes','nodes'])assert.equal(h.getGuestWorkspace()[key].length,0,key);
 const own=await h.handleGuestData('POST','/courses',{name:'中国历史'});
 await h.useAppStore.getState().startGuest();
 assert.equal(h.getGuestWorkspace().courses[0].id,own.course.id);
 const sample=h.seedGuestSample();assert.equal(h.seedGuestSample().id,sample.id);
 assert.equal(h.getGuestWorkspace().courses.length,2);
 assert.equal(h.getGuestWorkspace().courses[0].name,'中国历史');
});

test('arbitrary subject reaches real generation transport; failed or malformed generations create no content',async()=>{
 const h=harness();h.guest(false);let captured;
 h.setFetch(async(url,options)=>{captured={url,options};return response(fixture('中国历史'));});
 const result=await h.planetAPI.generate({subject:'中国历史',goal:'理解朝代变迁',credentials:{providerId:'fixture',apiKey:'temporary-key',baseUrl:''},model:'test-model'});
 assert.equal(result.draft.subject,'中国历史');assert.match(captured.url,/\/planets\/generate$/);
 assert.equal(JSON.parse(captured.options.body).subject,'中国历史');assert.equal(captured.options.headers.Authorization,undefined);
 assert.equal(h.getGuestWorkspace().courses.length,0);
 h.setFetch(async()=>response({code:'NOT_CONFIGURED'},503));
 await assert.rejects(()=>h.planetAPI.generate({subject:'英语'}),/尚未连接可用的大模型/);
 h.setFetch(async()=>response({draft:{},draftToken:'invalid'}));
 await assert.rejects(()=>h.planetAPI.generate({subject:'英语'}),/不完整/);
 assert.equal(h.getGuestWorkspace().courses.length,0);
 assert.equal(h.context.localStorage.getItem('temporary-key'),null);
});

test('confirmation is idempotent and creates connected course nodes plus first task',async()=>{
 const h=harness();h.guest(false);const draft=fixture();
 const [a,b]=await Promise.all([h.planetAPI.confirm(draft,'confirm-one'),h.planetAPI.confirm(draft,'confirm-one')]);
 assert.equal(a.id,b.id);assert.equal(h.getGuestWorkspace().courses.length,1);
 const w=h.getGuestWorkspace();assert.equal(w.nodes.length,3);assert.equal(w.tasks.length,1);assert.equal(w.nodes[1].parentIds[0],w.nodes[0].id);assert.equal(w.tasks[0].courseId,a.courseId);
 assert.equal((await h.planetAPI.get(a.id)).draft.subject,'天文学');
 const reused=fixture('英语');await assert.rejects(()=>h.planetAPI.confirm(reused,'confirm-one'),/另一颗星球/);
 assert.equal(w.courses[0].masteryLevel,0);assert.equal(w.user.exp,0);
});

test('practice enforces prerequisites and bounds; retry idempotency does not inflate attempts or mastery',async()=>{
 const h=harness();h.guest(false);const p=await h.planetAPI.confirm(fixture(),'confirm');
 await assert.rejects(()=>h.planetAPI.answer(p.id,'question-1',0,'locked'),/前面的探索区域/);
 await assert.rejects(()=>h.planetAPI.answer(p.id,'question-0',8,'invalid'),/数值无效/);
 let result=await h.planetAPI.answer(p.id,'question-0',1,'wrong');assert.equal(result.feedback.correct,false);assert.equal(result.planet.progress.completedRegionIds.length,0);
 const [first,retry]=await Promise.all([h.planetAPI.answer(p.id,'question-0',0,'correct'),h.planetAPI.answer(p.id,'question-0',0,'correct')]);
 assert.equal(first.planet.progress.answers['question-0'].attempts,2);assert.equal(retry.planet.progress.answers['question-0'].attempts,2);
 result=await h.planetAPI.answer(p.id,'question-1',0,'second');assert.equal(result.planet.progress.completedRegionIds.length,2);
 assert.equal(h.getGuestWorkspace().courses[0].masteryLevel,0);assert.equal(h.getGuestWorkspace().user.exp,0);
 h.endGuestSession();h.guest(false);assert.equal((await h.planetAPI.list()).length,0);await assert.rejects(()=>h.planetAPI.get(p.id),/不在当前学习空间/);
});

test('late generated response cannot populate a different guest session',async()=>{
 const h=harness();h.guest(false);let release;
 h.setFetch(()=>new Promise(resolve=>{release=()=>resolve(response(fixture()));}));
 const pending=h.planetAPI.generate({subject:'天文学'});h.endGuestSession();h.guest(false);release();
 await assert.rejects(()=>pending,/学习空间已切换/);assert.equal((await h.planetAPI.list()).length,0);
});

test('signed-in generation and confirmation keep account bearer and use server records',async()=>{
 const h=harness();h.account();const d=fixture('物理');const p={id:d.draft.id,courseId:'server-course',draft:d.draft,progress:{answers:{},completedRegionIds:[]},createdAt:d.draft.generatedBy.at,updatedAt:d.draft.generatedBy.at};const calls=[];
 h.setFetch(async(url,options)=>{calls.push({url,options});return response(url.endsWith('/confirm')?{planet:p}:url.endsWith('/generate')?d:{planets:[p]});});
 const draft=await h.planetAPI.generate({subject:'物理'});assert.equal((await h.planetAPI.confirm(draft,'account-confirm')).courseId,'server-course');assert.equal((await h.planetAPI.list()).length,1);
 assert.ok(calls.every(c=>c.options.headers.Authorization==='Bearer verified-account-a'));
 assert.equal(JSON.parse(calls[1].options.body).clientRequestId,'account-confirm');
});

test('asynchronous native generation polls its opaque token and does not create a course until confirmation',async()=>{
 const h=harness();h.guest(false);let calls=0;const d=fixture('经济学');
 h.setFetch(async(url,options)=>{calls++;if(url.endsWith('/generate'))return response({jobId:'job-1',jobToken:'opaque-session-token',status:'RUNNING'},202);assert.match(url,/generation-jobs\/job-1$/);assert.equal(options.headers['X-Planet-Job-Token'],'opaque-session-token');assert.equal(options.headers.Authorization,undefined);return response({status:'SUCCEEDED',...d});});
 const result=await h.planetAPI.generate({subject:'经济学'});assert.equal(result.draft.subject,'经济学');assert.equal(calls,2);assert.equal(h.getGuestWorkspace().courses.length,0);
});

test('stopping asynchronous generation preserves the empty workspace and stops polling',async()=>{
 const h=harness();h.guest(false);let calls=0;const controller=new AbortController();
 h.setFetch(async()=>{calls++;return response({jobId:'job-abort',jobToken:'opaque',status:'RUNNING'},202);});
 const pending=h.planetAPI.generate({subject:'地理'},controller.signal);controller.abort();await assert.rejects(()=>pending,/停止等待/);assert.equal(calls,1);assert.equal(h.getGuestWorkspace().courses.length,0);
});

test('common subject illustrations are selected semantically, with unknown subjects using fallback',()=>{
 const path=require('node:path'),vm=require('node:vm'),esbuild=require('esbuild');
 const code=esbuild.buildSync({entryPoints:[path.resolve(__dirname,'../src/components/subjectPlanetCatalog.ts')],bundle:true,platform:'node',format:'cjs',write:false,loader:{'.css':'empty'},define:require('../../../scripts/lib/vite-test-env.cjs')}).outputFiles[0].text;
 const exports={},context={module:{exports},exports,require,process};vm.runInNewContext(code,context);const pick=context.module.exports.subjectPlanet;
 for(const [subject,id] of [['高等数学','math'],['英语','english'],['中国历史','history'],['计算机科学','computer'],['经济学','economics'],['思想政治','politics'],['语文','chinese'],['物理学','physics'],['化学','chemistry'],['生物学','biology'],['地理学','geography'],['美术','arts']])assert.equal(pick(subject)?.id,id,subject);
 assert.equal(pick('自定义专题'),undefined);
});
