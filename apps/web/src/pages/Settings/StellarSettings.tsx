import { NavigationArrow } from '../../components/NavigationArrow';
import { ModuleTitle, SectionTitle } from '../../components/ModuleTitle';
import { ANDROID_DOWNLOAD_URL } from '../../services/appPath';
import { StellarSceneBanner } from '../../components/StellarScene';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAppStore } from '../../store/useAppStore';
import ModelAccessPanel from '../../components/ModelAccessPanel';
import './StellarSettings.css';
export default function StellarSettings() {
  const { logout, user, isGuest } = useAppStore(); const navigate = useNavigate();
  const [version, setVersion] = useState(''); const [checking, setChecking] = useState(false);
  async function check() { setChecking(true); try { const { data } = await api.get('/app/version', { params: { versionCode: 26, versionName: '4.0.5-defense-rc6' } }); setVersion(data.needUpdate ? `Android 新版本：${data.latestVersion.versionName}` : `已发布 Android：${data.latestVersion.versionName}`); } catch { setVersion('查询失败，请重试。'); } finally { setChecking(false); } }
  return <div className="stellar-settings"><header><div><ModuleTitle kind="settings">空间设置</ModuleTitle></div></header>
    <StellarSceneBanner scene="settings" title="我的空间" compact/>
    <ModelAccessPanel variant="configuration" title="API Key 与模型配置" scopeKey={`account:${user?.id || 'signed-out'}`}><Link to="/ai?mode=personal">临时问答 <NavigationArrow direction="right"/></Link></ModelAccessPanel>
    <section><SectionTitle kind="settings">我的空间</SectionTitle><Link to="/guide">使用指南 <NavigationArrow/></Link><Link to="/profile">资料与头像 <NavigationArrow direction="right"/></Link><Link to="/visual-library">星际视觉图鉴 <NavigationArrow direction="right"/></Link><Link to="/achievements">成就 <NavigationArrow direction="right"/></Link><button onClick={() => { logout(); navigate(isGuest ? '/explore' : '/login'); }}>{isGuest ? '退出试用并清空' : '退出账号'}</button></section>
    <section><SectionTitle kind="settings">AI 助手</SectionTitle><Link to="/ai">开始对话 <NavigationArrow direction="right"/></Link></section>
    <section><SectionTitle kind="settings">课灵 Web · 4.0.5-defense-rc6</SectionTitle><button disabled={checking} onClick={() => void check()}>{checking ? '正在查询…' : '查看 Android 版本'}</button>{version && <p role="status">{version}</p>}<a href={ANDROID_DOWNLOAD_URL}>Android 预览包 <NavigationArrow direction="right"/></a><a href="https://github.com/Hyhyhyyy/KeLing4.0/releases" target="_blank" rel="noreferrer">GitHub 下载页 <NavigationArrow direction="right"/></a><a href="https://github.com/Hyhyhyyy/KeLing4.0/issues" target="_blank" rel="noreferrer">问题反馈 <NavigationArrow direction="right"/></a></section>
  </div>;
}
