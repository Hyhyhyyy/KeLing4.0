/** Generated practice is deliberately separate from audited expedition/mastery evidence. */
export type PlanetQuestion = { id:string; prompt:string; options:string[]; answerIndex:number; explanation:string };
export type PlanetRegion = { id:string; title:string; description:string; prerequisiteIds:string[]; estimatedMinutes:number; lesson:string; objectives:string[]; questions:PlanetQuestion[] };
export type PlanetDraft = { id:string; subject:string; level:string; goal:string; title:string; story:string; planetStyleIndex:number; regions:PlanetRegion[]; reviewStatus:'UNREVIEWED'; generatedBy:{providerId:string;model:string;at:string} };
export type PlanetAnswer = { selectedIndex:number; correct:boolean; attempts:number; updatedAt:string };
export type PlanetProgress = { answers:Record<string,PlanetAnswer>; completedRegionIds:string[] };
export type PlanetRecord = { id:string; courseId:string; draft:PlanetDraft; progress:PlanetProgress; createdAt:string; updatedAt:string };
export type PlanetFeedback = { correct:boolean; expectedIndex:number; explanation:string };
export const PLANET_NOTE_TYPE = 'LEARNING_PLANET_INTERNAL';
function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('星球对象格式无效');return v as Record<string,unknown>;}
function string(v:unknown,max:number,empty=false):string{if(typeof v!=='string'||(!empty&&!v.trim())||v.trim().length>max)throw new Error('星球文字长度无效');return v.trim();}
function identifier(v:unknown){const s=string(v,100);if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(s)||['constructor','prototype','__proto__'].includes(s))throw new Error('星球标识无效');return s;}
function array(v:unknown,min:number,max:number):unknown[]{if(!Array.isArray(v)||v.length<min||v.length>max)throw new Error('星球内容数量无效');return v;}
function integer(v:unknown,min:number,max:number){if(typeof v!=='number'||!Number.isInteger(v)||v<min||v>max)throw new Error('星球数值无效');return v;}
export function validatePlanetDraft(raw:unknown):PlanetDraft{
 const p=object(raw),meta=object(p.generatedBy),allQuestions=new Set<string>();
 const regions=array(p.regions,3,6).map(v=>{const r=object(v);return {id:identifier(r.id),title:string(r.title,70),description:string(r.description,240),prerequisiteIds:array(r.prerequisiteIds,0,5).map(identifier),estimatedMinutes:integer(r.estimatedMinutes,5,60),lesson:string(r.lesson,3000),objectives:array(r.objectives,1,4).map(v=>string(v,150)),questions:array(r.questions,1,3).map(v=>{const q=object(v),id=identifier(q.id),options=array(q.options,2,5).map(v=>string(v,300));if(allQuestions.has(id)||new Set(options).size!==options.length)throw new Error('题目标识或选项重复');allQuestions.add(id);return {id,prompt:string(q.prompt,500),options,answerIndex:integer(q.answerIndex,0,options.length-1),explanation:string(q.explanation,1200)};})};});
 const ids=new Set<string>();for(const r of regions){if(ids.has(r.id)||new Set(r.prerequisiteIds).size!==r.prerequisiteIds.length||r.prerequisiteIds.some(id=>!ids.has(id)))throw new Error('区域先修关系必须指向前面的有效区域');ids.add(r.id);}
 if(p.reviewStatus!=='UNREVIEWED')throw new Error('生成内容只能是待核验练习');
 const at=string(meta.at,40);if(!Number.isFinite(Date.parse(at)))throw new Error('生成时间无效');
 const result:PlanetDraft={id:identifier(p.id),subject:string(p.subject,80),level:string(p.level,80),goal:string(p.goal,300,true),title:string(p.title,100),story:string(p.story,1200),planetStyleIndex:integer(p.planetStyleIndex,0,9),regions,reviewStatus:'UNREVIEWED',generatedBy:{providerId:string(meta.providerId,32),model:string(meta.model,160),at}};
 if(JSON.stringify(result).length>80000)throw new Error('星球内容过大');return result;
}
export function emptyPlanetProgress():PlanetProgress{return {answers:{},completedRegionIds:[]};}
/** Comparison is only against the model's generated answer, never mastery certification. */
export function answerPlanetQuestion(draft:PlanetDraft,progress:PlanetProgress,questionId:string,selectedIndex:number,at=new Date().toISOString()):{progress:PlanetProgress;feedback:PlanetFeedback}{
 const region=draft.regions.find(r=>r.questions.some(q=>q.id===questionId)),q=region?.questions.find(q=>q.id===questionId);
 if(!q||!region)throw new Error('题目不存在');integer(selectedIndex,0,q.options.length-1);
 const completed=new Set(draft.regions.filter(r=>r.questions.every(q=>progress.answers[q.id]?.correct===true)).map(r=>r.id));
 if(region.prerequisiteIds.some(id=>!completed.has(id)))throw new Error('请先完成前面的探索区域');
 const correct=selectedIndex===q.answerIndex,answers={...progress.answers,[questionId]:{selectedIndex,correct,attempts:(progress.answers[questionId]?.attempts||0)+1,updatedAt:at}};
 return {progress:{answers,completedRegionIds:draft.regions.filter(r=>r.questions.every(q=>answers[q.id]?.correct)).map(r=>r.id)},feedback:{correct,expectedIndex:q.answerIndex,explanation:q.explanation}};
}
