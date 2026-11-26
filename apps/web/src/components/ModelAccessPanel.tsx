import { NavigationArrow, SelectFrame } from './NavigationArrow';
import { SectionTitle } from './ModuleTitle';
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
  return currentScope === scopeKey ? <ModelAccessWorkspace key={scopeKey} {...props}/> : <p role="status">正在切换配置…</p>;
}

function ModelAccessWorkspace({ variant = 'full', title = 'API Key 与模型', initialMessage = '', message, onMessageChange, context = [], onAnswer, onSaveAnswer, children }: ModelAccessPanelProps) {
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
  const credentialIssue = !provider ? '请选择服务商。'
    : !/^[\x21-\x7E]{8,4096}$/.test(access.apiKey) ? 'API Key 需为 8–4096 个非空白 ASCII 字符。'
      : provider.endpointRequired && !access.baseUrl ? '请填写官方服务地址。'
        : access.baseUrl && (access.baseUrl.length > 500 || !validEndpoint(access.baseUrl) || access.baseUrl.includes(access.apiKey)) ? '地址须为 HTTPS，最多 500 字符，不含密钥、账号密码、参数或片段。' : '';
  const questionIssue = question.length > 4000 ? '问题不能超过 4000 字符。'
    : selectedContext.length > 3 ? '最多附带 3 段资料。'
      : selectedContext.some(item => !item.title.trim() || item.title.length > 120 || item.text.length > 2000) ? '请编辑所选摘录：标题需为 1–120 字符，正文最多 2000 字符。'
        : !/^[A-Za-z0-9][A-Za-z0-9_.:/@-]{0,159}$/.test(access.model) ? '请输入有效聊天模型 ID（最多 160 字符）。'
          : embeddingOnly ? '请选择聊天模型。'
            : provider && !provider.chat ? '此服务未启用聊天，请更换服务商。' : '';

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
  function clearKey() { stopWaiting(); clearModelAccess(); setShowKey(false); setError(''); setNotice('密钥与配置已清除。' + (busy === 'complete' ? '已发送的请求仍可能计费。' : '')); keyInput.current?.focus(); }
  async function discover() {
    if (busy || credentialIssue) return;
    const credentials = { providerId: access.providerId, apiKey: access.apiKey, baseUrl: access.baseUrl };
    const revision = access.revision; const current = ++requestId.current;
    const abort = new AbortController(); pending.current = abort;
    setBusy('discover'); setError(''); setNotice('');
    try {
      const data = await modelAccess.discover(credentials, abort.signal);
      if (abort.signal.aborted || current !== requestId.current || revision !== useModelAccess.getState().revision) return;
      if (data.providerId !== credentials.providerId) { setError('模型列表不匹配，请重新获取。'); return; }
      acceptDiscovery(data, revision);
      setNotice(`已获取 ${data.models.length} 个模型 · 调用权限未验证`);
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
      setNotice('回答已返回，尚未保存。');
    } catch (reason) { if (!abort.signal.aborted && current === requestId.current && revision === useModelAccess.getState().revision) setError(modelAccessError(reason)); }
    finally { if (!abort.signal.aborted && current === requestId.current) setBusy(null); }
  }
  async function copyAnswer() {
    if (!answer) return;
    try { await navigator.clipboard.writeText(formatModelAccessAnswer(answer)); if (mounted.current) setNotice('已复制。'); }
    catch { if (mounted.current) setError('复制失败，请选中文本手动复制。'); }
  }
  async function saveAnswer() {
    if (!answer || !onSaveAnswer || saving || saved) return;
    setSaving(true); setError('');
    try { await onSaveAnswer(answer); if (mounted.current) { setSaved(true); setNotice(guest ? '已加入笔记，刷新或退出清除。' : '已保存到笔记。'); } }
    catch { if (mounted.current) setError('保存失败，请重试或复制回答。'); }
    finally { if (mounted.current) setSaving(false); }
  }

  return <section className="model-access-panel" aria-labelledby={`${id}-heading`}>
    <header className="model-access-heading"><div><SectionTitle kind="ai" id={`${id}-heading`}>{title}</SectionTitle></div><span className="model-access-memory">仅本机内存</span></header>
    <p className="model-access-intro">{guest ? '密钥仅存本次内存，刷新或退出清除。' : '密钥仅存本次内存，离开面板或刷新、退出、切换账号时清除。'}</p>
    {catalogLoading && <p role="status">正在读取服务商…</p>}
    {catalogError && <div role="alert" className="model-access-error">{catalogError}<button type="button" onClick={() => { setCatalogLoading(true); setCatalogError(''); setCatalogRevision(value => value + 1); }}>重试</button></div>}
    <div className="model-access-fields">
      <label className="model-access-key">API Key<span className="model-access-secret"><input ref={keyInput} id={`${id}-key`} name="model-api-key" type={showKey ? 'text' : 'password'} autoComplete="off" spellCheck={false} autoCapitalize="none" value={access.apiKey} placeholder="粘贴 API Key" aria-describedby={`${id}-key-help`} onChange={event => changeCredentials({ apiKey: event.target.value })}/><button type="button" aria-pressed={showKey} aria-controls={`${id}-key`} onClick={() => setShowKey(value => !value)}>{showKey ? '隐藏' : '显示'}</button></span></label>
      <label>服务商<SelectFrame><select value={access.providerId} disabled={Boolean(busy) || catalogLoading} onChange={event => selectProvider(event.target.value)}><option value="">请选择服务商</option>{providers.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></SelectFrame></label>
    </div>
    <div id={`${id}-key-help`} className="model-access-detection" role="status">{!access.apiKey ? '密钥未验证' : candidate ? <><span>格式匹配：{candidate.name} · 未验证</span>{candidate.id !== access.providerId && <button type="button" disabled={Boolean(busy)} onClick={() => selectProvider(candidate.id)}>选择 {candidate.name}</button>}</> : '未识别服务商'}</div>
    {provider && <div className="model-access-provider-help"><span>聊天：{provider.chat ? '支持' : '未启用'} · 向量：{provider.embedding ? '可列出' : '未提供'}</span>{validDocumentation(provider.documentation) && <a href={provider.documentation} target="_blank" rel="noreferrer">官方文档 <NavigationArrow direction="up-right"/></a>}</div>}
    {provider && (provider.endpointRequired || provider.id === 'huawei' || provider.id === 'ark') && <div className="model-access-endpoint">{Boolean(provider.endpoints?.length) && <label>服务地址<SelectFrame><select disabled={Boolean(busy)} value={provider.endpoints?.includes(access.baseUrl) ? access.baseUrl : ''} onChange={event => changeCredentials({ baseUrl: event.target.value })}><option value="">手动填写</option>{provider.endpoints?.map(endpoint => <option key={endpoint} value={endpoint}>{endpoint}</option>)}</select></SelectFrame></label>}<label>官方服务地址{provider.endpointRequired ? '（必填）' : '（可选）'}<input type="url" name="model-base-url" autoComplete="off" spellCheck={false} disabled={Boolean(busy)} value={access.baseUrl} onChange={event => changeCredentials({ baseUrl: event.target.value })} placeholder={provider.endpointHint || 'https://官方服务域名/接口路径…'}/><small>请选择密钥所属区域。</small></label></div>}
    {provider?.id === 'huawei' && <p className="model-access-hint">v1 接口请手动填写模型 ID。</p>}
    {provider?.id === 'ark' && <p className="model-access-hint">无法获取目录时，请填写已开通的模型或接入点 ID。</p>}
    <p className="model-access-consent">查询模型时，密钥将经课灵转发至所选服务商。</p>
    <div className="model-access-actions"><button type="button" className="model-access-primary" disabled={Boolean(busy) || Boolean(credentialIssue)} onClick={() => void discover()}>{busy === 'discover' ? '正在获取…' : access.fetchedAt ? '刷新模型' : '获取模型'}</button><button type="button" onClick={clearKey}>清除密钥</button>{busy && <button type="button" onClick={() => { stopWaiting(); setNotice('已停止等待，已发送的请求仍可能计费。'); }}>停止等待</button>}</div>
    {credentialIssue && <p className="model-access-hint">{credentialIssue}</p>}
    {error && <p className="model-access-error" role="alert">{error}</p>}{notice && <p className="model-access-notice" role="status">{notice}</p>}
    {access.fetchedAt && <p className="model-access-hint">获取时间：{Number.isNaN(Date.parse(access.fetchedAt)) ? '时间未报告' : new Date(access.fetchedAt).toLocaleString('zh-CN')}</p>}
    <div className="model-access-fields">
      <label>模型列表<SelectFrame><select value={access.models.some(item => item.id === access.model) ? access.model : ''} disabled={Boolean(busy) || !access.models.length} onChange={event => chooseAccessModel(event.target.value)}><option value="">选择聊天模型</option>{access.models.map(item => <option key={item.id} value={item.id} disabled={item.capabilities.includes('embedding') && !item.capabilities.includes('chat')}>{item.id} · {item.capabilities.includes('chat') ? '聊天' : item.capabilities.includes('embedding') ? '向量' : '能力未知'}</option>)}</select></SelectFrame></label>
      <label>模型 ID<input name="model-id" autoComplete="off" spellCheck={false} disabled={Boolean(busy)} value={access.model} onChange={event => chooseAccessModel(event.target.value)} placeholder="手动填写模型 ID"/></label>
    </div>
    {variant === 'full' && <form className="model-access-composer" onSubmit={event => { event.preventDefault(); void complete(); }}>
      {currentContext.length > 0 && <fieldset className="model-access-context"><legend>附带资料（最多 3 段）</legend>{currentContext.map((source, index) => <div key={index}><label><input type="checkbox" checked={indexes.includes(index)} disabled={Boolean(busy)} onChange={event => setSelection({ signature, indexes: event.target.checked ? [...indexes, index] : indexes.filter(item => item !== index) })}/><span>{source.title || '未命名资料'} · {source.text.length}/2000 字符</span></label><details><summary>编辑摘录</summary><label className="model-access-source-editor">标题（{source.title.length}/120）<input autoComplete="off" value={source.title} disabled={Boolean(busy)} onChange={event => editContext(index, { title: event.target.value })}/></label><label className="model-access-source-editor">正文<textarea autoComplete="off" rows={5} value={source.text} disabled={Boolean(busy)} onChange={event => editContext(index, { text: event.target.value })}/></label></details></div>)}</fieldset>}
      <label htmlFor={`${id}-question`}>临时问题<textarea id={`${id}-question`} name="temporary-question" autoComplete="off" value={question} onChange={event => updateQuestion(event.target.value)} rows={4} placeholder="输入问题" aria-describedby={`${id}-send-help`}/></label>
      <p id={`${id}-send-help`} className="model-access-hint">{question.length}/4000 字符 · {selectedContext.length} 段资料 {questionIssue}</p>
      <p className="model-access-consent">发送问题与所选资料至 {provider?.name || '所选服务商'}，可能计费。</p>
      <button className="model-access-primary" type="submit" disabled={Boolean(busy) || Boolean(credentialIssue) || Boolean(questionIssue) || !question.trim()}>{busy === 'complete' ? '正在生成…' : '发送'}<NavigationArrow/></button>
    </form>}
    {answer && <article className="model-access-answer" aria-live="polite"><h3>回答 · {providers.find(item => item.id === answer.providerId)?.name || answer.providerId} · {answer.model}</h3><details><summary>问题与资料</summary><p>{answer.question}</p>{answer.context?.map((source, index) => <div key={index}><strong>[资料 {index + 1}] {source.title}</strong><p>{source.text}</p></div>)}</details><p>{answer.answer}</p><small>输入 {answer.usage?.inputTokens ?? '未报告'} / 输出 {answer.usage?.outputTokens ?? '未报告'} tokens · {saved ? (guest ? '已加入本次笔记' : '已保存') : '未保存'}</small><div className="model-access-actions"><button type="button" onClick={() => void copyAnswer()}>复制回答与资料</button>{onSaveAnswer && <button type="button" disabled={saving || saved} onClick={() => void saveAnswer()}>{saving ? '正在保存…' : saved ? (guest ? '已加入本次笔记' : '已保存') : (guest ? '加入笔记' : '保存笔记')}</button>}</div></article>}
    {children && <div className="model-access-footer">{children}</div>}
  </section>;
}

function validEndpoint(value: string) { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash; } catch { return false; } }
function validDocumentation(value: string) { try { return new URL(value).protocol === 'https:'; } catch { return false; } }
