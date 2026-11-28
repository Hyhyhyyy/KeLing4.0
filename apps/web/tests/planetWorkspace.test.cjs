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

test('generation preserves selected internet context and question volume in transport',async()=>{
 const h=harness();h.guest(false);let body;
 h.setFetch(async(_url,options)=>{body=JSON.parse(options.body);return response(fixture('奶龙学'));});
 await h.planetAPI.generate({subject:'奶龙学',contextMode:'internet_culture',questionCount:18,goal:'理解网络二创的用法'});
 assert.equal(body.contextMode,'internet_culture');assert.equal(body.questionCount,18);assert.equal(body.goal,'理解网络二创的用法');
 assert.equal(h.getGuestWorkspace().courses.length,0);
});

test('research failures keep the topic editable and create no course',async()=>{
 const h=harness();h.guest(false);
 h.setFetch(async()=>response({code:'INSUFFICIENT_RESEARCH'},422));
 await assert.rejects(()=>h.planetAPI.generate({subject:'无法核实的主题',contextMode:'internet_culture'}),/可靠资料不足/);
 h.setFetch(async()=>response({code:'RESEARCH_UNAVAILABLE'},503));
 await assert.rejects(()=>h.planetAPI.generate({subject:'奶龙学'}),/联网检索暂时不可用/);
 assert.equal(h.getGuestWorkspace().courses.length,0);
});

