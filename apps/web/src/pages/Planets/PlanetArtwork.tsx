import { useState } from 'react';
import type { PlanetDraft } from '@keling/shared';
import { planetArtworkUrl } from '@keling/shared';
import { SubjectPlanet } from '../../components/SubjectPlanet';
import './PlanetArtwork.css';

export function PlanetArtwork({draft,size=150}:{draft:PlanetDraft;size?:number}){
 const [failed,setFailed]=useState('');let url:string|undefined;
 if(draft.artwork?.status==='generated'){try{url=planetArtworkUrl(draft.artwork.url);}catch{url=undefined;}}
 return <div className="planet-artwork" style={{width:size,maxWidth:'100%'}}>{url&&failed!==url?<img src={url} width={size} height={size} alt={`${draft.subject}的定制星球`} referrerPolicy="no-referrer" onError={()=>setFailed(url!)}/>:<SubjectPlanet subject={draft.subject} index={draft.planetStyleIndex} size={size}/>}{draft.artwork&&(!url||failed===url)&&<span className="planet-fine">默认星球外观</span>}</div>;
}
