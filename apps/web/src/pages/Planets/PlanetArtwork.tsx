import { useState } from 'react';
import type { PlanetDraft } from '@keling/shared';
import { planetArtworkUrl } from '@keling/shared';
import { SubjectPlanet } from '../../components/SubjectPlanet';
import './PlanetArtwork.css';

export function PlanetArtwork({draft,size=150}:{draft:PlanetDraft;size?:number}){
 const [failed,setFailed]=useState(''),[loaded,setLoaded]=useState(''),[retry,setRetry]=useState(0);let url:string|undefined;
 if(draft.artwork?.status==='generated'){try{url=planetArtworkUrl(draft.artwork.url);}catch{url=undefined;}}
 return <div className="planet-artwork" style={{width:size,maxWidth:'100%'}}>{url?<div className="planet-artwork-frame">{failed===url?<div className="planet-artwork-placeholder"><span>形象待载入</span><button type="button" onClick={event=>{event.preventDefault();event.stopPropagation();setFailed('');setRetry(value=>value+1);}}>重试</button></div>:<><img key={url+retry} src={url} width={size} height={size} alt={`${draft.subject}的定制星球`} referrerPolicy="no-referrer" onLoad={()=>setLoaded(url!)} onError={()=>setFailed(url!)} style={{visibility:loaded===url?'visible':'hidden'}}/>{loaded!==url&&<div className="planet-artwork-placeholder" role="status">形象载入中</div>}</>}</div>:<SubjectPlanet subject={draft.subject} index={draft.planetStyleIndex} size={size}/>}{draft.artwork&&!url&&<span className="planet-fine">默认星球外观</span>}</div>;
}
