import { NavigationArrow, SelectFrame } from '../../components/NavigationArrow';
import { ModuleTitle } from '../../components/ModuleTitle';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { knowledgeAPI } from '../../services/api';
import { appPath } from '../../services/appPath';
import type { KnowledgeNode } from '../../types';
import { assistantError } from '../../services/assistant';
import { useCourseDialogFocus } from '../../components/useCourseDialogFocus';
import './KnowledgeGraph.css';

type NodeDraft = Pick<KnowledgeNode, 'name' | 'description' | 'parentIds' | 'masteryLevel' | 'difficulty'>;
type Position = {id:string;positionX:number;positionY:number};
type GraphData = {nodes:KnowledgeNode[];layoutSaved:boolean;savedNodeIds:string[];layoutUpdatedAt:string|null;preserveLayout?:boolean};
const blankDraft = (): NodeDraft => ({ name:'',description:'',parentIds:[],masteryLevel:0,difficulty:1 });
export default function KnowledgeGraph() {
 const navigate=useNavigate(),{courseId=''}=useParams<{courseId:string}>(),{courses,user,isGuest}=useAppStore();
 const course=courses.find(c=>c.id===courseId);
 const [nodes,setNodes]=useState<KnowledgeNode[]>([]),[payload,setPayload]=useState<GraphData|null>(null),[isLoading,setIsLoading]=useState(true),[ready,setReady]=useState(false),[dirty,setDirty]=useState(false),[layoutSaving,setLayoutSaving]=useState(false);
 const [showEditDialog,setShowEditDialog]=useState(false),[editingNode,setEditingNode]=useState<KnowledgeNode|null>(null),[draft,setDraft]=useState<NodeDraft>(blankDraft),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const iframeRef=useRef<HTMLIFrameElement>(null),dialogRef=useRef<HTMLDivElement>(null),loadRequest=useRef<symbol|null>(null),nodeRef=useRef(nodes),savingRef=useRef(false);
 const sessionId=useMemo(()=>`${courseId}:${isGuest?'guest':user?.id||'account'}:${crypto.randomUUID()}`,[courseId,user?.id,isGuest]);
 const identity=useRef(sessionId);identity.current=sessionId;nodeRef.current=nodes;
 useCourseDialogFocus(dialogRef,showEditDialog);
 const send=useCallback((type:string,data:Record<string,unknown>={})=>iframeRef.current?.contentWindow?.postMessage({protocol:1,type:'keling-graph:'+type,sessionId,courseId,...data},window.location.origin),[sessionId,courseId]);
 const loadNodes=useCallback(async(preserveLayout=false)=>{
  if(!courseId){setIsLoading(false);return false;}const request=Symbol(),scope=sessionId;loadRequest.current=request;setIsLoading(true);
  try{const {data}=await knowledgeAPI.getNodes(courseId);if(loadRequest.current!==request||identity.current!==scope)return false;setNodes(data.nodes||[]);setPayload({...data,preserveLayout});setError('');return true;}
  catch(e){if(loadRequest.current===request)setError(assistantError(e));return false;}finally{if(loadRequest.current===request)setIsLoading(false);}
 },[courseId,sessionId]);
 useEffect(()=>{setReady(false);setPayload(null);setNodes([]);setDirty(false);setNotice('');setShowEditDialog(false);void loadNodes();return()=>{loadRequest.current=null;};},[loadNodes]);
 useEffect(()=>{if(ready&&payload)send('init',{nodes:payload.nodes.map(({id,name,description,parentIds,masteryLevel,difficulty,positionX,positionY})=>({id,name,description,parentIds,masteryLevel,difficulty,positionX,positionY})),layoutSaved:payload.layoutSaved,savedNodeIds:payload.savedNodeIds,preserveLayout:payload.preserveLayout});},[ready,payload,send]);
 useEffect(()=>{const resize=()=>{const frame=iframeRef.current;if(frame&&window.innerWidth>700)frame.style.height=Math.max(360,window.innerHeight-frame.getBoundingClientRect().top-24)+'px';};const timer=requestAnimationFrame(resize);window.addEventListener('resize',resize);return()=>{cancelAnimationFrame(timer);window.removeEventListener('resize',resize);};},[notice,error,isLoading]);
 const edit=useCallback((id:string)=>{const node=nodeRef.current.find(n=>n.id===id);if(!node)return;setEditingNode(node);setDraft({name:node.name,description:node.description,parentIds:[...node.parentIds],masteryLevel:node.masteryLevel,difficulty:node.difficulty});setShowEditDialog(true);setError('');},[]);
 const saveLayout=useCallback(async(positions:Position[])=>{
  if(savingRef.current)return;savingRef.current=true;setLayoutSaving(true);setError('');const scope=sessionId;
  try{
   const current=new Map(nodeRef.current.map(node=>[node.id,node]));
   if(positions.length!==current.size||new Set(positions.map(p=>p.id)).size!==positions.length||positions.some(p=>!current.has(p.id)||!Number.isFinite(p.positionX)||!Number.isFinite(p.positionY)||p.positionX<0||p.positionX>1||p.positionY<0||p.positionY>1))throw new Error('布局数据已变化，请重新读取图谱。');
   const {data}=await knowledgeAPI.saveLayout(courseId,positions.map(p=>({...p,expectedUpdatedAt:current.get(p.id)!.updatedAt})));
   if(identity.current!==scope)return;const updated=new Map<string,KnowledgeNode>(data.nodes.map((node:KnowledgeNode)=>[node.id,node]));setNodes(old=>old.map(node=>updated.get(node.id)||node));
   if(data.layoutSaved!==true){send('saveError',{message:'课程知识点已变化，请核对新节点后保存布局。'});await loadNodes(true);setNotice('新增或变更的知识点已载入，请核对布局。');return;}
   send('saved',{positions:data.nodes.map(({id,positionX,positionY}:KnowledgeNode)=>({id,positionX,positionY}))});setNotice(isGuest?'布局已保存在本次会话':'布局已保存');
  }catch(e){if(identity.current===scope){const message=assistantError(e);setError(message);send('saveError',{message});}}finally{savingRef.current=false;if(identity.current===scope)setLayoutSaving(false);}
 },[sessionId,courseId,send,isGuest,loadNodes]);
 useEffect(()=>{const receive=(event:MessageEvent)=>{if(event.origin!==window.location.origin||event.source!==iframeRef.current?.contentWindow)return;const data=event.data;if(!data||data.protocol!==1||typeof data.type!=='string')return;if(data.type==='keling-graph:ready'){setReady(true);return;}if(data.sessionId!==sessionId||data.courseId!==courseId)return;
  if(['keling-graph:readyState','keling-graph:layoutChanged','keling-graph:saveState'].includes(data.type)){setDirty(data.dirty===true);if(data.dirty)setNotice('');}
  if(data.type==='keling-graph:editRequested'&&typeof data.nodeId==='string')edit(data.nodeId);
  if(data.type==='keling-graph:saveRequested'&&Array.isArray(data.positions))void saveLayout(data.positions);
  if(data.type==='keling-graph:error')setError(typeof data.message==='string'?data.message:'图谱加载失败');
 };window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);},[courseId,sessionId,edit,saveLayout]);
 useEffect(()=>{if(!dirty)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
 const reload=()=>{if(!dirty||confirm('重新读取会放弃未保存的布局，继续吗？'))void loadNodes(false);};
 async function handleSaveNode(){
  if(saving||!draft.name.trim())return;setSaving(true);setError('');const scope=sessionId,nodeData={...draft,name:draft.name.trim()};
  try{if(editingNode)await knowledgeAPI.updateNode(editingNode.id,nodeData);else{const {data}=await knowledgeAPI.createNode(courseId,{name:nodeData.name,description:nodeData.description,parentIds:nodeData.parentIds,difficulty:nodeData.difficulty});if(identity.current!==scope)return;setEditingNode(data.node);if(nodeData.masteryLevel>0)await knowledgeAPI.updateNode(data.node.id,{masteryLevel:nodeData.masteryLevel});}if(identity.current!==scope)return;if(await loadNodes(true)){setShowEditDialog(false);setEditingNode(null);}}
  catch(e){if(identity.current===scope)setError(assistantError(e));}finally{if(identity.current===scope)setSaving(false);}
 }
 async function handleDeleteNode(){if(saving||!editingNode||!confirm('确定要删除这个知识点吗？'))return;setSaving(true);const scope=sessionId;try{await knowledgeAPI.deleteNode(editingNode.id);if(identity.current===scope&&await loadNodes(true)){setShowEditDialog(false);setEditingNode(null);}}catch(e){if(identity.current===scope)setError(assistantError(e));}finally{if(identity.current===scope)setSaving(false);}}
 return <div className="knowledge-graph-container">
  <header className="graph-header"><button className="back-btn" onClick={()=>{if(!dirty||confirm('布局尚未保存，离开图谱吗？'))navigate(-1);}}><NavigationArrow direction="left"/>返回</button><div className="header-info"><ModuleTitle kind="courses">{course?.name||'知识图谱'}</ModuleTitle></div><div className="graph-header-actions"><button className="btn btn-secondary" disabled={layoutSaving||saving} onClick={reload}>重新读取</button><button className="btn btn-primary" disabled={layoutSaving||saving||isLoading} onClick={()=>{setEditingNode(null);setDraft(blankDraft());setShowEditDialog(true);setError('');}}><Plus size={18}/>添加知识点</button></div></header>
  {error&&<p role="alert" className="graph-notice graph-error">{error}</p>}{notice&&<p role="status" className="graph-notice">{notice}</p>}
  {isLoading&&<p role="status" className="graph-loading">正在读取知识点…</p>}
  <iframe key={sessionId} ref={iframeRef} className="shared-graph-editor" title="课灵知识关系编辑器" src={appPath('/graph-editor/index.html')} referrerPolicy="no-referrer"/>
      {/* 编辑对话框 */}
      {showEditDialog && (
        <div className="dialog-overlay" onClick={() => { if (!saving) setShowEditDialog(false); }}>
          <motion.div
            className="node-edit-dialog"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="node-dialog-title"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="dialog-header">
              <h2 id="node-dialog-title">{editingNode ? '编辑知识点' : '添加知识点'}</h2>
              <button className="close-btn" aria-label="关闭知识点编辑" disabled={saving} onClick={() => setShowEditDialog(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="dialog-content">
              {error && <p role="alert">{error}</p>}
              <div className="form-group">
                <label>名称 *</label>
                <input
                  type="text"
                  className="input"
                  placeholder="知识点名称"
                  aria-label="知识点名称"
                  disabled={saving}
                  value={draft.name}
                  onChange={e => setDraft(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>

              <div className="form-group">
                <label>描述</label>
                <textarea
                  className="input textarea"
                  placeholder="知识点描述"
                  aria-label="知识点描述"
                  disabled={saving}
                  value={draft.description}
                  onChange={e => setDraft(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>

              <div className="form-group">
                <label>父节点</label>
                <SelectFrame><select
                  className="input"
                  aria-label="父节点"
                  disabled={saving}
                  value={draft.parentIds[0] || ''}
                  onChange={e => setDraft(prev => ({ ...prev, parentIds: e.target.value ? [e.target.value] : [] }))}
                >
                  <option value="">无（作为根节点）</option>
                  {nodes.filter(n => n.id !== editingNode?.id).map(node => (
                    <option key={node.id} value={node.id}>{node.name}</option>
                  ))}
                </select></SelectFrame>
              </div>

              <div className="form-group">
                <label>掌握度</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  aria-label="掌握度"
                  disabled={saving}
                  value={Math.round(draft.masteryLevel * 100)}
                  onChange={e => setDraft(prev => ({ ...prev, masteryLevel: parseInt(e.target.value) / 100 }))}
                />
                <span className="range-value">{Math.round(draft.masteryLevel * 100)}%</span>
              </div>

              <div className="form-group">
                <label>难度</label>
                <div className="difficulty-selector">
                  {[1, 2, 3, 4, 5].map(level => (
                    <button
                      key={level}
                      className={`difficulty-option ${draft.difficulty === level ? 'selected' : ''}`}
                      disabled={saving}
                      aria-pressed={draft.difficulty === level}
                      onClick={() => setDraft(prev => ({ ...prev, difficulty: level }))}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="dialog-footer">
              {editingNode && (
                <button className="btn btn-danger" disabled={saving} onClick={handleDeleteNode}>
                  删除
                </button>
              )}
              <button className="btn btn-outline" disabled={saving} onClick={() => setShowEditDialog(false)}>
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={() => void handleSaveNode()}
                disabled={saving || !draft.name.trim()}
              >
                {saving ? '正在保存…' : '保存'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
 </div>;
}
