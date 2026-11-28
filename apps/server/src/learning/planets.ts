import { randomUUID, createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { PrismaClient, Prisma } from '@prisma/client';
import { PlanetDraft, PlanetRecord, PlanetFeedback, PlanetResponse, PLANET_NOTE_TYPE, validatePlanetDraft, emptyPlanetProgress, answerPlanetQuestion, planetQuestionComplete } from '@keling/shared';
import { EnhancedPlanetInput, groundedInput, planetDesignInstructions, assertPlanetQuality, generatePlanetArtwork, generateOneQuestion } from './planetEnhancement';
import { AIError, Provider, providers } from '../ai/catalog';
import { accessCredentials, credentialProvider } from '../ai/modelAccess';
import { complete } from '../ai/transport';
import { requireJwtSecret } from '../config/security';
import { mutateOwnedTask } from '../services/taskMutations';

export const planetGenerationInput=z.object({subject:z.string().trim().min(1).max(80),level:z.string().trim().min(1).max(80).default('入门'),goal:z.string().trim().max(300).default(''),contextMode:z.enum(['auto','general','internet_culture']).default('auto'),questionCount:z.union([z.literal(6),z.literal(12),z.literal(18)]).default(12),generateArtwork:z.boolean().default(true),model:z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9_.:/@-]*$/).optional(),providerId:z.string().max(32).optional(),credentials:accessCredentials.optional()}).strict();
const requestId=z.string().min(8).max(100).regex(/^[A-Za-z0-9][A-Za-z0-9_-]+$/).refine(v=>!['constructor','prototype','__proto__'].includes(v));
export const planetConfirmationInput=z.object({draft:z.unknown(),draftToken:z.string().min(1).max(3000),clientRequestId:requestId}).strict();
export const planetAnswerInput=z.object({questionId:z.string().min(1).max(100),selectedIndex:z.number().int().min(0).max(7).optional(),selectedIndices:z.array(z.number().int().min(0).max(7)).min(1).max(8).optional(),orderedIndices:z.array(z.number().int().min(0).max(7)).min(2).max(8).optional(),text:z.string().trim().min(1).max(4000).optional(),selfReview:z.boolean().optional(),clientRequestId:requestId}).strict();
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const audience='keling-planet-draft';
// Only fixed validator messages and numeric shapes enter logs; never raw prompts, sources, answers or tokens.
const validationReasons=new Set(['星球对象格式无效','星球文字长度无效','星球标识无效','星球内容数量无效','星球数值无效','选项序号不能重复','引用必须指向本次检索资料','生成时间无效','参考网址无效','检索状态无效','检索资料重复','题型无效','题目标识或选项重复','填空参考答案重复','区域先修关系必须指向前面的有效区域','生成内容只能是待核验练习','星球图像状态无效','星球图像网址必须是公网 HTTPS 地址','默认图像不能附带生成网址','图谱节点标识重复','图谱关系节点无效','图谱关系类型无效','图谱关系重复','图谱层级关系不能循环','星球内容过大']);
function reportRejectedPlanet(raw:unknown,error:unknown){
 const value=raw&&typeof raw==='object'?raw as Record<string,unknown>:{},graph=value.knowledgeGraph&&typeof value.knowledgeGraph==='object'?value.knowledgeGraph as Record<string,unknown>:{};
 const count=(v:unknown)=>Array.isArray(v)?v.length:null;
 console.warn('PLANET_STRUCTURE_REJECTED',{reason:error instanceof Error&&validationReasons.has(error.message)?error.message:'unknown',regions:count(value.regions),questions:Array.isArray(value.regions)?value.regions.slice(0,6).map(r=>r&&typeof r==='object'?count(r.questions):null):[],graphNodes:count(graph.nodes),graphEdges:count(graph.edges)});
}
type GenerationInput=z.infer<typeof planetGenerationInput>;
export type NativePlanetInput=EnhancedPlanetInput;
export type NativePlanetGenerator=(input:NativePlanetInput,signal:AbortSignal)=>Promise<unknown>;
let nativeGenerator:NativePlanetGenerator|undefined;
/** Trusted deployment adapter only; never registered from an HTTP request. */
export function registerLearningPlanetGenerator(generator:NativePlanetGenerator|undefined){nativeGenerator=generator;}
export function usesNativePlanetGenerator(raw:unknown){const input=planetGenerationInput.parse(raw);return !!nativeGenerator&&!input.credentials&&(!input.providerId||input.providerId==='miaoda');}
export async function generateNativePlanet(raw:unknown,userId:string|undefined,signal:AbortSignal){const input=planetGenerationInput.parse(raw);if(!nativeGenerator)throw new AIError('NOT_CONFIGURED','公共模型未连接',503);if(input.model&&input.model!=='miaoda-learning')throw new AIError('MODEL_NOT_ALLOWED','所选公共模型不可用',400);const enriched=await groundedInput(input,signal),result=await nativeGenerator(enriched,signal);if(signal.aborted)throw new AIError('TIMEOUT','星球生成超时，请重试',504);return finishGeneration(result,input,enriched,userId,'miaoda','miaoda-learning',signal);}
async function finishGeneration(raw:unknown,input:GenerationInput,enriched:EnhancedPlanetInput,userId:string|undefined,providerId:string,model:string,signal=new AbortController().signal){
 if(raw&&typeof raw==='object'&&'topicSupported' in raw&&raw.topicSupported===false)throw new AIError('RESEARCH_INSUFFICIENT','检索资料尚不能支持这个主题的可靠解释，请补充具体用法、别称或背景；未创建星球',422);
 const sealed=sealPlanet({...raw as object,artwork:undefined,research:enriched.research},input,userId,providerId,model);assertPlanetQuality(sealed.draft,input.questionCount);
 if(input.generateArtwork)sealed.draft.artwork=await generatePlanetArtwork(sealed.draft,signal);
 return sealPlanet(sealed.draft,input,userId,providerId,model);
}
function sealPlanet(raw:unknown,input:GenerationInput,userId:string|undefined,providerId:string,model:string){
 let draft:PlanetDraft;try{if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error();draft=validatePlanetDraft({...raw,id:randomUUID(),subject:input.subject,level:input.level,goal:input.goal,reviewStatus:'UNREVIEWED',generatedBy:{providerId,model,at:new Date().toISOString()}});}catch(error){reportRejectedPlanet(raw,error);throw new AIError('INVALID_PLANET','模型生成的区域、题目或先修关系未通过校验，未创建星球。请重试或缩小学科范围',422);}
 const draftToken=jwt.sign({hash:digest(draft),owner:userId||null},requireJwtSecret(),{algorithm:'HS256',audience,issuer:'keling-server',expiresIn:'2h'});return {draft,draftToken};
}
function publicProvider(env:NodeJS.ProcessEnv){return providers(env).find(p=>p.id===env.TRIAL_AI_PROVIDER&&p.configured&&p.chatModels.includes(env.TRIAL_AI_MODEL||'')&&env.TRIAL_AI_ENABLED==='true');}
export function planetCatalog(userId?:string,env:NodeJS.ProcessEnv=process.env){
 const list: {id:string;name:string;configured:boolean;chatModels:string[]}[]=userId?providers(env).filter(p=>p.protocol!=='native'&&p.configured&&p.chatModels.length).map(p=>({id:p.id,name:p.name,configured:true,chatModels:p.chatModels})):[];
 const p=publicProvider(env);if(p)list.unshift({id:'public',name:`公共模型 · ${p.name}`,configured:true,chatModels:[env.TRIAL_AI_MODEL!]});if(nativeGenerator)list.unshift({id:'miaoda',name:'课灵公共模型',configured:true,chatModels:['miaoda-learning']});return {providers:list};
}
function select(input:GenerationInput,userId:string|undefined,env:NodeJS.ProcessEnv):{provider:Provider;model:string}{
 if(input.credentials){if(!input.model)throw new AIError('VALIDATION','请先选择聊天模型',400);return {provider:credentialProvider(input.credentials,env),model:input.model};}
 if(userId&&input.providerId&&input.providerId!=='public'){
  const p=providers(env).find(p=>p.id===input.providerId&&p.configured),model=input.model||p?.chatModels[0];
  if(!p||!model)throw new AIError('NOT_CONFIGURED','该模型尚未启用，请配置模型连接',503);
  if(!p.chatModels.includes(model))throw new AIError('MODEL_NOT_ALLOWED','所选聊天模型尚未启用',400);return {provider:p,model};
 }
 const p=publicProvider(env);if(!p)throw new AIError('NOT_CONFIGURED','星球生成需要连接大模型，请配置自己的 API Key，或由管理员启用公共模型',503);
 if(input.model&&input.model!==env.TRIAL_AI_MODEL)throw new AIError('MODEL_NOT_ALLOWED','公共入口只使用管理员指定的聊天模型',400);
 return {provider:p,model:env.TRIAL_AI_MODEL!};
}
export async function generatePlanet(raw:unknown,userId?:string,signal?:AbortSignal,generate:typeof complete=complete,env:NodeJS.ProcessEnv=process.env){
 const input=planetGenerationInput.parse(raw),{provider,model}=select(input,userId,env);
 const enriched=await groundedInput(input,signal);
 const result=await generate(provider,model,[{role:'system',content:planetDesignInstructions},{role:'user',content:JSON.stringify(enriched)}],signal,undefined,8192);
 if(signal?.aborted)throw new AIError('CANCELLED','已停止生成',409);
 let rawContent:unknown;
 try{
  const clean=provider.key?result.content.split(provider.key).join('[密钥已隐藏]'):result.content;
  rawContent=JSON.parse(clean.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
 }catch{throw new AIError('INVALID_PLANET','模型生成的区域、题目或先修关系未通过校验，未创建星球。请重试或缩小学科范围',422);}
 return finishGeneration(rawContent,input,enriched,userId,provider.id,model,signal);
}
type StoredPlanet={version:1;record:PlanetRecord;confirmRequestId:string;answerRequests:Record<string,{questionId:string;selectedIndex?:number;response?:PlanetResponse;feedback:PlanetFeedback}>;regenerationRequests?:Record<string,string>};
function parseRecord(content:string):StoredPlanet{try{const x=JSON.parse(content) as StoredPlanet;if(x.version!==1||!x.record?.progress?.answers)throw new Error();x.record.draft=validatePlanetDraft(x.record.draft);return x;}catch{throw new AIError('INVALID_PLANET_RECORD','星球记录格式异常，请保留当前页面并联系维护者',409);}}
function verifyDraft(draft:PlanetDraft,token:string,userId:string|undefined){try{const claims=jwt.verify(token,requireJwtSecret(),{algorithms:['HS256'],audience,issuer:'keling-server'}) as {hash:string;owner:string|null};if(claims.hash!==digest(draft)||(claims.owner&&claims.owner!==userId))throw new Error();}catch{throw new AIError('DRAFT_EXPIRED','生成预览已过期、被修改或属于其他账号，请重新生成',409);}}
async function ownedRecord(db:Prisma.TransactionClient|PrismaClient,userId:string,id:string){const note=await db.note.findFirst({where:{id,userId,sourceType:PLANET_NOTE_TYPE}});if(!note)throw new AIError('NOT_FOUND','学习星球不存在',404);const stored=parseRecord(note.content);if(!await db.course.findFirst({where:{id:stored.record.courseId,userId,isArchived:false},select:{id:true}}))throw new AIError('NOT_FOUND','星球课程已删除或归档',404);return {note,stored};}
export async function confirmPlanet(db:PrismaClient,userId:string,raw:unknown){
 const input=planetConfirmationInput.parse(raw);let draft:PlanetDraft;try{draft=validatePlanetDraft(input.draft);}catch{throw new AIError('INVALID_PLANET','星球预览格式不正确',400);}verifyDraft(draft,input.draftToken,userId);
 return mutateOwnedTask(db,userId,async tx=>{
  const existing=await tx.note.findFirst({where:{id:draft.id,userId,sourceType:PLANET_NOTE_TYPE}});
  if(existing){const stored=parseRecord(existing.content);if(digest(stored.record.draft)!==digest(draft))throw new AIError('IDEMPOTENCY_CONFLICT','该星球编号已用于不同内容',409);return (await ownedRecord(tx,userId,draft.id)).stored.record;}
  const reused=await tx.note.findMany({where:{userId,sourceType:PLANET_NOTE_TYPE},select:{content:true}});if(reused.some(n=>parseRecord(n.content).confirmRequestId===input.clientRequestId))throw new AIError('IDEMPOTENCY_CONFLICT','确认编号已用于其他星球',409);
  const course=await tx.course.create({data:{userId,name:draft.subject,code:'AI_PLANET',teacher:'',planetStyleIndex:draft.planetStyleIndex,themeColor:'#68BDA8'}});
  const graph=draft.knowledgeGraph??{nodes:draft.regions.map(r=>({id:r.id,title:r.title,summary:r.lesson,sourceIds:r.sourceIds??[]})),edges:draft.regions.flatMap(r=>r.prerequisiteIds.map(source=>({source,target:r.id,label:'先修',kind:'hierarchy' as const})))};
  const nodeIds=new Map(graph.nodes.map(n=>[n.id,randomUUID()]));
  for(const [index,n]of graph.nodes.entries()){const parents=graph.edges.filter(e=>e.target===n.id&&e.kind==='hierarchy').map(e=>nodeIds.get(e.source));await tx.knowledgeNode.create({data:{id:nodeIds.get(n.id),courseId:course.id,name:n.title,description:'AI 生成学习内容，待核验。\n\n'+n.summary+'\n\n'+(draft.research?.sources.filter(s=>n.sourceIds.includes(s.id)).map(s=>s.title+' '+s.url).join('\n')||''),positionX:0.5,positionY:(index+1)/(graph.nodes.length+1),isUnlocked:parents.length===0,parentIds:JSON.stringify(parents),childIds:JSON.stringify(graph.edges.filter(e=>e.source===n.id&&e.kind==='hierarchy').map(e=>nodeIds.get(e.target)))}});}
  const first=draft.regions[0];await tx.task.create({data:{userId,courseId:course.id,title:`探索${first.title}`,description:`${first.description}\n\n${first.objectives.join('\n')}`,type:'DEEP_EXPLORATION',estimatedMinutes:first.estimatedMinutes,rewardsEnergy:0,rewardsCrystals:0,rewardsExp:0,knowledgeNodeIds:JSON.stringify([nodeIds.get(graph.nodes[0].id)])}});
  const at=new Date().toISOString(),record:PlanetRecord={id:draft.id,courseId:course.id,draft,progress:emptyPlanetProgress(),createdAt:at,updatedAt:at};
  const stored:StoredPlanet={version:1,record,confirmRequestId:input.clientRequestId,answerRequests:{}};
  await tx.note.create({data:{id:record.id,userId,title:draft.title,content:JSON.stringify(stored),sourceType:PLANET_NOTE_TYPE,relatedNodeIds:'[]',tags:'[]'}});return record;
 });
}
export async function listPlanets(db:PrismaClient,userId:string){const [notes,courses]=await Promise.all([db.note.findMany({where:{userId,sourceType:PLANET_NOTE_TYPE},orderBy:{updatedAt:'desc'}}),db.course.findMany({where:{userId,isArchived:false},select:{id:true}})]);const ids=new Set(courses.map(c=>c.id));return notes.map(n=>parseRecord(n.content).record).filter(r=>ids.has(r.courseId));}
export async function getPlanet(db:PrismaClient,userId:string,id:string){return (await ownedRecord(db,userId,id)).stored.record;}
export const planetRegenerationInput=z.object({kind:z.enum(['question','artwork']),questionId:z.string().min(1).max(100).optional(),instruction:z.string().trim().min(1).max(800),clientRequestId:requestId}).strict().refine(x=>x.kind!=='question'||!!x.questionId,{message:'请选择要修改的题目'});
export const planetPreviewRegenerationInput=z.object({draft:z.unknown(),draftToken:z.string().min(1).max(3000),kind:z.enum(['question','artwork']),questionId:z.string().min(1).max(100).optional(),instruction:z.string().trim().min(1).max(800),clientRequestId:requestId}).strict();
function signDraft(draft:PlanetDraft,userId?:string){return {draft,draftToken:jwt.sign({hash:digest(draft),owner:userId||null},requireJwtSecret(),{algorithm:'HS256',audience,issuer:'keling-server',expiresIn:'2h'})};}
async function revisedDraft(draft:PlanetDraft,input:z.infer<typeof planetRegenerationInput>,signal:AbortSignal){
 const next=structuredClone(draft);
 if(input.kind==='artwork')next.artwork=await generatePlanetArtwork(next,signal,(next.artwork?.prompt||'').slice(-500)+'\n用户新要求：'+input.instruction,true);
 else {const generated=await generateOneQuestion(next,input.questionId!,input.instruction,signal),raw=generated.question;if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new AIError('INVALID_QUESTION','模型未返回有效的新题目，已保留原题',422);next.research=generated.research;let replaced=false;for(const r of next.regions){const i=r.questions.findIndex(q=>q.id===input.questionId);if(i>=0){r.questions[i]={...raw as any,id:'q_'+randomUUID().replace(/-/g,'')};replaced=true;}}if(!replaced)throw new AIError('NOT_FOUND','题目不存在',404);}
 try{return validatePlanetDraft(next);}catch{throw new AIError('INVALID_QUESTION','新内容的答案或引用未通过校验，已保留原内容',422);}
}
export async function regeneratePlanetPreview(raw:unknown,userId:string|undefined,signal:AbortSignal){
 const input=planetPreviewRegenerationInput.parse(raw),draft=validatePlanetDraft(input.draft);verifyDraft(draft,input.draftToken,userId);const {draft:_d,draftToken:_t,...request}=input;const change=planetRegenerationInput.parse(request);return signDraft(await revisedDraft(draft,change,signal),userId);
}
export async function regenerateStoredPlanet(db:PrismaClient,userId:string,id:string,raw:unknown,signal:AbortSignal){
 const input=planetRegenerationInput.parse(raw),original=(await ownedRecord(db,userId,id)).stored,requestHash=digest(input),prior=original.regenerationRequests?.[input.clientRequestId];
 if(prior){if(prior!==requestHash)throw new AIError('IDEMPOTENCY_CONFLICT','修改编号已用于不同要求',409);return {planet:original.record};}
 const next=await revisedDraft(original.record.draft,input,signal);signal.throwIfAborted();
 return mutateOwnedTask(db,userId,async tx=>{const {stored}=await ownedRecord(tx,userId,id);const prior=stored.regenerationRequests?.[input.clientRequestId];if(prior){if(prior!==requestHash)throw new AIError('IDEMPOTENCY_CONFLICT','修改编号已用于不同要求',409);return {planet:stored.record};}if(digest(stored.record.draft)!==digest(original.record.draft))throw new AIError('REVISION_CONFLICT','星球内容已在另一处更新，请刷新后再修改',409);
 stored.record.draft=next;if(input.kind==='question'){delete stored.record.progress.answers[input.questionId!];for(const [key,value]of Object.entries(stored.answerRequests))if(value.questionId===input.questionId)delete stored.answerRequests[key];}
 const done=new Set<string>();for(const r of next.regions)if(r.prerequisiteIds.every(id=>done.has(id))&&r.questions.every(q=>planetQuestionComplete(q,stored.record.progress.answers[q.id])))done.add(r.id);stored.record.progress.completedRegionIds=[...done];stored.record.updatedAt=new Date().toISOString();stored.regenerationRequests={...stored.regenerationRequests,[input.clientRequestId]:requestHash};if(Object.keys(stored.regenerationRequests).length>100)throw new AIError('REGENERATION_LIMIT','此星球的修改记录已达上限',409);await tx.note.update({where:{id},data:{content:JSON.stringify(stored)}});return {planet:stored.record};});
}
export async function submitPlanetAnswer(db:PrismaClient,userId:string,id:string,raw:unknown){
 const input=planetAnswerInput.parse(raw);const {questionId:_q,clientRequestId:_r,...response}=input;return mutateOwnedTask(db,userId,async tx=>{const {stored}=await ownedRecord(tx,userId,id),previous=stored.answerRequests[input.clientRequestId];
  if(previous){if(previous.questionId!==input.questionId||digest(previous.response??{selectedIndex:previous.selectedIndex})!==digest(response))throw new AIError('IDEMPOTENCY_CONFLICT','提交编号已用于不同作答',409);return {planet:stored.record,feedback:previous.feedback};}
  let result;try{result=answerPlanetQuestion(stored.record.draft,stored.record.progress,input.questionId,response);}catch(e){throw new AIError('INVALID_ANSWER',(e as Error).message,400);}
  stored.record.progress=result.progress;stored.record.updatedAt=new Date().toISOString();stored.answerRequests[input.clientRequestId]={questionId:input.questionId,response,feedback:result.feedback};
  // Keep all idempotency receipts for this small planet; bounded total avoids unlimited growth.
  if(Object.keys(stored.answerRequests).length>1000)throw new AIError('ANSWER_LIMIT','此星球练习记录已达上限',409);
  await tx.note.update({where:{id},data:{content:JSON.stringify(stored)}});return {planet:stored.record,feedback:result.feedback};
 });
}
