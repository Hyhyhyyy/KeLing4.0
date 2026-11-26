import { ModuleTitle } from '../../components/ModuleTitle';
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
  const [conflict, setConflict] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null); const alive = useRef(true); const actionLock = useRef(false);
  const dirty = editing ? title !== editing.title || content !== editing.content : Boolean(title || content);
  async function refresh() { const { data } = await noteAPI.getAll(); if (alive.current) setNotes(data.notes); }
  useEffect(() => { alive.current = true; const load = () => void refresh().catch(e => { if (alive.current) setError(assistantError(e)); }); load(); window.addEventListener('focus', load); return () => { alive.current = false; window.removeEventListener('focus', load); }; }, []);
  async function action(fn: () => Promise<void>) { if (actionLock.current) return; actionLock.current = true; setBusy(true); setError(''); setNotice(''); try { await fn(); } catch (e) { if (alive.current) { setError(assistantError(e)); if (editing && [404, 409].includes((e as { response?: { status?: number } }).response?.status || 0)) setConflict(true); } } finally { actionLock.current = false; if (alive.current) setBusy(false); } }
  function choose(n: Note | null) { if ((title || content) && (title !== editing?.title || content !== editing?.content) && !window.confirm('切换会丢弃尚未保存的草稿，继续吗？')) return; setEditing(n); setTitle(n?.title || ''); setContent(n?.content || ''); setError(''); setConflict(false); }
  async function save(asCopy = false) { await action(async () => {
    const { data } = editing && !asCopy ? await noteAPI.update(editing.id, { title: title.trim(), content, expectedUpdatedAt: editing.updatedAt }) : await noteAPI.create({ title: title.trim(), content, sourceType: 'USER_CREATED' });
    if (!alive.current) return;
    const saved: Note = data.note;
    setEditing(saved); setTitle(saved.title); setContent(saved.content);
    setNotes(current => [saved, ...current.filter(note => note.id !== saved.id)]);
    setNotice(isGuest ? '已暂存' : '已保存'); setConflict(false);
  }); }
  async function readLatest() {
    if (!editing || !window.confirm('读取最新版将替换当前草稿，请先导出或保存副本。继续吗？')) return;
    await action(async () => {
      const { data } = await noteAPI.getAll();
      const latest: Note | undefined = data.notes.find((note: Note) => note.id === editing.id);
      if (!alive.current) return;
      setNotes(data.notes);
      if (!latest) { setError('原笔记已删除，可将草稿保存为副本。'); return; }
      setEditing(latest); setTitle(latest.title); setContent(latest.content); setConflict(false); setNotice('已读取最新版');
    });
  }
  async function importFile(file?: File) {
    if (!file) return;
    if (!/\.(md|txt)$/i.test(file.name) || file.size > 200000) { setError('支持 200 KB 以内的 Markdown / TXT 文件。'); return; }
    await action(async () => { const text = await file.text(); if (text.length > 50000) { setError('正文超过 50000 字符，请拆分后导入。'); return; } if (!text.trim()) { setError('文件内容为空'); return; } setTitle(file.name.replace(/\.(md|txt)$/i, '').slice(0, 180)); setContent(text); setEditing(null); setConflict(false); setNotice('已导入，请保存'); });
  }
  function download() { const url = URL.createObjectURL(new Blob([`# ${title}\n\n${content}`], { type: 'text/markdown;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = '课灵笔记.md'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  return <div className="shared-notebook"><header><StellarScene scene="archive" decorative/><div><span>KNOWLEDGE ARCHIVE</span><ModuleTitle kind="notes">{isGuest ? '学习笔记 · 本次试用' : '共享学习笔记'}</ModuleTitle></div></header>
    {error && <div role="alert" className="notebook-alert">{error}<p>草稿已保留，可先导出。</p>{conflict && <div className="notebook-actions"><button disabled={busy} onClick={() => void save(true)}>保存为副本</button><button disabled={busy} onClick={() => void readLatest()}>读取最新版</button></div>}</div>}{notice && <p role="status" className="notebook-notice">{notice}</p>}
    <div className="notebook-layout"><aside><input aria-label="搜索笔记" placeholder="搜索标题和内容" value={search} onChange={e => setSearch(e.target.value)} /><button disabled={busy} onClick={() => choose(null)}>＋ 新笔记</button><button disabled={busy} onClick={() => void action(refresh)}>刷新列表</button>{notes.filter(n => (n.title + n.content).toLowerCase().includes(search.toLowerCase())).map(n => <button className={editing?.id === n.id ? 'selected' : ''} key={n.id} disabled={busy} onClick={() => choose(n)}><strong>{n.title}</strong><small>{new Date(n.updatedAt).toLocaleString('zh-CN')}</small></button>)}{!notes.length && <p>暂无笔记</p>}<div className="notebook-shelf"><StellarScene scene="notebookShelf" decorative/></div></aside>
      <section><label>标题<input name="note-title" autoComplete="off" disabled={busy} value={title} maxLength={180} onChange={e => setTitle(e.target.value)} /></label><label>正文<textarea name="note-content" autoComplete="off" disabled={busy} value={content} maxLength={50000} rows={18} onChange={e => setContent(e.target.value)} placeholder="支持 Markdown" /></label><small>{content.length}/50000 字符</small>{(!editing || dirty) && <p id="note-context-help" className="notebook-context-help">问 AI 前请先保存</p>}<div className="notebook-actions"><button className="btn btn-primary" disabled={busy || !title.trim() || !content.trim()} onClick={() => void save()}>保存</button><AskAssistantButton source={{ kind: 'note', id: editing?.id || '' }} prompt="请根据这篇笔记梳理核心概念，指出需要澄清的问题，并给我一道自测题。" disabled={busy || !editing || dirty} describedBy={!editing || dirty ? "note-context-help" : undefined}>问 AI</AskAssistantButton><button disabled={busy} onClick={() => { if ((!title && !content) || window.confirm('导入文件会替换当前编辑区，继续吗？')) fileRef.current?.click(); }}>导入 MD / TXT</button><input ref={fileRef} type="file" accept=".md,.txt,text/plain,text/markdown" hidden onChange={e => { void importFile(e.target.files?.[0]); e.target.value = ''; }} /><button disabled={!content} onClick={download}>导出草稿</button>{editing && <button disabled={busy} onClick={() => { if (window.confirm(isGuest ? '删除本次试用中的这篇笔记？' : '删除此共享笔记？网页与手机都会移除。')) void action(async () => { await noteAPI.delete(editing.id); setEditing(null); setTitle(''); setContent(''); await refresh(); }); }}>删除</button>}</div></section>
    </div></div>;
}
