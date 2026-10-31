import { appPath, ANDROID_DOWNLOAD_URL } from '../../services/appPath';
import { Link } from 'react-router-dom';
import { StellarScene, type StellarSceneName } from '../../components/StellarScene';
import './Explore.css';

export const publicPreview = import.meta.env.VITE_PUBLIC_PREVIEW === 'true';
const features = [
  { scene: 'introAi' as StellarSceneName, title: '把问题，变成理解', text: '按学习场景选择对话模型。可选择关键词或嵌入模型检索自己的资料，查看引用，再决定是否保存为笔记。' },
  { scene: 'introSync' as StellarSceneName, title: '换个屏幕，接着学', text: '网页与 Kotlin 移动端共享账户、课程、任务、笔记、头像和 AI 会话。编辑冲突会提醒，避免覆盖另一端的新内容。' },
  { scene: 'introPlan' as StellarSceneName, title: '让计划有据可循', text: '智能编排读取课程资料，生成待确认的计划。检查任务、时长和引用后，由你确认创建；支持华为 AgentArts 接入。' },
];

export default function Explore() {
  return <div className="explore-page">
    <a href="#explore-content" className="explore-skip">跳到主要内容</a>
    <header className="explore-nav">
      <Link to="/explore" aria-label="课灵介绍"><img src={appPath("/stellar/title_logo.png")} alt="课灵 KeLing"/></Link>
      <nav aria-label="项目介绍导航"><a className="explore-secondary-nav" href="#capabilities">学习空间</a><Link className="explore-secondary-nav" to="/explore/art">视觉图鉴</Link><Link className="explore-action" to="/trial">游客试用</Link>{!publicPreview && <Link to="/login">账号登录</Link>}</nav>
    </header>
    <main id="explore-content">
      <section className="explore-hero">
        <div><span className="explore-eyebrow">KELING · STELLAR LEARNING</span><h1>让每一次理解，<br/>点亮一颗星。</h1><p>带着问题启航，与星芽一起整理知识、制定计划、保持专注。在电脑展开思路，在手机延续进度。</p>
          <div className="explore-actions"><Link className="explore-action" to="/trial">游客试用 · 无需登录 <span aria-hidden="true">↗</span></Link><a href="#capabilities">了解课灵 <span aria-hidden="true">↓</span></a></div>
          <p className="explore-trial-note">直接进入完整应用，所有学习模块均可使用；数据仅在本次内存中，刷新、关闭或退出后清空。AI 需要有效模型配置。</p>
        </div><figure><StellarScene scene="arrival" eager/><figcaption><span>01 · 轨道观测站</span><span>观察 · 理解 · 生长</span></figcaption></figure>
      </section>
      {publicPreview && <aside className="explore-preview" role="note"><strong>公开游客试用</strong><p>无需注册即可进入完整学习空间，包括 AI、智能编排、课程、知识图谱、笔记、任务、报告、签到与成就。试用内容不写入学习数据库；真实 AI 需要有效模型配置，并由你明确发送。</p></aside>}
      <section id="capabilities" className="explore-capabilities"><span className="explore-eyebrow">YOUR LEARNING ORBIT</span><h2>一个空间，贯穿学习的每一步</h2><div className="explore-grid">{features.map(item => <article key={item.title}><StellarScene scene={item.scene} decorative/><div><h3>{item.title}</h3><p>{item.text}</p></div></article>)}</div></section>
      <section className="explore-companion"><StellarScene scene="companion"/><div><span className="explore-eyebrow">MEET XINGYA</span><h2>你的星际学习伙伴，星芽</h2><p>薄荷绿的机身、温暖的像素表情。欢迎、讲解、专注、归档与庆祝，每一种形象都对应一个学习时刻。</p><Link to="/explore/art">认识星芽与九位头像伙伴 →</Link></div></section>
      <section className="explore-devices"><div><span className="explore-eyebrow">ONE ACCOUNT · TWO RHYTHMS</span><h2>同一片星空，适合不同的屏幕</h2></div><article><StellarScene scene="webWorkspace" decorative/><h3>网页 · 展开思路</h3><p>宽幅学习空间、并排查看资料、整理长篇笔记、比较模型和计划。</p></article><article><StellarScene scene="mobileRover" decorative/><h3>Kotlin 手机端 · 随身专注</h3><p>紧凑的学习入口、触控操作、可暂停的专注计时与快速打卡。</p></article></section>
    </main>
    <footer className="explore-footer"><span>课灵 4.0 · 让知识在你的星球上生长</span><a href={ANDROID_DOWNLOAD_URL}>下载 Android 预览包 →</a><Link to="/explore/art">查看视觉资源与创作说明 →</Link></footer>
  </div>;
}
