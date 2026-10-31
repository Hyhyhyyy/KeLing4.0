import { appPath } from '../../services/appPath';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { assistant, assistantError, assistantErrorCode } from '../../services/assistant';
import type { AssistantSession, ContextPreview, ContextRef, ModelProvider, SessionInput, Turn } from '../../services/assistant';
import { clearAssistantLaunch, readAssistantLaunch } from '../../services/assistantLaunch';
import type { AssistantLaunch } from '../../services/assistantLaunch';
import AssistantContextPanel, { AssistantSourceList } from '../../components/AssistantContextPanel';
import { useAppStore } from '../../store/useAppStore';
import { StellarScene } from '../../components/StellarScene';
import ModelAccessPanel from '../../components/ModelAccessPanel';
import { formatModelAccessAnswer, useModelAccess } from '../../services/modelAccess';
import type { ModelAccessContext } from '../../services/modelAccess';
import { noteAPI } from '../../services/api';
import './StellarAssistant.css';
import { isGuestSession } from '../../services/guestSession';

const scenarios = [['CONCEPT_EXPLAIN', '概念讲解'], ['QUICK_PLAN', '学习规划'], ['WEAKNESS_DIAGNOSE', '薄弱诊断'], ['PRACTICE_SESSION', '逐题练习'], ['REVIEW_SESSION', '复习回顾'], ['CASUAL_CHAT', '自由问答']];
const initial: SessionInput = { title: '新的学习对话', providerId: '', modelId: '', scenario: 'CONCEPT_EXPLAIN', includeContext: false, retrievalMode: 'keyword', embeddingProviderId: '', embeddingModelId: '' };
export default function StellarAssistant() {
  const accountId = useAppStore(s => s.user?.id);
  const location = useLocation();
  const entryKey: unknown = location.state?.assistantContextEntry;
  const launch = readAssistantLaunch(entryKey, accountId);
  // A fresh workspace also prevents an old account's in-flight replies from
  // being rendered in a new account or a newly opened resource conversation.
  return <AssistantModes key={`${accountId || 'signed-out'}:${location.key}`} accountId={accountId} launch={launch} entryRequested={Boolean(entryKey)} personal={new URLSearchParams(location.search).get('mode') === 'personal'} />;
}

function AssistantModes({ personal, ...workspace }: { accountId?: string; launch: AssistantLaunch | null; entryRequested: boolean; personal: boolean }) {
  const [mode, setMode] = useState<'shared' | 'personal'>(personal ? 'personal' : 'shared');
  const guest = isGuestSession();
  const [contextPreview, setContextPreview] = useState<ModelAccessContext[]>([]);
  return <div className="assistant-mode-shell"><nav className="assistant-mode-bar" aria-label="AI 使用方式"><button type="button" aria-pressed={mode === 'shared'} onClick={() => setMode('shared')}>{guest ? '本次学习会话' : '共享学习会话'}</button><button type="button" aria-pressed={mode === 'personal'} onClick={() => setMode('personal')}>我的 API Key · 临时问答</button></nav>
    <div hidden={mode !== 'shared'}>{guest && <details className="assistant-personal-mode" open><summary>输入 API Key · 启用完整 AI 会话与智能编排</summary><ModelAccessPanel variant="configuration" scopeKey={`account:${workspace.accountId}`} title="配置本次游客使用的模型"/><p>点击发送会把所选资料及最近会话内容交给模型服务商，可能消耗你的额度；会话只留在本次内存。</p></details>}<AssistantWorkspace {...workspace} onContextPreview={setContextPreview}/></div>
    {mode === 'personal' && <div className="assistant-personal-mode"><p>这里使用你自己的服务商密钥，共享会话草稿保持原样；已预览的资料需在下方明确勾选，超长内容可编辑为本次摘录。{guest ? '密钥可在本次游客的其他模块继续使用，刷新或退出清除；回答只有明确保存后才加入本次笔记。' : '离开此面板会清除密钥，回答只有明确保存后才进入共享笔记。'}</p><ModelAccessPanel title="粘贴 API Key，连接自己的模型" scopeKey={`account:${workspace.accountId || 'signed-out'}`} initialMessage={workspace.launch?.prompt} context={contextPreview} onSaveAnswer={async result => {
      const content = formatModelAccessAnswer(result);
      if (content.length > 50000) throw new Error('Temporary answer is too long for one note');
      await noteAPI.create({ title: `临时 AI · ${result.question || result.model}`.slice(0, 180), content, sourceType: 'AI_GENERATED', tags: ['自带 Key', result.model] });
    }}/></div>}
  </div>;
}