function practiceHelpers(){
 const path=require('node:path'),vm=require('node:vm'),esbuild=require('esbuild');
 const code=esbuild.buildSync({entryPoints:[path.resolve(__dirname,'../src/pages/Planets/practiceAnswers.ts')],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
 const exports={},context={module:{exports},exports,require,process,URL};vm.runInNewContext(code,context);return context.module.exports;
}

test('practice response builder keeps six formats distinct and does not auto-confirm self review',()=>{
 const {questionResponse,describeResponse}=practiceHelpers(),q={options:['甲','乙','丙']};
 const call=(kind,selected,multiple,text,order,selfReview)=>questionResponse({...q,kind},selected,multiple,text,order,selfReview);
 const plain=value=>JSON.parse(JSON.stringify(value));
 assert.deepEqual(plain(call(undefined,1,[],'',[])),{selectedIndex:1});
 assert.deepEqual(plain(call('true_false',0,[],'',[])),{selectedIndex:0});
 assert.deepEqual(plain(call('multiple_choice',null,[2,0],'',[])),{selectedIndices:[0,2]});
 assert.deepEqual(plain(call('fill_blank',null,[],'  网络文化  ',[])),{text:'网络文化'});
 assert.deepEqual(plain(call('ordering',null,[],'',[2,0,1])),{orderedIndices:[2,0,1]});
 assert.equal(call('ordering',null,[],'',[0,0,2]),null);
 assert.equal(call('multiple_choice',null,[],'',[]),null);
 assert.equal(call('short_answer',null,[],' ',[]),null);
 assert.deepEqual(plain(call('short_answer',null,[],'我的解释',[])),{text:'我的解释'});
 assert.deepEqual(plain(call('short_answer',null,[],'我的解释',[],true)),{text:'我的解释',selfReview:true});
 assert.equal(describeResponse(q,{orderedIndices:[2,0,1]}),'1. 丙\n2. 甲\n3. 乙');
});

test('ordering controls preserve each item and research links reject executable or credential URLs',()=>{
 const {moveOrder,sourceUrl}=practiceHelpers(),order=[0,1,2];
 assert.equal(moveOrder(order,0,-1),order);assert.equal(moveOrder(order,2,1),order);
 assert.deepEqual(Array.from(moveOrder(order,1,-1)),[1,0,2]);assert.deepEqual(order,[0,1,2]);
 assert.equal(sourceUrl('https://example.org/source?id=3'),'https://example.org/source?id=3');
 for(const value of ['javascript:alert(1)','data:text/html,test','https://user:password@example.org/','not-a-url'])assert.equal(sourceUrl(value),undefined);
});

test('legacy draft canonical bytes retain signed field order without new defaults',()=>{
 const h=harness(),d=fixture().draft;
 const canonical={id:d.id,subject:d.subject,level:d.level,goal:d.goal,title:d.title,story:d.story,planetStyleIndex:d.planetStyleIndex,regions:d.regions,reviewStatus:d.reviewStatus,generatedBy:d.generatedBy};
 assert.equal(JSON.stringify(h.validatePlanetDraft(d)),JSON.stringify(canonical));
 assert.equal(Object.hasOwn(h.validatePlanetDraft(d).regions[0].questions[0],'kind'),false);
});

function diverseFixture(){
 const d=fixture().draft;
 const base=(id,kind,more)=>({id,kind,prompt:id,options:[],answerIndex:0,explanation:'参考解析',...more});
 d.regions[0].questions=[
  base('multi','multiple_choice',{options:['甲','乙','丙'],answerIndices:[0,2]}),
  base('bool','true_false',{options:['是','否'],answerIndex:1}),
  base('blank','fill_blank',{acceptedAnswers:['ABC','甲 乙']}),
  base('order','ordering',{options:['开始','结束','过程'],answerIndices:[0,2,1]}),
  base('short','short_answer',{referenceAnswer:'原作设定与网络二创不能混为一谈。',rubric:['区分语境','给出依据']}),
 ];
 return d;
}

test('mixed practice uses sets, exact order and normalized exact text without false semantic grading',()=>{
 const h=harness(),d=h.validatePlanetDraft(diverseFixture());let p=h.emptyPlanetProgress();
 const submit=(id,value)=>{const r=h.answerPlanetQuestion(d,p,id,value);p=r.progress;return r.feedback;};
 assert.equal(submit('multi',{selectedIndices:[2,0]}).correct,true);
 assert.equal(submit('multi',{selectedIndices:[0,1,2]}).correct,false);
 assert.throws(()=>submit('multi',{selectedIndices:[0,0]}),/重复/);
 assert.equal(submit('bool',{selectedIndex:1}).correct,true);
 assert.equal(submit('blank',{text:'  ＡＢＣ  '}).correct,true);
 assert.equal(submit('blank',{text:'甲\n乙'}).correct,true);
 assert.equal(submit('blank',{text:'甲乙'}).correct,false);
 assert.equal(submit('order',{orderedIndices:[0,2,1]}).correct,true);
 assert.equal(submit('order',{orderedIndices:[2,0,1]}).correct,false);
 assert.throws(()=>submit('order',{orderedIndices:[0,1]}),/数量无效/);
});

test('short answer needs a previous matching answer and explicit review; changed text resets review',()=>{
 const h=harness(),d=h.validatePlanetDraft(diverseFixture());d.regions[0].questions=d.regions[0].questions.filter(q=>q.id==='short');let p=h.emptyPlanetProgress();
 assert.throws(()=>h.answerPlanetQuestion(d,p,'short',{text:'我的解释',selfReview:true}),/先提交/);
 let r=h.answerPlanetQuestion(d,p,'short',{text:'我的解释'});p=r.progress;
 assert.equal(r.feedback.correct,false);assert.equal(r.feedback.requiresSelfReview,true);assert.equal(p.completedRegionIds.length,0);
 assert.throws(()=>h.answerPlanetQuestion(d,p,'short',{text:'另一个解释',selfReview:true}),/先提交/);
 r=h.answerPlanetQuestion(d,p,'short',{text:'我的解释',selfReview:true});p=r.progress;
 assert.equal(r.feedback.correct,false);assert.equal(p.answers.short.reviewed,true);assert.equal(p.completedRegionIds[0],'region-0');
 r=h.answerPlanetQuestion(d,p,'short',{text:'修改后的解释'});
 assert.equal(r.progress.answers.short.reviewed,false);assert.equal(r.progress.completedRegionIds.length,0);
});

test('citations and artwork validation reject unknown sources and unsafe image URLs',()=>{
 const h=harness(),d=diverseFixture();
 d.research={status:'grounded',intent:'网络文化语境',sources:[{id:'s1',title:'来源',url:'https://example.org/article',snippet:'原作和二创的区别'}],searchedAt:'2026-11-28T00:00:00Z',queries:['奶龙学']};
 d.regions[0].questions[0].sourceIds=['s1'];
 d.artwork={status:'generated',url:'https://images.example.org/planet.png',prompt:'星球插画'};
 assert.equal(h.validatePlanetDraft(d).research.sources[0].id,'s1');
 d.regions[0].questions[0].sourceIds=['unknown'];assert.throws(()=>h.validatePlanetDraft(d),/引用必须/);d.regions[0].questions[0].sourceIds=['s1'];
 for(const url of ['http://images.example.org/p.png','https://127.0.0.1/p.png','https://localhost/p.png','https://[::1]/p.png','https://user:pass@example.org/p.png']){d.artwork.url=url;assert.throws(()=>h.validatePlanetDraft(d),/网址/);}
 d.artwork={status:'fallback',prompt:'图像生成失败'};assert.equal(h.validatePlanetDraft(d).artwork.status,'fallback');
});

function graphFixture(){return {nodes:Array.from({length:7},(_,i)=>({id:'n'+i,title:'概念'+i,summary:'知识解释'+i,sourceIds:[]})),edges:[{source:'n0',target:'n1',label:'包含',kind:'hierarchy'},{source:'n0',target:'n2',label:'包含',kind:'hierarchy'},{source:'n2',target:'n3',label:'应用',kind:'hierarchy'},{source:'n1',target:'n3',label:'辨析',kind:'related'}]};}
test('adaptive graph keeps arbitrary branches; hierarchy cycles and unknown nodes are rejected',async()=>{
 const h=harness(),d=fixture();d.draft.knowledgeGraph=graphFixture();h.guest(false);
 assert.equal(h.validatePlanetDraft(d.draft).knowledgeGraph.nodes.length,7);
 await h.planetAPI.confirm(d,'graph-confirmation');assert.equal(h.getGuestWorkspace().nodes.length,7);
 assert.equal(h.getGuestWorkspace().nodes.find(n=>n.name==='概念3').parentIds.length,1);
 d.draft.knowledgeGraph.edges.push({source:'n3',target:'n0',label:'循环',kind:'hierarchy'});assert.throws(()=>h.validatePlanetDraft(d.draft),/不能循环/);
 d.draft.knowledgeGraph.edges.pop();d.draft.knowledgeGraph.edges.push({source:'n3',target:'unknown',label:'无效',kind:'related'});assert.throws(()=>h.validatePlanetDraft(d.draft),/节点无效/);
});

test('guest question regeneration preserves other questions, clears replaced answer and relocks dependents',async()=>{
 const h=harness();h.guest(false);const d=fixture();const p=await h.planetAPI.confirm(d,'regenerate-confirmation');
 await h.planetAPI.answer(p.id,'question-0',0,'first-answer');await h.planetAPI.answer(p.id,'question-1',0,'second-answer');
 h.setFetch(async(url,options)=>{assert.match(url,/regenerate-preview$/);const body=JSON.parse(options.body);assert.equal(body.kind,'question');assert.equal(body.questionId,'question-0');assert.equal(body.draftToken,d.draftToken);const next=structuredClone(body.draft);next.regions[0].questions[0].id='new-question';return response({draft:next,draftToken:'revised-token'});});
 const changed=await h.planetAPI.regenerate(p.id,'question','用更贴近语境的题目','question-regenerate','question-0');
 assert.equal(changed.progress.answers['question-0'],undefined);assert.equal(changed.progress.answers['question-1'].correct,true);assert.equal(changed.progress.completedRegionIds.length,0);
 assert.equal(changed.draft.regions[1].questions[0].id,'question-1');
 h.setFetch(async()=>response({code:'ARTWORK_FAILED'},502));await assert.rejects(()=>h.planetAPI.regenerate(p.id,'artwork','像素风','image-regenerate'),/原形象已保留/);
 assert.equal((await h.planetAPI.get(p.id)).draft.regions[0].questions[0].id,'new-question');
});
