import { answerPlanetQuestion, emptyPlanetProgress, validatePlanetDraft, completedPlanetRegionIds, parsePlanetWorkProgress } from '@keling/shared';
import type { PlanetDraft, PlanetRecord, PlanetFeedback, PlanetResponse, PlanetWorkProgress } from '@keling/shared';
import { hostingCredentials, hostingHeaders } from './appPath';
import { getGuestSessionId, subscribeGuestSession } from './guestSession';
import { getGuestWorkspace, handleGuestData } from './guestData';
import type { ModelCredentials } from './modelAccess';

export type { PlanetDraft, PlanetRecord, PlanetFeedback, PlanetResponse, PlanetWorkProgress } from '@keling/shared';
export interface PlanetProvider { id: string; name: string; chatModels: string[]; configured: boolean }
export interface PlanetGeneration { draft: PlanetDraft; draftToken: string }
export interface PlanetInput { subject: string; level?: string; goal?: string; contextMode?: 'auto'|'general'|'internet_culture'; questionCount?: 6|12|18; generateArtwork?:boolean; model?: string; providerId?: string; credentials?: ModelCredentials }
export type PlanetProgressListener = (progress: PlanetWorkProgress) => void;
const planetListeners = new Set<() => void>();
let pendingList: { scope: string; promise: Promise<PlanetRecord[]> } | undefined;
export function subscribePlanetChanges(listener: () => void) { planetListeners.add(listener); return () => { planetListeners.delete(listener); }; }
function notifyPlanetChanges() { pendingList = undefined; for (const listener of planetListeners) listener(); }
const base = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '') + '/learning/v1/planets';
const guestPlanets = new Map<string, PlanetRecord>();
const guestDraftTokens = new Map<string,string>();
const guestConfirmations = new Map<string, { fingerprint: string; planetId: string }>();
const pendingConfirmations = new Map<string, {fingerprint:string; promise:Promise<PlanetRecord>}>();
const guestAnswers = new Map<string, {fingerprint:string; result:{planet:PlanetRecord;feedback:PlanetFeedback}}>();
let confirmationQueue: Promise<unknown> = Promise.resolve();
subscribeGuestSession(() => { guestPlanets.clear(); guestDraftTokens.clear(); guestConfirmations.clear(); pendingConfirmations.clear(); guestAnswers.clear(); confirmationQueue=Promise.resolve(); notifyPlanetChanges(); });
const scope = () => getGuestSessionId() || `account:${localStorage.getItem('token') || ''}`;
function assertScope(expected: string) { if (scope() !== expected) throw new Error('学习空间已切换，请重新打开星球。'); }
const messages: Record<string, string> = { NOT_CONFIGURED: '尚未连接可用的大模型，请配置 API Key 和模型后重试。', INVALID_PLANET: '模型返回的星球不完整，请重新生成。', INSUFFICIENT_RESEARCH: '可靠资料不足，请补充具体语境或换一个更明确的主题。', RESEARCH_UNAVAILABLE: '联网检索暂时不可用，主题与目标已保留，请稍后重试。', TIMEOUT: '生成超时，主题与目标已保留，请重试。', PROVIDER_ERROR: '模型服务暂时不可用，请检查配置后重试。', RATE_LIMITED: '请求过于频繁，请稍后重试。', CANCELLED: '已停止等待。', UNAUTHORIZED: '登录已失效，请重新登录。', DRAFT_EXPIRED: '星球预览已过期，请重新生成。' };
Object.assign(messages,{RESEARCH_INSUFFICIENT:messages.INSUFFICIENT_RESEARCH,ARTWORK_FAILED:'定制形象暂未生成，原形象已保留，请重试。',INVALID_QUESTION:'新题目的答案或引用未通过校验，原题已保留，请调整要求后重试。',REVISION_CONFLICT:'星球已在另一处更新，请重新打开后再调整。',REGENERATION_LIMIT:'这颗星球的修改次数已达上限。'});
Object.assign(messages,{PRACTICE_LIMIT:'本区练习已达上限，可以探索其他区域。',CONTENT_REVIEW_FAILED:'新内容的答案或依据未通过核对，原内容已保留，请调整要求后重试。',CONTENT_REVIEW_INVALID:'内容核对未完成，原内容已保留，请稍后重试。',CONTENT_REVIEW_UNAVAILABLE:'内容核对暂时不可用，原内容已保留，请稍后重试。'});
export function planetError(error: unknown): string { return error instanceof Error ? error.message : '操作未完成，请重试。'; }
async function request<T>(path: string, body?: unknown, signal?: AbortSignal, extraHeaders: Record<string,string> = {}): Promise<T> {
  const identity = scope(), guest = getGuestSessionId(), token = guest ? null : localStorage.getItem('token');
  let response: Response;
  try { response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { ...hostingHeaders(), ...extraHeaders, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, credentials: hostingCredentials, cache: 'no-store', redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000), ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
  catch { assertScope(identity); throw new Error(signal?.aborted ? '已停止等待。' : '网络或模型请求超时，请重试。'); }
  const data = await response.json().catch(() => null);
  assertScope(identity);
  if (!response.ok) throw new Error(messages[data?.code] || (response.status === 401 ? messages.UNAUTHORIZED : '星球请求未完成，请检查模型配置后重试。'));
  if (!data) throw new Error('星球响应无法读取，请重试。');
  return data as T;
}
type GenerationJob = {jobId:string;jobToken?:string;status:'RUNNING'|'SUCCEEDED'|'FAILED';draft?:PlanetDraft;draftToken?:string;planet?:PlanetRecord;code?:string;progress?:unknown};
function progressReporter(onProgress?:PlanetProgressListener) { let revision=-1; return (result:unknown) => { const value=result&&typeof result==='object'&&'progress' in result?parsePlanetWorkProgress(result.progress):undefined; if(value&&value.revision>revision){revision=value.revision;onProgress?.(value);} }; }
async function waitForPoll(signal:AbortSignal) {
  if(signal.aborted)throw new Error('已停止等待。');
  await new Promise<void>((resolve,reject)=>{
    const cancel=()=>{clearTimeout(timer);reject(new Error('已停止等待。'));};
    const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},1500);
    signal.addEventListener('abort',cancel,{once:true});
  });
}
async function regeneration(path:string,body:unknown,signal?:AbortSignal,onProgress?:PlanetProgressListener):Promise<Partial<PlanetGeneration>&{planet?:PlanetRecord}>{
 const identity=scope(),deadline=AbortSignal.timeout(600000),active=signal?AbortSignal.any([signal,deadline]):deadline;
 try{
  const report=progressReporter(onProgress);
  let result=await request<GenerationJob|PlanetGeneration|{planet:PlanetRecord}>(path,body,active);report(result);
  if('jobId' in result){const {jobId,jobToken}=result;while('status' in result&&result.status==='RUNNING'){await waitForPoll(active);assertScope(identity);result=await request<GenerationJob>('/generation-jobs/'+encodeURIComponent(jobId),undefined,active,jobToken?{'X-Planet-Job-Token':jobToken}:{});report(result);}if('status' in result&&result.status==='FAILED')throw new Error(messages[result.code||'']||'这次调整未完成，原内容已保留。');}
  assertScope(identity);return result;
 }catch(error){if(deadline.aborted&&!signal?.aborted)throw new Error(messages.TIMEOUT);throw error;}
}
export const planetAPI = {
  catalog: (signal?: AbortSignal) => request<{ providers: PlanetProvider[] }>('/catalog', undefined, signal),
  async generate(input: PlanetInput, signal?: AbortSignal, onProgress?:PlanetProgressListener):Promise<PlanetGeneration> {
    const identity=scope(),deadline=AbortSignal.timeout(600000),active=signal?AbortSignal.any([signal,deadline]):deadline;
    try {
      const report=progressReporter(onProgress);
      let result=await request<PlanetGeneration|GenerationJob>('/generate',input,active);report(result);
      if('jobId' in result){
        const {jobId,jobToken}=result;
        while('status' in result&&result.status==='RUNNING'){
          await waitForPoll(active);assertScope(identity);
          result=await request<GenerationJob>('/generation-jobs/'+encodeURIComponent(jobId),undefined,active,jobToken?{'X-Planet-Job-Token':jobToken}:{});report(result);
        }
        if('status' in result&&result.status==='FAILED')throw new Error(messages[result.code||'']||'模型服务未完成生成，请重试。');
      }
      assertScope(identity);
      try { const draft=validatePlanetDraft(result.draft);if(typeof result.draftToken!=='string'||!result.draftToken)throw new Error();return {draft,draftToken:result.draftToken}; }
      catch { throw new Error(messages.INVALID_PLANET); }
    }catch(error){if(deadline.aborted&&!signal?.aborted)throw new Error(messages.TIMEOUT);throw error;}
  },
  async regeneratePreview(generation:PlanetGeneration,kind:'question'|'artwork'|'similar',instruction:string,clientRequestId:string,questionId?:string,signal?:AbortSignal,onProgress?:PlanetProgressListener):Promise<PlanetGeneration>{
    const result=await regeneration('/regenerate-preview',{...generation,kind,instruction,clientRequestId,...(questionId?{questionId}:{})},signal,onProgress);
    const draft=validatePlanetDraft(result.draft);if(typeof result.draftToken!=='string'||!result.draftToken)throw new Error('调整结果无法校验，原内容已保留。');return {draft,draftToken:result.draftToken};
  },
  async regenerate(id:string,kind:'question'|'artwork'|'similar',instruction:string,clientRequestId:string,questionId?:string,signal?:AbortSignal,onProgress?:PlanetProgressListener):Promise<PlanetRecord>{
    if(!getGuestSessionId()){
      const result=await regeneration('/'+encodeURIComponent(id)+'/regenerate',{kind,instruction,clientRequestId,...(questionId?{questionId}:{})},signal,onProgress);
      if(!result.planet)throw new Error('调整结果无法读取，原内容已保留。');validatePlanetDraft(result.planet.draft);notifyPlanetChanges();return result.planet;
    }
    const identity=scope(),stored=await this.get(id),token=guestDraftTokens.get(id);if(!token)throw new Error('星球预览已过期，请重新生成。');
    const result=await this.regeneratePreview({draft:stored.draft,draftToken:token},kind,instruction,clientRequestId,questionId,signal,onProgress);assertScope(identity);
    if(result.draft.id!==stored.draft.id||JSON.stringify(guestPlanets.get(id)?.draft)!==JSON.stringify(stored.draft))throw new Error('星球内容已变更，请刷新后重新调整。');
    const answers={...stored.progress.answers};if(kind==='question'&&questionId)delete answers[questionId];
    const updated:PlanetRecord={...stored,draft:result.draft,updatedAt:new Date().toISOString(),progress:{answers,completedRegionIds:completedPlanetRegionIds(result.draft,answers)}};
    guestPlanets.set(id,updated);guestDraftTokens.set(id,result.draftToken);notifyPlanetChanges();return structuredClone(updated);
  },
  async list(): Promise<PlanetRecord[]> {
    const identity=scope();
    if(pendingList?.scope===identity)return pendingList.promise;
    const promise=(async()=>{if(getGuestSessionId()){const w=getGuestWorkspace();return structuredClone([...guestPlanets.values()].filter(p=>w.courses.some(c=>c.id===p.courseId&&!c.isArchived)));}return(await request<{planets:PlanetRecord[]}>('')).planets;})();
    const entry={scope:identity,promise};pendingList=entry;
    try{return await promise;}finally{if(pendingList===entry)pendingList=undefined;}
  },
  async get(id: string): Promise<PlanetRecord> { if (getGuestSessionId()) { const p=guestPlanets.get(id);if(!p||!getGuestWorkspace().courses.some(c=>c.id===p.courseId&&!c.isArchived))throw new Error('这颗星球已不在当前学习空间。');return structuredClone(p); } return (await request<{planet:PlanetRecord}>('/'+encodeURIComponent(id))).planet; },
  async confirm(generation: PlanetGeneration, clientRequestId: string): Promise<PlanetRecord> {
    const draft=validatePlanetDraft(generation.draft);
    if (!getGuestSessionId()) {const result=await request<{planet:PlanetRecord}>('/confirm',{...generation,clientRequestId});notifyPlanetChanges();return result.planet;}
    const fingerprint=JSON.stringify(generation), previous=guestConfirmations.get(clientRequestId), pending=pendingConfirmations.get(clientRequestId);
    if(previous){if(previous.fingerprint!==fingerprint)throw new Error('确认请求已用于另一颗星球。');return this.get(previous.planetId);}
    if(pending){if(pending.fingerprint!==fingerprint)throw new Error('确认请求已用于另一颗星球。');return pending.promise;}
    const identity=scope();
    const operation=confirmationQueue.catch(()=>undefined).then(async()=>{
      assertScope(identity);
      const existing=guestPlanets.get(draft.id);
      if(existing){if(JSON.stringify(existing.draft)!==JSON.stringify(draft))throw new Error('星球标识已使用，请重新生成。');return structuredClone(existing);}
      const w=getGuestWorkspace(),snapshot=structuredClone(w);
      try {
        const {course}=await handleGuestData('POST','/courses',{name:draft.subject,code:'AI_PLANET',teacher:'',planetStyleIndex:draft.planetStyleIndex}) as {course:{id:string}};assertScope(identity);
        const ids=new Map<string,string>();
        if(draft.knowledgeGraph){
          for(const n of draft.knowledgeGraph.nodes){assertScope(identity);const result=await handleGuestData('POST',`/knowledge/${course.id}/nodes`,{name:n.title,description:n.summary,parentIds:[]}) as {node:{id:string}};ids.set(n.id,result.node.id);}
          for(const n of draft.knowledgeGraph.nodes){const parents=draft.knowledgeGraph.edges.filter(e=>e.kind==='hierarchy'&&e.target===n.id).map(e=>ids.get(e.source)!);if(parents.length){assertScope(identity);await handleGuestData('PUT',`/knowledge/node/${ids.get(n.id)}`,{parentIds:parents});}}
        }else for(const r of draft.regions){assertScope(identity);const result=await handleGuestData('POST',`/knowledge/${course.id}/nodes`,{name:r.title,description:r.lesson,parentIds:r.prerequisiteIds.map(id=>ids.get(id))}) as {node:{id:string}};ids.set(r.id,result.node.id);}
        assertScope(identity);await handleGuestData('POST','/tasks',{title:`探索：${draft.regions[0].title}`,description:draft.regions[0].description,courseId:course.id,type:'DEEP_EXPLORATION',estimatedMinutes:draft.regions[0].estimatedMinutes,rewards:{energy:0,crystals:0,exp:0}});assertScope(identity);
        const now=new Date().toISOString(),p:PlanetRecord={id:draft.id,courseId:course.id,draft:structuredClone(draft),progress:emptyPlanetProgress(),createdAt:now,updatedAt:now};guestPlanets.set(p.id,p);guestDraftTokens.set(p.id,generation.draftToken);guestConfirmations.set(clientRequestId,{fingerprint,planetId:p.id});return structuredClone(p);
      } catch(error){if(scope()===identity)Object.assign(w,snapshot);throw error;}
    });
    pendingConfirmations.set(clientRequestId,{fingerprint,promise:operation});confirmationQueue=operation;
    try{const result=await operation;notifyPlanetChanges();return result;}finally{if(pendingConfirmations.get(clientRequestId)?.promise===operation)pendingConfirmations.delete(clientRequestId);}
  },
  async answer(id:string,questionId:string,value:number|PlanetResponse,clientRequestId:string):Promise<{planet:PlanetRecord;feedback:PlanetFeedback}>{
    const response=typeof value==='number'?{selectedIndex:value}:value;
    if(!getGuestSessionId())return request('/'+encodeURIComponent(id)+'/answers',{questionId,...response,clientRequestId});
    const identity=scope(),fingerprint=JSON.stringify([id,questionId,response]);
    const stored=guestPlanets.get(id);
    if(!stored||!getGuestWorkspace().courses.some(c=>c.id===stored.courseId&&!c.isArchived))throw new Error('这颗星球已不在当前学习空间。');
    const p=structuredClone(stored);assertScope(identity);
    const previous=guestAnswers.get(clientRequestId);
    if(previous){if(previous.fingerprint!==fingerprint)throw new Error('提交请求已用于另一条回答。');return structuredClone(previous.result);}
    const result=answerPlanetQuestion(p.draft,p.progress,questionId,response);p.progress=result.progress;p.updatedAt=new Date().toISOString();guestPlanets.set(id,p);
    const output={planet:structuredClone(p),feedback:result.feedback};guestAnswers.set(clientRequestId,{fingerprint,result:structuredClone(output)});return output;
  },
};
