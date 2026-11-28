/** Generated practice is deliberately separate from audited expedition/mastery evidence. */
export type PlanetQuestionKind = 'single_choice'|'multiple_choice'|'true_false'|'fill_blank'|'ordering'|'short_answer';
export type PlanetSource = {id:string;title:string;url:string;snippet:string;publishedAt?:string};
export type PlanetResearch = {status:'grounded'|'insufficient'|'unavailable';intent:string;sources:PlanetSource[];searchedAt:string;queries:string[];summary?:string};
export type PlanetMeaningAnalysis = {overview:string;interpretations:{label:string;description:string;context:string}[];contrasts:string[];caveats:string[]};
export type PlanetArtwork = {status:'generated'|'fallback';url?:string;prompt:string;provider?:string;generatedAt?:string};
export type PlanetKnowledgeGraph = {nodes:{id:string;title:string;summary:string;sourceIds:string[]}[];edges:{source:string;target:string;label:string;kind:'hierarchy'|'related'}[]};
export type PlanetQuestion = {id:string;prompt:string;options:string[];answerIndex:number;explanation:string;kind?:PlanetQuestionKind;answerIndices?:number[];acceptedAnswers?:string[];referenceAnswer?:string;rubric?:string[];sourceIds?:string[]};
export type PlanetRegion = {id:string;title:string;description:string;prerequisiteIds:string[];estimatedMinutes:number;lesson:string;objectives:string[];questions:PlanetQuestion[];sourceIds?:string[]};
export type PlanetDraft = {id:string;subject:string;level:string;goal:string;title:string;story:string;planetStyleIndex:number;regions:PlanetRegion[];reviewStatus:'UNREVIEWED';generatedBy:{providerId:string;model:string;at:string};research?:PlanetResearch;meaningAnalysis?:PlanetMeaningAnalysis;artwork?:PlanetArtwork;knowledgeGraph?:PlanetKnowledgeGraph};
export type PlanetResponse = {selectedIndex?:number;selectedIndices?:number[];text?:string;orderedIndices?:number[];selfReview?:boolean};
export type PlanetAnswer = PlanetResponse & {correct:boolean;attempts:number;updatedAt:string;evaluation?:'objective'|'self_review';reviewed?:boolean};
export type PlanetProgress = {answers:Record<string,PlanetAnswer>;completedRegionIds:string[]};
export type PlanetRecord = {id:string;courseId:string;draft:PlanetDraft;progress:PlanetProgress;createdAt:string;updatedAt:string};
export type PlanetFeedback = {correct:boolean;expectedIndex?:number;explanation:string;expectedIndices?:number[];acceptedAnswers?:string[];referenceAnswer?:string;rubric?:string[];requiresSelfReview?:boolean};
export const PLANET_NOTE_TYPE='LEARNING_PLANET_INTERNAL';
function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('星球对象格式无效');return v as Record<string,unknown>;}
function string(v:unknown,max:number,empty=false):string{if(typeof v!=='string'||(!empty&&!v.trim())||v.trim().length>max)throw new Error('星球文字长度无效');return v.trim();}
function identifier(v:unknown){const s=string(v,100);if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(s)||['constructor','prototype','__proto__'].includes(s))throw new Error('星球标识无效');return s;}
function array(v:unknown,min:number,max:number):unknown[]{if(!Array.isArray(v)||v.length<min||v.length>max)throw new Error('星球内容数量无效');return v;}
function integer(v:unknown,min:number,max:number){if(typeof v!=='number'||!Number.isInteger(v)||v<min||v>max)throw new Error('星球数值无效');return v;}
function indices(v:unknown,size:number,min=1,max=size){const a=array(v,min,max).map(i=>integer(i,0,size-1));if(new Set(a).size!==a.length)throw new Error('选项序号不能重复');return a;}
function sourceIds(v:unknown,known:Set<string>){const ids=array(v,0,10).map(identifier);if(new Set(ids).size!==ids.length||ids.some(id=>!known.has(id)))throw new Error('引用必须指向本次检索资料');return ids;}
function date(v:unknown){const text=string(v,80);if(!Number.isFinite(Date.parse(text)))throw new Error('生成时间无效');return text;}
function publicUrl(v:unknown){const text=string(v,2000);try{const u=new URL(text);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw new Error();return text;}catch{throw new Error('参考网址无效');}}
export function planetArtworkUrl(value:unknown){const text=publicUrl(value),u=new URL(text),host=u.hostname.toLowerCase();if(u.protocol!=='https:'||!host.includes('.')||host.startsWith('[')||/^[0-9.]+$/.test(host)||/(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host))throw new Error('星球图像网址必须是公网 HTTPS 地址');return text;}
export function normalizePlanetText(value:string){return value.normalize('NFKC').trim().replace(/\s+/gu,' ').toLocaleLowerCase('en-US');}
function research(raw:unknown):PlanetResearch{
 const r=object(raw);if(!['grounded','insufficient','unavailable'].includes(r.status as string))throw new Error('检索状态无效');
 const seen=new Set<string>(),urls=new Set<string>();
 const sources=array(r.sources,r.status==='grounded'?1:0,10).map(v=>{const s=object(v),id=identifier(s.id),url=publicUrl(s.url);if(seen.has(id)||urls.has(url))throw new Error('检索资料重复');seen.add(id);urls.add(url);const result:PlanetSource={id,title:string(s.title,300),url,snippet:string(s.snippet,3000,true)};if(s.publishedAt!==undefined)result.publishedAt=string(s.publishedAt,80);return result;});
 const result:PlanetResearch={status:r.status as PlanetResearch['status'],intent:string(r.intent,1600),sources,searchedAt:date(r.searchedAt),queries:array(r.queries,0,8).map(v=>string(v,300))};
 if(r.summary!==undefined)result.summary=string(r.summary,6000,true);return result;
}
export function validatePlanetDraft(raw:unknown):PlanetDraft{
 const p=object(raw),meta=object(p.generatedBy),allQuestions=new Set<string>(),evidence=p.research===undefined?undefined:research(p.research),knownSources=new Set(evidence?.sources.map(s=>s.id)||[]);
 const regions=array(p.regions,3,6).map(v=>{
  const r=object(v);const result:PlanetRegion={id:identifier(r.id),title:string(r.title,70),description:string(r.description,240),prerequisiteIds:array(r.prerequisiteIds,0,5).map(identifier),estimatedMinutes:integer(r.estimatedMinutes,5,60),lesson:string(r.lesson,5000),objectives:array(r.objectives,1,4).map(v=>string(v,150)),questions:array(r.questions,1,6).map(v=>{
   const q=object(v),id=identifier(q.id),kind=q.kind===undefined?'single_choice':q.kind;
   if(!['single_choice','multiple_choice','true_false','fill_blank','ordering','short_answer'].includes(kind as string))throw new Error('题型无效');
   const free=kind==='fill_blank'||kind==='short_answer',options=array(q.options??(free?[]:undefined),free?0:2,free?0:kind==='true_false'?2:8).map(v=>string(v,500));
   if(allQuestions.has(id)||new Set(options).size!==options.length)throw new Error('题目标识或选项重复');allQuestions.add(id);
   const answerIndex=free?integer(q.answerIndex??0,0,0):integer(q.answerIndex??(kind==='ordering'||kind==='multiple_choice'?0:undefined),0,options.length-1);
   // Preserve legacy field order and omit new defaults: draft signatures use canonical JSON.
   const result:PlanetQuestion={id,prompt:string(q.prompt,1000),options,answerIndex,explanation:string(q.explanation,2000)};
   if(q.kind!==undefined)result.kind=kind as PlanetQuestionKind;
   if(kind==='multiple_choice')result.answerIndices=indices(q.answerIndices,options.length);
   if(kind==='ordering')result.answerIndices=indices(q.answerIndices,options.length,options.length,options.length);
   if(kind==='fill_blank'){result.acceptedAnswers=array(q.acceptedAnswers,1,12).map(v=>string(v,500));if(new Set(result.acceptedAnswers.map(normalizePlanetText)).size!==result.acceptedAnswers.length)throw new Error('填空参考答案重复');}
   if(kind==='short_answer'){result.referenceAnswer=string(q.referenceAnswer,3000);result.rubric=array(q.rubric,1,6).map(v=>string(v,500));}
   if(q.sourceIds!==undefined)result.sourceIds=sourceIds(q.sourceIds,knownSources);
   return result;
  })};if(r.sourceIds!==undefined)result.sourceIds=sourceIds(r.sourceIds,knownSources);return result;
 });
 const ids=new Set<string>();for(const r of regions){if(ids.has(r.id)||new Set(r.prerequisiteIds).size!==r.prerequisiteIds.length||r.prerequisiteIds.some(id=>!ids.has(id)))throw new Error('区域先修关系必须指向前面的有效区域');ids.add(r.id);}
 if(p.reviewStatus!=='UNREVIEWED')throw new Error('生成内容只能是待核验练习');
 const at=string(meta.at,40);if(!Number.isFinite(Date.parse(at)))throw new Error('生成时间无效');
 const result:PlanetDraft={id:identifier(p.id),subject:string(p.subject,80),level:string(p.level,80),goal:string(p.goal,300,true),title:string(p.title,100),story:string(p.story,1200),planetStyleIndex:integer(p.planetStyleIndex,0,9),regions,reviewStatus:'UNREVIEWED',generatedBy:{providerId:string(meta.providerId,32),model:string(meta.model,160),at}};
 if(evidence)result.research=evidence;
 if(p.meaningAnalysis!==undefined){const m=object(p.meaningAnalysis);result.meaningAnalysis={overview:string(m.overview,3000),interpretations:array(m.interpretations,1,8).map(v=>{const i=object(v);return {label:string(i.label,100),description:string(i.description,2000),context:string(i.context,1000)};}),contrasts:array(m.contrasts,0,8).map(v=>string(v,1000)),caveats:array(m.caveats,0,8).map(v=>string(v,1000))};}
 if(p.artwork!==undefined){const a=object(p.artwork);if(a.status!=='generated'&&a.status!=='fallback')throw new Error('星球图像状态无效');const artwork:PlanetArtwork={status:a.status,prompt:string(a.prompt,3000,true)};if(a.status==='generated')artwork.url=planetArtworkUrl(a.url);else if(a.url!==undefined)throw new Error('默认图像不能附带生成网址');if(a.provider!==undefined)artwork.provider=string(a.provider,100);if(a.generatedAt!==undefined)artwork.generatedAt=date(a.generatedAt);result.artwork=artwork;}
 if(p.knowledgeGraph!==undefined){
  const g=object(p.knowledgeGraph),ids=new Set<string>(),pairs=new Set<string>();
  const nodes=array(g.nodes,4,48).map(v=>{const n=object(v),id=identifier(n.id);if(ids.has(id))throw new Error('图谱节点标识重复');ids.add(id);return {id,title:string(n.title,100),summary:string(n.summary,2000),sourceIds:sourceIds(n.sourceIds,knownSources)};});
  const edges:PlanetKnowledgeGraph['edges']=array(g.edges,0,96).map(v=>{const e=object(v),source=identifier(e.source),target=identifier(e.target);if(!ids.has(source)||!ids.has(target)||source===target)throw new Error('图谱关系节点无效');if(e.kind!=='hierarchy'&&e.kind!=='related')throw new Error('图谱关系类型无效');const key=source+'|'+target+'|'+e.kind;if(pairs.has(key))throw new Error('图谱关系重复');pairs.add(key);return {source,target,label:string(e.label,100),kind:e.kind};});
  const incoming=new Map(nodes.map(n=>[n.id,0])),children=new Map(nodes.map(n=>[n.id,[] as string[]]));for(const e of edges.filter(e=>e.kind==='hierarchy')){incoming.set(e.target,incoming.get(e.target)!+1);children.get(e.source)!.push(e.target);}const ready=nodes.filter(n=>incoming.get(n.id)===0).map(n=>n.id);let visited=0;for(let i=0;i<ready.length;i++){visited++;for(const child of children.get(ready[i])!){incoming.set(child,incoming.get(child)!-1);if(incoming.get(child)===0)ready.push(child);}}if(visited!==nodes.length)throw new Error('图谱层级关系不能循环');
  result.knowledgeGraph={nodes,edges};
 }
 if(JSON.stringify(result).length>180000)throw new Error('星球内容过大');return result;
}
export function emptyPlanetProgress():PlanetProgress{return {answers:{},completedRegionIds:[]};}
export function planetQuestionComplete(question:PlanetQuestion,answer:PlanetAnswer|undefined){return question.kind==='short_answer'?answer?.evaluation==='self_review'&&answer.reviewed===true:answer?.correct===true;}
export function completedPlanetRegionIds(draft:PlanetDraft,answers:PlanetProgress['answers']){const done=new Set<string>();for(const region of draft.regions)if(region.prerequisiteIds.every(id=>done.has(id))&&region.questions.every(q=>planetQuestionComplete(q,answers[q.id])))done.add(region.id);return [...done];}
/** Objective comparisons use generated references. Short answers record explicit self-review only. */
export function answerPlanetQuestion(draft:PlanetDraft,progress:PlanetProgress,questionId:string,value:number|PlanetResponse,at=new Date().toISOString()):{progress:PlanetProgress;feedback:PlanetFeedback}{
 const region=draft.regions.find(r=>r.questions.some(q=>q.id===questionId)),q=region?.questions.find(q=>q.id===questionId);
 if(!q||!region)throw new Error('题目不存在');
 const response=typeof value==='number'?{selectedIndex:value}:object(value) as PlanetResponse;
 const kind=q.kind||'single_choice',completed=new Set(completedPlanetRegionIds(draft,progress.answers));
 if(region.prerequisiteIds.some(id=>!completed.has(id)))throw new Error('请先完成前面的探索区域');
 const previous=progress.answers[questionId],attempts=(previous?.attempts||0)+1;let answer:PlanetAnswer,feedback:PlanetFeedback;
 const allowed=kind==='multiple_choice'?['selectedIndices']:kind==='ordering'?['orderedIndices']:kind==='fill_blank'?['text']:kind==='short_answer'?['text','selfReview']:['selectedIndex'];
 if(Object.keys(response).some(k=>!allowed.includes(k)))throw new Error('作答内容与题型不符');
 if(kind==='single_choice'||kind==='true_false'){
  const selectedIndex=integer(response.selectedIndex,0,q.options.length-1),correct=selectedIndex===q.answerIndex;
  answer={selectedIndex,correct,attempts,updatedAt:at};feedback={correct,expectedIndex:q.answerIndex,explanation:q.explanation};
 }else if(kind==='multiple_choice'||kind==='ordering'){
  const ordered=kind==='ordering',chosen=indices(ordered?response.orderedIndices:response.selectedIndices,q.options.length,ordered?q.options.length:1,q.options.length),expected=q.answerIndices||[];
  const correct=ordered?chosen.every((v,i)=>v===expected[i]):chosen.length===expected.length&&chosen.every(v=>expected.includes(v));
  answer={...(ordered?{orderedIndices:chosen}:{selectedIndices:chosen}),correct,attempts,updatedAt:at,evaluation:'objective'};feedback={correct,expectedIndices:[...expected],explanation:q.explanation};
 }else{
  const text=string(response.text,kind==='short_answer'?2000:500);
  if(kind==='fill_blank'){
   const correct=(q.acceptedAnswers||[]).some(expected=>normalizePlanetText(expected)===normalizePlanetText(text));
   answer={text,correct,attempts,updatedAt:at,evaluation:'objective'};feedback={correct,acceptedAnswers:q.acceptedAnswers?[...q.acceptedAnswers]:[],explanation:q.explanation};
  }else{
   if(response.selfReview!==undefined&&typeof response.selfReview!=='boolean')throw new Error('自核确认无效');
   const reviewed=response.selfReview===true;
   if(reviewed&&(!previous||previous.evaluation!=='self_review'||previous.text!==text))throw new Error('请先提交这份回答并阅读参考答案，再完成自核');
   answer={text,correct:false,attempts,updatedAt:at,evaluation:'self_review',reviewed};feedback={correct:false,explanation:q.explanation,referenceAnswer:q.referenceAnswer,rubric:q.rubric?[...q.rubric]:[],requiresSelfReview:!reviewed};
  }
 }
 const answers={...progress.answers,[questionId]:answer};
 return {progress:{answers,completedRegionIds:completedPlanetRegionIds(draft,answers)},feedback};
}
