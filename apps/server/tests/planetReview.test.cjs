const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const {registerPlanetContentReviewer,reviewPlanetContent}=require('../src/learning/planetReview');
const {diagnosticForJob}=require('../src/learning/planetDiagnostics');

// Synthetic review replies test the gate, not a model's ability to fact-check.
const quote='1865年克劳修斯提出热力学熵，1877年玻尔兹曼提出统计熵，1923年普朗克来华讲学引入熵概念，1943年薛定谔提出负熵。';
function draft(){return {
 id:'fixture',subject:'熵',level:'入门',goal:'',title:'审核合同测试',story:'不作为事实课程',planetStyleIndex:0,reviewStatus:'UNREVIEWED',generatedBy:{providerId:'fixture',model:'fixture',at:'2026-11-28T00:00:00Z'},
 research:{status:'grounded',intent:'合成摘录测试，沿用真实失败样本自身声称的年份，未认证历史事实',sources:[{id:'s1',title:'合成摘录',url:'https://example.org/synthetic',snippet:quote}],queries:[],searchedAt:'2026-11-28T00:00:00Z'},
 regions:[
  {id:'r1',title:'历史材料',description:'',prerequisiteIds:[],estimatedMinutes:10,lesson:quote,objectives:['检验内部顺序'],questions:[{id:'q6',kind:'ordering',prompt:'按材料中的时间先后排序',options:['统计熵','热力学熵','来华讲学','负熵'],answerIndex:0,answerIndices:[1,0,3,2],explanation:quote,sourceIds:['s1']}]},
  {id:'r2',title:'定义',description:'',prerequisiteIds:['r1'],estimatedMinutes:10,lesson:'区分定义与比喻。',objectives:['分清语境'],questions:[{id:'q7',kind:'true_false',prompt:'材料区分定义与比喻。',options:['正确','错误'],answerIndex:0,explanation:'材料说明需区分。',sourceIds:['s1']}]},
  {id:'r3',title:'边界',description:'',prerequisiteIds:['r2'],estimatedMinutes:10,lesson:'物理量和信息量各有定义，比喻没有统一数值标准。',objectives:['核对边界'],questions:[{id:'q18',kind:'ordering',prompt:'按概念严谨性从高到低排序',options:['网络比喻','热力学熵','信息熵'],answerIndex:0,answerIndices:[1,2,0],explanation:'物理量比信息量更严谨。',sourceIds:['s1']}]}
 ],knowledgeGraph:{nodes:[{id:'n1',title:'定义与边界',summary:'定义与比喻须区分。',sourceIds:['s1']}],edges:[]}
};}
const evidence=()=>[{kind:'source',id:'s1',quote}];
function review(d=draft(),scope){const regions=scope?d.regions.filter(r=>r.questions.some(q=>q.id===scope)):d.regions;const questions=regions.flatMap(r=>r.questions).filter(q=>!scope||q.id===scope);return {
 reviewedQuestionIds:questions.map(q=>q.id),reviewedRegionIds:regions.map(r=>r.id),reviewedNodeIds:scope?[]:d.knowledgeGraph.nodes.map(n=>n.id),issues:[],
 orderingChecks:questions.filter(q=>q.kind==='ordering').map(q=>q.id==='q6'?{questionId:q.id,basis:'chronology',direction:'ascending',unit:'year',items:[1877,1865,1923,1943].map((value,optionIndex)=>({optionIndex,value,evidence:evidence()}))}:{questionId:q.id,basis:'unsupported',direction:'ascending',unit:'',items:[]})
};}
afterEach(()=>registerPlanetContentReviewer(undefined));
const signal=()=>new AbortController().signal;

