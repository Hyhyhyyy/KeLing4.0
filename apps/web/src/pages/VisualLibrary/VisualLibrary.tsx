import { appPath } from '../../services/appPath';
import { Link } from 'react-router-dom';
import { StellarSprite } from '../../components/StellarArt';
import { avatarNames } from '../../components/stellarCatalog';
import { coursePlanets } from '../../components/planetCatalog';
import { StellarScene, StellarSceneBanner } from '../../components/StellarScene';
import { stellarScenes, type StellarSceneName } from '../../components/stellarScenes';
import './VisualLibrary.css';
const art = [
  ['title_logo', '课灵 · 星际标题'], ['app_icon', '书本星球 · 应用图标'], ['hero_web', '轨道观测站 · 网页横幅'],
  ['mascot_welcome', '星芽 · 欢迎探索'], ['mascot_mentor', '星芽 · 知识领航'], ['mascot_focus', '星芽 · 陪伴专注'],
  ['mascot_archive', '星芽 · 整理笔记'], ['mascot_celebrate', '星芽 · 成长庆祝'],
  ['checkin_frame', '每日补给 · 打卡框'], ['timer_frame', '轨道时钟 · 计时框'], ['input_frame', '观测记录 · 输入框'], ['button_primary', '启航 · 操作按钮'],
];
const expeditionArt = [
  ['expedition_voyage', '学习远航 · 星际航线'], ['expedition_starmap', '知识星图 · 章节探索'],
  ['expedition_base', '星际基地 · 建设空间'], ['decoration_antenna', '基地装饰 · 信号天线'],
  ['decoration_archive', '基地装饰 · 知识档案'], ['decoration_observatory', '基地装饰 · 观测台'],
];
const subjects = ['数学', '物理', '化学', '生物', '计算机', '语言', '历史', '地理', '艺术'];
const modules = ['首页', 'AI 助手', '任务', '笔记', '课程', '个人资料', '学习报告', '设置', '成就'];
const sceneNames = Object.keys(stellarScenes) as StellarSceneName[];
export default function VisualLibrary({ publicView = false }: { publicView?: boolean }) {
  return <div className="visual-library"><header className="stellar-heading"><img src={appPath("/stellar/mascot_welcome.png")} alt="星芽"/><div><span className="eyebrow">STELLAR ATLAS / 01</span><h1>星际视觉图鉴</h1><p>薄荷色的学习伙伴，陪你记录每一次理解。</p></div><Link to={publicView ? '/explore' : '/profile'} className="stellar-link">{publicView ? '返回课灵介绍 →' : '选择我的头像 →'}</Link></header>
    <StellarSceneBanner scene="atlas" eyebrow="ART / PIXEL OBSERVATORY" title="每个学习空间，都有自己的故事" description="浏览独立场景、星芽形象与学科图标。原画以完整构图展示，可打开原图查看。" compact/>
    <p>这套资源在网页与 Kotlin 手机端共用。网页保留宽幅场景和并排信息，手机用紧凑布局、单个图标与适合触控的操作区域。</p>
    <section><h2>模块与展示位 · 独立原画</h2><p>每个位置对应独立绘制的场景；图鉴在这里集中收录原作，不把不同裁切计作新设计。</p><div className="art-gallery scene-art-gallery">{sceneNames.map(scene => <figure key={scene} className="scene-gallery-item"><a href={appPath(`/stellar/${stellarScenes[scene].file}.png`)} target="_blank" rel="noreferrer" aria-label={`查看原画：${stellarScenes[scene].title}（新标签页）`}><StellarScene scene={scene}/></a><figcaption>{stellarScenes[scene].title}</figcaption></figure>)}</div></section>
    <section><h2>星芽与观测站</h2><div className="art-gallery">{art.map(([file, name]) => <figure key={file} className={file.startsWith('scene_') || file === 'station_full' ? 'scene-gallery-item' : undefined}><a href={appPath(`/stellar/${file}.png`)} target="_blank" rel="noreferrer"><img loading="lazy" src={appPath(`/stellar/${file}.png`)} alt={name}/></a><figcaption>{name}</figcaption></figure>)}</div></section>
    <section><h2>十颗知识星球</h2><p>每颗星球都是独立原画，可在课程中选择。</p><div className="art-gallery">{coursePlanets.map(planet => <figure key={planet.file}><a href={appPath(`/stellar/${planet.file}`)} target="_blank" rel="noreferrer"><img loading="lazy" src={appPath(`/stellar/${planet.file}`)} alt={planet.description}/></a><figcaption>{planet.name}</figcaption></figure>)}</div></section>
    <section><h2>远航与基地 · 新的探索空间</h2><div className="art-gallery">{expeditionArt.map(([file, name]) => <figure key={file}><a href={appPath(`/stellar/${file}.png`)} target="_blank" rel="noreferrer"><img loading="lazy" src={appPath(`/stellar/${file}.png`)} alt={name}/></a><figcaption>{name}</figcaption></figure>)}</div></section>
    {([['avatars', '你的星际身份', avatarNames], ['subjects', '九大学科星球', subjects], ['modules', '模块导航图标', modules]] as const).map(([atlas, title, names]) => <section key={atlas}><h2>{title}</h2><div className="sprite-gallery">{names.map((name, index) => <figure key={name}><StellarSprite atlas={atlas} index={index} size={96} label={name}/><figcaption>{name}</figcaption></figure>)}</div></section>)}
    <footer><p>图像由 AI 辅助绘制，名称、配色、图集布局与功能适配由项目统一维护。图形承担装饰与识别；按钮、计时、输入、头像保存均使用真实界面控件。</p><Link to={publicView ? '/explore' : '/'}>{publicView ? '返回课灵介绍 →' : '返回学习空间 →'}</Link></footer>
  </div>;
}
