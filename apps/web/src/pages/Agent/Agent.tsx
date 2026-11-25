import { ModuleTitle, SectionTitle } from '../../components/ModuleTitle';
import { StellarScene } from '../../components/StellarScene';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import './Agent.css';
import { isGuestSession } from '../../services/guestSession';
import { useModelAccess } from '../../services/modelAccess';
import ModelAccessPanel from '../../components/ModelAccessPanel';

interface Course {id:string;name:string;knowledgeNodeCount:number}
interface RunSummary {id:string;goal:string;status:string;mode:string;createdAt:string}
interface Run extends RunSummary {error:string;events:{name:string;type:string;status:string;at:string}[];sources:{id:string;title:string}[];result:null|{summary:string;tasks:{title:string;description:string;date:string;minutes:number;sourceIds:string[]}[]}}
const labels:Record<string,string>={RUNNING:'正在规划',FAILED:'未生成计划',SUCCEEDED:'待确认',CONFIRMED:'已加入任务'};
const events:Record<string,string>={sources_retrieved:'已检索资料',node_started:'开始执行',node_finished:'执行完成',workflow_started:'工作流开始',workflow_finished:'工作流结束',start:'运行开始',end:'运行结束',plugin_start:'工具开始',plugin_end:'工具完成'};
const message=(e:unknown)=>{const v=e as {response?:{data?:{error?:string}}};return v.response?.data?.error||'连接失败，请检查网络后重试';};
const dateAfter=(days:number)=>new Date(Date.now()+days*86400000).toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});