test('similar question citations use local research even when the global source has the same id',async()=>{
 const d=draft(),q=d.regions[1].questions[0];q.similarTo='base';q.practiceResearch={...d.research,sources:[{...d.research.sources[0],snippet:'本次相似碎片的独立资料。'}]};
 const response=review(d,q.id);response.issues=[{targetType:'question',targetId:q.id,code:'SOURCE_SUPPORT_MISSING',reason:'合成问题',evidence:[{kind:'source',id:'s1',quote:'本次相似碎片的独立资料'}]}];
 registerPlanetContentReviewer(async()=>response);assert.equal((await reviewPlanetContent(d,signal(),q.id)).issues.length,1);
 const full=review(d);full.issues=response.issues;registerPlanetContentReviewer(async()=>full);assert.ok((await reviewPlanetContent(d,signal())).issues.some(i=>i.targetId===q.id));
 response.issues[0].evidence[0].quote=quote;registerPlanetContentReviewer(async()=>response);await assert.rejects(()=>reviewPlanetContent(d,signal(),q.id),e=>e.code==='CONTENT_REVIEW_INVALID');
 full.issues=response.issues;registerPlanetContentReviewer(async()=>full);await assert.rejects(()=>reviewPlanetContent(d,signal()),e=>e.code==='CONTENT_REVIEW_INVALID');
});

test('unconfigured reviewer explicitly prevents confirming unchecked generation',async()=>{
 await assert.rejects(()=>reviewPlanetContent(draft(),signal()),e=>e.code==='NOT_CONFIGURED');
});
test('server catches the real q6-style order contradiction and a ranking without common scale',async()=>{
 registerPlanetContentReviewer(async()=>review());const result=await reviewPlanetContent(draft(),signal());
 assert.equal(result.issues.length,2);assert.equal(result.issues[0].targetId,'q6');assert.equal(result.issues[0].code,'ANSWER_EXPLANATION_CONFLICT');assert.match(result.issues[0].reason,/\[1,0,2,3\]/);
 assert.equal(result.issues[1].targetId,'q18');assert.equal(result.issues[1].code,'ORDER_BASIS_MISSING');assert.equal(JSON.parse(result.feedback).issues.length,2);
});
test('matching chronology with exact evidence passes, without asserting historical truth',async()=>{
 const d=draft();d.regions[0].questions[0].answerIndices=[1,0,2,3];registerPlanetContentReviewer(async(value,_signal,scope)=>review(value,scope));
 assert.deepEqual(await reviewPlanetContent(d,signal(),'q6'),{issues:[],feedback:''});
});
test('missing or duplicate coverage and omitted ordering proofs are rejected',async()=>{
 for(const alter of [r=>r.reviewedQuestionIds.pop(),r=>r.reviewedRegionIds.pop(),r=>r.reviewedNodeIds.pop(),r=>r.reviewedQuestionIds.push('q6'),r=>r.orderingChecks.pop()]){
  const response=review();alter(response);registerPlanetContentReviewer(async()=>response);
  await assert.rejects(()=>reviewPlanetContent(draft(),signal()),e=>e.code==='CONTENT_REVIEW_INVALID');
 }
});
test('fabricated source ids, absent quotes, and invented numeric values do not count as evidence',async()=>{
 for(const alter of [r=>{r.orderingChecks[0].items[0].evidence[0].id='invented';},r=>{r.orderingChecks[0].items[0].evidence[0].quote='原文没有这句话';},r=>{r.orderingChecks[0].items[0].value=1900;},r=>{r.orderingChecks[0].items[0].evidence[0]={kind:'question',id:'q6',quote};}]){
  const response=review();alter(response);registerPlanetContentReviewer(async()=>response);
  await assert.rejects(()=>reviewPlanetContent(draft(),signal()),e=>e.code==='CONTENT_REVIEW_INVALID');
 }
});
test('a tie is an issue, not an arbitrarily accepted total order',async()=>{
 const response=review();response.orderingChecks[0].items[2].value=1877;registerPlanetContentReviewer(async()=>response);
 const result=await reviewPlanetContent(draft(),signal());assert.ok(result.issues.some(i=>i.targetId==='q6'&&i.code==='ORDER_NOT_UNIQUE'));
});
test('a single-question scope covers only that question and its lesson, with no unrelated nodes',async()=>{
 registerPlanetContentReviewer(async(value,_signal,scope)=>{assert.equal(scope,'q7');return review(value,scope);});
 assert.deepEqual(await reviewPlanetContent(draft(),signal(),'q7'),{issues:[],feedback:''});
 const invalid=review(draft(),'q7');invalid.issues.push({targetType:'question',targetId:'q18',code:'ORDER_BASIS_MISSING',reason:'超出本次审核范围',evidence:[]});registerPlanetContentReviewer(async()=>invalid);
 await assert.rejects(()=>reviewPlanetContent(draft(),signal(),'q7'),e=>e.code==='CONTENT_REVIEW_INVALID');
 await assert.rejects(()=>reviewPlanetContent(draft(),signal(),'absent'),e=>e.code==='NOT_FOUND');
});

