import { Graph } from '@antv/x6';
import type { Node } from '@antv/x6';
import { CARD, PROTOCOL, WORLD_SIZE, automaticLayout, graphEdges, initialLayout, normalizedPosition, positionFingerprint, validateGraphInput } from './model';
import type { GraphInput, GraphPosition, GraphNode } from './model';
import './editor.css';

declare global { interface Window { KelingGraph?:{postMessage:(message:string)=>void}; KelingGraphEditor:{receive:(message:unknown)=>void} } }
const container=document.getElementById('graph')!, status=document.getElementById('status')!, errorBox=document.getElementById('error')!, editButton=document.getElementById('edit-selected') as HTMLButtonElement;
let input:GraphInput|null=null, changing=false, selected='', cardScale=1, savedFingerprint='', savePending=false;
const graph=new Graph({container,autoResize:true,background:{color:'#fbfbf2'},grid:false,
  panning:{enabled:true,eventTypes:['leftMouseDown','mouseWheelDown']},
  mousewheel:{enabled:true,modifiers:null,minScale:.1,maxScale:5,factor:1.12,zoomAtMousePosition:true},scaling:{min:.1,max:5},
  interacting:()=>({nodeMovable:input?.readOnly!==true,edgeMovable:false,edgeLabelMovable:false,arrowheadMovable:false,vertexMovable:false}),
  translating:{restrict:{x:0,y:0,width:WORLD_SIZE,height:WORLD_SIZE}},connecting:{allowBlank:false,allowEdge:false,allowLoop:false},
});
const markup=[{tagName:'rect',selector:'shadow'},{tagName:'rect',selector:'body'},{tagName:'path',selector:'cap'},
  {tagName:'path',selector:'ornament'},{tagName:'circle',selector:'lens'},{tagName:'text',selector:'ordinal'},
  {tagName:'text',selector:'title'},{tagName:'text',selector:'description'},{tagName:'path',selector:'divider'},
  {tagName:'rect',selector:'progressTrack'},{tagName:'rect',selector:'progress'},{tagName:'text',selector:'mastery'},
  ...Array.from({length:5},(_,i)=>({tagName:'rect',selector:'difficulty'+i}))];
