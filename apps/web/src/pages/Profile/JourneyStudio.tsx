import { useEffect,useState } from 'react';
import { Link,useNavigate } from 'react-router-dom';
import { JOURNEY_CATALOG,JourneyError } from '@keling/shared';
import type { JourneyPatch,JourneyProfile } from '@keling/shared';
import { journeyAPI } from '../../services/journey';
import { userAPI } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';
import { JourneyArt,ExplorerAvatar } from '../../components/JourneyArt';
import { ModuleTitle,SectionTitle } from '../../components/ModuleTitle';
import { NavigationArrow } from '../../components/NavigationArrow';
import { appPath } from '../../services/appPath';
import '../../components/Journey.css';
const C=JOURNEY_CATALOG;
export default function JourneyStudio({mode='profile'}:{mode?:'profile'|'home'|'achievements'}){
 const {user,isGuest,loadUser,logout}=useAppStore(),navigate=useNavigate();
 const [profile,setProfile]=useState<JourneyProfile|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[name,setName]=useState(user?.name||''),[tab,setTab]=useState<'avatars'|'frames'|'titles'>('avatars');
 async function load(){try{setProfile(await journeyAPI.profile());setNotice('');}catch{setNotice('未能读取装扮，请重新读取。');}}
 useEffect(()=>{let alive=true;void journeyAPI.profile().then(p=>{if(alive)setProfile(p);}).catch(()=>{if(alive)setNotice('未能读取装扮，请重新读取。');});return()=>{alive=false;};},[]);
 async function patch(change:Omit<JourneyPatch,'expectedRevision'>){if(!profile||busy)return;setBusy(true);try{setProfile(await journeyAPI.patch({expectedRevision:profile.state.revision,...change}));await loadUser();setNotice(isGuest?'已暂存':'已保存');}catch(e){const remote=e as {response?:{data?:{error?:string}}};setNotice(remote.response?.data?.error||(e instanceof JourneyError?e.message:'保存未完成，请重新读取。'));}finally{setBusy(false);}}
 const equippedTitle=C.titles.find(t=>t.id===profile?.state.titleId);
 const title=mode==='home'?'星图家园':mode==='achievements'?'远航成就':'我的探索者形象';
 return <div className="journey-studio"><header className="journey-heading"><ModuleTitle kind={mode==='home'?'settings':'profile'}>{title}</ModuleTitle><button className="btn" disabled={busy} onClick={()=>void load()}>重新读取</button></header>
  <nav className="journey-tabs" aria-label="我的星际空间">{[['/profile','个人形象','profile'],['/base','星图家园','home'],['/achievements','远航成就','achievements'],['/me','学习轨迹','records']].map(([to,label,key])=><Link key={to} to={to} aria-current={key===mode?'page':undefined}>{label}<NavigationArrow/></Link>)}</nav>
  {notice&&<p className="journey-notice" role="status">{notice}</p>}
  {!profile?<p role="status">正在读取星际空间…</p>:<>
  {mode==='profile'&&<><section className="journey-identity"><div className="journey-portrait"><ExplorerAvatar url={'journey:'+profile.state.avatarId} frameId={profile.state.frameId} size={144}/></div><div><h2>{user?.name||'探索者'}</h2>{equippedTitle?<div className="journey-title-preview"><JourneyArt kind="titles" index={equippedTitle.index} size={180}/><strong>{equippedTitle.name}</strong></div>:<p>星际探索者</p>}<span>{profile.achievements.filter(a=>a.unlocked).length} / 10 项远航成就</span></div><img className="journey-identity-scene" src={appPath('/stellar/scene_companion.webp')} alt="" onError={e=>{e.currentTarget.style.display='none';}}/></section>
  <div className="journey-name"><label>昵称<input value={name} maxLength={60} onChange={e=>setName(e.target.value)}/></label><button className="btn" disabled={busy||!name.trim()} onClick={()=>{setBusy(true);void userAPI.updateProfile({name:name.trim()}).then(loadUser).then(()=>setNotice('昵称已保存')).catch(()=>setNotice('昵称未保存')).finally(()=>setBusy(false));}}>保存昵称</button></div>
  <div className="journey-picker-tabs">{(['avatars','frames','titles'] as const).map((key,i)=><button key={key} aria-pressed={tab===key} onClick={()=>setTab(key)}>{['探索者形象','头像星环','成就称号'][i]} · 10款</button>)}</div>
  {tab!=='avatars'&&<button className="btn" disabled={busy} onClick={()=>void patch(tab==='frames'?{frameId:null}:{titleId:null})}>卸下{tab==='frames'?'头像框':'称号'}</button>}
  <div className="journey-collection">{C[tab].map(item=>{const owned=tab==='avatars'||(tab==='frames'?profile.owned.frameIds:profile.owned.titleIds).includes(item.id),selected=profile.state[tab==='avatars'?'avatarId':tab==='frames'?'frameId':'titleId']===item.id,achievement=profile.achievements.find(a=>a.id===item.achievementId);return <article className={'journey-item '+(!owned?'is-locked':'')} key={item.id}><JourneyArt kind={tab} index={item.index} size={118}/><h3>{item.name}</h3>{achievement&&<p>{achievement.description}</p>}<button disabled={busy||!owned||selected} onClick={()=>void patch(tab==='avatars'?{avatarId:item.id}:tab==='frames'?{frameId:item.id}:{titleId:item.id})}>{selected?'已装备':owned?'装备':'尚未解锁'}</button></article>;})}</div>
  <button className="journey-logout" onClick={()=>{if(confirm(isGuest?'退出将清空本次游客记录，确定吗？':'退出登录？')){logout();navigate('/explore');}}}>{isGuest?'结束游客体验':'退出登录'}</button></>}
  {mode==='home'&&<><section className="journey-home-scene" style={{backgroundImage:`linear-gradient(#102d4340,#102d4370),url(${appPath('/stellar/expedition_base.webp')})`}} aria-label="已布置的星图家园"><header><h2>{user?.name||'探索者'}的轨道居所</h2><span>{profile.state.furnitureSlots.filter(Boolean).length} / 10 件已陈列</span></header><div className="journey-home-slots">{profile.state.furnitureSlots.map((id,index)=>{const item=C.furniture.find(f=>f.id===id);return <button key={index} disabled={busy||!item} aria-label={item?`收起${item.name}`:`陈列位置${index+1}，空位`} title={item?'点击收起':'空位'} onClick={()=>void patch({furnitureSlots:profile.state.furnitureSlots.map((f,i)=>i===index?null:f)})}>{item?<><JourneyArt kind="furniture" index={item.index} size={120}/><span>{item.name}</span></>:<span className="journey-empty-slot">{String(index+1).padStart(2,'0')}</span>}</button>;})}</div></section>
  <SectionTitle kind="settings">成就家具收藏</SectionTitle><p>完成成就，领取家具，为自己的航程留一个位置。</p><div className="journey-collection">{C.furniture.map(item=>{const owned=profile.owned.furnitureIds.includes(item.id),placed=profile.state.furnitureSlots.includes(item.id),a=profile.achievements.find(a=>a.id===item.achievementId)!;return <article className={'journey-item '+(!owned?'is-locked':'')} key={item.id}><JourneyArt kind="furniture" index={item.index} size={130}/><h3>{item.name}</h3><p>{a.description}</p><small>{a.progress} / {a.target}</small><button disabled={busy||!owned||placed||!profile.state.furnitureSlots.includes(null)} onClick={()=>{const slots=[...profile.state.furnitureSlots];slots[slots.indexOf(null)]=item.id;void patch({furnitureSlots:slots});}}>{placed?'已陈列':owned?'放入家园':'尚未解锁'}</button></article>;})}</div></>}
  {mode==='achievements'&&<><section className="journey-achievement-intro"><h2>{profile.achievements.filter(a=>a.unlocked).length} / 10 项成就已点亮</h2><p>每一项成就，解锁一套头像框、称号和家具。</p><Link to="/base">布置星图家园<NavigationArrow/></Link></section><div className="journey-achievements">{profile.achievements.map(a=><article className={a.unlocked?'is-unlocked':''} key={a.id}><JourneyArt kind="titles" index={a.index} size={130}/><div><h3>{a.name}</h3><p>{a.description}</p><progress value={a.progress} max={a.target}/><span>{a.unlocked?'已解锁':`${a.progress} / ${a.target}`}</span><small>家具 · {C.furniture[a.index].name}</small></div><JourneyArt kind="furniture" index={a.index} size={110}/></article>)}</div></>}
  </>}
 </div>;
}
