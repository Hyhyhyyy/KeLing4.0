import { ANDROID_DOWNLOAD_URL } from '../../services/appPath';
import { StellarSceneBanner } from '../../components/StellarScene';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAppStore } from '../../store/useAppStore';
import { StellarSprite } from '../../components/StellarArt';
import ModelAccessPanel from '../../components/ModelAccessPanel';
import './StellarSettings.css';
export default function StellarSettings() {
  const { logout, user, isGuest } = useAppStore(); const navigate = useNavigate();
  const [version, setVersion] = useState(''); const [checking, setChecking] = useState(false);
  async function check() { setChecking(true); try { const { data } = await api.get('/app/version', { params: { versionCode: 22, versionName: '4.0.5-defense-rc2' } }); setVersion(data.needUpdate ? `Android 新版本：${data.latestVersion.versionName}` : `已发布 Android：${data.latestVersion.versionName}`); } catch { setVersion('查询失败，请重试。'); } finally { setChecking(false); } }
  return <div className="stellar-settings"><header><StellarSprite atlas="modules" index={7} size={64}/><div><h1>空间设置</h1></div></header>
    <StellarSceneBanner scene="settings" title="我的空间" compact/>
    <ModelAccessPanel variant="configuration" title="API Key 与模型配置" scopeKey={`account:${user?.id || 'signed-out'}`}><Link to="/ai?mode=personal">临时问答 →</Link></ModelAccessPanel>
    <section><h2>我的空间</h2><Link to="/profile">资料与头像 →</Link><Link to="/visual-library">星际视觉图鉴 →</Link><Link to="/achievements">成就 →</Link><button onClick={() => { logout(); navigate(isGuest ? '/explore' : '/login'); }}>{isGuest ? '退出试用并清空' : '退出账号'}</button></section>
    <section><h2>AI 助手</h2><Link to="/ai">开始对话 →</Link></section>
    <section><h2>课灵 Web · 4.0.5-defense-rc2</h2><button disabled={checking} onClick={() => void check()}>{checking ? '正在查询…' : '查看 Android 版本'}</button>{version && <p role="status">{version}</p>}<a href={ANDROID_DOWNLOAD_URL}>Android 预览包 →</a><a href="https://github.com/Hyhyhyyy/KeLing4.0/releases" target="_blank" rel="noreferrer">GitHub 下载页 →</a><a href="https://github.com/Hyhyhyyy/KeLing4.0/issues" target="_blank" rel="noreferrer">问题反馈 →</a></section>
  </div>;
}
