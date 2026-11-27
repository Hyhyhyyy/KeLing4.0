import { applyJourneyPatch, emptyJourneyState, journeyDate, journeyProfile } from '@keling/shared';
import type { JourneyCalendar, JourneyPatch, JourneyProfile, JourneyState } from '@keling/shared';
import api from './api';
import { getGuestWorkspace } from './guestData';
import { getGuestSessionId, subscribeGuestSession } from './guestSession';
import { planetAPI } from './planets';
let guestState:JourneyState=emptyJourneyState();
subscribeGuestSession(()=>{guestState=emptyJourneyState();});
const currentScope=()=>getGuestSessionId()||localStorage.getItem('token');
function requireScope(scope:string|null){if(scope!==currentScope())throw new Error('学习空间已切换，请重新打开。');}
async function guestProfile():Promise<JourneyProfile>{
 const scope=currentScope(),w=getGuestWorkspace(),planets=await planetAPI.list();requireScope(scope);
 const p=journeyProfile(guestState,{planetsCreated:planets.length,tasksCompleted:w.tasks.filter(t=>t.status==='COMPLETED').length,notesCreated:w.notes.filter(n=>!n.sourceType?.endsWith('_INTERNAL')).length,knowledgeNodes:w.nodes.length,studyMinutes:w.user.totalStudyMinutes,checkinDays:new Set(w.checkins.map(c=>c.date)).size});guestState=p.state;return structuredClone(p);
}
export const journeyAPI={
 async profile():Promise<JourneyProfile>{const scope=currentScope(),result=getGuestSessionId()?await guestProfile():(await api.get('/journey/profile')).data;requireScope(scope);return result;},
 async patch(input:JourneyPatch):Promise<JourneyProfile>{
  const scope=currentScope();
  let result:JourneyProfile;
  if(getGuestSessionId()){const current=await guestProfile();requireScope(scope);guestState=applyJourneyPatch(current,input);getGuestWorkspace().user.avatarUrl='journey:'+guestState.avatarId;result=await guestProfile();}
  else result=(await api.patch('/journey/profile',input)).data;
  requireScope(scope);
  window.dispatchEvent(new CustomEvent('keling-journey-updated',{detail:result}));return result;
 },
 async calendar(month:string):Promise<JourneyCalendar>{
  if(!getGuestSessionId()){const scope=currentScope(),result=(await api.get('/journey/calendar',{params:{month}})).data;requireScope(scope);return result;}
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('月份无效');
  const w=getGuestWorkspace(),[year,m]=month.split('-').map(Number),count=new Date(Date.UTC(year,m,0)).getUTCDate();
  const days=Array.from({length:count},(_,i)=>{const date=month+'-'+String(i+1).padStart(2,'0');return {date,checkedIn:w.checkins.some(c=>c.date===date.replaceAll('-','')),studyMinutes:w.studyRecords.filter(r=>r.date===date).reduce((sum,r)=>sum+r.minutes,0),completedTasks:w.tasks.filter(t=>t.status==='COMPLETED'&&t.completedAt&&journeyDate(t.completedAt)===date).length,notesCreated:w.notes.filter(n=>!n.sourceType?.endsWith('_INTERNAL')&&journeyDate(n.createdAt)===date).length};});
  return {month,timezone:'Asia/Shanghai',days,totals:{studyMinutes:days.reduce((s,d)=>s+d.studyMinutes,0),completedTasks:days.reduce((s,d)=>s+d.completedTasks,0),checkinDays:days.filter(d=>d.checkedIn).length,notesCreated:days.reduce((s,d)=>s+d.notesCreated,0)}};
 }
};
