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
  async function check() { setChecking(true); try { const { data } = await api.get('/app/version', { params: { versionCode: 14, versionName: '3.2.4-preview' } }); setVersion(data.needUpdate ? `已发布新版本 ${data.latestVersion.versionName}，可前往下载页查看。` : `当前发布页版本：${data.latestVersion.versionName}。本机为 3.2.4-preview 预览构建。`); } catch { setVersion('暂时无法取得发布信息，不能确认更新状态。'); } finally { setChecking(false); } }
  return <div className="stellar-settings"><header><StellarSprite atlas="modules" index={7} size={64}/><div><h1>空间设置</h1><p>{isGuest ? '本次试用可使用完整学习空间；数据只保留到刷新或退出。' : '账号共享学习数据，每个设备保留适合自己的工作方式。'}</p></div></header>
    <StellarSceneBanner scene="settings" eyebrow="SPACE / CONTROL ROOM" title="让学习空间，适合你的节奏" description={isGuest ? '设置本次试用的头像与模型，了解学习功能与数据保存方式。' : '管理账号入口，了解双端协作与已启用的服务。'} compact/>
    <ModelAccessPanel variant="configuration" title="API Key 与模型配置" scopeKey={`account:${user?.id || 'signed-out'}`}><Link to="/ai?mode=personal">打开自带 Key 临时问答 →</Link><p>{isGuest ? '密钥仅保留在本次游客会话内存，切换模块可继续使用；刷新或退出后清除。' : '离开此配置面板会清除密钥。进入问答页后需重新粘贴，不会跨页面保留或转存。'}</p></ModelAccessPanel>
    <section><h2>我的空间</h2><Link to="/profile">修改资料与星际头像 →</Link><Link to="/visual-library">星际视觉图鉴 →</Link><Link to="/achievements">查看成就 →</Link><button onClick={() => { logout(); navigate(isGuest ? '/explore' : '/login'); }}>{isGuest ? '退出试用并清空' : '退出当前账号'}</button></section>
    <section><h2>两端怎样配合</h2>{isGuest && <p><b>当前为游客模式：</b>可操作相同的学习模块；本次数据不跨标签页或设备同步，也不会写入原有账号。需要下次继续时，可登录账号使用持久保存。</p>}<p><b>网页：</b>并排整理课程和长笔记，导入 Markdown / TXT，导出笔记与 AI 对话。</p><p><b>Kotlin 手机端：</b>随身查看同一账号的课程、任务、笔记与会话，专注时保持屏幕唤醒，暂停后继续计时。</p><p>两端连接同一服务地址并登录同一账号，保存后通过刷新获取最新内容。手机旧版离线资料从“我的 → 原有本机田园数据”进入，未自动上传。</p><p>网页尚未接入离线推送；系统减少动态效果的偏好会用于界面动画。</p></section>
    <section><h2>AI 服务与资料</h2><p>{isGuest ? '在上方配置自己的 API Key，然后选择模型与学习场景。资料检索仅使用本次试用中的内容；真实 AI 调用需要有效密钥，并可能产生厂商费用。' : '模型由部署管理员启用；先选择服务、模型和学习场景。资料检索默认关闭，开启后仅发送你自己的相关摘录。向量检索需要单独配置向量模型，可能产生额外费用。'}</p><p>对话答案不会自动改动课程或任务。保存笔记和智能编排的“确认计划”才会写入{isGuest ? '本次试用内存' : '账号数据'}。</p><Link to="/ai">配置本次对话 →</Link></section>
    <section><h2>课灵 3.2.4-preview</h2><button disabled={checking} onClick={() => void check()}>{checking ? '正在查询发布信息…' : '检查已发布版本'}</button>{version && <p role="status">{version}</p>}<a href="https://github.com/Hyhyhyyy/KeLing4.0/releases" target="_blank" rel="noreferrer">前往 GitHub 下载页 →</a><a href="https://github.com/Hyhyhyyy/KeLing4.0/issues" target="_blank" rel="noreferrer">查看或提交问题反馈 →</a><p>本地预览包与正式签名发布是不同阶段；下载页是否已有该版本以实际发布记录为准。</p></section>
  </div>;
}
