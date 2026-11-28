import { randomUUID, createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { PrismaClient, Prisma } from '@prisma/client';
import { PlanetDraft, PlanetRecord, PlanetFeedback, PlanetResponse, PLANET_NOTE_TYPE, validatePlanetDraft, emptyPlanetProgress, answerPlanetQuestion, completedPlanetRegionIds, normalizePlanetText } from '@keling/shared';
import { EnhancedPlanetInput, groundedInput, planetDesignInstructions, assertPlanetQuality, generatePlanetArtwork, generateOneQuestion, prepareSimilarQuestions } from './planetEnhancement';
import { AIError, Provider, providers } from '../ai/catalog';
import { accessCredentials, credentialProvider } from '../ai/modelAccess';
import { complete } from '../ai/transport';
import { requireJwtSecret } from '../config/security';
import { mutateOwnedTask } from '../services/taskMutations';
import { reviewPlanetContent,planetContentReviewInstructions,PlanetContentReviewer } from './planetReview';
import { PlanetDiagnosticError } from './planetDiagnostics';

export const planetGenerationInput=z.object({subject:z.string().trim().min(1).max(80),level:z.string().trim().min(1).max(80).default('入门'),goal:z.string().trim().max(300).default(''),contextMode:z.enum(['auto','general','internet_culture']).default('auto'),questionCount:z.union([z.literal(6),z.literal(12),z.literal(18)]).default(12),generateArtwork:z.boolean().default(true),model:z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9_.:/@-]*$/).optional(),providerId:z.string().max(32).optional(),credentials:accessCredentials.optional()}).strict();
const requestId=z.string().min(8).max(100).regex(/^[A-Za-z0-9][A-Za-z0-9_-]+$/).refine(v=>!['constructor','prototype','__proto__'].includes(v));
export const planetConfirmationInput=z.object({draft:z.unknown(),draftToken:z.string().min(1).max(3000),clientRequestId:requestId}).strict();
export const planetAnswerInput=z.object({questionId:z.string().min(1).max(100),selectedIndex:z.number().int().min(0).max(7).optional(),selectedIndices:z.array(z.number().int().min(0).max(7)).min(1).max(8).optional(),orderedIndices:z.array(z.number().int().min(0).max(7)).min(2).max(8).optional(),text:z.string().trim().min(1).max(4000).optional(),selfReview:z.boolean().optional(),clientRequestId:requestId}).strict();
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const audience='keling-planet-draft';
// Only fixed validator messages and numeric shapes enter logs; never raw prompts, sources, answers or tokens.
const validationReasons=new Set(['星球对象格式无效','星球文字长度无效','星球标识无效','星球内容数量无效','星球数值无效','选项序号不能重复','引用必须指向本次检索资料','生成时间无效','参考网址无效','检索状态无效','检索资料重复','题型无效','题目标识或选项重复','填空参考答案重复','区域先修关系必须指向前面的有效区域','生成内容只能是待核验练习','星球图像状态无效','星球图像网址必须是公网 HTTPS 地址','默认图像不能附带生成网址','图谱节点标识重复','图谱关系节点无效','图谱关系类型无效','图谱关系重复','图谱层级关系不能循环','星球内容过大','每区基础练习数量须为 1 至 6 道','相似碎片必须附带本次有效检索资料和原题标识','相似碎片必须引用本次检索资料','相似碎片必须关联本区域的练习','相似碎片关联不能循环','初次星球生成不能冒充后续搜索的补充练习','模型未完整生成所选题量、多样题型、知识图谱或资料依据，未保存，请重试','选择题选项不完整，未保存，请重试']);
function reportRejectedPlanet(raw:unknown,error:unknown){
 const value=raw&&typeof raw==='object'?raw as Record<string,unknown>:{},graph=value.knowledgeGraph&&typeof value.knowledgeGraph==='object'?value.knowledgeGraph as Record<string,unknown>:{};
 const count=(v:unknown)=>Array.isArray(v)?v.length:null;
 const diagnostic={stage:'structure' as const,reason:error instanceof Error&&validationReasons.has(error.message)?error.message:'unknown',shape:{regions:count(value.regions),questions:Array.isArray(value.regions)?value.regions.slice(0,6).map(r=>r&&typeof r==='object'?count(r.questions):null):[],graphNodes:count(graph.nodes),graphEdges:count(graph.edges)}};
 console.warn('PLANET_STRUCTURE_REJECTED',{reason:diagnostic.reason,...diagnostic.shape});
 return diagnostic;
}
type GenerationInput=z.infer<typeof planetGenerationInput>;
export type NativePlanetInput=EnhancedPlanetInput&{previousOutput?:string;validationFeedback?:string};
export type NativePlanetGenerator=(input:NativePlanetInput,signal:AbortSignal)=>Promise<unknown>;
let nativeGenerator:NativePlanetGenerator|undefined;
/** Trusted deployment adapter only; never registered from an HTTP request. */
export function registerLearningPlanetGenerator(generator:NativePlanetGenerator|undefined){nativeGenerator=generator;}
export function usesNativePlanetGenerator(raw:unknown){const input=planetGenerationInput.parse(raw);return !!nativeGenerator&&!input.credentials&&(!input.providerId||input.providerId==='miaoda');}
export async function generateNativePlanet(raw:unknown,userId:string|undefined,signal:AbortSignal){const input=planetGenerationInput.parse(raw);if(!nativeGenerator)throw new AIError('NOT_CONFIGURED','公共模型未连接',503);if(input.model&&input.model!=='miaoda-learning')throw new AIError('MODEL_NOT_ALLOWED','所选公共模型不可用',400);const generator=nativeGenerator,enriched=await groundedInput(input,signal),result=await generator(enriched,signal);if(signal.aborted)throw new AIError('TIMEOUT','星球生成超时，请重试',504);return finishGeneration(result,input,enriched,userId,'miaoda','miaoda-learning',signal,(previous,feedback)=>generator({...enriched,previousOutput:JSON.stringify(previous).slice(0,180000),validationFeedback:feedback.slice(0,20000)},signal));}
async function finishGeneration(raw:unknown,input:GenerationInput,enriched:EnhancedPlanetInput,userId:string|undefined,providerId:string,model:string,signal=new AbortController().signal,repair?:(previous:unknown,feedback:string)=>Promise<unknown>,reviewerOverride?:PlanetContentReviewer){
 const validate=(value:unknown)=>{
  if(value&&typeof value==='object'&&'topicSupported' in value&&value.topicSupported===false)throw new AIError('RESEARCH_INSUFFICIENT','检索资料尚不能支持这个主题的可靠解释，请补充具体用法、别称或背景；未创建星球',422);
  const sealed=sealPlanet({...value as object,artwork:undefined,research:enriched.research},input,userId,providerId,model);
  try{assertPlanetQuality(sealed.draft,input.questionCount);}catch(error){if(!(error instanceof AIError)||error.code!=='INVALID_PLANET')throw error;throw new PlanetDiagnosticError(error.code,error.message,error.status,reportRejectedPlanet(sealed.draft,error));}
  return sealed.draft;
 };
 let draft:PlanetDraft,repaired=false;
 try{draft=validate(raw);}catch(error){
  if(!(error instanceof AIError)||error.code!=='INVALID_PLANET'||!repair)throw error;
  const detail=error instanceof PlanetDiagnosticError?JSON.stringify(error.diagnostic):error.message;
  repaired=true;raw=await repair(raw,`原返回未通过结构校验：${detail}。保持主题与实际来源，检查字段类型、合法唯一标识、实际sourceIds、无环图谱、区域先修顺序、精确${input.questionCount}题、每区1至6题及至少${input.questionCount===6?3:4}种适用题型。没有顺序依据不要凑排序题。只修复实际缺口，不补造事实。`);draft=validate(raw);
 }
 let review=await reviewPlanetContent(draft,signal,undefined,reviewerOverride);
 if(review.issues.length){
  console.warn('PLANET_CONTENT_REVIEW_REJECTED',{issueCodes:[...new Set(review.issues.map(i=>i.code))],issueCount:review.issues.length,repaired});
  if(repaired||!repair)throw new AIError('CONTENT_REVIEW_FAILED','生成内容仍有矛盾或依据缺口，未创建星球，请补充资料或重试',422);
  draft=validate(await repair(draft,review.feedback));repaired=true;
  review=await reviewPlanetContent(draft,signal,undefined,reviewerOverride);
  if(review.issues.length)throw new AIError('CONTENT_REVIEW_FAILED','修复后内容仍有矛盾或依据缺口，未创建星球，请补充资料或重试',422);
 }
 if(input.generateArtwork)draft.artwork=await generatePlanetArtwork(draft,signal);
 return sealPlanet(draft,input,userId,providerId,model);
}
function sealPlanet(raw:unknown,input:GenerationInput,userId:string|undefined,providerId:string,model:string){
 let draft:PlanetDraft;try{if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error();draft=validatePlanetDraft({...raw,id:randomUUID(),subject:input.subject,level:input.level,goal:input.goal,reviewStatus:'UNREVIEWED',generatedBy:{providerId,model,at:new Date().toISOString()}});}catch(error){const diagnostic=reportRejectedPlanet(raw,error);throw new PlanetDiagnosticError('INVALID_PLANET','模型生成的区域、题目或先修关系未通过校验，未创建星球。请重试或缩小学科范围',422,diagnostic);}
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
 const requestJson=async(instructions:string,data:unknown,requestSignal=signal)=>{const result=await generate(provider,model,[{role:'system',content:instructions},{role:'user',content:JSON.stringify(data)}],requestSignal,undefined,8192);if(requestSignal?.aborted)throw new AIError('CANCELLED','已停止生成',409);const clean=provider.key?result.content.split(provider.key).join('[密钥已隐藏]'):result.content;try{return JSON.parse(clean.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));}catch{return clean.slice(0,180000);}};
 const rawContent=await requestJson(planetDesignInstructions,enriched);
 return finishGeneration(rawContent,input,enriched,userId,provider.id,model,signal,(previous,feedback)=>requestJson(planetDesignInstructions,{...enriched,previousOutput:previous,validationFeedback:feedback}),async(draft,reviewSignal,scopeQuestionId,validation)=>requestJson(planetContentReviewInstructions,{draft,scopeQuestionId,...validation},reviewSignal));
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
export const planetRegenerationInput=z.object({kind:z.enum(['question','artwork','similar']),questionId:z.string().min(1).max(100).optional(),instruction:z.string().trim().min(1).max(800),clientRequestId:requestId}).strict().refine(x=>x.kind==='artwork'||!!x.questionId,{message:'请选择练习'});
export const planetPreviewRegenerationInput=z.object({draft:z.unknown(),draftToken:z.string().min(1).max(3000),kind:z.enum(['question','artwork','similar']),questionId:z.string().min(1).max(100).optional(),instruction:z.string().trim().min(1).max(800),clientRequestId:requestId}).strict();
function signDraft(draft:PlanetDraft,userId?:string){return {draft,draftToken:jwt.sign({hash:digest(draft),owner:userId||null},requireJwtSecret(),{algorithm:'HS256',audience,issuer:'keling-server',expiresIn:'2h'})};}
async function appendSimilarQuestions(draft:PlanetDraft,questionId:string,instruction:string,signal:AbortSignal){
 const prepared=await prepareSimilarQuestions(draft,questionId,instruction,signal);
 const fingerprint=(q:{prompt:string;options?:string[]})=>JSON.stringify([normalizePlanetText(q.prompt),(q.options??[]).map(normalizePlanetText)]);
 let feedback='';
 for(let attempt=0;attempt<2;attempt++){
  const raw=await prepared.generate(feedback);
  try{
   if(!raw||typeof raw!=='object'||!('questions'in raw)||!Array.isArray(raw.questions)||raw.questions.length!==2)throw new AIError('INVALID_QUESTION','相似练习必须恰好包含两道题，已保留原内容',422);
   const next=structuredClone(draft),region=next.regions.find(r=>r.id===prepared.regionId)!,seen=new Set(draft.regions.flatMap(r=>r.questions.map(fingerprint)));
   const ids:string[]=[];
   for(const item of raw.questions){
    if(!item||typeof item!=='object'||typeof item.prompt!=='string'||!Array.isArray(item.options)||item.options.some((v:unknown)=>typeof v!=='string')||(item.kind??'single_choice')!==(prepared.question.kind??'single_choice')||seen.has(fingerprint(item)))throw new AIError('INVALID_QUESTION','相似练习须保持题型且不重复完整原题，请换一个情境或实质不同的选项',422);
    if(['single_choice','multiple_choice'].includes(item.kind??'single_choice')&&(!Array.isArray(item.options)||item.options.length<4))throw new AIError('INVALID_QUESTION','相似选择题至少需要四个选项',422);
    if(item.kind==='multiple_choice'&&(!Array.isArray(item.answerIndices)||item.answerIndices.length<2))throw new AIError('INVALID_QUESTION','相似多选题至少需要两个正确选项',422);
    const id='q_'+randomUUID().replace(/-/g,'');ids.push(id);seen.add(fingerprint(item));
    region.questions.push({...item,id,similarTo:questionId,practiceResearch:prepared.research});
   }
   let valid:PlanetDraft;try{valid=validatePlanetDraft(next);}catch{throw new AIError('INVALID_QUESTION','相似练习的答案、结构或新来源不完整，已保留原内容',422);}
   const issues=[];
   for(const id of ids){const review=await reviewPlanetContent(valid,signal,id);issues.push(...review.issues);}
   if(issues.length)throw new AIError('CONTENT_REVIEW_FAILED',JSON.stringify({instruction:'保持两道同题型新练习，修复依据与答案问题。',issues}),422);
   return valid;
  }catch(error){
   if(!(error instanceof AIError)||!['INVALID_QUESTION','CONTENT_REVIEW_FAILED'].includes(error.code))throw error;
   if(attempt===1)throw new AIError(error.code,'相似练习仍未通过核对，原题与作答已保留，请稍后重试',422);
   feedback=error.message;
  }
 }
 throw new AIError('INVALID_QUESTION','相似练习未生成，原题已保留',422);
}
async function revisedDraft(draft:PlanetDraft,input:z.infer<typeof planetRegenerationInput>,signal:AbortSignal){
 if(input.kind==='similar')return appendSimilarQuestions(draft,input.questionId!,input.instruction,signal);
 const next=structuredClone(draft);
 if(input.kind==='artwork')next.artwork=await generatePlanetArtwork(next,signal,input.instruction,true);
 else {const generated=await generateOneQuestion(next,input.questionId!,input.instruction,signal),raw=generated.question;if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new AIError('INVALID_QUESTION','模型未返回有效的新题目，已保留原题',422);const {similarTo:_s,practiceResearch:_p,...question}=raw as any;let replaced=false;for(const r of next.regions){const i=r.questions.findIndex(q=>q.id===input.questionId);if(i>=0){const previous=r.questions[i],id='q_'+randomUUID().replace(/-/g,'');r.questions[i]={...question,id,...(previous.similarTo?{similarTo:previous.similarTo,practiceResearch:generated.research}:{})};if(!previous.similarTo)next.research=generated.research;for(const q of r.questions)if(q.similarTo===previous.id)q.similarTo=id;replaced=true;}}if(!replaced)throw new AIError('NOT_FOUND','题目不存在',404);}
 let valid:PlanetDraft;try{valid=validatePlanetDraft(next);}catch{throw new AIError('INVALID_QUESTION','新内容的答案或引用未通过校验，已保留原内容',422);}
 if(input.kind==='question'){
  const target=valid.regions.flatMap(r=>r.questions).find(q=>!draft.regions.some(r=>r.questions.some(old=>old.id===q.id)))!;
  let review=await reviewPlanetContent(valid,signal,target.id);
  if(review.issues.length){
   const revised=await generateOneQuestion(valid,target.id,input.instruction+'\n内容审核需修复：'+review.feedback,signal);
   const {similarTo:_s,practiceResearch:_p,...question}=revised.question as any;
   for(const region of valid.regions){const at=region.questions.findIndex(q=>q.id===target.id);if(at>=0)region.questions[at]={...question,id:target.id,...(target.similarTo?{similarTo:target.similarTo,practiceResearch:target.practiceResearch}:{})};}
   try{valid=validatePlanetDraft(valid);}catch{throw new AIError('INVALID_QUESTION','修复后的题目结构无效，已保留原题',422);}
   review=await reviewPlanetContent(valid,signal,target.id);
   if(review.issues.length)throw new AIError('CONTENT_REVIEW_FAILED','新题目仍有矛盾或依据缺口，已保留原题',422);
  }
 }
 return valid;
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
 stored.record.progress.completedRegionIds=completedPlanetRegionIds(next,stored.record.progress.answers);stored.record.updatedAt=new Date().toISOString();stored.regenerationRequests={...stored.regenerationRequests,[input.clientRequestId]:requestHash};if(Object.keys(stored.regenerationRequests).length>100)throw new AIError('REGENERATION_LIMIT','此星球的修改记录已达上限',409);await tx.note.update({where:{id},data:{content:JSON.stringify(stored)}});return {planet:stored.record};});
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
