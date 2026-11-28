import JourneyCalendar from '../../components/JourneyCalendar';
import { openStory } from '../../services/story';
import { NavigationArrow } from '../../components/NavigationArrow';
import { ModuleTitle, SectionTitle } from '../../components/ModuleTitle';
import { appPath } from '../../services/appPath';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { checkinAPI } from '../../services/api';
import { assistantError } from '../../services/assistant';
import { StellarSprite } from '../../components/StellarArt';
import { CourseArtwork } from '../../components/CourseArtwork';
import { StellarScene } from '../../components/StellarScene';
import { useCoursePlanets } from '../../services/useCoursePlanets';
import './StellarHome.css';
export default function StellarHome() {
  const { user, courses, tasks, notes, loadUser, isGuest } = useAppStore();
  const [checked, setChecked] = useState<boolean | null>(null); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState('');
  const {byCourse,loading:artworkLoading}=useCoursePlanets();
  useEffect(() => { let alive = true; const refresh = () => void checkinAPI.getStatus().then(({ data }) => { if (alive) setChecked(data.hasCheckedInToday); }).catch(() => { if (alive) setChecked(null); }); refresh(); window.addEventListener('focus', refresh); return () => { alive = false; window.removeEventListener('focus', refresh); }; }, []);
  async function checkin() { if (busy) return; setBusy(true); try { const { data } = await checkinAPI.checkIn(); setChecked(true); setNotice(data.alreadyCheckedIn ? (isGuest ? '今日已签到' : '今日已签到') : '签到成功'); await loadUser(); } catch (e) { setNotice(assistantError(e)); } finally { setBusy(false); } }
  const pending = tasks.filter(t => t.status === 'PENDING' || t.status === 'IN_PROGRESS');
  return <div className="stellar-home">
    <section className="stellar-hero"><div className="stellar-hero-copy"><ModuleTitle kind="home"><span className="greeting-fragment">你好，</span><span className="greeting-fragment">{user?.name || '探索者'}</span><br /><span className="greeting-fragment">今天也向</span><span className="greeting-fragment">星光出发。</span></ModuleTitle><Link className="stellar-cta" to={courses.length ? "/planets" : "/start"}>{courses.length ? "继续探索" : "选择我的学科"} <NavigationArrow direction="right"/></Link><div className="hero-destinations"><button className="btn" onClick={openStory}>启航故事</button><Link to="/planets">01 知识星球</Link><Link to="/notes">02 观测记录</Link><Link to="/tasks">03 专注航程</Link></div></div><div className="stellar-hero-window"><StellarScene scene="station" eager/><span className="station-plate">星芽的轨道观测站</span></div></section>
    {notice && <p role="status" className="stellar-status">{notice}</p>}
    <div className="stellar-metrics">{[[courses.length, isGuest ? '本次课程' : '共享课程'], [pending.length, '待完成任务'], [notes.length, '学习笔记'], [user?.totalStudyMinutes || 0, '累计学习分钟']].map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
    <div className="home-checkin-trajectory"><section className="stellar-surface daily-supply"><img src={appPath("/stellar/mascot_celebrate.webp")} alt="" /><div><SectionTitle kind="home">今日星际补给</SectionTitle><p>连续签到 {user?.streakDays || 0} 天</p><button disabled={busy || checked === true || checked === null} onClick={() => void checkin()}>{checked === null ? '签到状态待连接' : checked ? '今日已签到 ✓' : '记录今日签到'}</button></div></section><JourneyCalendar refreshKey={checked?1:0}/></div>
      <div className="stellar-dashboard-grid journey-mission-row"><section className="stellar-surface learning-mission"><div className="stellar-section-title"><SectionTitle kind="home">继续一项学习</SectionTitle><Link to="/tasks">全部任务 <NavigationArrow direction="right"/></Link></div><div className="mission-content"><StellarScene scene="homeMissions" decorative/><div>{pending.length ? pending.slice(0, 3).map(t => <Link className="stellar-task-row" to="/tasks" key={t.id}><span className="pixel-dot"/><div><strong>{t.title}</strong><small>{t.estimatedMinutes} 分钟</small></div><span><NavigationArrow direction="up-right"/></span></Link>) : <div className="stellar-empty"><strong>暂无待办</strong><Link to="/agent">创建计划 <NavigationArrow direction="right"/></Link></div>}</div></div></section>
    </div>
    <div className="stellar-section-title"><SectionTitle kind="home">你的知识星球</SectionTitle><Link to="/greenhouse">整理课程 <NavigationArrow direction="right"/></Link></div><div className={`stellar-course-grid ${courses.length === 1 ? "single-course-grid" : ""}`}>{courses.slice(0, 6).map(c => <Link to={`/greenhouse/${c.id}`} key={c.id} className="stellar-surface stellar-course"><CourseArtwork course={c} planet={byCourse[c.id]} loading={artworkLoading} size={80}/><div><h3>{c.name}</h3><p>{c.knowledgeNodeCount || 0} 个知识点 · {c.totalStudyMinutes} 分钟</p></div></Link>)}{courses.length > 0 && courses.length < 3 && <Link className="stellar-surface course-expedition" to="/start"><StellarScene scene="homeCourses" decorative/><div><strong>生成学习星球</strong><span>选择新的学科 <NavigationArrow direction="right"/></span></div></Link>}{!courses.length && <Link className="stellar-surface empty-planet" to="/start"><StellarScene scene="homeCourses" decorative/><div><h3>第一颗星球，由你选择</h3><span className="planet-subjects">{[0,1,2,3,4].map(index => <StellarSprite key={index} atlas="subjects" index={index} size={36}/>)}</span><strong>输入学科，生成学习星球 <NavigationArrow/></strong></div></Link>}</div>
    <section className="stellar-surface home-voyage"><img src={appPath("/stellar/expedition_voyage.webp")} width="1536" height="1024" loading="lazy" alt="像素星际远征航线"/><div className="home-voyage-copy"><SectionTitle kind="home">开启知识远航</SectionTitle><Link className="stellar-cta" to="/voyage">进入学习远航 <NavigationArrow direction="right"/></Link><Link className="home-voyage-secondary" to="/base">星际基地 <NavigationArrow direction="right"/></Link></div></section>
    <div className="stellar-section-title"><SectionTitle kind="home">探索学习甲板</SectionTitle></div>
    <div className="stellar-module-grid">
      <Link className="stellar-surface" to="/agent"><StellarScene scene="portalPlanning" decorative/><div><h3>智能编排</h3><span>打开智能编排 <NavigationArrow direction="right"/></span></div></Link>
      <Link className="stellar-surface" to="/notes"><StellarScene scene="portalNotes" decorative/><div><h3>资料与笔记</h3><span>打开{isGuest ? '本次' : '共享'}笔记 <NavigationArrow direction="right"/></span></div></Link>
      <Link className="stellar-surface" to="/visual-library"><StellarScene scene="portalAtlas" decorative/><div><h3>星际视觉图鉴</h3><span>探索像素宇宙 <NavigationArrow direction="right"/></span></div></Link>
    </div>
  </div>;
}
