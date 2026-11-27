import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { appPath } from '../services/appPath';
import { NavigationArrow } from './NavigationArrow';
import './StoryDialog.css';

import { STORY_SCENES } from '../services/story';
export default function StoryDialog(){
 const location=useLocation(),navigate=useNavigate(),dialog=useRef<HTMLDialogElement>(null);
 const [open,setOpen]=useState(false),[scene,setScene]=useState(0),[count,setCount]=useState(0);
 const [reduced,setReduced]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 const current=STORY_SCENES[scene],finished=count>=current.text.length;
 useEffect(()=>{const m=window.matchMedia('(prefers-reduced-motion: reduce)'); const change=()=>setReduced(m.matches);m.addEventListener('change',change);return()=>m.removeEventListener('change',change);},[]);
 useEffect(()=>{const show=()=>{setScene(0);setCount(0);setOpen(true);};window.addEventListener('keling-open-story',show);return()=>window.removeEventListener('keling-open-story',show);},[]);
 useEffect(()=>{if(['/','/explore','/login','/start','/workspace'].includes(location.pathname)&&!sessionStorage.getItem('keling-story-seen-v2')){const timer=setTimeout(()=>{setOpen(true);sessionStorage.setItem('keling-story-seen-v2','1');},0);return()=>clearTimeout(timer);}},[location.pathname]);
 useEffect(()=>{if(open&&!dialog.current?.open)dialog.current?.showModal();else if(!open&&dialog.current?.open)dialog.current?.close();},[open]);
 useEffect(()=>{const reset=window.setTimeout(()=>setCount(reduced?current.text.length:0),0);if(!open||reduced)return()=>clearTimeout(reset);const timer=window.setInterval(()=>setCount(n=>Math.min(n+1,current.text.length)),44);return()=>{clearTimeout(reset);clearInterval(timer);};},[scene,open,reduced,current.text]);
 function close(){setOpen(false);sessionStorage.setItem('keling-story-seen-v2','1');}
 function proceed(){if(!finished){setCount(current.text.length);return;}if(scene<3)setScene(scene+1);else{close();navigate('/start');}}
 function cycleFocus(event:import('react').KeyboardEvent<HTMLDialogElement>){if(event.key!=='Tab')return;const buttons=dialog.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])');if(!buttons?.length)return;const first=buttons[0],last=buttons[buttons.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
 return <dialog ref={dialog} className="story-dialog" aria-labelledby="story-title" onKeyDown={cycleFocus} onCancel={close} onClose={()=>setOpen(false)} style={{'--story-desktop':`url(${appPath('/stellar/story_cockpit.webp')})`,'--story-mobile':`url(${appPath('/stellar/story_cockpit_mobile.webp')})`} as import('react').CSSProperties}>
  <div className="story-console"><span className="story-coordinate">课灵启航 · {String(scene+1).padStart(2,'0')} / 04</span><h1 id="story-title">{current.title}</h1>
  <div className="story-text" aria-hidden="true">{current.text.slice(0,count)}<span className={`story-cursor ${finished?'is-finished':''}`}>▌</span></div><p className="story-sr" aria-live="polite">{current.text}</p>
  <div className="story-controls">{scene>0&&<button onClick={()=>setScene(scene-1)}>上一幕</button>}<button className="story-primary" onClick={proceed}>{!finished?'显示全文':scene===3?'选择第一颗星球':'继续'}<NavigationArrow/></button><button onClick={close}>跳过故事</button></div>
  <button className="story-guide" onClick={()=>{close();navigate('/guide');}}>查看使用指南<NavigationArrow/></button></div>
 </dialog>;
}
