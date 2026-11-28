import { useEffect, useRef, useState } from 'react';
import type { PlanetDraft, PlanetQuestion, PlanetRegion } from '@keling/shared';
import { requestAI } from '../../services/aiJobs';
import { assistantError } from '../../services/assistant';
import { planetHintContext } from '../../services/planetHints';
import { useModelAccess } from '../../services/modelAccess';
import { NavigationArrow } from '../../components/NavigationArrow';
import { appPath } from '../../services/appPath';

type Provider={id:string;name:string;chatModels:string[];configured:boolean};
type Turn={role:'user'|'assistant';content:string};
export function PlanetHint({draft,region,question}:{draft:PlanetDraft;region:PlanetRegion;question:PlanetQuestion}){
 const access=useModelAccess(),[open,setOpen]=useState(false),[providers,setProviders]=useState<Provider[]>([]),[selection,setSelection]=useState(''),[message,setMessage]=useState(''),[history,setHistory]=useState<Turn[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const abort=useRef<AbortController|null>(null),catalogAbort=useRef<AbortController|null>(null);
 useEffect(()=>()=>{abort.current?.abort();catalogAbort.current?.abort();},[]);
 async function show(){
  setOpen(v=>!v);if(open||providers.length)return;
  const controller=new AbortController();catalogAbort.current=controller;
  try{const result=await requestAI<{providers:Provider[]}>('/trial/workspace/catalog',undefined,controller.signal);if(!controller.signal.aborted){setProviders(result.providers);setSelection(value=>value||result.providers.flatMap(p=>p.chatModels.map(model=>p.id+'\n'+model))[0]||(access.apiKey&&access.model?'byok':''));}}
  catch(e){if(!controller.signal.aborted)setError(assistantError(e));}
 }
 async function send(){
  if(busy||!message.trim()||!selection)return;
  const controller=new AbortController();abort.current=controller;setBusy(true);setError('');
  const questionText=message.trim(),[providerId,model]=selection.split('\n');
  try{
   const result=await requestAI<{answer:string}>('/trial/workspace/chat',{
    ...(selection==='byok'?{providerId:access.providerId,model:access.model,credentials:{providerId:access.providerId,apiKey:access.apiKey,baseUrl:access.baseUrl}}:{providerId,model}),
    scenario:'CASUAL_CHAT',retrievalMode:'selected',history:history.slice(-6).map(turn=>({...turn,content:turn.content.slice(0,3500)})),...planetHintContext(draft,region,question,questionText),
   },controller.signal);
   if(!controller.signal.aborted){if(!result.answer?.trim())throw new Error('星芽未返回提示，请重试。');setHistory(value=>[...value,{role:'user',content:questionText},{role:'assistant',content:result.answer}]);setMessage('');}
  }catch(e){if(!controller.signal.aborted)setError(assistantError(e));}
  finally{if(abort.current===controller){abort.current=null;setBusy(false);}}
 }
 return <div className="planet-hint"><button type="button" aria-expanded={open} onClick={()=>void show()}><img src={appPath('/stellar/scene_companion.webp')} alt=""/>问星芽</button>{open&&<div className="planet-hint-content"><label>提示模型<select value={selection} disabled={busy} onChange={e=>setSelection(e.target.value)}><option value="">选择模型</option>{providers.flatMap(p=>p.chatModels.map(model=><option key={p.id+model} value={p.id+'\n'+model}>{p.name} · {model}</option>))}{access.apiKey&&access.model&&<option value="byok">我的模型 · {access.model}</option>}</select></label><div className="planet-hint-history" aria-live="polite">{history.map((turn,index)=><div key={index} className={'planet-hint-'+turn.role}><strong>{turn.role==='user'?'我':'星芽'}</strong><p>{turn.content}</p></div>)}</div><label>你的问题<textarea rows={3} maxLength={500} value={message} disabled={busy} onChange={e=>setMessage(e.target.value)} placeholder="例如：应该从哪个概念开始想？"/></label>{error&&<p role="alert" className="planet-error">{error}</p>}<div className="planet-actions"><button type="button" disabled={busy||!message.trim()||!selection} onClick={()=>void send()}>{busy?'星芽正在思考…':'请给我一点提示'} <NavigationArrow/></button>{busy&&<button type="button" onClick={()=>{abort.current?.abort();setBusy(false);}}>停止等待</button>}</div></div>}</div>;
}
