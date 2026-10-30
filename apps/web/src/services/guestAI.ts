import type { AssistantSession, ContextPreview, ContextRef, ModelProvider, Source, Turn } from './assistant';
import { getGuestWorkspace, handleGuestData } from './guestData';
import { getGuestSessionId, subscribeGuestSession } from './guestSession';
import { modelAccess, useModelAccess } from './modelAccess';

type GuestTurn = Turn & { sessionId:string; requestId:string; requestHash:string; noteId?:string };
type PlanTask={title:string;description:string;date:string;minutes:number;sourceIds:string[]};
type Run={id:string;courseId:string;goal:string;mode:string;status:string;createdAt:string;error:string;sources:Source[];events:{name:string;type:string;status:string;at:string}[];result:null|{summary:string;tasks:PlanTask[]}};
let sessions:AssistantSession[]=[],turns:GuestTurn[]=[],runs:Run[]=[];
const controllers=new Map<string,AbortController>();
const noteSaves=new Map<string,Promise<unknown>>();
const preparing=new Map<string,{requestId:string;hash:string;promise:Promise<{id:string;status:string}>}>();
subscribeGuestSession(()=>{controllers.forEach(c=>c.abort());controllers.clear();sessions=[];turns=[];runs=[];noteSaves.clear();preparing.clear();});
const clone=<T,>(value:T):T=>structuredClone(value);
const now=()=>new Date().toISOString();
const id=()=>crypto.randomUUID();
function fail(message:string,code='VALIDATION',status=400):never{throw Object.assign(new Error(message),{response:{status,data:{error:message,code}}});}
function failure(error:unknown){return (error as {response?:{data?:{error?:string;code?:string}}}).response?.data||{error:'请求未完成，问题仍保留；请检查配置后重试',code:'NETWORK'};}
const base=(import.meta.env.VITE_API_BASE_URL||'/api').replace(/\/+$/,'');
async function request<T>(path:string,body?:unknown,signal?:AbortSignal):Promise<T>{
  const timeout=AbortSignal.timeout(90000);
  const response=await fetch(`${base}/trial/workspace/${path}`,{method:body===undefined?'GET':'POST',credentials:'omit',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json'},signal:signal?AbortSignal.any([timeout,signal]):timeout,...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json();if(!response.ok)fail(typeof data.error==='string'?data.error:'模型请求未完成',data.code,response.status);return data;
}
function credentials(providerId:string){
  if(providerId==='public')return undefined;
  const access=useModelAccess.getState();
  if(access.providerId!==providerId||!access.apiKey)fail('请先在“输入 API Key”模块配置该厂商的密钥，再发送问题','NOT_CONFIGURED');
  return {providerId:access.providerId,apiKey:access.apiKey,baseUrl:access.baseUrl};
}
async function catalog(){
  let publicProviders:ModelProvider[]=[];
  try {publicProviders=(await request<{providers:ModelProvider[]}>('catalog')).providers;}catch{/* BYOK can still be configured when public catalog is unreachable. */}
  const access=useModelAccess.getState();
  if(access.apiKey&&access.providerId){
    publicProviders.push({id:access.providerId,name:`我的 Key · ${access.providerId}`,protocol:'服务商原生协议',configured:true,
      chatModels:Array.from(new Set([access.model,...access.models.filter(m=>!m.capabilities.includes('embedding')||m.capabilities.includes('chat')).map(m=>m.id)].filter(Boolean))),
      embeddingModels:access.models.filter(m=>m.capabilities.includes('embedding')).map(m=>m.id),documentation:''});
  }
  return {providers:publicProviders};
}
type Dated={updatedAt?:string;createdAt?:string};
const date=(item:Dated)=>item.updatedAt||item.createdAt||'';
const recent=<T extends Dated,>(items:T[])=>[...items].sort((a,b)=>date(b).localeCompare(date(a)));
function candidates():Source[]{
  const w=getGuestWorkspace();
  return [...recent(w.nodes.filter(n=>w.courses.some(c=>c.id===n.courseId&&!c.isArchived))).slice(0,24).map(n=>({id:n.id,title:n.name,text:n.description.slice(0,1000),kind:'knowledge',updatedAt:date(n),truncated:n.description.length>1000})),
    ...recent(w.notes).slice(0,12).map(n=>({id:n.id,title:n.title,text:n.content.slice(0,1000),kind:'note',updatedAt:date(n),truncated:n.content.length>1000}))];
}
async function preview(raw:Record<string,unknown>):Promise<ContextPreview>{
  const w=getGuestWorkspace(),ref={kind:raw.kind,id:raw.id} as ContextRef;let title='',sources:Source[]=[];const warnings:string[]=[];
  if(ref.kind==='note'){
    const note=w.notes.find(n=>n.id===ref.id);if(!note)fail('笔记已删除，请重新选择资料','CONTEXT_NOT_FOUND',404);
    title=note.title;sources=[{id:note.id,kind:'note',title,text:note.content.slice(0,6000),truncated:note.content.length>6000,updatedAt:date(note)}];
  }else if(ref.kind==='task'){
    const task=w.tasks.find(t=>t.id===ref.id);if(!task)fail('任务已删除，请重新选择资料','CONTEXT_NOT_FOUND',404);
    title=task.title;sources=[{id:task.id,kind:'task',title,text:`任务类型：${task.type}\n当前状态：${task.status}\n预计时长：${task.estimatedMinutes} 分钟（不是实际完成时长）\n\n${task.description.slice(0,4000)}`,truncated:task.description.length>4000,updatedAt:date(task)}];
  }else if(ref.kind==='course'){
    const course=w.courses.find(c=>c.id===ref.id&&!c.isArchived);if(!course)fail('课程已删除或归档，请重新选择资料','CONTEXT_NOT_FOUND',404);
    title=course.name;const nodes=recent(w.nodes.filter(n=>n.courseId===course.id));
    sources=[{id:course.id,kind:'course',title,text:`当前选择的课程：${title}。以下只包含这门课程的知识点。`,updatedAt:date(course),truncated:false},...nodes.slice(0,6).map(n=>({id:n.id,kind:'knowledge',title:n.name,text:n.description.slice(0,1000),truncated:n.description.length>1000,updatedAt:date(n)}))];
    if(nodes.length>6)warnings.push('只附带最近更新的 6 个知识点。');if(!nodes.length)warnings.push('课程尚未添加知识点，本次只附带课程名称。');
  }else fail('资料类型不正确');
  if(sources.some(s=>s.truncated))warnings.push('部分资料较长，发送范围以这里展示的摘录为准。');
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({ref,title,sources,warnings})));
  return {ref,title,sources,warnings,fingerprint:Array.from(new Uint8Array(bytes)).map(x=>x.toString(16).padStart(2,'0')).join('')};
}
function sessionById(sid:string){const s=sessions.find(s=>s.id===sid);if(!s)fail('本次会话不存在','NOT_FOUND',404);return s;}
function stop(s:AssistantSession){if(s.activeRequestId){controllers.get(s.activeRequestId)?.abort();const t=turns.find(t=>t.id===s.activeRequestId);if(t){t.status='CANCELLED';t.error='已停止等待，服务商仍可能处理已送达的请求并计费';t.errorCode='CANCELLED';}s.activeRequestId='';}}
async function send(s:AssistantSession,data:Record<string,unknown>){
  const message=String(data.message||'').trim();if(!message||message.length>6000)fail('问题需为 1–6000 字符');
  if(typeof data.clientRequestId!=='string'||!data.clientRequestId||data.clientRequestId.length>120)fail('请求编号无效，请重新发送');
  const requestHash=JSON.stringify({sessionId:s.id,message,context:data.context});
  const duplicate=turns.find(t=>t.requestId===data.clientRequestId);if(duplicate){if(duplicate.requestHash!==requestHash)fail('请求编号已用于其他内容','IDEMPOTENCY_CONFLICT',409);return {id:duplicate.id,status:duplicate.status};}
  const pending=preparing.get(s.id);
  if(pending&&pending.requestId===data.clientRequestId){if(pending.hash!==requestHash)fail('请求编号已用于其他内容','IDEMPOTENCY_CONFLICT',409);return pending.promise;}
  if(s.activeRequestId)fail('此会话正在生成，请等待或停止','BUSY',409);
  // Claim before fingerprinting: even source validation can yield to another send/delete.
  const sessionScope=getGuestSessionId(),reservation=id(),abort=new AbortController();
  s.activeRequestId=reservation;controllers.set(reservation,abort);
  const preparation=(async()=>{
  const access=credentials(s.providerId);
  let sources:Source[];if(data.context){const context=data.context as Record<string,unknown>,p=await preview(context);if(p.fingerprint!==context.fingerprint)fail('资料已更新，请刷新预览后发送','CONTEXT_CHANGED',409);sources=p.sources;}else sources=s.includeContext?candidates():[];
  if(abort.signal.aborted||sessionScope!==getGuestSessionId()||!sessions.includes(s))fail('请求已取消或游客空间已结束','CANCELLED',409);
  if(s.retrievalMode==='vector'&&s.includeContext&&!data.context&&(!access||s.embeddingProviderId!==s.providerId||!s.embeddingModelId))fail('请选用当前 Key 所属厂商的向量模型，或切换关键词检索','NOT_CONFIGURED');
  const history:{role:'user'|'assistant';content:string}[]=[];let remaining=24000;
  for(const t of turns.filter(t=>t.sessionId===s.id&&t.status==='SUCCEEDED').slice(-10).reverse()){const size=t.userText.length+t.assistantText.length;if(size>remaining)break;remaining-=size;history.unshift({role:'user',content:t.userText},{role:'assistant',content:t.assistantText});}
  const turn:GuestTurn={id:reservation,sessionId:s.id,requestId:String(data.clientRequestId),requestHash,status:'RUNNING',userText:message,assistantText:'',error:'',errorCode:'',providerId:s.providerId,modelId:s.modelId,sources,usage:{},createdAt:now()};
  turns.push(turn);s.updatedAt=now();
  void request<{answer:string;usage:Turn['usage'];sources:Source[]}>('chat',{credentials:access,model:s.modelId,message,scenario:s.scenario,history,sources,retrievalMode:data.context?'selected':s.includeContext?s.retrievalMode:'selected',...(s.embeddingModelId?{embeddingModel:s.embeddingModelId}:{})},abort.signal).then(result=>{
    if(abort.signal.aborted||sessionScope!==getGuestSessionId()||turn.status!=='RUNNING')return;turn.status='SUCCEEDED';turn.assistantText=result.answer;turn.usage=result.usage||{};turn.sources=result.sources;
  }).catch(error=>{if(abort.signal.aborted||sessionScope!==getGuestSessionId())return;turn.status='FAILED';turn.error=failure(error).error||'请求未完成';turn.errorCode=failure(error).code||'NETWORK';}).finally(()=>{controllers.delete(turn.id);if(s.activeRequestId===turn.id)s.activeRequestId='';});
  return {id:turn.id,status:turn.status};
  })();
  preparing.set(s.id,{requestId:data.clientRequestId,hash:requestHash,promise:preparation});
  try{return await preparation;}
  catch(error){controllers.delete(reservation);if(s.activeRequestId===reservation)s.activeRequestId='';throw error;}
  finally{if(preparing.get(s.id)?.promise===preparation)preparing.delete(s.id);}
}
async function startRun(data:Record<string,unknown>){
  const scope=getGuestSessionId();
  const w=getGuestWorkspace(),course=w.courses.find(c=>c.id===data.courseId&&!c.isArchived);if(!course)fail('请先选择课程');
  const available=[...w.nodes.filter(n=>n.courseId===course.id).map(n=>({id:'kg:'+n.id,title:n.name,text:n.description.slice(0,1800),kind:'knowledge',updatedAt:date(n)})),...w.notes.filter(n=>n.title.includes(course.name)||n.relatedNodeIds.some(id=>w.nodes.some(k=>k.id===id&&k.courseId===course.id))).map(n=>({id:'note:'+n.id,title:n.title,text:n.content.slice(0,1800),kind:'note',updatedAt:date(n)}))];
  const terms=Array.from(new Set(String(data.goal).toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fff]/g)||[]));
  const sources=available.map(s=>({s,score:terms.filter(t=>(s.title+s.text).toLowerCase().includes(t)).length})).sort((a,b)=>b.score-a.score).slice(0,8).map(x=>x.s);if(!sources.length)fail('请先为课程添加知识点或关联笔记');
  const providers=(await catalog()).providers;
  if(scope!==getGuestSessionId())fail('游客空间已结束','CANCELLED',409);
  const c=providers.find(p=>p.configured&&p.chatModels.length&&p.id===useModelAccess.getState().providerId)||providers.find(p=>p.configured&&p.chatModels.length);if(!c)fail('请先填写 API Key 和聊天模型','NOT_CONFIGURED');
  const access=credentials(c.id),model=c.id==='public'?c.chatModels[0]:useModelAccess.getState().model;
  const run:Run={id:id(),courseId:course.id,goal:String(data.goal),mode:String(data.mode||'plan'),status:'RUNNING',createdAt:now(),error:'',sources,events:[{name:'课程资料检索',type:'knowledge',status:'sources_retrieved',at:now()}],result:null};runs.unshift(run);
  const abort=new AbortController();controllers.set(run.id,abort);
  void request<{result:NonNullable<Run['result']>}>('plan',{credentials:access,model,request:data,courseName:course.name,sources,tasks:w.tasks.filter(t=>t.courseId===course.id).slice(0,100).map(t=>({title:t.title,status:t.status,estimatedMinutes:t.estimatedMinutes,actualMinutes:t.actualMinutes}))},abort.signal).then(result=>{if(scope!==getGuestSessionId()||abort.signal.aborted)return;run.result=result.result;run.status='SUCCEEDED';run.events.push({name:'计划约束校验',type:'validation',status:'node_finished',at:now()});}).catch(error=>{if(scope===getGuestSessionId()&&!abort.signal.aborted){run.status='FAILED';run.error=failure(error).error||'规划未完成';}}).finally(()=>controllers.delete(run.id));
  return clone(run);
}
export async function handleGuestAI(method:string,path:string,data:Record<string,unknown>,_params:Record<string,unknown>):Promise<unknown>{
  if(method==='GET'&&path==='/ai/catalog')return catalog();
  if(method==='POST'&&path==='/ai/context-preview')return preview(data);
  if(path==='/ai/sessions'){
    if(method==='GET')return {sessions:clone([...sessions].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,100))};
    if(method==='POST'){const providerId=String(data.providerId);credentials(providerId);if(!data.modelId)fail('请选择聊天模型');const s:AssistantSession={id:id(),title:String(data.title||'新的学习对话').slice(0,80),providerId,modelId:String(data.modelId),scenario:String(data.scenario||'CONCEPT_EXPLAIN'),includeContext:Boolean(data.includeContext),retrievalMode:String(data.retrievalMode||'keyword'),embeddingProviderId:String(data.embeddingProviderId||''),embeddingModelId:String(data.embeddingModelId||''),activeRequestId:'',updatedAt:now()};sessions.push(s);return {session:clone(s)};}
  }
  const session=path.match(/^\/ai\/sessions\/([^/]+)(?:\/(turns|cancel))?$/);
  if(session){const s=sessionById(session[1]);if(method==='GET')return {session:clone(s),turns:clone(turns.filter(t=>t.sessionId===s.id).slice(-100))};if(method==='POST'&&session[2]==='turns')return send(s,data);if(method==='POST'&&session[2]==='cancel'){stop(s);return {ok:true};}if(method==='DELETE'){stop(s);sessions=sessions.filter(x=>x.id!==s.id);turns=turns.filter(t=>t.sessionId!==s.id);return {ok:true};}}
  const note=path.match(/^\/ai\/turns\/([^/]+)\/note$/);if(method==='POST'&&note){const t=turns.find(t=>t.id===note[1]&&t.status==='SUCCEEDED');if(!t)fail('没有可保存的回答','NOT_FOUND',404);const existing=getGuestWorkspace().notes.find(n=>n.id===t.noteId);if(existing)return {note:clone(existing)};if(noteSaves.has(t.id))return noteSaves.get(t.id);const saving=handleGuestData('POST','/notes',{title:t.userText.slice(0,80),content:t.assistantText+'\n\n引用资料快照\n'+t.sources.map((s,i)=>`[资料${i+1}] ${s.title}\n${s.text}`).join('\n\n'),sourceType:'AI_GENERATED',tags:['AI学习',t.modelId.slice(0,50)]},{}).then(result=>{t.noteId=(result as {note:{id:string}}).note.id;return result;}).finally(()=>noteSaves.delete(t.id));noteSaves.set(t.id,saving);return saving;}
  const discover=path.match(/^\/ai\/providers\/([^/]+)\/models$/);if(method==='GET'&&discover){if(discover[1]==='public')return {models:(await catalog()).providers.find(p=>p.id==='public')?.chatModels.map(id=>({id}))||[],note:'公共模型由管理员明确开放。'};const result=await modelAccess.discover(credentials(discover[1])!);return {models:result.models,note:result.note};}
  if(method==='GET'&&path==='/agent/status'){const p=(await catalog()).providers.find(p=>p.configured&&p.chatModels.length);return {configured:Boolean(p),provider:p?.name||''};}
  if(method==='GET'&&path==='/agent/runs')return {runs:clone(runs)};
  if(method==='POST'&&path==='/agent/runs/start')return startRun(data);
  const runPath=path.match(/^\/agent\/runs\/([^/]+)(?:\/(confirm))?$/);
  if(runPath){const run=runs.find(r=>r.id===runPath[1]);if(!run)fail('本次运行记录不存在','NOT_FOUND',404);if(method==='GET')return clone(run);if(method==='POST'&&runPath[2]==='confirm'){
    if(run.status==='CONFIRMED')return {message:'计划已确认，不重复创建任务'};if(run.status!=='SUCCEEDED'||!run.result)fail('只有通过校验的计划可确认');
    const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});if(run.result.tasks.some(t=>t.date<today))fail('计划已过期，请重新生成');
    const validateSources=()=>{
      const w=getGuestWorkspace();if(!w.courses.some(c=>c.id===run.courseId&&!c.isArchived))fail('课程已删除或归档，请重新生成');
      for(const sourceId of new Set(run.result!.tasks.flatMap(t=>t.sourceIds))){
        const snapshot=run.sources.find(s=>s.id===sourceId);if(!snapshot)fail('计划引用无效，请重新生成','CONTEXT_CHANGED',409);
        const node=sourceId.startsWith('kg:')?w.nodes.find(n=>n.id===sourceId.slice(3)&&n.courseId===run.courseId):undefined;
        const note=sourceId.startsWith('note:')?w.notes.find(n=>n.id===sourceId.slice(5)):undefined;
        const item=node||note;
        if(!item||date(item)!==snapshot.updatedAt||(node?node.name:note!.title)!==snapshot.title||(node?node.description:note!.content).slice(0,1800)!==snapshot.text)
          fail('计划引用的资料已修改或删除，请重新生成后确认','CONTEXT_CHANGED',409);
      }
    };
    validateSources();
    // One synchronous claim before the first await prevents concurrent confirmations.
    run.status='CONFIRMING';const scope=getGuestSessionId(),created:string[]=[];
    try{for(const t of run.result.tasks){if(scope!==getGuestSessionId())fail('游客空间已结束','CANCELLED',409);validateSources();const response=await handleGuestData('POST','/tasks',{title:t.title,description:t.description+'\n依据：'+t.sourceIds.join(', '),courseId:run.courseId,knowledgeNodeIds:t.sourceIds.filter(s=>s.startsWith('kg:')).map(s=>s.slice(3)),type:'DEEP_EXPLORATION',priority:3,estimatedMinutes:t.minutes,scheduledAt:t.date+'T09:00:00+08:00'},{});created.push((response as {task:{id:string}}).task.id);}if(scope!==getGuestSessionId())fail('游客空间已结束','CANCELLED',409);validateSources();run.status='CONFIRMED';return {count:created.length,message:'已加入本次游客任务'};}
    catch(error){if(scope===getGuestSessionId()){const w=getGuestWorkspace();w.tasks=w.tasks.filter(t=>!created.includes(t.id));}run.status='SUCCEEDED';throw error;}
  }}
  return undefined;
}
