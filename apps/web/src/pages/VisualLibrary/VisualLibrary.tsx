import { NavigationArrow } from '../../components/NavigationArrow';
import { ModuleTitle, SectionTitle } from '../../components/ModuleTitle';
import { stellarPath } from '../../services/stellarPath';
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
  return <div className="visual-library"><header className="stellar-heading"><div><ModuleTitle kind="home">星际视觉图鉴</ModuleTitle></div><Link to={publicView ? '/explore' : '/profile'} className="stellar-link">{publicView ? '返回课灵介绍' : '选择我的头像'}<NavigationArrow/></Link></header>
    <StellarSceneBanner scene="atlas" title="星际图鉴" compact/>

    <section><SectionTitle kind="home">模块场景</SectionTitle><div className="art-gallery scene-art-gallery">{sceneNames.map(scene => <figure key={scene} className="scene-gallery-item"><a href={appPath(`/stellar/${stellarScenes[scene].file}.webp`)} target="_blank" rel="noreferrer" aria-label={`查看大图：${stellarScenes[scene].title}（新标签页）`}><StellarScene scene={scene}/></a><figcaption>{stellarScenes[scene].title}</figcaption></figure>)}</div></section>
    <section><SectionTitle kind="home">星芽与观测站</SectionTitle><div className="art-gallery">{art.map(([file, name]) => <figure key={file} className={file.startsWith('scene_') || file === 'station_full' ? 'scene-gallery-item' : undefined}><a href={stellarPath(file)} target="_blank" rel="noreferrer"><img loading="lazy" src={stellarPath(file)} alt={name}/></a><figcaption>{name}</figcaption></figure>)}</div></section>
    <section><SectionTitle kind="home">十颗知识星球</SectionTitle><div className="art-gallery">{coursePlanets.map(planet => <figure key={planet.file}><a href={appPath(`/stellar/${planet.file}`)} target="_blank" rel="noreferrer"><img loading="lazy" src={appPath(`/stellar/${planet.file}`)} alt={planet.description}/></a><figcaption>{planet.name}</figcaption></figure>)}</div></section>
    <section><SectionTitle kind="home">远航与基地 · 新的探索空间</SectionTitle><div className="art-gallery">{expeditionArt.map(([file, name]) => <figure key={file}><a href={stellarPath(file)} target="_blank" rel="noreferrer"><img loading="lazy" src={stellarPath(file)} alt={name}/></a><figcaption>{name}</figcaption></figure>)}</div></section>
    {([['avatars', '你的星际身份', avatarNames], ['subjects', '九大学科星球', subjects], ['modules', '模块导航图标', modules]] as const).map(([atlas, title, names]) => <section key={atlas}><h2>{title}</h2><div className="sprite-gallery">{names.map((name, index) => <figure key={name}><StellarSprite atlas={atlas} index={index} size={96} label={name}/><figcaption>{name}</figcaption></figure>)}</div></section>)}
    <footer><p>图像由 AI 辅助创作</p><Link to={publicView ? '/explore' : '/'}>{publicView ? '返回课灵介绍' : '返回学习空间'}<NavigationArrow direction="left"/></Link></footer>
  </div>;
}
