import { useEffect, useRef, useState } from 'react';
import { NavigationArrow } from '../../components/NavigationArrow';
import { planetError } from '../../services/planets';

export function PlanetRegenerate({kind,busy,setBusy,setError,onRegenerate}:{kind:'question'|'artwork';busy:boolean;setBusy:(value:boolean)=>void;setError:(value:string)=>void;onRegenerate:(instruction:string,requestId:string,signal:AbortSignal)=>Promise<void>}){
 const [instruction,setInstruction]=useState(''),abort=useRef<AbortController|null>(null),operation=useRef({input:'',id:''});
 useEffect(()=>()=>abort.current?.abort(),[]);
 async function submit(){if(busy||!instruction.trim())return;setBusy(true);setError('');const controller=new AbortController();abort.current=controller;const text=instruction.trim();if(operation.current.input!==text)operation.current={input:text,id:crypto.randomUUID()};try{await onRegenerate(text,operation.current.id,controller.signal);setInstruction('');operation.current={input:'',id:''};}catch(error){if(!controller.signal.aborted)setError(planetError(error));}finally{if(abort.current===controller){setBusy(false);abort.current=null;}}}
 return <details className="planet-regenerate"><summary>{kind==='question'?'调整这道练习':'调整星球外观'}</summary><label><span>{kind==='question'?'你想怎样修改？':'追加绘图提示'}</span><textarea rows={3} maxLength={800} disabled={busy} value={instruction} onChange={e=>setInstruction(e.target.value)} placeholder={kind==='question'?'例如：结合网络使用场景，增加辨析题的难度':'例如：保留薄荷绿，增加漂浮书页和像素星环'}/></label><button type="button" disabled={busy||!instruction.trim()} onClick={()=>void submit()}>{busy?'正在调整…':kind==='question'?'重新生成这道题':'重新绘制星球'} <NavigationArrow/></button></details>;
}
