import type { CSSProperties } from 'react';
import { appPath } from '../services/appPath';
import { StellarSprite } from './StellarArt';
import { avatarIndex } from './stellarCatalog';
import './Journey.css';
export function JourneyArt({kind,index,size=80,label,className=''}:{kind:'avatars'|'frames'|'titles'|'furniture';index:number;size?:number;label?:string;className?:string}){
 const n=Math.max(0,Math.min(9,index));const style:CSSProperties={width:size,height:size,backgroundImage:`url(${appPath('/stellar/journey_'+kind+'.webp')})`,backgroundSize:'500% 200%',backgroundPosition:`${n%5*25}% ${Math.floor(n/5)*100}%`};
 return <span className={'journey-art '+className} style={style} role={label?'img':undefined} aria-label={label} aria-hidden={!label}/>;
}
export function ExplorerAvatar({url,size=64,frameId}:{url?:string|null;size?:number;frameId?:string|null}){const match=/^journey:avatar-([0-9])$/.exec(url||'');return <span className={'explorer-avatar '+(frameId?'has-frame':'')} style={{width:size,height:size}}>{match?<JourneyArt kind="avatars" index={Number(match[1])} size={frameId?size*.84:size} label="我的形象"/>:<StellarSprite atlas="avatars" index={avatarIndex(url)} size={frameId?size*.84:size} label="我的形象"/>}{frameId&&<JourneyArt className="explorer-frame" kind="frames" index={Number(frameId.split('-')[1])} size={size*1.32}/>}</span>;}
