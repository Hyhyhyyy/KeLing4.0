import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { planetAPI, planetError } from '../services/planets';
import { NavigationArrow } from './NavigationArrow';
import { SectionTitle } from './ModuleTitle';

export function PlanetCourseEntry({courseId,subject}:{courseId:string;subject:string}) {
  const [result,setResult]=useState<{courseId:string;retry:number;planetId:string;error:string}|null>(null),[retry,setRetry]=useState(0);
  const current=result?.courseId===courseId&&result.retry===retry?result:null;
  useEffect(()=>{let alive=true;void planetAPI.list().then(items=>{if(alive)setResult({courseId,retry,planetId:items.find(item=>item.courseId===courseId)?.id||'',error:''});}).catch(e=>{if(alive)setResult({courseId,retry,planetId:'',error:planetError(e)});});return()=>{alive=false;};},[courseId,retry]);
  return <section className="exp-panel"><SectionTitle kind="courses">学习远航</SectionTitle>{current?.error?<p role="alert">{current.error} <button onClick={()=>setRetry(v=>v+1)}>重新读取</button></p>:current?<Link className="btn btn-primary" to={current.planetId?'/planets/'+encodeURIComponent(current.planetId):'/start?subject='+encodeURIComponent(subject)}>{current.planetId?'继续探索学习星球':'为这门学科生成星球'} <NavigationArrow/></Link>:<p role="status">正在读取学习星球…</p>}</section>;
}
