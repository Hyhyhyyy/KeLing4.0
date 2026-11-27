import { useEffect,useState } from 'react';
import { Link } from 'react-router-dom';
import { journeyDate } from '@keling/shared';
import type { JourneyCalendar as CalendarData } from '@keling/shared';
import { journeyAPI } from '../services/journey';
import { NavigationArrow } from './NavigationArrow';
import './Journey.css';
export default function JourneyCalendar({refreshKey=0}:{refreshKey?:number}){
 const [month,setMonth]=useState(()=>journeyDate(new Date()).slice(0,7)),[data,setData]=useState<CalendarData|null>(null),[error,setError]=useState(''),[selected,setSelected]=useState(()=>journeyDate(new Date()));
 useEffect(()=>{let alive=true;setError('');void journeyAPI.calendar(month).then(d=>{if(alive)setData(d);}).catch(()=>{if(alive){setError('轨迹未能读取');setData(null);}});return()=>{alive=false;};},[month,refreshKey]);
 function move(delta:number){const [y,m]=month.split('-').map(Number);const date=new Date(Date.UTC(y,m-1+delta,1));setMonth(date.toISOString().slice(0,7));setSelected(date.toISOString().slice(0,10));}
 const day=data?.days.find(d=>d.date===selected),firstWeekday=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5))-1,1)).getUTCDay();
 return <section className="journey-calendar" aria-label="学习轨迹日历"><header><button aria-label="上个月" onClick={()=>move(-1)}><NavigationArrow direction="left"/></button><h3>{month.replace('-','年')}月</h3><button aria-label="下个月" onClick={()=>move(1)}><NavigationArrow/></button></header><div className="journey-week">{'日一二三四五六'.split('').map(d=><span key={d}>{d}</span>)}</div><div className="journey-days">{Array.from({length:firstWeekday},(_,i)=><span key={'empty'+i}/>)}{data?.days.map(d=><button key={d.date} className={[d.date===journeyDate(new Date())?'today':'',d.checkedIn?'checked':'',d.studyMinutes||d.completedTasks||d.notesCreated?'active':''].join(' ')} aria-pressed={selected===d.date} aria-label={`${d.date}，${d.checkedIn?'已打卡，':''}${d.studyMinutes}分钟，${d.completedTasks}项任务`} onClick={()=>setSelected(d.date)}>{Number(d.date.slice(-2))}<i/></button>)}</div><p className="journey-day-detail" aria-live="polite">{error|| (day?`${Number(day.date.slice(-2))}日 · ${day.studyMinutes}分钟 · ${day.completedTasks}项任务${day.checkedIn?' · 已打卡':''}`:'选择日期查看轨迹')}</p><Link to="/tasks">开始专注<NavigationArrow/></Link></section>;
}
