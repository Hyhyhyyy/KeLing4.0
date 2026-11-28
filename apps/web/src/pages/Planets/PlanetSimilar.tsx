import { useEffect, useRef, useState } from 'react';
import { NavigationArrow } from '../../components/NavigationArrow';
import type { PlanetWorkProgress } from '@keling/shared';
import { PlanetWork } from './PlanetWork';
import type { PlanetProgressListener } from '../../services/planets';
import { planetError } from '../../services/planets';

export const similarPracticeInstruction='围绕这道题的知识点，搜索并生成两道同题型的新练习';
export function PlanetSimilar({busy,limitReached,setBusy,setError,onGenerate}:{busy:boolean;limitReached:boolean;setBusy:(value:boolean)=>void;setError:(value:string)=>void;onGenerate:(instruction:string,requestId:string,signal:AbortSignal,onProgress:PlanetProgressListener)=>Promise<void>}){
 const abort=useRef<AbortController|null>(null),requestId=useRef('');
 const [running,setRunning]=useState(false),[progress,setProgress]=useState<PlanetWorkProgress>();
 useEffect(()=>()=>abort.current?.abort(),[]);
 async function generate(){
  if(busy||limitReached)return;
  const controller=new AbortController();abort.current=controller;requestId.current||=crypto.randomUUID();setBusy(true);setRunning(true);setProgress(undefined);setError('');
  try{await onGenerate(similarPracticeInstruction,requestId.current,controller.signal,setProgress);requestId.current='';}
  catch(error){if(!controller.signal.aborted)setError(planetError(error));}
  finally{if(abort.current===controller){abort.current=null;setBusy(false);setRunning(false);}}
 }
 return <div className="planet-similar"><button type="button" disabled={busy||limitReached} onClick={()=>void generate()}>{running?'正在搜索相似碎片…':'相似碎片搜索'} <NavigationArrow/></button><span className="planet-fine">{limitReached?'本区练习已达上限':'同题型 · 再做两道'}</span>{running&&<PlanetWork kind="similar" progress={progress}/>}</div>;
}
