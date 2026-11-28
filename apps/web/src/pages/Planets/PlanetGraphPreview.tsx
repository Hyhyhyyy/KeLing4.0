import { useEffect, useMemo, useRef, useState } from 'react';
import type { PlanetDraft } from '@keling/shared';
import { SectionTitle } from '../../components/ModuleTitle';
import { appPath } from '../../services/appPath';
import { QuestionSources } from './PlanetResearch';

export function PlanetGraphPreview({draft}:{draft:PlanetDraft}){
 const frame=useRef<HTMLIFrameElement>(null),[ready,setReady]=useState(false),[rendered,setRendered]=useState(false),[selected,setSelected]=useState(''),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const graph=draft.knowledgeGraph,courseId='preview-'+draft.id,sessionId=useMemo(()=>draft.id+':'+retry+':'+crypto.randomUUID(),[draft.id,retry]);
 useEffect(()=>{const receive=(event:MessageEvent)=>{if(event.origin!==window.location.origin||event.source!==frame.current?.contentWindow)return;const data=event.data;if(!data||data.protocol!==1)return;if(data.type==='keling-graph:ready'){setReady(true);return;}if(data.sessionId!==sessionId||data.courseId!==courseId)return;if(data.type==='keling-graph:readyState'){setRendered(true);setError('');}if(data.type==='keling-graph:selected')setSelected(typeof data.nodeId==='string'?data.nodeId:'');if(data.type==='keling-graph:error')setError(typeof data.message==='string'?data.message:'图谱未能载入');};window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);},[sessionId,courseId]);
 useEffect(()=>{if(!graph||rendered)return;const timer=setTimeout(()=>setError('图谱加载超时，可以重新载入。'),15000);return()=>clearTimeout(timer);},[graph,rendered,sessionId]);
 useEffect(()=>{if(ready&&graph)frame.current?.contentWindow?.postMessage({protocol:1,type:'keling-graph:init',courseId,sessionId,readOnly:true,layoutSaved:false,savedNodeIds:[],nodes:graph.nodes.map(n=>({id:n.id,name:n.title,description:n.summary,parentIds:graph.edges.filter(e=>e.kind==='hierarchy'&&e.target===n.id).map(e=>e.source),masteryLevel:0,difficulty:1,positionX:.5,positionY:.5})),edges:graph.edges},window.location.origin);},[ready,graph,courseId,sessionId]);
 if(!graph)return null;
 const node=graph.nodes.find(n=>n.id===selected);
 return <section className="planet-panel planet-graph-preview"><SectionTitle kind="courses">这次探索的知识星图</SectionTitle><p className="planet-graph-legend"><span>实线：知识层级</span><span>虚线：跨主题关联</span></p>{error?<p role="alert" className="planet-error">{error} <button onClick={()=>{setError('');setReady(false);setRendered(false);setRetry(v=>v+1);}}>重新载入图谱</button></p>:!rendered&&<p role="status">正在绘制知识星图…</p>}<iframe key={sessionId} ref={frame} src={appPath('/graph-editor/index.html')} title={`${draft.subject}的知识图谱预览`} referrerPolicy="no-referrer" onError={()=>setError('图谱未能载入，可以重试。')}/>{node?<article className="planet-graph-selected"><h3>{node.title}</h3><p>{node.summary}</p><QuestionSources draft={draft} ids={node.sourceIds}/></article>:<p className="planet-fine">选择知识点查看内容与来源；确认星球后可在课程中编辑。</p>}</section>;
}