function AssistantWorkspace({ accountId, launch, entryRequested, onContextPreview }: { accountId?: string; launch: AssistantLaunch | null; entryRequested: boolean; onContextPreview: (sources: ModelAccessContext[]) => void }) {
  const guest = isGuestSession();
  const accessRevision = useModelAccess(s => `${s.revision}:${s.model}`);
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [sessions, setSessions] = useState<AssistantSession[]>([]);
  const [selected, setSelected] = useState<AssistantSession | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [form, setForm] = useState(initial);
  const [input, setInput] = useState(launch?.prompt || ''); const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [notice, setNotice] = useState(entryRequested && !launch ? '资料入口已失效或因刷新而清除，请返回课程、任务或笔记重新选择。当前不会附带原资料。' : '');
  const [contextRef, setContextRef] = useState<ContextRef | null>(launch?.ref || null);
  const [preview, setPreview] = useState<ContextPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(Boolean(launch));
  const [previewError, setPreviewError] = useState('');
  const [previewRevision, setPreviewRevision] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const version = useRef(0); const mounted = useRef(true);
  const previewRequest = useRef(0); const previewAbort = useRef<AbortController | null>(null);
  const launchKey = useRef(launch?.key);
  const sendKey = useRef<{ id: string; text: string; session: string; context: string } | null>(null);
  const selectedId = selected?.id;
  const provider = providers.find(p => p.id === form.providerId);
  const embeddingProvider = providers.find(p => p.id === form.embeddingProviderId);
  const running = turns.some(t => t.status === 'RUNNING') || Boolean(selected?.activeRequestId);
  const activeProvider = providers.find(p => p.id === (selected?.providerId || form.providerId));
  const sendBlockedReason = !activeProvider?.configured || !(selected?.modelId || form.modelId)
    ? '所选模型服务尚未启用或未读取成功，暂不能发送；你仍可核对资料和编辑问题。'
    : contextRef && (previewLoading || !preview || previewError)
      ? '请先取得并核对最新资料预览，再发送问题。'
      : !selected && !contextRef && form.includeContext && form.retrievalMode === 'vector' && !form.embeddingModelId
        ? '请先选择向量模型，或改用关键词检索。' : '';
  useEffect(() => {
    const abort = new AbortController(); let alive = true;
    void Promise.all([assistant.catalog(abort.signal), assistant.sessions(abort.signal)]).then(([catalog, list]) => {
      if (!alive) return; setProviders(catalog.data.providers); setSessions(list.data.sessions);
      setForm(f => { if (f.providerId && catalog.data.providers.some(p => p.id === f.providerId && p.chatModels.includes(f.modelId))) return f; const p = catalog.data.providers.find(x => x.configured && x.chatModels.length) || catalog.data.providers[0]; return { ...f, providerId: p?.id || '', modelId: p?.chatModels[0] || '' }; });
    }).catch(e => { if (alive) setError(assistantError(e)); });
    return () => { alive = false; abort.abort(); };
  }, [accountId, refresh, accessRevision]);
  useEffect(() => {
    mounted.current = true;
    const key = launchKey.current;
    return () => { mounted.current = false; if (key) clearAssistantLaunch(key); };
  }, []);
  useEffect(() => {
    if (!contextRef) return;
    const abort = new AbortController(); previewAbort.current = abort;
    const request = ++previewRequest.current;
    void assistant.preview(contextRef, abort.signal).then(({ data }) => {
      if (!mounted.current || request !== previewRequest.current || abort.signal.aborted) return;
      setPreview(data); setPreviewError(''); onContextPreview(data.sources.map(source => ({ title: source.title, text: `资料版本：${source.updatedAt || '未记录'}${source.truncated ? ' · 服务端预览已截断' : ''}\n${source.text}` })));
    }).catch(e => {
      if (!mounted.current || request !== previewRequest.current || abort.signal.aborted) return;
      setPreview(null); onContextPreview([]); setPreviewError(assistantErrorCode(e) === 'CONTEXT_NOT_FOUND' ? '这份资料已无法访问。请移除它，或返回原页面选择仍可访问的资料。' : assistantError(e));
    }).finally(() => {
      if (mounted.current && request === previewRequest.current && !abort.signal.aborted) setPreviewLoading(false);
    });
    return () => abort.abort();
  }, [contextRef, previewRevision, onContextPreview]);
  useEffect(() => {
    if (!selectedId) return;
    const abort = new AbortController(); let timer: ReturnType<typeof setTimeout>; let alive = true; let fetching = false;
    const selectedVersion = version.current;
    async function poll() {
      if (fetching || !alive) return; fetching = true;
      try {
        const { data } = await assistant.get(selectedId!, abort.signal);
        if (!alive || selectedVersion !== version.current) return; setSelected(data.session); setTurns(data.turns);
        timer = setTimeout(() => void poll(), data.session.activeRequestId ? 3000 : 30000);
      } catch (e) { if (alive && selectedVersion === version.current) setError(assistantError(e)); } finally { fetching = false; }
    }
    void poll(); const focus = () => { clearTimeout(timer); if (document.visibilityState === 'visible') void poll(); };
    window.addEventListener('focus', focus);
    return () => { alive = false; abort.abort(); clearTimeout(timer); window.removeEventListener('focus', focus); };
  }, [selectedId, refresh]);
  function clearContext() { previewRequest.current++; previewAbort.current?.abort(); setContextRef(null); setPreview(null); onContextPreview([]); setPreviewError(''); setPreviewLoading(false); sendKey.current = null; clearAssistantLaunch(launchKey.current); }
  function refreshContext() { previewRequest.current++; previewAbort.current?.abort(); setPreview(null); onContextPreview([]); setPreviewError(''); setPreviewLoading(true); setPreviewRevision(x => x + 1); }
  function newSession() { version.current++; clearContext(); setSelected(null); setTurns([]); setInput(''); setError(''); setNotice(''); }
  function openSession(session: AssistantSession) { version.current++; clearContext(); setSelected(session); setTurns([]); setInput(''); setError(''); setNotice(''); setRefresh(x => x + 1); }
  async function act(fn: () => Promise<void>) { if (busy) return; const v = version.current; setBusy(true); setError(''); try { await fn(); } catch (e) { if (mounted.current && v === version.current) setError(assistantError(e)); } finally { if (mounted.current) setBusy(false); } }
  async function send() {
    const text = input.trim(); if (!text || busy || running || sendBlockedReason) return;
    const v = version.current;
    const context = contextRef && preview ? { ...contextRef, fingerprint: preview.fingerprint } : undefined;
    const contextKey = JSON.stringify(context || null);
    await act(async () => {
      let s = selected;
      if (!s) { s = (await assistant.create({ ...form, includeContext: context ? false : form.includeContext, title: text.slice(0, 80) })).data.session; if (!mounted.current || v !== version.current) return; setSelected(s); }
      if (!sendKey.current || sendKey.current.text !== text || sendKey.current.session !== s.id || sendKey.current.context !== contextKey) sendKey.current = { id: crypto.randomUUID(), text, session: s.id, context: contextKey };
      try { await assistant.send(s.id, text, sendKey.current.id, context); }
      catch (e) {
        if (!mounted.current || v !== version.current) return;
        const code = assistantErrorCode(e);
        if (context && (code === 'CONTEXT_CHANGED' || code === 'CONTEXT_NOT_FOUND')) {
          setPreview(null); onContextPreview([]); setPreviewError(code === 'CONTEXT_CHANGED' ? '资料在预览后已更新。你的问题已保留，请刷新资料、核对新内容后再次点击发送。' : '资料已删除或无法访问。你的问题已保留，请移除资料或重新选择。'); return;
        }
        throw e;
      }
      if (!mounted.current || v !== version.current) return;
      sendKey.current = null; setInput(''); setRefresh(x => x + 1);
    });
  }
  function exportConversation() {
    if (!selected) return;
    const body = '# ' + selected.title + '\n\n' + turns.map(t => `## 我\n${t.userText}\n\n## 课灵 · ${t.modelId}\n${t.assistantText || t.error || '生成中'}\n${t.sources.map((s, i) => `\n[资料${i + 1}] ${s.title}\n版本：${s.updatedAt || '旧会话未记录版本'}${s.truncated ? ' · 已截断' : ''}\n${s.text}`).join('')}`).join('\n\n');
    const url = URL.createObjectURL(new Blob([body], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = '课灵学习对话.md'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="stellar-assistant">
    <header className="stellar-heading"><img src={appPath("/stellar/mascot_mentor.png")} alt="课灵星际导师" /><div><span className="eyebrow">KELING / LEARNING LAB</span><h1>星际 AI 助手</h1><p>从一个问题出发，把知识连成星图。</p></div><Link className="stellar-link" to="/agent">智能编排 →</Link></header>
    {error && <div className="stellar-alert" role="alert">{error} <button onClick={() => { setError(''); setRefresh(x => x + 1); }}>重新连接</button></div>}
    {notice && <p className="stellar-notice" role="status">{notice}</p>}
    <div className="assistant-layout"><aside className="stellar-panel session-list">
      <button className="stellar-primary" disabled={busy} onClick={newSession}>＋ 新建对话</button><h2>{guest ? '本次会话' : '共享会话'}</h2><input aria-label="搜索会话" placeholder="搜索学习主题" value={search} onChange={e => setSearch(e.target.value)} />
      <p className="stellar-muted">{guest ? '本次可跨模块继续；刷新或退出清除。显示最近 100 个会话。' : '同一账号可在网页与手机继续。显示最近 100 个会话。'}</p>
      {sessions.filter(s => s.title.includes(search)).map(s => <button disabled={busy} className={s.id === selectedId ? 'session active' : 'session'} key={s.id} onClick={() => openSession(s)}><strong>{s.title}</strong><small>{s.modelId}</small></button>)}
      <div className="session-observatory"><StellarScene scene="conversations" decorative/><strong>把理解，留在自己的星图里</strong><p>{guest ? '整理资料、保存回答，在本次游客空间继续探索。' : '整理资料、保存回答，下一次探索从这里接续。'}</p><Link to="/notes">{guest ? '打开本次笔记 →' : '打开共享笔记 →'}</Link><Link to="/greenhouse">整理知识星球 →</Link></div>
    </aside><section className="stellar-panel conversation">
      {!selected ? <div className="model-setup"><h2>为这次探索选择模型</h2><div className="model-fields">
        <label>模型服务<select disabled={busy} value={form.providerId} onChange={e => { const p = providers.find(x => x.id === e.target.value); setForm({ ...form, providerId: e.target.value, modelId: p?.chatModels[0] || '' }); }}>{providers.map(p => <option key={p.id} value={p.id}>{p.name}{p.configured ? ' · 已配置' : ' · 未配置'}</option>)}</select></label>
        <label>聊天模型<select disabled={busy} value={form.modelId} onChange={e => setForm({ ...form, modelId: e.target.value })}><option value="">选择已启用的模型</option>{provider?.chatModels.map(m => <option key={m}>{m}</option>)}</select></label>
        <label>学习方式<select disabled={busy} value={form.scenario} onChange={e => setForm({ ...form, scenario: e.target.value })}>{scenarios.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      </div><p className="stellar-muted">{provider?.configured ? '配置已就绪；实际连通性以请求结果为准。' : guest ? '先在上方输入 API Key 并选择聊天模型；不会自动验证或调用模型。' : '此服务尚未启用。管理员在服务端配置密钥与模型名单后，两端自动获得相同选项。'}</p>
      <details><summary>模型与资料设置</summary><p>协议：{provider?.protocol || '—'}。聊天模型负责回答，向量模型负责寻找相关资料。</p>
        <button disabled={busy || !provider?.configured} onClick={() => void act(async () => { const { data } = await assistant.discover(form.providerId); setNotice('服务返回模型：' + data.models.map(m => m.id).join('、') + '。' + data.note); })}>查询服务端模型目录</button>
        <label className="context-toggle"><input type="checkbox" disabled={busy || Boolean(contextRef)} checked={contextRef ? false : form.includeContext} onChange={e => setForm({ ...form, includeContext: e.target.checked })} />允许检索并发送我的课程知识点和笔记摘录</label>
        {!contextRef && form.includeContext && <><label>检索方式<select disabled={busy} value={form.retrievalMode} onChange={e => setForm({ ...form, retrievalMode: e.target.value })}><option value="keyword">关键词检索 · 不调用向量服务</option><option value="vector">语义向量检索 · 额外消耗模型额度</option></select></label><p className="stellar-muted">每轮最多从最近更新的 24 个知识点和 12 篇笔记中选择 6 条摘录；不是全库搜索。</p></>}
        {!contextRef && form.includeContext && form.retrievalMode === 'vector' && <div className="model-fields"><label>向量服务<select disabled={busy} value={form.embeddingProviderId} onChange={e => { const p = providers.find(x => x.id === e.target.value); setForm({ ...form, embeddingProviderId: e.target.value, embeddingModelId: p?.embeddingModels[0] || '' }); }}><option value="">选择独立向量服务</option>{providers.filter(p => p.configured && p.embeddingModels.length).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>向量模型<select disabled={busy} value={form.embeddingModelId} onChange={e => setForm({ ...form, embeddingModelId: e.target.value })}><option value="">选择向量模型</option>{embeddingProvider?.embeddingModels.map(m => <option key={m}>{m}</option>)}</select>{guest && <input aria-label="手动填写向量模型 ID" placeholder="目录未标明时可填写已开通的向量模型 ID" value={form.embeddingModelId} onChange={e=>setForm({...form,embeddingProviderId:form.providerId,embeddingModelId:e.target.value})}/>}</label></div>}
      </details></div> : <div className="conversation-toolbar"><div><h2>{selected.title}</h2><small>{selected.modelId} · {contextRef ? '本轮附带所选资料' : selected.includeContext ? '资料检索已开启' : '仅聊天内容与已有会话历史'}</small></div><button onClick={exportConversation}>导出 Markdown</button><button disabled={busy} onClick={() => { if (window.confirm(guest ? '删除本次游客会话？已加入本次笔记的内容保留。' : '删除这个共享会话？网页和手机都会移除，已保存的笔记保留。')) void act(async () => { await assistant.remove(selected.id); newSession(); setRefresh(x => x + 1); }); }}>删除</button></div>}
      {contextRef && <AssistantContextPanel source={contextRef} preview={preview} loading={previewLoading} error={previewError} disabled={busy || running} onRefresh={refreshContext} onRemove={() => { clearContext(); setForm(f => ({ ...f, includeContext: false })); setNotice('已移除所选资料；当前问题已保留。'); }}/>}
      <div className={`stellar-turns${contextRef && !turns.length ? ' context-only' : ''}`} aria-live="polite">
        {!turns.length && !contextRef && <div className="conversation-empty"><StellarScene scene="lab" decorative/><div className="conversation-invitation"><h3>今天想理解什么？</h3><p>解释概念、逐题练习，或带着学习资料一起推敲。</p><div className="quick-prompts">{['用例子解释二叉树遍历', '帮我设计一次 25 分钟复习', '用一道题检查我对导数的理解'].map(p => <button key={p} onClick={() => setInput(p)}>{p}</button>)}</div></div></div>}
        {turns.map(t => <article className="stellar-turn" key={t.id}><div className="user-bubble"><small>我</small><p>{t.userText}</p></div><div className="assistant-bubble"><small>课灵 · {t.modelId}</small><p>{t.assistantText || (t.status === 'RUNNING' ? '正在思考，你可以离开页面，稍后回来查看…' : t.error)}</p>{(t.sources.length > 0 || t.status === 'SUCCEEDED') && <details><summary>本轮资料快照与用量</summary>{t.sources.length ? <AssistantSourceList sources={t.sources}/> : <p>本轮没有附带引用资料，回答需自行核实。</p>}<p>输入 {t.usage.inputTokens ?? '未报告'} / 输出 {t.usage.outputTokens ?? '未报告'} tokens</p></details>}{t.status === 'SUCCEEDED' && <button disabled={busy} onClick={() => void act(async () => { await assistant.saveNote(t.id); setNotice(guest ? '已加入本次游客笔记，刷新或退出清除。' : '已保存到共享笔记，手机端可查看。'); })}>{guest ? '加入本次笔记' : '保存到共享笔记'}</button>}{t.status === 'FAILED' && <button onClick={() => setInput(t.userText)}>重新编辑问题</button>}</div></article>)}
      </div><form className="stellar-composer" onSubmit={e => { e.preventDefault(); void send(); }}><label htmlFor="assistant-input">你的问题</label><textarea id="assistant-input" name="question" autoComplete="off" disabled={busy} aria-describedby="assistant-send-help" value={input} onChange={e => setInput(e.target.value)} maxLength={6000} rows={3} placeholder="输入问题；Ctrl / ⌘ + Enter 发送" onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void send(); } }} /><p id="assistant-send-help" className="stellar-muted" role="status">{sendBlockedReason || (contextRef ? '发送时会再次校验资料版本，资料变化时需刷新预览后重新确认。' : '点击发送才会调用所选模型。')}</p><div><small>{input.length}/6000 · AI 回答可能有误，请结合资料核实</small>{running && selected ? <button type="button" disabled={busy} onClick={() => void act(async () => { await assistant.cancel(selected.id); setRefresh(x => x + 1); })}>停止生成</button> : <button className="stellar-primary" disabled={busy || !input.trim() || Boolean(sendBlockedReason)}>{busy ? '正在提交…' : '发送问题 →'}</button>}</div></form>
    </section></div>
  </div>;
}
