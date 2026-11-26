import { NavigationArrow } from '../../components/NavigationArrow';
import { ModuleTitle, SectionTitle } from '../../components/ModuleTitle';
import { appPath, ANDROID_DOWNLOAD_URL } from '../../services/appPath';
import { Link } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { StellarScene, type StellarSceneName } from '../../components/StellarScene';
import './Explore.css';

export const publicPreview = import.meta.env.VITE_PUBLIC_PREVIEW === 'true';
const features = [
  { scene: 'introAi' as StellarSceneName, title: '把问题，变成理解', text: '提问、查阅资料、保存笔记。' },
  { scene: 'introSync' as StellarSceneName, title: '换个屏幕，接着学', text: '课程、任务与笔记跨端同步。' },
  { scene: 'introPlan' as StellarSceneName, title: '让计划有据可循', text: '用课程资料生成计划，确认后开始学习。' },
];

export default function Explore() {
  const token = useAppStore(state => state.token);
  const isGuest = useAppStore(state => state.isGuest);
  const hasWorkspace = Boolean(token) || isGuest;
  const entry = hasWorkspace ? '/workspace' : '/trial';
  const entryLabel = hasWorkspace ? '返回学习空间' : '游客试用';
  return <div className="explore-page">
    <a href="#explore-content" className="explore-skip">跳到主要内容</a>
    <header className="explore-nav">
      <Link to="/explore" aria-label="课灵介绍"><img src={appPath("/stellar/title_logo.webp")} alt="课灵 KeLing"/></Link>
      <nav aria-label="项目介绍导航"><a className="explore-secondary-nav" href="#capabilities">学习空间</a><Link className="explore-secondary-nav" to="/explore/art">视觉图鉴</Link><Link className="explore-guide-nav" to="/guide">使用指南</Link><Link className="explore-action" to={entry}>{entryLabel}</Link>{!publicPreview && <Link to="/login">账号登录</Link>}</nav>
    </header>
    <main id="explore-content">
      <section className="explore-hero">
        <div><ModuleTitle kind="home">让每一次理解，<br/>点亮一颗星。</ModuleTitle><p>整理知识、制定计划、专注学习。</p>
          <div className="explore-actions"><Link className="explore-action" to={entry}>{entryLabel} <NavigationArrow direction="up-right"/></Link><Link className="explore-guide" to="/guide">使用指南 <NavigationArrow/></Link></div>
          {!token && <p className="explore-trial-note">游客数据在刷新或退出后清空。</p>}
        </div><figure><StellarScene scene="arrival" eager/><figcaption><span>01 · 轨道观测站</span><span>观察 · 理解 · 生长</span></figcaption></figure>
      </section>

      <section id="capabilities" className="explore-capabilities"><SectionTitle kind="home">一个空间，贯穿学习的每一步</SectionTitle><div className="explore-grid">{features.map(item => <article key={item.title}><StellarScene scene={item.scene} decorative/><div><h3>{item.title}</h3><p>{item.text}</p></div></article>)}</div></section>
      <section className="explore-companion"><StellarScene scene="companion"/><div><SectionTitle kind="home">你的星际学习伙伴，星芽</SectionTitle><Link to="/explore/art">查看图鉴 <NavigationArrow direction="right"/></Link></div></section>
      <section className="explore-devices"><div><SectionTitle kind="home">同一片星空，适合不同的屏幕</SectionTitle></div><article><StellarScene scene="webWorkspace" decorative/><h3>网页 · 展开思路</h3><p>整理资料与笔记</p></article><article><StellarScene scene="mobileRover" decorative/><h3>手机端 · 随身专注</h3><p>随时记录与专注</p></article></section>
    </main>
    <footer className="explore-footer"><span>课灵 4.0 · 让知识在你的星球上生长</span><a href={ANDROID_DOWNLOAD_URL}>下载 Android 预览包 <NavigationArrow direction="right"/></a><Link to="/explore/art">视觉图鉴 <NavigationArrow direction="right"/></Link></footer>
  </div>;
}
