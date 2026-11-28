import { openStory } from '../../services/story';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PlanetArtwork } from './PlanetArtwork';
import { PlanetRegenerate } from './PlanetRegenerate';
import { ModuleTitle, SectionTitle } from '../../components/ModuleTitle';
import { NavigationArrow, SelectFrame } from '../../components/NavigationArrow';
import ModelAccessPanel from '../../components/ModelAccessPanel';
import { appPath } from '../../services/appPath';
import { useAppStore } from '../../store/useAppStore';
import { useModelAccess } from '../../services/modelAccess';
import { seedGuestSample } from '../../services/guestData';
import { planetAPI, planetError } from '../../services/planets';
import type { PlanetGeneration, PlanetProvider, PlanetRecord } from '../../services/planets';
import { noteAPI, taskAPI } from '../../services/api';
import { PlanetResearch } from './PlanetResearch';
import { PlanetGraphPreview } from './PlanetGraphPreview';
import { PlanetPractice, type PracticeRecord } from './PlanetPractice';
import { describeResponse } from './practiceAnswers';
import './Planets.css';

export function PlanetStart() {
  const navigate=useNavigate(), [query]=useSearchParams(), {user,loadCourses,loadTasks}=useAppStore();
  const [subject,setSubject]=useState(query.get('subject')||''),[level,setLevel]=useState('初学者'),[goal,setGoal]=useState('');
  const [providers,setProviders]=useState<PlanetProvider[]>([]),[selection,setSelection]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[draft,setDraft]=useState<PlanetGeneration|null>(null);
  const [contextMode,setContextMode]=useState<'auto'|'general'|'internet_culture'>('auto'),[questionCount,setQuestionCount]=useState<6|12|18>(12);
  const access=useModelAccess(), abort=useRef<AbortController|null>(null), confirmation=useRef('');
  useEffect(()=>{const a=new AbortController();void planetAPI.catalog(a.signal).then(r=>setProviders(r.providers.filter(p=>p.configured))).catch(e=>{if(!a.signal.aborted)setError(planetError(e));});return()=>{a.abort();abort.current?.abort();};},[]);
  async function generate(){if(busy||!subject.trim())return;setBusy(true);setError('');const a=new AbortController();abort.current=a;try{
    const [providerId,model]=selection.split('\n');
    const result=await planetAPI.generate({subject:subject.trim(),level:level.trim(),goal:goal.trim(),contextMode,questionCount,generateArtwork:true,...(selection==='byok'?{model:access.model,credentials:{providerId:access.providerId,apiKey:access.apiKey,baseUrl:access.baseUrl}}:selection?{providerId,model}:{})},a.signal);
    if(a.signal.aborted)return;setDraft(result);confirmation.current=crypto.randomUUID();
  }catch(e){if(!a.signal.aborted)setError(planetError(e));}finally{if(abort.current===a){setBusy(false);abort.current=null;}}}
  async function confirm(){if(!draft||busy)return;setBusy(true);setError('');try{const p=await planetAPI.confirm(draft,confirmation.current);await Promise.all([loadCourses(),loadTasks()]);navigate('/planets/'+encodeURIComponent(p.id));}catch(e){setError(planetError(e));}finally{setBusy(false);}}
  return <div className="planet-page"><header className="planet-heading"><ModuleTitle kind="courses">{draft?'你的学习星球，准备启航':'第一颗星球，由你选择'}</ModuleTitle><div className="planet-actions"><button onClick={openStory} disabled={busy}>回看序章</button><Link to="/planets">我的星图</Link></div></header>
    {error&&<p role="alert" className="planet-error">{error}</p>}
    {!draft?<div className="planet-create-layout"><form className="planet-panel planet-create-form" onSubmit={e=>{e.preventDefault();void generate();}}><label>想探索的主题<input autoComplete="off" autoFocus value={subject} maxLength={80} onChange={e=>setSubject(e.target.value)} placeholder="例如：天文学、英语、奶龙学" disabled={busy} required/></label><div className="planet-subjects">{['天文学','英语','奶龙学','中国古代史'].map(s=><button type="button" key={s} disabled={busy} onClick={()=>setSubject(s)}>{s}</button>)}</div><div className="planet-generation-options"><label>探索语境<SelectFrame><select value={contextMode} onChange={e=>setContextMode(e.target.value as typeof contextMode)} disabled={busy}><option value="auto">自动识别</option><option value="general">学科与科普</option><option value="internet_culture">网络文化与流行语</option></select></SelectFrame></label><label>练习数量<SelectFrame><select value={questionCount} onChange={e=>setQuestionCount(Number(e.target.value) as 6|12|18)} disabled={busy}><option value={6}>6 题 · 轻量探索</option><option value={12}>12 题 · 完整探索</option><option value={18}>18 题 · 深入探索</option></select></SelectFrame></label></div><label>目前基础<SelectFrame><select value={level} onChange={e=>setLevel(e.target.value)} disabled={busy}><option>初学者</option><option>有一些基础</option><option>希望深入学习</option></select></SelectFrame></label><label>这次想学到什么<input value={goal} onChange={e=>setGoal(e.target.value)} placeholder="可选，例如：了解它在网络上的用法与语境" maxLength={300} disabled={busy}/></label><label>生成模型<SelectFrame><select value={selection} onChange={e=>setSelection(e.target.value)} disabled={busy}><option value="">平台默认模型</option>{providers.flatMap(p=>p.chatModels.map(m=><option key={p.id+m} value={p.id+'\n'+m}>{p.name} · {m}</option>))}<option value="byok">使用我的 API Key</option></select></SelectFrame></label>
    {selection==='byok'&&<ModelAccessPanel variant="configuration" scopeKey={user?.id||'guest'} title="连接生成模型"/>}
    <div className="planet-actions"><button className="planet-primary" disabled={busy||!subject.trim()||(selection==='byok'&&(!access.apiKey||!access.model))}>{busy?'正在绘制学习星球…':'生成我的学习星球'} <NavigationArrow/></button>{busy&&<button type="button" onClick={()=>{abort.current?.abort();setBusy(false);setError('已停止等待，输入内容已保留。');}}>停止等待</button>}</div><p className="planet-fine">主题将用于联网检索，并与目标一起发送给所选模型。</p></form><aside className="planet-intro-art"><img src={appPath('/stellar/scene_arrival.webp')} alt="星芽准备探索一颗新的知识星球"/><h2>好奇由你定义，航程由此展开</h2><p>检索资料，理解语境，动手探索</p></aside></div>:<><section className="planet-panel planet-preview-hero"><PlanetArtwork draft={draft.draft} size={180}/><div><span className="planet-step">{draft.draft.subject} · {draft.draft.level}</span><h2>{draft.draft.title}</h2><p>{draft.draft.story}</p><span className="planet-fine">AI 生成 · 尚未人工审核</span><PlanetRegenerate kind="artwork" busy={busy} setBusy={setBusy} setError={setError} onRegenerate={async(instruction,requestId,signal)=>{setDraft(await planetAPI.regeneratePreview(draft,'artwork',instruction,requestId,undefined,signal));confirmation.current=crypto.randomUUID();}}/></div></section><PlanetResearch draft={draft.draft}/><PlanetGraphPreview draft={draft.draft}/><ol className="planet-region-grid">{draft.draft.regions.map((r,i)=><li className="planet-panel" key={r.id}><span className="planet-step">区域 {i+1}</span><h3>{r.title}</h3><p>{r.description}</p><ul>{r.objectives.map(o=><li key={o}>{o}</li>)}</ul><span>{r.estimatedMinutes} 分钟 · {r.questions.length} 个探索练习</span><details className="planet-preview-questions"><summary>查看练习</summary>{r.questions.map(q=><div key={q.id}><h4>{q.prompt}</h4><PlanetRegenerate kind="question" busy={busy} setBusy={setBusy} setError={setError} onRegenerate={async(instruction,requestId,signal)=>{setDraft(await planetAPI.regeneratePreview(draft,'question',instruction,requestId,q.id,signal));confirmation.current=crypto.randomUUID();}}/></div>)}</details></li>)}</ol><div className="planet-actions"><button className="planet-primary" disabled={busy} onClick={()=>void confirm()}>{busy?'正在保存星球…':'确认星球，开始探索'} <NavigationArrow/></button><button disabled={busy} onClick={()=>setDraft(null)}>调整主题与目标</button></div></>}
  </div>;
}

