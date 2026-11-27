import { answerPlanetQuestion, emptyPlanetProgress, validatePlanetDraft } from '@keling/shared';
import type { PlanetDraft, PlanetRecord } from '@keling/shared';
import { hostingCredentials, hostingHeaders } from './appPath';
import { getGuestSessionId, subscribeGuestSession } from './guestSession';
import { getGuestWorkspace, handleGuestData } from './guestData';
import type { ModelCredentials } from './modelAccess';

export type { PlanetDraft, PlanetRecord } from '@keling/shared';
export interface PlanetProvider { id: string; name: string; chatModels: string[]; configured: boolean }
export interface PlanetGeneration { draft: PlanetDraft; draftToken: string }
export interface PlanetInput { subject: string; level?: string; goal?: string; model?: string; providerId?: string; credentials?: ModelCredentials }
export interface PlanetFeedback { correct: boolean; expectedIndex: number; explanation: string }
const base = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '') + '/learning/v1/planets';
const guestPlanets = new Map<string, PlanetRecord>();
const guestConfirmations = new Map<string, { fingerprint: string; planetId: string }>();
const pendingConfirmations = new Map<string, {fingerprint:string; promise:Promise<PlanetRecord>}>();
const guestAnswers = new Map<string, {fingerprint:string; result:{planet:PlanetRecord;feedback:PlanetFeedback}}>();
let confirmationQueue: Promise<unknown> = Promise.resolve();
subscribeGuestSession(() => { guestPlanets.clear(); guestConfirmations.clear(); pendingConfirmations.clear(); guestAnswers.clear(); confirmationQueue=Promise.resolve(); });
const scope = () => getGuestSessionId() || `account:${localStorage.getItem('token') || ''}`;
function assertScope(expected: string) { if (scope() !== expected) throw new Error('学习空间已切换，请重新打开星球。'); }
const messages: Record<string, string> = { NOT_CONFIGURED: '尚未连接可用的大模型，请配置 API Key 和模型后重试。', INVALID_PLANET: '模型返回的星球不完整，请重新生成。', TIMEOUT: '生成超时，学科与目标已保留，请重试。', PROVIDER_ERROR: '模型服务暂时不可用，请检查配置后重试。', RATE_LIMITED: '请求过于频繁，请稍后重试。', CANCELLED: '已停止等待。', UNAUTHORIZED: '登录已失效，请重新登录。', DRAFT_EXPIRED: '星球预览已过期，请重新生成。' };
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
type GenerationJob = {jobId:string;jobToken?:string;status:'RUNNING'|'SUCCEEDED'|'FAILED';draft?:PlanetDraft;draftToken?:string;code?:string};
async function waitForPoll(signal:AbortSignal) {
  if(signal.aborted)throw new Error('已停止等待。');
  await new Promise<void>((resolve,reject)=>{
    const cancel=()=>{clearTimeout(timer);reject(new Error('已停止等待。'));};
    const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},1500);
    signal.addEventListener('abort',cancel,{once:true});
  });
}
export const planetAPI = {
  catalog: (signal?: AbortSignal) => request<{ providers: PlanetProvider[] }>('/catalog', undefined, signal),
  async generate(input: PlanetInput, signal?: AbortSignal):Promise<PlanetGeneration> {
    const identity=scope(),deadline=AbortSignal.timeout(600000),active=signal?AbortSignal.any([signal,deadline]):deadline;
    try {
      let result=await request<PlanetGeneration|GenerationJob>('/generate',input,active);
      if('jobId' in result){
        const {jobId,jobToken}=result;
        while('status' in result&&result.status==='RUNNING'){
          await waitForPoll(active);assertScope(identity);
          result=await request<GenerationJob>('/generation-jobs/'+encodeURIComponent(jobId),undefined,active,jobToken?{'X-Planet-Job-Token':jobToken}:{});
        }
        if('status' in result&&result.status==='FAILED')throw new Error(messages[result.code||'']||'模型服务未完成生成，请重试。');
      }
      assertScope(identity);
      try { const draft=validatePlanetDraft(result.draft);if(typeof result.draftToken!=='string'||!result.draftToken)throw new Error();return {draft,draftToken:result.draftToken}; }
      catch { throw new Error(messages.INVALID_PLANET); }
    }catch(error){if(deadline.aborted&&!signal?.aborted)throw new Error(messages.TIMEOUT);throw error;}
  },
  async list(): Promise<PlanetRecord[]> { if (getGuestSessionId()) { const w=getGuestWorkspace(); return structuredClone([...guestPlanets.values()].filter(p=>w.courses.some(c=>c.id===p.courseId&&!c.isArchived))); } return (await request<{planets:PlanetRecord[]}>('')).planets; },
  async get(id: string): Promise<PlanetRecord> { if (getGuestSessionId()) { const p=guestPlanets.get(id);if(!p||!getGuestWorkspace().courses.some(c=>c.id===p.courseId&&!c.isArchived))throw new Error('这颗星球已不在当前学习空间。');return structuredClone(p); } return (await request<{planet:PlanetRecord}>('/'+encodeURIComponent(id))).planet; },
  async confirm(generation: PlanetGeneration, clientRequestId: string): Promise<PlanetRecord> {
    const draft=validatePlanetDraft(generation.draft);
    if (!getGuestSessionId()) return (await request<{planet:PlanetRecord}>('/confirm',{...generation,clientRequestId})).planet;
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
        for(const r of draft.regions){assertScope(identity);const result=await handleGuestData('POST',`/knowledge/${course.id}/nodes`,{name:r.title,description:r.lesson,parentIds:r.prerequisiteIds.map(id=>ids.get(id))}) as {node:{id:string}};ids.set(r.id,result.node.id);}
        assertScope(identity);await handleGuestData('POST','/tasks',{title:`探索：${draft.regions[0].title}`,description:draft.regions[0].description,courseId:course.id,type:'DEEP_EXPLORATION',estimatedMinutes:draft.regions[0].estimatedMinutes,rewards:{energy:0,crystals:0,exp:0}});assertScope(identity);
        const now=new Date().toISOString(),p:PlanetRecord={id:draft.id,courseId:course.id,draft:structuredClone(draft),progress:emptyPlanetProgress(),createdAt:now,updatedAt:now};guestPlanets.set(p.id,p);guestConfirmations.set(clientRequestId,{fingerprint,planetId:p.id});return structuredClone(p);
      } catch(error){if(scope()===identity)Object.assign(w,snapshot);throw error;}
    });
    pendingConfirmations.set(clientRequestId,{fingerprint,promise:operation});confirmationQueue=operation;
    try{return await operation;}finally{if(pendingConfirmations.get(clientRequestId)?.promise===operation)pendingConfirmations.delete(clientRequestId);}
  },
  async answer(id:string,questionId:string,selectedIndex:number,clientRequestId:string):Promise<{planet:PlanetRecord;feedback:PlanetFeedback}>{
    if(!getGuestSessionId())return request('/'+encodeURIComponent(id)+'/answers',{questionId,selectedIndex,clientRequestId});
    const identity=scope(),fingerprint=JSON.stringify([id,questionId,selectedIndex]);
    const stored=guestPlanets.get(id);
    if(!stored||!getGuestWorkspace().courses.some(c=>c.id===stored.courseId&&!c.isArchived))throw new Error('这颗星球已不在当前学习空间。');
    const p=structuredClone(stored);assertScope(identity);
    const previous=guestAnswers.get(clientRequestId);
    if(previous){if(previous.fingerprint!==fingerprint)throw new Error('提交请求已用于另一条回答。');return structuredClone(previous.result);}
    const result=answerPlanetQuestion(p.draft,p.progress,questionId,selectedIndex);p.progress=result.progress;p.updatedAt=new Date().toISOString();guestPlanets.set(id,p);
    const response={planet:structuredClone(p),feedback:result.feedback};guestAnswers.set(clientRequestId,{fingerprint,result:structuredClone(response)});return response;
  },
};
