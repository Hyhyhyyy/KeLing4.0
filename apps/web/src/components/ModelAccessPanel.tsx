import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { acceptDiscovery, changeModelAccessScope, changeModelCredentials, chooseAccessModel, clearModelAccess, formatModelAccessAnswer, modelAccess, modelAccessError, suggestKeyProvider, useModelAccess } from '../services/modelAccess';
import type { ModelAccessAnswer, ModelAccessContext, ModelAccessProvider } from '../services/modelAccess';
import './ModelAccessPanel.css';
import { getGuestSessionId, isGuestSession } from '../services/guestSession';

export interface ModelAccessPanelProps {
  variant?: 'full' | 'configuration';
  title?: string;
  initialMessage?: string;
  message?: string;
  onMessageChange?: (value: string) => void;
  context?: readonly ModelAccessContext[];
  onAnswer?: (result: ModelAccessAnswer) => void;
  onSaveAnswer?: (result: ModelAccessAnswer) => Promise<void>;
  children?: ReactNode;
  scopeKey?: string;
}

export default function ModelAccessPanel({ scopeKey = 'guest', ...props }: ModelAccessPanelProps) {
  scopeKey = getGuestSessionId() || scopeKey;
  const currentScope = useModelAccess(state => state.scopeKey);
  useEffect(() => { changeModelAccessScope(scopeKey); return () => { if (!isGuestSession()) clearModelAccess(); }; }, [scopeKey]);
  return currentScope === scopeKey ? <ModelAccessWorkspace key={scopeKey} {...props}/> : <p role="status">正在清理上一个空间的临时配置…</p>;
}