export function PlanetHub(){
 const {loadCourses,isGuest}=useAppStore(),navigate=useNavigate();const [planets,setPlanets]=useState<PlanetRecord[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0);
 useEffect(()=>{let alive=true;void planetAPI.list().then(p=>{if(alive){setPlanets(p);setError('');}}).catch(e=>{if(alive)setError(planetError(e));}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[retry]);
 async function sample(){if(isGuest){seedGuestSample();await loadCourses();}navigate('/voyage/sample');}
 return <div className="planet-page"><header className="planet-heading"><ModuleTitle kind="courses">你的知识星海</ModuleTitle><Link className="planet-primary" to="/start">生成学习星球 <NavigationArrow/></Link></header>{error&&<p role="alert" className="planet-error">{error} <button onClick={()=>{setLoading(true);setRetry(v=>v+1);}}>重新读取</button></p>}{loading?<p role="status">正在读取星图…</p>:<div className="planet-region-grid">{planets.map(p=><Link className="planet-panel planet-card" to={'/planets/'+encodeURIComponent(p.id)} key={p.id}><PlanetArtwork draft={p.draft} size={140}/><h2>{p.draft.title}</h2><p>{p.draft.subject}</p><span>已探索 {p.progress.completedRegionIds.length} / {p.draft.regions.length} 个区域</span><NavigationArrow/></Link>)}</div>}{!loading&&!error&&!planets.length&&<section className="planet-empty"><img src={appPath('/stellar/scene_intro_plan.webp')} alt="等待探索的知识星海"/><div><h2>星图的第一笔，交给你</h2><p>输入想探索的主题，开启一颗学习星球。</p><Link className="planet-primary" to="/start">开始首次远航 <NavigationArrow/></Link></div></section>}<div className="planet-actions"><Link to="/greenhouse">全部课程资料</Link><button onClick={()=>void sample()}>体验二叉树示例</button><Link to="/start">回看开场故事</Link></div></div>;
}

export function PlanetExplore(){
 const {id=''}=useParams(),{loadNotes,loadTasks}=useAppStore();
 const [planet,setPlanet]=useState<PlanetRecord|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[region,setRegion]=useState(0),[question,setQuestion]=useState(0),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0),[practice,setPractice]=useState<PracticeRecord|null>(null);
 useEffect(()=>{let alive=true;setPlanet(null);setError('');void planetAPI.get(id).then(p=>{if(alive){setPlanet(p);setRegion(Math.max(0,p.draft.regions.findIndex(r=>!p.progress.completedRegionIds.includes(r.id))));setQuestion(0);setPractice(null);}}).catch(e=>{if(alive)setError(planetError(e));});return()=>{alive=false;};},[id,retry]);
 const r=planet?.draft.regions[region],q=r?.questions[question];
 function switchRegion(index:number){setRegion(index);setQuestion(0);setPractice(null);setNotice('');}
 function switchQuestion(index:number){setQuestion(index);setPractice(null);setNotice('');}
 function nextQuestion(){
  if(!planet||!r)return;
  if(question+1<r.questions.length){switchQuestion(question+1);return;}
  const missing=r.questions.findIndex(item=>{const a=planet.progress.answers[item.id];return !(a?.correct||((item.kind==='short_answer')&&a?.reviewed));});
  if(missing>=0){switchQuestion(missing);setNotice('继续完成本区域的练习。');return;}
  if(region+1<planet.draft.regions.length)switchRegion(region+1);
  else setNotice('本次探索已记录。可以回看各区域，或保存下一次的学习目标。');
 }
 async function save(kind:'note'|'task'){
  if(!planet||!r||busy)return;setBusy(true);setError('');
  try{
   if(kind==='note'){
    const answer=practice?`本次练习：${practice.question.prompt}\n我的回答：${describeResponse(practice.question,practice.response)}\n参考解析：${practice.feedback.explanation}${practice.feedback.referenceAnswer?'\n参考答案：'+practice.feedback.referenceAnswer:''}\n\n`:'';
    const sources=planet.draft.research?.sources.map(s=>`${s.title}：${s.url}`).join('\n');
    await noteAPI.create({title:`航行日志：${r.title}`,content:`${planet.draft.subject}\n\n${r.lesson}\n\n${answer}下一次探索：${r.objectives.join('；')}${sources?'\n\n参考资料\n'+sources:''}\n\nAI 生成学习内容，需结合资料核对。`,sourceType:'AI_GENERATED',tags:['课灵航行日志',planet.draft.subject]});
    await loadNotes();setNotice('已存入航行日志。');
   }else{
    await taskAPI.create({title:`继续探索：${r.title}`,description:r.objectives.join('\n'),courseId:planet.courseId,type:'DEEP_EXPLORATION',estimatedMinutes:r.estimatedMinutes,rewards:{energy:0,crystals:0,exp:0}});await loadTasks();setNotice('已加入学习任务。');
   }
  }catch(e){setError(planetError(e));}finally{setBusy(false);}
 }
 return <div className="planet-page">
  {error&&<p role="alert" className="planet-error">{error} {!planet&&<button onClick={()=>setRetry(v=>v+1)}>重新读取</button>}</p>}
  {notice&&<p role="status" className="planet-notice">{notice}</p>}
  {!planet||!r||!q?!error&&<p role="status">正在进入星球…</p>:<>
   <header className="planet-heading"><ModuleTitle kind="voyage">{planet.draft.title}</ModuleTitle><Link to="/planets">返回星图 <NavigationArrow direction="left"/></Link></header>
   <section className="planet-panel planet-preview-hero"><PlanetArtwork draft={planet.draft} size={130}/><div><p>{planet.draft.story}</p><strong>已探索 {planet.progress.completedRegionIds.length} / {planet.draft.regions.length} 个区域</strong><p className="planet-fine">AI 生成练习 · 参考答案尚未人工审核</p><PlanetRegenerate kind="artwork" busy={busy} setBusy={setBusy} setError={setError} onRegenerate={async(instruction,requestId,signal)=>{setPlanet(await planetAPI.regenerate(planet.id,'artwork',instruction,requestId,undefined,signal));}}/></div></section>
   <PlanetResearch draft={planet.draft}/><PlanetGraphPreview draft={planet.draft}/>
   <nav className="planet-region-nav" aria-label="知识区域">{planet.draft.regions.map((item,i)=><button disabled={busy||item.prerequisiteIds.some(key=>!planet.progress.completedRegionIds.includes(key))} aria-current={region===i?'step':undefined} onClick={()=>switchRegion(i)} key={item.id}>{i+1}. {item.title}{planet.progress.completedRegionIds.includes(item.id)?' · 已探索':item.prerequisiteIds.some(key=>!planet.progress.completedRegionIds.includes(key))?' · 待解锁':''}</button>)}</nav>
   <div className="planet-learning-layout"><article className="planet-panel"><SectionTitle kind="courses">{r.title}</SectionTitle><p>{r.description}</p><div className="planet-lesson">{r.lesson}</div><ul>{r.objectives.map(o=><li key={o}>{o}</li>)}</ul><div className="planet-actions"><button disabled={busy} onClick={()=>void save('note')}>保存航行日志</button><button disabled={busy} onClick={()=>void save('task')}>加入下次任务</button><Link to={`/greenhouse/${planet.courseId}`}>课程资料</Link></div></article>
   <PlanetPractice key={planet.id+':'+r.id+':'+q.id} planet={planet} regionIndex={region} questionIndex={question} busy={busy} setBusy={setBusy} setError={setError} onPlanet={value=>{setPlanet(value);setPractice(null);}} onNext={nextQuestion} onQuestion={switchQuestion} onResponse={setPractice}/></div>
  </>}
 </div>;
}