export default function Agent(){
 const guest=isGuestSession();
 const accessRevision=useModelAccess(s=>`${s.revision}:${s.model}`);
 const [courses,setCourses]=useState<Course[]>([]), [history,setHistory]=useState<RunSummary[]>([]), [run,setRun]=useState<Run|null>(null);
 const [courseId,setCourse]=useState(''),[goal,setGoal]=useState(''),[date,setDate]=useState(()=>dateAfter(7)),[minutes,setMinutes]=useState(60),[mode,setMode]=useState('plan');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[configured,setConfigured]=useState<boolean|null>(null),[provider,setProvider]=useState('');
 const [courseName,setCourseName]=useState(''),[sourceTitle,setSourceTitle]=useState(''),[sourceText,setSourceText]=useState(''),[reload,setReload]=useState(0),[pollRetry,setPollRetry]=useState(0);
 const selection=useRef(0);
 useEffect(()=>{
   const controller=new AbortController();
   Promise.all([api.get('/courses',{signal:controller.signal}),api.get('/agent/status',{signal:controller.signal}),api.get('/agent/runs',{signal:controller.signal})]).then(([c,s,h])=>{
     setCourses(c.data.courses);setConfigured(s.data.configured);setProvider(s.data.provider||'');setHistory(h.data.runs);
   }).catch(e=>{if(!controller.signal.aborted)setError(message(e));});
   return ()=>controller.abort();
 },[reload,accessRevision]);
 const runId=run?.id,runStatus=run?.status;
 useEffect(()=>{
   if(!runId||runStatus!=='RUNNING')return;
   const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
   const poll=async()=>{
     try{
       const {data}=await api.get<Run>(`/agent/runs/${runId}`,{signal:controller.signal});
       if(controller.signal.aborted)return;
       setRun(current=>current?.id===runId?data:current);
       if(data.status==='RUNNING')timer=setTimeout(poll,3000);else setReload(value=>value+1);
     }catch(e){if(!controller.signal.aborted)setError(message(e)+'；可刷新或从历史重试。');}
   };
   timer=setTimeout(poll,1000);
   return ()=>{controller.abort();clearTimeout(timer);};
 },[runId,runStatus,pollRetry]);
 const refresh=()=>{setError('');setReload(v=>v+1);setPollRetry(v=>v+1);};
 const openRun=async(id:string)=>{
   const request=++selection.current;setError('');
   try{const {data}=await api.get<Run>(`/agent/runs/${id}`);if(request===selection.current)setRun(data);}catch(e){if(request===selection.current)setError(message(e));}
 };
 const perform=async(action:()=>Promise<void>)=>{if(busy)return;setBusy(true);setError('');setNotice('');try{await action();setReload(v=>v+1);}catch(e){setError(message(e));}finally{setBusy(false);}};
 const submit=(e:React.FormEvent)=>{e.preventDefault();void perform(async()=>{selection.current++;const {data}=await api.post<Run>('/agent/runs/start',{courseId,goal,examDate:date,dailyMinutes:minutes,mode});setRun(data);});};
 const confirm=()=>{if(!run)return;void perform(async()=>{await api.post(`/agent/runs/${run.id}/confirm`);await openRun(run.id);setNotice(guest?'已加入任务，刷新或退出清除。':'已加入任务。');});};
 const createCourse=(e:React.FormEvent)=>{e.preventDefault();void perform(async()=>{const {data}=await api.post('/courses',{name:courseName.trim()});setCourse(data.course.id);setCourseName('');setNotice('课程已创建。');});};
 const addSource=(e:React.FormEvent)=>{e.preventDefault();void perform(async()=>{await api.post(`/knowledge/${courseId}/nodes`,{name:sourceTitle.trim(),description:sourceText.trim()});setSourceTitle('');setSourceText('');setNotice('资料已保存。');});};
 const selected=courses.find(c=>c.id===courseId);
 return <div className="agent-page">
  <header className="agent-hero"><div><ModuleTitle kind="voyage">智能编排</ModuleTitle></div><span className={`agent-badge ${configured?'ready':''}`}>{configured===null?'正在连接':configured?`${provider} 已配置`:'规划服务未配置'}</span></header>
  {configured===false&&<p role="status" className="agent-notice">{guest?'请先配置 API Key 与聊天模型。':'规划服务未配置。'}</p>}
  {guest&&<details className="agent-panel"><summary>配置模型</summary><ModelAccessPanel variant="configuration" title="规划模型"/><p>规划时发送课程资料与任务记录至模型服务商，可能计费。</p></details>}
  {error&&<div role="alert" className="agent-error">{error} <button type="button" onClick={refresh}>重试</button></div>}
  {notice&&<p role="status" className="agent-notice">{notice}</p>}
  <div className="agent-columns"><section className="agent-panel"><SectionTitle kind="voyage">学习目标</SectionTitle><form onSubmit={submit}>
   <label>课程<select required value={courseId} onChange={e=>setCourse(e.target.value)}><option value="">选择课程</option>{courses.map(c=><option key={c.id} value={c.id}>{c.name} · {c.knowledgeNodeCount} 个知识点</option>)}</select></label>
   {selected?.knowledgeNodeCount===0&&<p className="agent-hint">请先添加课程资料。</p>}
   <label>学习目标<textarea required minLength={2} maxLength={1200} value={goal} onChange={e=>setGoal(e.target.value)} placeholder="例如：一周掌握二叉树遍历"/></label>
   <div className="agent-row"><label>目标日期<input required type="date" min={dateAfter(0)} max={dateAfter(90)} value={date} onChange={e=>setDate(e.target.value)}/></label><label>每日时长（分钟）<input required type="number" min={10} max={480} value={minutes} onChange={e=>setMinutes(Number(e.target.value))}/></label></div>
   <label>规划方式<select value={mode} onChange={e=>setMode(e.target.value)}><option value="plan">学习计划</option><option value="review">学习复盘</option></select></label>
   <button className="agent-primary" disabled={busy||configured!==true||run?.status==='RUNNING'}>{busy?'正在提交…':run?.status==='RUNNING'?'正在规划…':'开始规划'}</button>
   <p className="agent-hint">确认计划后加入任务。</p>
  </form>
  <details className="agent-material"><summary>添加课程与资料</summary><form onSubmit={createCourse}><label>新课程名称<input required maxLength={120} value={courseName} onChange={e=>setCourseName(e.target.value)} placeholder="例如：数据结构"/></label><button disabled={busy}>创建课程</button></form><form onSubmit={addSource}><label>知识点名称<input required maxLength={180} value={sourceTitle} onChange={e=>setSourceTitle(e.target.value)}/></label><label>学习内容<textarea required maxLength={1800} value={sourceText} onChange={e=>setSourceText(e.target.value)} placeholder="粘贴课堂笔记、概念说明或练习要求"/></label><button disabled={busy||!courseId}>保存到课程</button></form></details>
  <div className="agent-section-heading"><SectionTitle kind="voyage">运行历史</SectionTitle><button onClick={refresh} disabled={busy}>刷新</button></div>
  {history.length===0?<p className="agent-hint">暂无记录</p>:history.map(h=><button className={`agent-history ${h.id===run?.id?'selected':''}`} key={h.id} disabled={busy} onClick={()=>void openRun(h.id)}>{h.goal}<small>{labels[h.status]||h.status} · {new Date(h.createdAt).toLocaleString('zh-CN')}</small></button>)}
  </section><section className="agent-panel agent-result" aria-live="polite"><div className="agent-section-heading"><SectionTitle kind="voyage">学习计划</SectionTitle><Link to="/tasks">查看任务 →</Link></div>
   {!run&&<div className="agent-empty"><StellarScene scene="planning" decorative/><div><span>暂无计划</span></div></div>}
   {run&&<><StellarScene scene="planning" className="agent-run-art" decorative/><span className={`agent-badge ${run.status==='FAILED'?'failed':'ready'}`}>{labels[run.status]||run.status}</span><h3>{run.goal}</h3>{run.status==='RUNNING'&&<p role="status" className="agent-notice">正在规划…</p>}{run.error&&<p className="agent-error">{run.error}</p>}
   {run.result&&<><p className="agent-summary">{run.result.summary}</p><p className="agent-hint">共 {run.result.tasks.length} 项 · {run.result.tasks.reduce((sum,t)=>sum+t.minutes,0)} 分钟</p><div className="agent-tasks">{run.result.tasks.map((t,i)=><article key={i}><span>{t.date} · {t.minutes} 分钟</span><h3>{t.title}</h3><p>{t.description}</p><small>依据：{t.sourceIds.map(id=>run.sources.find(s=>s.id===id)?.title||id).join('、')}</small></article>)}</div>{run.status==='SUCCEEDED'&&<button className="agent-primary" disabled={busy} onClick={confirm}>确认并加入任务</button>}{run.status==='CONFIRMED'&&<Link className="agent-primary" to="/tasks">查看任务</Link>}</>}
   <SectionTitle kind="voyage">执行记录</SectionTitle>{run.events.length?<ol className="agent-trace">{run.events.map((e,i)=><li key={i}><strong>{e.name}</strong><small>{events[e.status]||e.status} · {new Date(e.at).toLocaleTimeString('zh-CN')}</small></li>)}</ol>:<p className="agent-hint">等待执行记录…</p>}</>}
  </section></div>
 </div>;
}