Graph.registerNode('keling-instrument-node',{inherit:'rect',markup,attrs:{text:{refX:0,refY:0}}},true);
function attrs(node:GraphNode,index:number,scale:number) {
  const s=(n:number)=>n*scale, font='华文中宋,STZhongsong,serif';
  const colors=['#568e7a','#548a89','#9b8956'];const accent=colors[index%colors.length];
  return {
    shadow:{x:s(3),y:s(4),width:s(284),height:s(120),rx:s(11),fill:'#dce7d9',opacity:.6,stroke:'none'},
    body:{x:0,y:0,width:s(284),height:s(120),rx:s(11),fill:'#fffdf4',stroke:'#7aa894',strokeWidth:s(1.6)},
    cap:{d:`M ${s(12)} 0 H ${s(235)} L ${s(223)} ${s(14)} H ${s(12)} Z`,fill:'#e1edda',stroke:'none'},
    ornament:{d:`M ${s(247)} ${s(21)} H ${s(268)} V ${s(42)} M ${s(15)} ${s(17)} V ${s(35)} M ${s(19)} ${s(17)} V ${s(26)}`,stroke:'#c4a150',strokeWidth:s(1.4),fill:'none'},
    lens:{cx:s(250),cy:s(21),r:s(5),stroke:accent,strokeWidth:s(1.4),fill:'#f3d787'},
    ordinal:{text:String(index+1).padStart(2,'0'),x:s(32),y:s(29),fontFamily:font,fontSize:s(11),fill:accent,textAnchor:'start',textVerticalAnchor:'middle'},
    title:{text:node.name,x:s(20),y:s(48),fontFamily:font,fontSize:s(22),fontWeight:600,fill:'#244a46',textAnchor:'start',textVerticalAnchor:'middle',textWrap:{width:s(246),height:s(44),ellipsis:true},lineHeight:s(24)},
    description:{text:node.description.replace(/\s+/g,' ').slice(0,48),x:s(20),y:s(77),fontFamily:font,fontSize:s(14),fill:'#62776a',textAnchor:'start',textVerticalAnchor:'middle',textWrap:{width:s(244),height:s(19),ellipsis:true}},
    divider:{d:`M ${s(20)} ${s(91)} H ${s(264)}`,stroke:'#d7e2ce',strokeWidth:s(1)},
    progressTrack:{x:s(20),y:s(105),width:s(91),height:s(4),rx:s(2),fill:'#e1e9dc',stroke:'none'},
    progress:{x:s(20),y:s(105),width:s(91*node.masteryLevel),height:s(4),rx:s(2),fill:accent,stroke:'none'},
    mastery:{text:`自评 ${Math.round(node.masteryLevel*100)}%`,x:s(123),y:s(107),fontFamily:font,fontSize:s(11),fill:'#5d786a',textAnchor:'start',textVerticalAnchor:'middle'},
    ...Object.fromEntries(Array.from({length:5},(_,i)=>['difficulty'+i,{x:s(221+i*9),y:s(103),width:s(5),height:s(7),rx:s(1),fill:i<node.difficulty?'#bfaa6a':'#e6e9da',stroke:'none'}])),
  };
}
function send(type:string,data:Record<string,unknown>={}) {
  const message={protocol:PROTOCOL,type:'keling-graph:'+type,...(input?{courseId:input.courseId,sessionId:input.sessionId}:{}),...data};
  if(window.KelingGraph?.postMessage)window.KelingGraph.postMessage(JSON.stringify(message));
  else if(window.parent!==window)window.parent.postMessage(message,window.location.origin);
}
function positions():GraphPosition[]{return graph.getNodes().map(node=>{const p=node.position(),size=node.size();return {id:node.id,positionX:(p.x+size.width/2)/WORLD_SIZE,positionY:(p.y+size.height/2)/WORLD_SIZE};});}
function dirty(){return Boolean(input?.nodes.length)&&positionFingerprint(positions())!==savedFingerprint;}
function updateStatus(message?:string){const unsaved=dirty();status.dataset.dirty=String(unsaved);status.textContent=message||(savePending?'正在保存…':!input?.nodes.length?'暂无知识点':unsaved?'布局未保存':'布局已保存');document.querySelectorAll<HTMLButtonElement>('[data-command=save]').forEach(button=>button.disabled=savePending||!unsaved||input?.readOnly===true);document.querySelectorAll<HTMLButtonElement>('[data-command=autoLayout]').forEach(button=>button.disabled=input?.readOnly===true||!input?.nodes.length);}
function fail(message:string){errorBox.hidden=false;errorBox.textContent=message;send('error',{message});}
function fit(){if(graph.getNodes().length){graph.zoomToFit({padding:28,maxScale:1.15,minScale:.1});}else graph.zoomTo(1);}
function selectNode(id:string){selected=id;graph.getNodes().forEach(node=>node.attr('body/stroke',node.id===id?'#bc8e37':'#7aa894'));graph.getNodes().forEach(node=>node.attr('body/strokeWidth',(node.id===id?3:1.6)*cardScale));const node=input?.nodes.find(n=>n.id===id);document.getElementById('selection-label')!.textContent=node?.name||'选择知识点';editButton.disabled=!node||input?.readOnly===true;send('selected',{nodeId:id||null});}
function applyPositions(next:GraphPosition[]){changing=true;const byId=new Map(next.map(p=>[p.id,p]));graph.getNodes().forEach(node=>{const p=byId.get(node.id);if(p){const size=node.size();node.position(p.positionX*WORLD_SIZE-size.width/2,p.positionY*WORLD_SIZE-size.height/2);}});changing=false;}
function render(next:GraphInput,preserveLayout=false){
  const preserve=preserveLayout&&input?.courseId===next.courseId&&input.sessionId===next.sessionId;
  const existing=preserve?new Map(positions().map(p=>[p.id,p])):new Map<string,GraphPosition>();
  const previousFingerprint=savedFingerprint;
  input=next;selected='';savePending=false;errorBox.hidden=true;changing=true;
  const placement=preserve?{...next,layoutSaved:false,savedNodeIds:[...new Set([...next.savedNodeIds,...existing.keys()])],nodes:next.nodes.map(node=>({...node,...existing.get(node.id)}))}:next;
  const initial=initialLayout(placement);cardScale=initial.scale;const byId=new Map(initial.positions.map(p=>[p.id,p]));
  const cells=next.nodes.map((node,index)=>{const p=byId.get(node.id)!;return graph.createNode({id:node.id,shape:'keling-instrument-node',width:CARD.width*cardScale,height:CARD.height*cardScale,x:p.positionX*WORLD_SIZE-CARD.width*cardScale/2,y:p.positionY*WORLD_SIZE-CARD.height*cardScale/2,attrs:attrs(node,index,cardScale),zIndex:2,data:{nodeId:node.id}});});
  const edges=graphEdges(next.nodes).map((edge,index)=>graph.createEdge({id:`edge-${index}`,source:{cell:edge.source,anchor:{name:'right'}},target:{cell:edge.target,anchor:{name:'left'}},router:{name:'manhattan',args:{padding:28*cardScale,startDirections:['right'],endDirections:['left']}},connector:{name:'rounded',args:{radius:12*cardScale}},attrs:{line:{stroke:'#74a18c',strokeWidth:2.1*cardScale,targetMarker:{name:'path',d:`M 12 -6 L 0 0 L 12 6 L 9 0 Z`,fill:'#74a18c',stroke:'#4e806c',strokeWidth:1},strokeLinecap:'round'}},zIndex:1}));
  graph.resetCells([...cells,...edges]);changing=false;savedFingerprint=preserve?previousFingerprint:next.layoutSaved?positionFingerprint(positions()):'';
  document.getElementById('node-count')!.textContent=`${next.nodes.length} 个节点 · ${edges.length} 条关系`;
  selectNode('');updateStatus();fit();
  requestAnimationFrame(()=>{container.querySelectorAll<SVGGElement>('.x6-node').forEach(el=>{el.setAttribute('tabindex','0');el.setAttribute('role','button');const id=el.getAttribute('data-cell-id');el.setAttribute('aria-label',next.nodes.find(n=>n.id===id)?.name||'知识点');el.onkeydown=e=>{if(e.key==='Enter'&&id){selectNode(id);send('editRequested',{nodeId:id});}};});});
  if(next.fontUrl){try{const url=new URL(next.fontUrl,location.href);if(url.origin===location.origin){const face=new FontFace('华文中宋',`url("${url.href}")`);void face.load().then(font=>document.fonts.add(font)).catch(()=>{});}}catch{/* Keep the bundled local font. */}}
  send('readyState',{positions:positions(),dirty:dirty(),saved:!dirty(),scale:graph.zoom()});
}
function command(value:string){if(!input)return;errorBox.hidden=true;switch(value){case'fit':fit();break;case'zoomIn':graph.zoom(.15);break;case'zoomOut':graph.zoom(-.15);break;case'autoLayout':if(!input.readOnly){applyPositions(automaticLayout(input.nodes).positions);fit();updateStatus();send('layoutChanged',{positions:positions(),reason:'auto',dirty:dirty()});}break;case'save':if(!input.readOnly&&dirty()&&!savePending){savePending=true;updateStatus();send('saveRequested',{positions:positions()});}break;}}
function receive(raw:unknown){let message:Record<string,unknown>;try{message=(typeof raw==='string'?JSON.parse(raw):raw) as Record<string,unknown>;if(!message||message.protocol!==PROTOCOL||typeof message.type!=='string')return;if(message.type==='keling-graph:init'){render(validateGraphInput(message),message.preserveLayout===true);return;}if(!input||message.sessionId!==input.sessionId||message.courseId!==input.courseId)return;
  if(message.type==='keling-graph:command'&&typeof message.command==='string')command(message.command);
  else if(message.type==='keling-graph:saved'){savePending=false;const snapshot=Array.isArray(message.positions)?message.positions as GraphPosition[]:positions();savedFingerprint=positionFingerprint(snapshot);updateStatus();send('saveState',{dirty:dirty()});}
  else if(message.type==='keling-graph:saveError'){savePending=false;updateStatus('保存未完成 · 可重试');errorBox.hidden=false;errorBox.textContent=typeof message.message==='string'?message.message:'布局保存失败，请重试';send('saveState',{dirty:dirty()});}
  }catch(error){savePending=false;fail(error instanceof Error?error.message:'图谱暂未载入');}}
window.KelingGraphEditor={receive};
window.addEventListener('message',event=>{if(event.source===window.parent&&event.origin===window.location.origin)receive(event.data);});
graph.on('node:click',({node})=>selectNode(node.id));graph.on('node:dblclick',({node})=>{selectNode(node.id);send('editRequested',{nodeId:node.id});});
graph.on('blank:click',()=>selectNode(''));graph.on('node:moved',({node}:{node:Node})=>{if(changing||!input)return;const p=node.position(),size=node.size(),normalized=normalizedPosition(node.id,p.x,p.y,size.width,size.height);applyPositions([normalized]);updateStatus();send('layoutChanged',{positions:positions(),reason:'drag',dirty:dirty()});});
graph.on('scale',({sx})=>{document.getElementById('scale')!.textContent=Math.round(sx*100)+'%';});
document.querySelectorAll<HTMLButtonElement>('[data-command]').forEach(button=>button.onclick=()=>command(button.dataset.command!));editButton.onclick=()=>{if(selected)send('editRequested',{nodeId:selected});};
send('ready');let attempts=0;const timer=setInterval(()=>{if(input||++attempts>=30)clearInterval(timer);else send('ready');},300);