test('scoped callbacks receive only the target question and lesson on both review attempts without mutating the draft',async()=>{
 const d=draft(),region=d.regions[1],q=region.questions[0];
 region.questions.push({...q,id:'unrelated-sibling',prompt:'不应发送给这次审核的另一道题'});
 q.practiceResearch={...d.research,sources:[{...d.research.sources[0],snippet:'当前补题的局部摘录。'}]};
 const original=structuredClone(d),expected=review(d,q.id);let calls=0;
 const scopedReviewer=async(value,_signal,scope,repair)=>{
  calls++;assert.equal(scope,q.id);assert.equal(value.regions.length,1);assert.equal(value.regions[0].id,region.id);assert.equal(value.regions[0].lesson,region.lesson);assert.deepEqual(value.regions[0].questions,[q]);assert.equal(value.knowledgeGraph,undefined);assert.deepEqual(value.research,q.practiceResearch);
  assert.doesNotMatch(JSON.stringify(value),/unrelated-sibling|不应发送给这次审核/);
  value.regions[0].lesson='callback mutation';value.regions[0].questions[0].prompt='callback mutation';
  if(calls===1){assert.equal(repair,undefined);return {...expected,reviewedQuestionIds:[]};}
  assert.ok(repair.validationFeedback);return expected;
 };
 registerPlanetContentReviewer(scopedReviewer);
 assert.deepEqual(await reviewPlanetContent(d,signal(),q.id),{issues:[],feedback:''});assert.equal(calls,2);assert.deepEqual(d,original);
});
test('semantic issues require real targets and literal provenance when provided',async()=>{
 const response=review(draft(),'q7');response.issues.push({targetType:'lesson',targetId:'r2',code:'LESSON_SUPPORT_MISSING',reason:'合成的语义审查结果',evidence:[{kind:'lesson',id:'r2',quote:'区分定义与比喻。'}]});registerPlanetContentReviewer(async()=>response);
 assert.equal((await reviewPlanetContent(draft(),signal(),'q7')).issues[0].targetType,'lesson');
 response.issues[0].evidence[0].quote='不存在的课文';await assert.rejects(()=>reviewPlanetContent(draft(),signal(),'q7'),e=>e.code==='CONTENT_REVIEW_INVALID');
});
test('reviewer cannot mutate the source draft and unsupported malformed proofs fail closed',async()=>{
 const d=draft(),original=structuredClone(d);registerPlanetContentReviewer(async value=>{value.subject='unexpected change';return review();});await reviewPlanetContent(d,signal());assert.deepEqual(d,original);
 const response=review();response.orderingChecks[1].unit='quality';registerPlanetContentReviewer(async()=>response);await assert.rejects(()=>reviewPlanetContent(d,signal()),e=>e.code==='CONTENT_REVIEW_INVALID');
});
test('dependency failure and cancellation cannot silently pass review',async()=>{
 registerPlanetContentReviewer(async()=>{throw new Error('private provider detail');});await assert.rejects(()=>reviewPlanetContent(draft(),signal()),e=>{assert.equal(e.code,'CONTENT_REVIEW_UNAVAILABLE');assert.doesNotMatch(JSON.stringify(e),/private provider detail/);assert.deepEqual(diagnosticForJob(e),{stage:'content-review',reason:'provider_error',attempt:1,phase:'initial'});return true;});
 const controller=new AbortController();registerPlanetContentReviewer(async()=>new Promise(()=>{}));const pending=reviewPlanetContent(draft(),controller.signal);controller.abort();await assert.rejects(()=>pending,e=>e.code==='CANCELLED'&&diagnosticForJob(e).reason==='cancelled');
});

