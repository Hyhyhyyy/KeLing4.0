import { useEffect, useRef, useState } from 'react';
import { noteAPI } from '../../services/api';
import { assistantError } from '../../services/assistant';
import type { Note } from '../../types';
import { StellarScene } from '../../components/StellarScene';
import AskAssistantButton from '../../components/AskAssistantButton';
import { useAppStore } from '../../store/useAppStore';
import './SharedNotebook.css';
export default function SharedNotebook() {
  const isGuest = useAppStore(state => state.isGuest);
  const [notes, setNotes] = useState<Note[]>([]); const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Note | null>(null); const [title, setTitle] = useState(''); const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const fileRef = useRef<HTMLInputElement>(null); const alive = useRef(true);
  const dirty = editing ? title !== editing.title || content !== editing.content : Boolean(title || content);
  async function refresh() { const { data } = await noteAPI.getAll(); if (alive.current) setNotes(data.notes); }
  useEffect(() => { alive.current = true; const load = () => void refresh().catch(e => { if (alive.current) setError(assistantError(e)); }); load(); window.addEventListener('focus', load); return () => { alive.current = false; window.removeEventListener('focus', load); }; }, []);
  async function action(fn: () => Promise<void>) { if (busy) return; setBusy(true); setError(''); setNotice(''); try { await fn(); } catch (e) { if (alive.current) setError(assistantError(e)); } finally { if (alive.current) setBusy(false); } }
  function choose(n: Note | null) { if ((title || content) && (title !== editing?.title || content !== editing?.content) && !window.confirm('切换会丢弃尚未保存的草稿，继续吗？')) return; setEditing(n); setTitle(n?.title || ''); setContent(n?.content || ''); setError(''); }
  async function save() { await action(async () => {
    const { data } = editing ? await noteAPI.update(editing.id, { title: title.trim(), content, expectedUpdatedAt: editing.updatedAt }) : await noteAPI.create({ title: title.trim(), content, sourceType: 'USER_CREATED' });
    if (!alive.current) return;
    const saved: Note = data.note;
    setEditing(saved); setTitle(saved.title); setContent(saved.content);
    setNotes(current => [saved, ...current.filter(note => note.id !== saved.id)]);
    setNotice(isGuest ? '笔记已保留在本次试用中，可带着资料问 AI；刷新或退出后清空。' : '笔记已同步到账号，可带着已保存的资料问 AI。');
  }); }
  async function importFile(file?: File) {
    if (!file) return;
    if (!/\.(md|txt)$/i.test(file.name) || file.size > 200000) { setError('支持 200 KB 以内的 Markdown / TXT 文件。'); return; }
    await action(async () => { const text = await file.text(); if (text.length > 50000) { setError('正文超过 50000 字符，请拆分后导入。'); return; } if (!text.trim()) { setError('文件内容为空'); return; } setTitle(file.name.replace(/\.(md|txt)$/i, '').slice(0, 180)); setContent(text); setEditing(null); setNotice(isGuest ? '已导入编辑区，保存后可在本次试用的其他模块使用。' : '已导入编辑区，确认保存后两端可见。'); });
  }
  function download() { const url = URL.createObjectURL(new Blob([`# ${title}\n\n${content}`], { type: 'text/markdown;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = '课灵笔记.md'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  return <div className="shared-notebook"><header><StellarScene scene="archive" decorative/><div><span>KNOWLEDGE ARCHIVE</span><h1>{isGuest ? '学习笔记 · 本次试用' : '共享学习笔记'}</h1><p>{isGuest ? '整理、导入、导出和向 AI 提问均可使用；笔记仅保留在当前页面内存中。' : '网页整理长文与导入资料，手机随时回顾和补充。'}</p></div></header>
    {error && <div role="alert" className="notebook-alert">{error}<p>草稿仍在编辑区。版本冲突时可先导出草稿，再重新打开最新笔记。</p></div>}{notice && <p role="status" className="notebook-notice">{notice}</p>}
    <div className="notebook-layout"><aside><input aria-label="搜索笔记" placeholder="搜索标题和内容" value={search} onChange={e => setSearch(e.target.value)} /><button disabled={busy} onClick={() => choose(null)}>＋ 新笔记</button>{notes.filter(n => (n.title + n.content).toLowerCase().includes(search.toLowerCase())).map(n => <button className={editing?.id === n.id ? 'selected' : ''} key={n.id} disabled={busy} onClick={() => choose(n)}><strong>{n.title}</strong><small>{new Date(n.updatedAt).toLocaleString('zh-CN')}</small></button>)}{!notes.length && <p>还没有笔记，可新建或从 AI 回答保存。</p>}<div className="notebook-shelf"><StellarScene scene="notebookShelf" decorative/><strong>给每一次理解，留一个坐标</strong><p>记下概念、自己的解释与例子，复习时再补上新的发现。</p></div></aside>
      <section><label>标题<input name="note-title" autoComplete="off" disabled={busy} value={title} maxLength={180} onChange={e => setTitle(e.target.value)} /></label><label>正文<textarea name="note-content" autoComplete="off" disabled={busy} value={content} maxLength={50000} rows={18} onChange={e => setContent(e.target.value)} placeholder="在这里记下你的理解，支持粘贴 Markdown 原文。" /></label><small>{content.length}/50000 字符 · 原文保存，不执行 HTML</small><p id="note-context-help" className="notebook-context-help">{!editing || dirty ? '请先保存当前笔记，再把已保存的资料带入 AI 对话；未保存的草稿不会发送。' : '已保存，可先预览 AI 将看到的资料，再编辑问题并发送。'}</p><div className="notebook-actions"><button className="btn btn-primary" disabled={busy || !title.trim() || !content.trim()} onClick={() => void save()}>{isGuest ? '保存到本次试用' : '保存到共享账号'}</button><AskAssistantButton source={{ kind: 'note', id: editing?.id || '' }} prompt="请根据这篇笔记梳理核心概念，指出需要澄清的问题，并给我一道自测题。" disabled={busy || !editing || dirty} describedBy="note-context-help">带着笔记问 AI</AskAssistantButton><button disabled={busy} onClick={() => { if ((!title && !content) || window.confirm('导入文件会替换当前编辑区，继续吗？')) fileRef.current?.click(); }}>导入 MD / TXT</button><input ref={fileRef} type="file" accept=".md,.txt,text/plain,text/markdown" hidden onChange={e => { void importFile(e.target.files?.[0]); e.target.value = ''; }} /><button disabled={!content} onClick={download}>导出草稿</button>{editing && <button disabled={busy} onClick={() => { if (window.confirm(isGuest ? '删除本次试用中的这篇笔记？' : '删除此共享笔记？网页与手机都会移除。')) void action(async () => { await noteAPI.delete(editing.id); setEditing(null); setTitle(''); setContent(''); await refresh(); }); }}>删除</button>}</div></section>
    </div></div>;
}
