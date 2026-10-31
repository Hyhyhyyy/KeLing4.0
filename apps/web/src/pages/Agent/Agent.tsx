import { appPath } from '../../services/appPath';
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
const labels:Record<string,string>={RUNNING:'正在规划',FAILED:'未生成计划',SUCCEEDED:'等待你确认',CONFIRMED:'已加入学习任务'};
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
     }catch(e){if(!controller.signal.aborted)setError(message(e)+'；运行已保留，可重试刷新或从历史恢复。');}
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
 const confirm=()=>{if(!run)return;void perform(async()=>{await api.post(`/agent/runs/${run.id}/confirm`);await openRun(run.id);setNotice(guest?'计划已加入本次游客任务，刷新或退出清除。':'计划已保存，手机和网页可使用同一账户查看。');});};
 const createCourse=(e:React.FormEvent)=>{e.preventDefault();void perform(async()=>{const {data}=await api.post('/courses',{name:courseName.trim()});setCourse(data.course.id);setCourseName('');setNotice('课程已创建，接下来添加真实学习资料。');});};
 const addSource=(e:React.FormEvent)=>{e.preventDefault();void perform(async()=>{await api.post(`/knowledge/${courseId}/nodes`,{name:sourceTitle.trim(),description:sourceText.trim()});setSourceTitle('');setSourceText('');setNotice('资料已保存到课程知识图谱，可用于规划。');});};
 const selected=courses.find(c=>c.id===courseId);
 return <div className="agent-page">
  <header className="agent-hero"><img className="agent-stellar-mascot" src={appPath("/stellar/mascot_mentor.png")} alt="星芽知识领航员" /><div><p className="agent-eyebrow">课灵 / 智学工作台</p><h1>有依据地学，有节奏地进步</h1><p>从你的课程资料出发，把目标拆成每天可完成的行动。</p></div><span className={`agent-badge ${configured?'ready':''}`}>{configured===null?'连接服务中':configured?`${provider} 已配置`:'规划服务未配置'}</span></header>
  <ol className="agent-steps" aria-label="学习流程"><li><b>01</b> 准备课程资料</li><li><b>02</b> 生成可追溯计划</li><li><b>03</b> 确认并执行任务</li><li><b>04</b> 根据记录复盘</li></ol>
  {configured===false&&<p role="status" className="agent-notice">{guest?'先配置本次游客使用的 API Key 和聊天模型，即可基于本次课程资料生成计划。':'暂时无法生成 AI 计划。你仍可整理资料和查看历史；管理员需配置华为 AgentArts 或 DeepSeek 服务。'}</p>}
  {guest&&<details className="agent-panel"><summary>输入 API Key · 配置规划模型</summary><ModelAccessPanel variant="configuration" title="本次游客规划模型"/><p>点击开始规划后发送这门课程检索到的资料与任务记录，可能消耗服务商额度；计划经日期、时长和来源校验后，仍需你确认才能加入任务。</p></details>}
  {error&&<div role="alert" className="agent-error">{error} <button type="button" onClick={refresh}>重试刷新</button></div>}
  {notice&&<p role="status" className="agent-notice">{notice}</p>}
  <div className="agent-columns"><section className="agent-panel"><h2>本次学习目标</h2><form onSubmit={submit}>
   <label>课程<select required value={courseId} onChange={e=>setCourse(e.target.value)}><option value="">{guest?'选择本次课程':'选择云端课程'}</option>{courses.map(c=><option key={c.id} value={c.id}>{c.name} · {c.knowledgeNodeCount} 个知识点</option>)}</select></label>
   {selected?.knowledgeNodeCount===0&&<p className="agent-hint">先在下方添加知识点或关联笔记，让计划有真实依据。</p>}
   <label>希望掌握什么<textarea required minLength={2} maxLength={1200} value={goal} onChange={e=>setGoal(e.target.value)} placeholder="例如：一周内掌握二叉树遍历，能独立完成三道练习"/></label>
   <div className="agent-row"><label>目标日期<input required type="date" min={dateAfter(0)} max={dateAfter(90)} value={date} onChange={e=>setDate(e.target.value)}/></label><label>每天分钟<input required type="number" min={10} max={480} value={minutes} onChange={e=>setMinutes(Number(e.target.value))}/></label></div>
   <label>规划方式<select value={mode} onChange={e=>setMode(e.target.value)}><option value="plan">生成学习计划</option><option value="review">结合完成记录复盘</option></select></label>
   <button className="agent-primary" disabled={busy||configured!==true||run?.status==='RUNNING'}>{busy?'正在提交…':run?.status==='RUNNING'?'规划正在运行':'开始规划'}</button>
   <p className="agent-hint">仅在你确认后写入任务。生成期间可离开页面，从运行历史继续查看。</p>
  </form>
  <details className="agent-material"><summary>添加课程与学习资料</summary><form onSubmit={createCourse}><label>新课程名称<input required maxLength={120} value={courseName} onChange={e=>setCourseName(e.target.value)} placeholder="例如：数据结构"/></label><button disabled={busy}>创建课程</button></form><form onSubmit={addSource}><p>资料将加入上方选中的课程。</p><label>知识点名称<input required maxLength={180} value={sourceTitle} onChange={e=>setSourceTitle(e.target.value)}/></label><label>学习内容<textarea required maxLength={1800} value={sourceText} onChange={e=>setSourceText(e.target.value)} placeholder="粘贴课堂笔记、概念说明或练习要求"/></label><button disabled={busy||!courseId}>保存到课程</button></form></details>
  <div className="agent-section-heading"><h2>运行历史</h2><button onClick={refresh} disabled={busy}>刷新</button></div>
  {history.length===0?<p className="agent-hint">还没有运行记录。先准备课程资料，再开始第一份计划。</p>:history.map(h=><button className={`agent-history ${h.id===run?.id?'selected':''}`} key={h.id} disabled={busy} onClick={()=>void openRun(h.id)}>{h.goal}<small>{labels[h.status]||h.status} · {new Date(h.createdAt).toLocaleString('zh-CN')}</small></button>)}
  </section><section className="agent-panel agent-result" aria-live="polite"><div className="agent-section-heading"><h2>计划与执行依据</h2><Link to="/tasks">查看任务 →</Link></div>
   {!run&&<div className="agent-empty"><StellarScene scene="planning" decorative/><div><span>从一个目标开始</span><p>计划会列出每天的学习内容、时长和引用资料。完成任务后，选择复盘，下一次规划会参考你的实际完成记录。</p><p>同一账户可在 Kotlin Android 客户端与网页工作台继续学习。</p></div></div>}
   {run&&<><StellarScene scene="planning" className="agent-run-art" decorative/><span className={`agent-badge ${run.status==='FAILED'?'failed':'ready'}`}>{labels[run.status]||run.status}</span><h3>{run.goal}</h3>{run.status==='RUNNING'&&<p role="status" className="agent-notice">正在检索和规划，执行轨迹自动更新。断网后可以从历史恢复查看。</p>}{run.error&&<p className="agent-error">{run.error}</p>}
   {run.result&&<><p className="agent-summary">{run.result.summary}</p><p className="agent-hint">共 {run.result.tasks.length} 项 · {run.result.tasks.reduce((sum,t)=>sum+t.minutes,0)} 分钟 · 请检查是否符合你的实际安排</p><div className="agent-tasks">{run.result.tasks.map((t,i)=><article key={i}><span>{t.date} · {t.minutes} 分钟</span><h3>{t.title}</h3><p>{t.description}</p><small>依据：{t.sourceIds.map(id=>run.sources.find(s=>s.id===id)?.title||id).join('、')}</small></article>)}</div>{run.status==='SUCCEEDED'&&<button className="agent-primary" disabled={busy} onClick={confirm}>确认这份计划并加入任务</button>}{run.status==='CONFIRMED'&&<Link className="agent-primary" to="/tasks">前往完成学习任务</Link>}</>}
   <h2>实际执行轨迹</h2>{run.events.length?<ol className="agent-trace">{run.events.map((e,i)=><li key={i}><strong>{e.name}</strong><small>{events[e.status]||e.status} · {new Date(e.at).toLocaleTimeString('zh-CN')}</small></li>)}</ol>:<p className="agent-hint">等待服务返回执行事件。</p>}</>}
  </section></div>
 </div>;
}
