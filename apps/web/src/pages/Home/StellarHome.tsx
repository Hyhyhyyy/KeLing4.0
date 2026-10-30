import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { checkinAPI } from '../../services/api';
import { assistantError } from '../../services/assistant';
import { StellarSprite } from '../../components/StellarArt';
import { CoursePlanet } from '../../components/CoursePlanet';
import { StellarScene } from '../../components/StellarScene';
import './StellarHome.css';
export default function StellarHome() {
  const { user, courses, tasks, notes, loadUser, isGuest } = useAppStore();
  const [checked, setChecked] = useState<boolean | null>(null); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState('');
  useEffect(() => { let alive = true; const refresh = () => void checkinAPI.getStatus().then(({ data }) => { if (alive) setChecked(data.hasCheckedInToday); }).catch(() => { if (alive) setChecked(null); }); refresh(); window.addEventListener('focus', refresh); return () => { alive = false; window.removeEventListener('focus', refresh); }; }, []);
  async function checkin() { if (busy) return; setBusy(true); try { const { data } = await checkinAPI.checkIn(); setChecked(true); setNotice(data.alreadyCheckedIn ? (isGuest ? '本次试用今日已签到。' : '另一端已经签到，今日记录已同步。') : '签到成功，今天的坚持已记录。'); await loadUser(); } catch (e) { setNotice(assistantError(e)); } finally { setBusy(false); } }
  const pending = tasks.filter(t => t.status === 'PENDING' || t.status === 'IN_PROGRESS');
  return <div className="stellar-home">
    <section className="stellar-hero"><div className="stellar-hero-copy"><span className="eyebrow">YOUR LEARNING UNIVERSE</span><h1>你好，{user?.name || '探索者'}<br />今天也向星光出发。</h1><p>把问题变成理解，把每天的专注连成知识星图。</p><Link className="stellar-cta" to="/ai">与 AI 助手一起探索 →</Link><div className="hero-destinations"><Link to="/greenhouse">01 知识星球</Link><Link to="/notes">02 观测记录</Link><Link to="/tasks">03 专注航程</Link></div></div><div className="stellar-hero-window"><StellarScene scene="station" eager/><span className="station-plate">星芽的轨道观测站 · 观察 / 理解 / 生长</span></div></section>
    {notice && <p role="status" className="stellar-status">{notice}</p>}
    <div className="stellar-metrics">{[[courses.length, isGuest ? '本次课程' : '共享课程'], [pending.length, '待完成任务'], [notes.length, '学习笔记'], [user?.totalStudyMinutes || 0, '累计学习分钟']].map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
    <div className="stellar-dashboard-grid"><section className="stellar-surface daily-supply"><img src="/stellar/mascot_celebrate.png" alt="" /><div><span className="eyebrow">DAILY SUPPLY</span><h2>今日星际补给</h2><p>连续学习 {user?.streakDays || 0} 天<br />每一天的坚持，都值得被记录。</p><button disabled={busy || checked === true || checked === null} onClick={() => void checkin()}>{checked === null ? '签到状态待连接' : checked ? '今日已签到 ✓' : '记录今日签到'}</button><small>{isGuest ? '北京时间 · 本次试用记录' : '北京时间 · 网页与手机共享记录'}</small></div></section>
      <section className="stellar-surface learning-mission"><div className="stellar-section-title"><h2>继续一项学习</h2><Link to="/tasks">全部任务 →</Link></div><div className="mission-content"><StellarScene scene="homeMissions" decorative/><div>{pending.length ? pending.slice(0, 3).map(t => <Link className="stellar-task-row" to="/tasks" key={t.id}><span className="pixel-dot"/><div><strong>{t.title}</strong><small>{t.estimatedMinutes} 分钟 · 打开任务开始行动</small></div><span>↗</span></Link>) : <div className="stellar-empty"><strong>下一段航程，由你开启</strong><p>选一个想理解的问题，给它一段专注时间。</p><Link to="/agent">创建我的学习计划 →</Link></div>}</div></div></section>
    </div>
    <div className="stellar-section-title"><h2>你的知识星球</h2><Link to="/greenhouse">整理课程 →</Link></div><div className={`stellar-course-grid ${courses.length === 1 ? "single-course-grid" : ""}`}>{courses.slice(0, 6).map(c => <Link to={`/greenhouse/${c.id}`} key={c.id} className="stellar-surface stellar-course"><CoursePlanet index={c.planetStyleIndex} size={80} /><div><h3>{c.name}</h3><p>{c.knowledgeNodeCount || 0} 个知识点 · {c.totalStudyMinutes} 分钟</p></div></Link>)}{courses.length > 0 && courses.length < 3 && <Link className="stellar-surface course-expedition" to="/greenhouse"><StellarScene scene="homeCourses" decorative/><div><strong>为好奇心，再开一扇舷窗</strong><p>整理更多学科，让知识星球慢慢生长。</p><span>管理我的课程 →</span></div></Link>}{!courses.length && <Link className="stellar-surface empty-planet" to="/greenhouse"><StellarScene scene="homeCourses" decorative/><div><span className="eyebrow">PLANT YOUR FIRST IDEA</span><h3>每一门课程，都是一颗新的星球</h3><p>从一个学科出发，慢慢种下你的知识森林。</p><span className="planet-subjects">{[0,1,2,3,4].map(index => <StellarSprite key={index} atlas="subjects" index={index} size={36}/>)}</span><strong>＋ 创建第一门课程</strong></div></Link>}</div>
    <section className="stellar-surface home-voyage"><img src="/stellar/expedition_voyage.png" width="1536" height="1024" loading="lazy" alt="像素星际远征航线"/><div className="home-voyage-copy"><span className="eyebrow">LEARN · PRACTISE · REFLECT</span><h2>带着好奇心，开启一次知识远航</h2><p>从二叉树示例章节出发，动手练习、阅读反馈、记录理解，再回到知识星图查看学习过程。</p><Link className="stellar-cta" to="/voyage">进入学习远航 →</Link><Link className="home-voyage-secondary" to="/base">看看我的星际基地 →</Link></div></section>
    <div className="stellar-section-title"><h2>探索学习甲板</h2><span className="eyebrow">CHOOSE YOUR NEXT ORBIT</span></div>
    <div className="stellar-module-grid">
      <Link className="stellar-surface" to="/agent"><StellarScene scene="portalPlanning" decorative/><div><h3>智能编排</h3><p>基于学习资料生成计划，经你确认后加入{isGuest ? '本次试用任务' : '共享任务'}。</p><span>打开智能编排 →</span></div></Link>
      <Link className="stellar-surface" to="/notes"><StellarScene scene="portalNotes" decorative/><div><h3>资料与笔记</h3><p>{isGuest ? '整理、导入与导出资料，记录本次探索中的理解。' : '网页适合整理与导入，手机随时回顾和补充。'}</p><span>打开{isGuest ? '本次' : '共享'}笔记 →</span></div></Link>
      <Link className="stellar-surface" to="/visual-library"><StellarScene scene="portalAtlas" decorative/><div><h3>星际视觉图鉴</h3><p>认识你的学习伙伴，浏览头像、学科图标和模块场景。</p><span>探索像素宇宙 →</span></div></Link>
    </div>
  </div>;
}