test('diagnostics expose only allowlisted validation paths and codes, never model text or extra key names',async()=>{
 const bad=review(draft(),'q7');bad['SECRET_EXTRA_KEY']='SECRET_VALUE';bad.issues=[{targetType:'question',targetId:'q7',code:'SOURCE_SUPPORT_MISSING',reason:'SECRET_REASON',evidence:[{kind:'source',id:'s1',quote:'SECRET_NONVERBATIM'}]}];let calls=0;
 registerPlanetContentReviewer(async()=>{calls++;return bad;});
 await assert.rejects(()=>reviewPlanetContent(draft(),signal(),'q7'),e=>{const diagnostic=diagnosticForJob(e);assert.equal(e.code,'CONTENT_REVIEW_INVALID');assert.equal(diagnostic.stage,'content-review');assert.equal(diagnostic.reason,'invalid_result');assert.equal(diagnostic.attempt,2);assert.equal(diagnostic.phase,'format-repair');assert.ok(diagnostic.problems.some(p=>p.code==='unrecognized_keys'));assert.ok(diagnostic.problems.some(p=>p.code==='non_verbatim_quote'&&p.path.join('.')==='issues.0.evidence.0.quote'));assert.doesNotMatch(JSON.stringify(diagnostic),/SECRET|quote.*SECRET|reason.*SECRET/);assert.ok(diagnostic.problems.every(p=>Object.keys(p).sort().join(',')==='code,path'));return true;});assert.equal(calls,2);
});