function ModelAccessWorkspace({ variant = 'full', title = '使用自己的 API Key', initialMessage = '', message, onMessageChange, context = [], onAnswer, onSaveAnswer, children }: ModelAccessPanelProps) {
  const id = useId();
  const guest = isGuestSession();
  const access = useModelAccess();
  const [providers, setProviders] = useState<ModelAccessProvider[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [showKey, setShowKey] = useState(false);
  const [localMessage, setLocalMessage] = useState(initialMessage);
  const [busy, setBusy] = useState<'discover' | 'complete' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [answer, setAnswer] = useState<(ModelAccessAnswer & { question: string }) | null>(null);
  const [saving, setSaving] = useState(false); const [saved, setSaved] = useState(false);
  const mounted = useRef(true);
  const [selection, setSelection] = useState<{ signature: string; indexes: number[] }>({ signature: '', indexes: [] });
  const [contextDrafts, setContextDrafts] = useState<{ signature: string; items: ModelAccessContext[] }>({ signature: '', items: [] });
  const requestId = useRef(0); const pending = useRef<AbortController | null>(null);
  const keyInput = useRef<HTMLInputElement>(null);
  const question = message === undefined ? localMessage : message;
  const provider = providers.find(item => item.id === access.providerId);
  const candidateId = suggestKeyProvider(access.apiKey);
  const candidate = providers.find(item => item.id === candidateId);
  const signature = JSON.stringify(context);
  const currentContext = contextDrafts.signature === signature ? contextDrafts.items : context;
  const indexes = selection.signature === signature ? selection.indexes : [];
  const selectedContext = currentContext.filter((_, index) => indexes.includes(index));
  const selectedModel = access.models.find(item => item.id === access.model);
  const embeddingOnly = Boolean(selectedModel?.capabilities.includes('embedding') && !selectedModel.capabilities.includes('chat'));
  const credentialIssue = !provider ? '请选择将接收这份密钥的服务商。'
    : !/^[\x21-\x7E]{8,4096}$/.test(access.apiKey) ? 'API Key 需为 8–4096 个非空白 ASCII 字符；请去掉首尾空格。'
      : provider.endpointRequired && !access.baseUrl ? '请填写该账号所需的官方服务地址。'
        : access.baseUrl && (access.baseUrl.length > 500 || !validEndpoint(access.baseUrl) || access.baseUrl.includes(access.apiKey)) ? '服务地址须为 HTTPS 且最多 500 字符，不能包含密钥、账号密码、查询参数或片段。' : '';
  const questionIssue = question.length > 4000 ? '问题超过 4000 字符，请手动缩短后再发送。'
    : selectedContext.length > 3 ? '最多附带 3 段资料，请取消部分选择。'
      : selectedContext.some(item => !item.title.trim() || item.title.length > 120 || item.text.length > 2000) ? '所选资料需要非空标题（最多 120 字符），正文最多 2000 字符；请展开并手动编辑本次摘录，或取消选择。'
        : !/^[A-Za-z0-9][A-Za-z0-9_.:/@-]{0,159}$/.test(access.model) ? '请选择或填写有效的聊天模型 ID（最多 160 字符）。'
          : embeddingOnly ? '所选项目是向量模型；本面板只进行聊天问答，请选择聊天模型。'
            : provider && !provider.chat ? '此服务未启用临时聊天能力，请选择可聊天的服务。' : '';

  useEffect(() => {
    const abort = new AbortController();
    void modelAccess.catalog(abort.signal).then(data => {
      if (abort.signal.aborted) return;
      setProviders(data.providers); setCatalogError('');
    }).catch(reason => { if (!abort.signal.aborted) setCatalogError(modelAccessError(reason)); })
      .finally(() => { if (!abort.signal.aborted) setCatalogLoading(false); });
    return () => abort.abort();
  }, [catalogRevision]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; pending.current?.abort(); }; }, []);

  function stopWaiting() { requestId.current++; pending.current?.abort(); setBusy(null); }
  function changeCredentials(change: Parameters<typeof changeModelCredentials>[0]) {
    stopWaiting(); changeModelCredentials(change); setShowKey(false); setError(''); setNotice('');
  }
  function updateQuestion(value: string) {
    if (message === undefined) setLocalMessage(value);
    onMessageChange?.(value);
  }
  function selectProvider(providerId: string) { const selected = providers.find(item => item.id === providerId); changeCredentials({ providerId, baseUrl: selected?.endpointRequired ? selected.endpointHint : '' }); }
  function editContext(index: number, change: Partial<ModelAccessContext>) { setContextDrafts({ signature, items: currentContext.map((source, position) => position === index ? { ...source, ...change } : source) }); }
  function clearKey() { stopWaiting(); clearModelAccess(); setShowKey(false); setError(''); setNotice('API Key 与连接配置已从本机内存清除，问题文本仍保留。' + (busy === 'complete' ? '已送达服务商的请求仍可能继续处理并计费。' : '')); keyInput.current?.focus(); }
  async function discover() {
    if (busy || credentialIssue) return;
    const credentials = { providerId: access.providerId, apiKey: access.apiKey, baseUrl: access.baseUrl };
    const revision = access.revision; const current = ++requestId.current;
    const abort = new AbortController(); pending.current = abort;
    setBusy('discover'); setError(''); setNotice('');
    try {
      const data = await modelAccess.discover(credentials, abort.signal);
      if (abort.signal.aborted || current !== requestId.current || revision !== useModelAccess.getState().revision) return;
      if (data.providerId !== credentials.providerId) { setError('模型列表与所选服务不一致，请重新获取。'); return; }
      acceptDiscovery(data, revision);
      setNotice(`本次收到 ${data.models.length} 个模型条目。目录可见不保证每项都有调用权限，请核对能力标签。`);
    } catch (reason) { if (!abort.signal.aborted && current === requestId.current && revision === useModelAccess.getState().revision) setError(modelAccessError(reason)); }
    finally { if (!abort.signal.aborted && current === requestId.current) setBusy(null); }
  }
  async function complete() {
    if (busy || credentialIssue || questionIssue || !question.trim()) return;
    const revision = access.revision; const current = ++requestId.current;
    const credentials = { providerId: access.providerId, apiKey: access.apiKey, baseUrl: access.baseUrl };
    const submitted = question; const abort = new AbortController(); pending.current = abort;
    setBusy('complete'); setError(''); setNotice('');
    try {
      const data = await modelAccess.complete(credentials, access.model, submitted, selectedContext, abort.signal);
      if (abort.signal.aborted || current !== requestId.current || revision !== useModelAccess.getState().revision) return;
      const redact = (value: string) => value.replaceAll(credentials.apiKey, '[API Key 已隐藏]');
      const result = { ...data, question: redact(submitted), providerId: credentials.providerId, context: selectedContext.map(source => ({ title: redact(source.title), text: redact(source.text) })) };
      setAnswer(result); setSaved(false); onAnswer?.(result);
      setNotice('临时回答已返回，仅在本页显示，未写入共享会话或云端笔记。');
    } catch (reason) { if (!abort.signal.aborted && current === requestId.current && revision === useModelAccess.getState().revision) setError(modelAccessError(reason)); }
    finally { if (!abort.signal.aborted && current === requestId.current) setBusy(null); }
  }
  async function copyAnswer() {
    if (!answer) return;
    try { await navigator.clipboard.writeText(formatModelAccessAnswer(answer)); if (mounted.current) setNotice('已复制问题、回答与本次资料快照，可粘贴到自己的笔记。'); }
    catch { if (mounted.current) setError('浏览器未允许复制，请在回答区选中文本手动复制。'); }
  }
  async function saveAnswer() {
    if (!answer || !onSaveAnswer || saving || saved) return;
    setSaving(true); setError('');
    try { await onSaveAnswer(answer); if (mounted.current) { setSaved(true); setNotice(guest ? '问题、回答与资料快照已加入本次游客笔记，刷新或退出清除。' : '问题、回答与本次资料快照已保存到共享笔记，可在同账号手机端查看。'); } }
    catch { if (mounted.current) setError('保存到共享笔记未完成，回答仍保留在这里；可以重试或复制后自行保存。'); }
    finally { if (mounted.current) setSaving(false); }
  }

  return <section className="model-access-panel" aria-labelledby={`${id}-heading`}>
    <header className="model-access-heading"><div><span className="model-access-eyebrow">MY API KEY / TEMPORARY ACCESS</span><h2 id={`${id}-heading`}>{title}</h2></div><span className="model-access-memory">仅本机内存</span></header>
    <p className="model-access-intro">在这里粘贴自己的 Key，选择服务商并实时获取模型。{guest ? '密钥仅在本次游客内存中，可供 AI 会话和智能编排使用；刷新或退出游客清除，不云同步。' : '课灵不保存密钥；离开面板、刷新页面、退出或切换账号会清除它。临时问答不云同步。'}</p>
    {catalogLoading && <p role="status">正在读取支持的服务商…</p>}
    {catalogError && <div role="alert" className="model-access-error">{catalogError}<button type="button" onClick={() => { setCatalogLoading(true); setCatalogError(''); setCatalogRevision(value => value + 1); }}>重新读取服务商</button></div>}
    <div className="model-access-fields">
      <label className="model-access-key">API Key<span className="model-access-secret"><input ref={keyInput} id={`${id}-key`} name="model-api-key" type={showKey ? 'text' : 'password'} autoComplete="off" spellCheck={false} autoCapitalize="none" value={access.apiKey} placeholder="粘贴所选服务商的 API Key…" aria-describedby={`${id}-key-help`} onChange={event => changeCredentials({ apiKey: event.target.value })}/><button type="button" aria-pressed={showKey} aria-controls={`${id}-key`} onClick={() => setShowKey(value => !value)}>{showKey ? '隐藏' : '显示'}</button></span></label>
      <label>接收密钥的服务商<select value={access.providerId} disabled={Boolean(busy) || catalogLoading} onChange={event => selectProvider(event.target.value)}><option value="">请选择服务商</option>{providers.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
    </div>
    <div id={`${id}-key-help`} className="model-access-detection" role="status">{!access.apiKey ? '只在本地检查格式，不自动验证、不尝试其他厂商。' : candidate ? <><span>格式候选：{candidate.name}；仅凭格式不能确认有效性。</span>{candidate.id !== access.providerId && <button type="button" disabled={Boolean(busy)} onClick={() => selectProvider(candidate.id)}>选择 {candidate.name}</button>}</> : '普通 sk-、JWT 或其他格式不能可靠识别厂商。请从服务商列表手动选择，不会向多个厂商试探。'}</div>
    {provider && <div className="model-access-provider-help"><span>聊天：{provider.chat ? '支持' : '未启用'} · 向量：{provider.embedding ? '可列出候选' : '未提供'}</span>{validDocumentation(provider.documentation) && <a href={provider.documentation} target="_blank" rel="noreferrer">查看该服务官方文档 ↗</a>}</div>}
    {provider && (provider.endpointRequired || provider.id === 'huawei' || provider.id === 'ark') && <div className="model-access-endpoint">{Boolean(provider.endpoints?.length) && <label>官方地址候选<select disabled={Boolean(busy)} value={provider.endpoints?.includes(access.baseUrl) ? access.baseUrl : ''} onChange={event => changeCredentials({ baseUrl: event.target.value })}><option value="">手动填写官方工作空间地址</option>{provider.endpoints?.map(endpoint => <option key={endpoint} value={endpoint}>{endpoint}</option>)}</select></label>}<label>官方服务地址{provider.endpointRequired ? '（必填）' : '（可选）'}<input type="url" name="model-base-url" autoComplete="off" spellCheck={false} disabled={Boolean(busy)} value={access.baseUrl} onChange={event => changeCredentials({ baseUrl: event.target.value })} placeholder={provider.endpointHint || 'https://官方服务域名/接口路径…'}/><small>默认展示首个官方地址，请核对账号区域。不要把 Key 放进地址；自定义服务须由管理员预置。</small></label></div>}
    {provider?.id === 'huawei' && <p className="model-access-hint">华为云模型目录接口有区域限制：当前香港区域 v2 支持列出模型；其他区域可按官方文档手填模型 ID。</p>}
    {provider?.id === 'ark' && <p className="model-access-hint">火山方舟的完整基础模型目录可能需要 AK 签名，API Key 不等于 AK。可按已开通的模型或推理接入点填写 ID。</p>}
    <p className="model-access-consent">点击验证时，密钥经课灵服务转发给你选择的服务商，仅查询模型目录；不会自动发起聊天或测试其他厂商。</p>
    <div className="model-access-actions"><button type="button" className="model-access-primary" disabled={Boolean(busy) || Boolean(credentialIssue)} onClick={() => void discover()}>{busy === 'discover' ? '正在验证并获取模型…' : access.fetchedAt ? '重新验证并刷新模型' : '验证并获取模型'}</button><button type="button" onClick={clearKey}>一键清除 Key</button>{busy && <button type="button" onClick={() => { stopWaiting(); setNotice('已停止等待，服务商仍可能处理已送达的请求并计费。'); }}>停止等待</button>}</div>
    {credentialIssue && <p className="model-access-hint">{credentialIssue}</p>}
    {error && <p className="model-access-error" role="alert">{error}</p>}{notice && <p className="model-access-notice" role="status">{notice}</p>}
    {access.fetchedAt && <p className="model-access-hint">最近获取：{Number.isNaN(Date.parse(access.fetchedAt)) ? '时间未报告' : new Date(access.fetchedAt).toLocaleString('zh-CN')}。{access.note}</p>}
    <div className="model-access-fields">
      <label>本次返回的模型<select value={access.models.some(item => item.id === access.model) ? access.model : ''} disabled={Boolean(busy) || !access.models.length} onChange={event => chooseAccessModel(event.target.value)}><option value="">选择聊天模型，或在右侧手动填写</option>{access.models.map(item => <option key={item.id} value={item.id} disabled={item.capabilities.includes('embedding') && !item.capabilities.includes('chat')}>{item.id} · {item.capabilities.includes('chat') ? '聊天' : item.capabilities.includes('embedding') ? '向量，不能聊天' : '能力未知，需核实'}</option>)}</select></label>
      <label>模型 ID（可手动纠正）<input name="model-id" autoComplete="off" spellCheck={false} disabled={Boolean(busy)} value={access.model} onChange={event => chooseAccessModel(event.target.value)} placeholder="填写该服务实际可用的模型 ID…"/></label>
    </div><p className="model-access-hint">目录可能不完整，能力标签也可能未知。手动填写不代表已验证；是否可用以实际调用结果为准。向量模型用于检索，不用于本面板的聊天。</p>
    {variant === 'full' && <form className="model-access-composer" onSubmit={event => { event.preventDefault(); void complete(); }}>
      {currentContext.length > 0 && <fieldset className="model-access-context"><legend>明确选择本次附带的资料（最多 3 段）</legend><p className="model-access-hint">默认不附带资料。可展开并手动编辑此次摘录，原课程与笔记保持不变；发送的是这里的快照，不再次读取或校验云端版本。超限内容不会自动截断。</p>{currentContext.map((source, index) => <div key={index}><label><input type="checkbox" checked={indexes.includes(index)} disabled={Boolean(busy)} onChange={event => setSelection({ signature, indexes: event.target.checked ? [...indexes, index] : indexes.filter(item => item !== index) })}/><span>{source.title || '未命名资料'} · {source.text.length}/2000 字符</span></label><details><summary>展开并编辑本次摘录</summary><label className="model-access-source-editor">本次资料标题（{source.title.length}/120）<input autoComplete="off" value={source.title} disabled={Boolean(busy)} onChange={event => editContext(index, { title: event.target.value })}/></label><label className="model-access-source-editor">本次资料正文<textarea autoComplete="off" rows={5} value={source.text} disabled={Boolean(busy)} onChange={event => editContext(index, { text: event.target.value })}/></label></details></div>)}</fieldset>}
      <label htmlFor={`${id}-question`}>临时问题<textarea id={`${id}-question`} name="temporary-question" autoComplete="off" value={question} onChange={event => updateQuestion(event.target.value)} rows={4} placeholder="例如：用一个例子解释今天遇到的概念…" aria-describedby={`${id}-send-help`}/></label>
      <p id={`${id}-send-help`} className="model-access-hint">{question.length}/4000 字符 · 本次附带 {selectedContext.length} 段资料。{questionIssue || '仅发送这次问题和明确勾选的资料，不读取共享会话历史。'}</p>
      <p className="model-access-consent">点击发送即把问题与所选资料交给 {provider?.name || '所选服务商'}，可能消耗你在该服务商的额度。回答可能有误，请核实。</p>
      <button className="model-access-primary" type="submit" disabled={Boolean(busy) || Boolean(credentialIssue) || Boolean(questionIssue) || !question.trim()}>{busy === 'complete' ? '正在等待临时回答…' : '使用我的 Key 发送问题'}</button>
    </form>}
    {answer && <article className="model-access-answer" aria-live="polite"><h3>已返回的临时回答 · {providers.find(item => item.id === answer.providerId)?.name || answer.providerId} · {answer.model}</h3><details><summary>查看本次发送的问题与资料</summary><p>{answer.question}</p>{answer.context?.map((source, index) => <div key={index}><strong>[资料 {index + 1}] {source.title}</strong><p>{source.text}</p></div>)}</details><p>{answer.answer}</p><small>输入 {answer.usage?.inputTokens ?? '未报告'} / 输出 {answer.usage?.outputTokens ?? '未报告'} tokens · {saved ? (guest ? '已加入本次笔记' : '已明确保存为共享笔记') : '未保存到共享账号'}</small><div className="model-access-actions"><button type="button" onClick={() => void copyAnswer()}>复制回答与资料</button>{onSaveAnswer && <button type="button" disabled={saving || saved} onClick={() => void saveAnswer()}>{saving ? '正在保存…' : saved ? (guest ? '已加入本次笔记' : '已保存到共享笔记') : (guest ? '加入本次游客笔记' : '保存到共享笔记（云端）')}</button>}</div>{onSaveAnswer && <p className="model-access-hint">{guest ? '仅点击保存才将问题、回答和资料快照加入本次游客笔记。' : '仅点击保存才将问题、回答和资料快照写入共享笔记；不保存密钥。'}</p>}</article>}
    {children && <div className="model-access-footer">{children}</div>}
  </section>;
}

function validEndpoint(value: string) { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash; } catch { return false; } }
function validDocumentation(value: string) { try { return new URL(value).protocol === 'https:'; } catch { return false; } }
