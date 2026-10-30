import type { ContextPreview, ContextRef, Source } from '../services/assistant';
import './AssistantContextPanel.css';

const kinds = { course: '课程', note: '笔记', task: '任务' };

export function AssistantSourceList({ sources }: { sources: Source[] }) {
  return <div className="assistant-source-list">{sources.map((source, index) => <details key={`${source.kind}:${source.id}:${index}`}>
    <summary>[资料 {index + 1}] {source.title}{source.truncated ? ' · 已截断' : ''}</summary>
    <p className="assistant-source-version">{source.updatedAt
      ? <>资料版本：<time dateTime={source.updatedAt}>{Number.isNaN(Date.parse(source.updatedAt)) ? source.updatedAt : new Date(source.updatedAt).toLocaleString('zh-CN')}</time></>
      : '旧会话未记录版本'}</p>
    {source.truncated && <p>仅发送下方摘录，未包含完整原文。</p>}
    <div className="assistant-source-text" tabIndex={0} role="region" aria-label={`${source.title}的资料摘录`}>{source.text}</div>
  </details>)}</div>;
}

export default function AssistantContextPanel({ source, preview, loading, error, disabled, onRefresh, onRemove }: {
  source: ContextRef;
  preview: ContextPreview | null;
  loading: boolean;
  error: string;
  disabled: boolean;
  onRefresh: () => void;
  onRemove: () => void;
}) {
  return <section className="assistant-context-panel" aria-labelledby="assistant-context-heading" aria-busy={loading}>
    <div className="assistant-context-header"><h3 id="assistant-context-heading">本轮附带的{kinds[source.kind]}资料</h3>
      <div><button type="button" disabled={disabled || loading} onClick={onRefresh}>{error ? '重新获取资料' : '刷新资料'}</button>
        <button type="button" disabled={disabled} onClick={onRemove}>移除资料</button></div></div>
    <p>本轮仅附带这里的资料，不额外检索其他课程或笔记；当前会话历史仍可能参与回答。</p>
    <p className="assistant-context-status" role={error ? 'alert' : 'status'}>{loading ? '正在读取账号中已保存的资料，尚未调用模型…' : error || (preview ? `${preview.title} · 共 ${preview.sources.length} 段，请展开核对实际发送内容。` : '尚未取得资料，请重新获取。')}</p>
    {preview && <><AssistantSourceList sources={preview.sources}/>{preview.warnings.length > 0 && <ul className="assistant-context-warnings">{preview.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}</>}
    <p className="assistant-context-hint">你可以编辑下方问题。点击发送后才会创建对话并把这些摘录交给所选模型；离开页面或切换对话会清除待发问题与资料选择。</p>
  </section>;
}