test('a format-repair adapter failure is diagnosed separately without exposing its exception',async()=>{
 let calls=0;registerPlanetContentReviewer(async()=>{calls++;if(calls===1){const bad=review(draft(),'q7');bad.reviewedQuestionIds=[];return bad;}throw new Error('SECRET_KEY provider raw response');});
 await assert.rejects(()=>reviewPlanetContent(draft(),signal(),'q7'),e=>{assert.equal(e.code,'CONTENT_REVIEW_UNAVAILABLE');assert.deepEqual(diagnosticForJob(e),{stage:'content-review',reason:'provider_error',attempt:2,phase:'format-repair'});assert.doesNotMatch(JSON.stringify(e),/SECRET_KEY|provider raw response/);return true;});assert.equal(calls,2);
});
test('explicit provider reviewer overrides the global registration without changing it',async()=>{
 let globalCalls=0,overrideCalls=0;registerPlanetContentReviewer(async()=>{globalCalls++;return review(draft(),'q7');});
 const override=async(value,_signal,scope)=>{overrideCalls++;assert.equal(scope,'q7');return review(value,scope);};
 assert.deepEqual(await reviewPlanetContent(draft(),signal(),'q7',override),{issues:[],feedback:''});assert.equal(globalCalls,0);assert.equal(overrideCalls,1);
 await reviewPlanetContent(draft(),signal(),'q7');assert.equal(globalCalls,1);
 registerPlanetContentReviewer(undefined);await reviewPlanetContent(draft(),signal(),'q7',override);assert.equal(overrideCalls,2);
});
test('explicit sequence requires position units and still checks the complete order',async()=>{
 const d=draft();d.regions[2].lesson='先识别语境，再核对定义，最后检查适用条件。';d.regions[2].questions[0].options=['检查适用条件','识别语境','核对定义'];
 const response=review(d,'q18');response.orderingChecks[0]={questionId:'q18',basis:'explicit_sequence',direction:'ascending',unit:'position',items:[3,1,2].map((value,optionIndex)=>({optionIndex,value,evidence:[{kind:'lesson',id:'r3',quote:d.regions[2].lesson}]}))};registerPlanetContentReviewer(async()=>response);
 assert.deepEqual(await reviewPlanetContent(d,signal(),'q18'),{issues:[],feedback:''});response.orderingChecks[0].unit='rigor';await assert.rejects(()=>reviewPlanetContent(d,signal(),'q18'),e=>e.code==='CONTENT_REVIEW_INVALID');
});
test('one format retry receives safe field paths for both schema and non-verbatim quote failures',async()=>{
 const bad=review();bad.issues.push({targetType:'question',targetId:'q7',code:'LESSON_SUPPORT_MISSING',reason:'合成实质问题必须保留',evidence:[{kind:'lesson',id:'r2',prompt:'private-invalid-prompt-marker'}]});bad.orderingChecks[0].items[0].evidence[0].quote='private-non-verbatim-marker';
 const fixed=review();fixed.issues.push({...bad.issues[0],evidence:[{kind:'lesson',id:'r2',quote:'区分定义与比喻。'}]});let calls=0;const signals=[];
 registerPlanetContentReviewer(async(_draft,active,_scope,repair)=>{calls++;signals.push(active);if(calls===1){assert.equal(repair,undefined);return bad;}assert.deepEqual(repair.previousOutput,bad);assert.ok(!repair.validationFeedback.includes('private-'));const feedback=JSON.parse(repair.validationFeedback);assert.ok(feedback.problems.some(p=>p.path.join('.')==='issues.0.evidence.0.quote'));assert.ok(feedback.problems.some(p=>p.path.join('.')==='orderingChecks.0.items.0.evidence.0.quote'&&p.code==='non_verbatim_quote'));return fixed;});
 const result=await reviewPlanetContent(draft(),signal());assert.equal(calls,2);assert.equal(signals[0],signals[1]);assert.ok(result.issues.some(i=>i.targetId==='q7'&&i.code==='LESSON_SUPPORT_MISSING'));assert.ok(result.issues.some(i=>i.targetId==='q6'&&i.code==='ANSWER_EXPLANATION_CONFLICT'));
});
test('a second invalid review fails without a third model attempt',async()=>{
 let calls=0;registerPlanetContentReviewer(async()=>{calls++;const bad=review(draft(),'q7');bad.reviewedRegionIds=[];return bad;});
 await assert.rejects(()=>reviewPlanetContent(draft(),signal(),'q7'),e=>e.code==='CONTENT_REVIEW_INVALID'&&JSON.parse(e.validationFeedback).problems[0].path[0]==='reviewedRegionIds');assert.equal(calls,2);
});
test('format correction cannot remove an already identified substantive issue',async()=>{
 let calls=0;registerPlanetContentReviewer(async()=>{calls++;const result=review(draft(),'q7');if(calls===1)result.issues.push({targetType:'question',targetId:'q7',code:'SOURCE_SUPPORT_MISSING',reason:'合成的依据缺口',evidence:[{kind:'lesson',id:'r2',prompt:'区分定义与比喻。'}]});return result;});
 await assert.rejects(()=>reviewPlanetContent(draft(),signal(),'q7'),e=>e.code==='CONTENT_REVIEW_INVALID'&&e.validationFeedback.includes('substantive_issue_removed'));assert.equal(calls,2);
});
test('an unverifiable sorting proof may downgrade to unsupported but cannot become a pass',async()=>{
 let calls=0;registerPlanetContentReviewer(async()=>{calls++;const result=review(draft(),'q6');if(calls===1)result.orderingChecks[0].items[0].evidence[0].quote='材料没有的引用';else result.orderingChecks[0]={questionId:'q6',basis:'unsupported',direction:'ascending',unit:'',items:[]};return result;});
 const result=await reviewPlanetContent(draft(),signal(),'q6');assert.equal(calls,2);assert.equal(result.issues[0].code,'ORDER_BASIS_MISSING');
});
test('a mistaken comparison value may be corrected only against literal source evidence',async()=>{
 const d=draft();d.regions[0].questions[0].answerIndices=[1,0,2,3];let calls=0;registerPlanetContentReviewer(async()=>{calls++;const result=review(d,'q6');if(calls===1)result.orderingChecks[0].items[0].value=1900;return result;});
 assert.deepEqual(await reviewPlanetContent(d,signal(),'q6'),{issues:[],feedback:''});assert.equal(calls,2);
});
test('format retry shares one 120-second deadline even when the second callback never settles',async t=>{
 const deadline=new AbortController();let deadlines=0,calls=0,firstSignal;
 t.mock.method(AbortSignal,'timeout',ms=>{assert.equal(ms,120000);deadlines++;return deadline.signal;});
 registerPlanetContentReviewer(async(_draft,active)=>{calls++;if(calls===1){firstSignal=active;const bad=review(draft(),'q7');bad.reviewedQuestionIds=[];return bad;}assert.equal(active,firstSignal);deadline.abort();return new Promise(()=>{});});
 await assert.rejects(()=>reviewPlanetContent(draft(),signal(),'q7'),e=>{assert.equal(e.code,'CONTENT_REVIEW_UNAVAILABLE');assert.deepEqual(diagnosticForJob(e),{stage:'content-review',reason:'timeout',attempt:2,phase:'format-repair'});return true;});assert.equal(calls,2);assert.equal(deadlines,1);assert.equal(firstSignal.aborted,true);
});
