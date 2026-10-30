import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Check, ChevronRight, FlaskConical, Leaf, NotebookPen, Pause, Play, Plus, RotateCcw, ShieldCheck, Sparkles, Timer, Trash2, X } from 'lucide-react';
import { StellarScene } from '../../components/StellarScene';
import ModelAccessPanel from '../../components/ModelAccessPanel';
import { clearModelAccess } from '../../services/modelAccess';
import './Trial.css';

type Module = 'courses' | 'focus' | 'notes' | 'ai' | 'stats';
type Course = { id: string; title: string; subject: string; nodes: { id: string; title: string; text: string }[] };
type Task = { id: string; title: string; minutes: number; done: boolean };
type Note = { id: string; title: string; text: string };
type Context = { key: string; title: string; text: string; truncated: boolean };
type Clock = { taskId: string; target: number; elapsed: number; startedAt: number | null };
type AiConfig = { state: 'loading' | 'ready' | 'error'; available: boolean; model: string | null; reason: string };
type Answer = { kind: 'example' | 'live'; text: string; question?: string; sources?: readonly { title: string; text: string }[]; model?: string; usage?: { inputTokens?: number; outputTokens?: number } };

const modules = [
  { id: 'courses', title: '知识星球', scene: 'garden', icon: Leaf, subtitle: '在一颗小小星球上，种下新的理解。', description: '打开示例知识点，标记已理解，或把资料带进 AI 预览。' },
  { id: 'focus', title: '专注工作室', scene: 'focus', icon: Timer, subtitle: '把遥远的目标，变成眼前的一小步。', description: '添加任务，真实计时，再由你确认完成。计时在本页切换模块时继续。' },
  { id: 'notes', title: '观测手记', scene: 'archive', icon: NotebookPen, subtitle: '给刚刚出现的想法，留一小块地方。', description: '创建和编辑自己的手记，内容只存在这次打开的页面里。' },
  { id: 'ai', title: '星图实验舱', scene: 'lab', icon: FlaskConical, subtitle: '先看清资料，再提出一个好问题。', description: '预览资料、修改问题；真实调用只有在服务可用且你点击发送后发生。' },
  { id: 'stats', title: '本次探索', scene: 'profile', icon: Sparkles, subtitle: '每一步探索，都有看得见的回响。', description: '这里汇总本次页面中的操作，不是历史记录，也不会同步到另一个设备。' },
] as const;

function seedCourses(): Course[] {
  return [
    { id: 'algorithms', title: '算法与思考', subject: '计算机 · 3 个示例知识点', nodes: [
      { id: 'recursion', title: '递归与终止条件', text: '递归把问题缩小为同类子问题。必须同时具备终止条件，以及让每一步接近终止条件的变化。例如计算阶乘：0! = 1，n! = n × (n−1)!。尝试展开 3!，观察函数何时停止。' },
      { id: 'complexity', title: '时间复杂度', text: '时间复杂度描述输入规模增长时，算法执行步骤如何增长。扫描 n 个元素通常是 O(n)；对已经排序的数据做二分查找通常是 O(log n)。它不是某台设备上实际运行秒数的承诺。' },
      { id: 'decomposition', title: '把问题拆开', text: '先明确输入和期望输出，再分解成可以单独检查的小步骤。例如整理课程笔记，可以依次识别主题、提取概念、找出关联，最后用例子检查理解。' },
    ] },
    { id: 'ai-foundations', title: '人工智能初探', subject: 'AI 基础 · 2 个示例知识点', nodes: [
      { id: 'embedding', title: '什么是嵌入向量', text: '嵌入模型把文字转换为一组数字，使含义接近的文字在向量空间中相近。学习应用可以先寻找与问题相关的资料，再把这些资料交给聊天模型。相似并不保证事实正确，仍需要核对来源。' },
      { id: 'grounding', title: '有依据的回答', text: '回答引用资料时，应能指出具体来源，并区分资料中的事实与模型的推测。资料不完整时，需要说明范围；检索结果不等于经过验证的结论。' },
    ] },
  ];
}
const seedTasks = (): Task[] => [
  { id: 'task-recursion', title: '用自己的话解释递归的终止条件', minutes: 5, done: false },
  { id: 'task-note', title: '写下今天想弄懂的一个问题', minutes: 1, done: false },
];
const seedNotes = (): Note[] => [{ id: 'note-first', title: '我的第一份观测手记', text: '我想弄懂：递归为什么必须有终止条件？\n\n试着写一个例子，再用自己的话解释。你可以直接修改这段示例，也可以新建空白笔记。' }];
const emptyClock = (): Clock => ({ taskId: '', target: 5 * 60, elapsed: 0, startedAt: null });
const sampleAnswer = '示例问题：递归为什么需要终止条件？\n\n可以把递归想成逐层打开套盒。每打开一层，就把剩余问题交给下一层；终止条件告诉你何时已经到达最小的盒子。\n\n计算 3! 时：3! → 3 × 2! → 3 × 2 × 1! → 3 × 2 × 1 × 0!，然后用 0! = 1 逐层返回，得到 6。\n\n检查理解：如果每次调用时 n 都没有变小，即使写了 n = 0 的终止条件，程序一定能结束吗？为什么？';
const timeText = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
function clipText(text: string, limit: number) {
  const end = text.length > limit && /[\uD800-\uDBFF]/.test(text[limit - 1]) ? limit - 1 : limit;
  return text.slice(0, end);
}

export default function Trial() {
  const [module, setModule] = useState<Module>('courses');
  const [courses, setCourses] = useState(seedCourses);
  const [courseId, setCourseId] = useState('algorithms');
  const [learned, setLearned] = useState<string[]>([]);
  const [tasks, setTasks] = useState(seedTasks);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskMinutes, setTaskMinutes] = useState('5');
  const [notes, setNotes] = useState(seedNotes);
  const [noteId, setNoteId] = useState('note-first');
  const [clock, setClock] = useState<Clock>(emptyClock);
  const [now, setNow] = useState(0);
  const [bankedSeconds, setBankedSeconds] = useState(0);
  const [context, setContext] = useState<Context[]>([]);
  const [question, setQuestion] = useState('请先用一个直观例子解释，再用一个问题检查我的理解。');
  const [consent, setConsent] = useState(false);
  const [config, setConfig] = useState<AiConfig>({ state: 'loading', available: false, model: null, reason: '正在检查真实 AI 服务是否可用…' });
  const [configVersion, setConfigVersion] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmClear, setConfirmClear] = useState<'clear' | 'examples' | null>(null);
  const [modelPanelEpoch, setModelPanelEpoch] = useState(0);
  const [keyAnswer, setKeyAnswer] = useState<Answer | null>(null);
  const request = useRef<{ id: number; controller: AbortController | null }>({ id: 0, controller: null });
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const confirmationRef = useRef<HTMLButtonElement>(null);

  const stopRequest = useCallback(() => {
    request.current.id++;
    request.current.controller?.abort();
    request.current.controller = null;
    setBusy(false);
  }, []);

  const reset = useCallback((examples: boolean) => {
    stopRequest(); clearModelAccess(); setModelPanelEpoch(value => value + 1); setKeyAnswer(null);
    setCourses(examples ? seedCourses() : []); setCourseId(examples ? 'algorithms' : ''); setLearned([]);
    setTasks(examples ? seedTasks() : []); setTaskTitle(''); setTaskMinutes('5');
    setNotes(examples ? seedNotes() : []); setNoteId(examples ? 'note-first' : '');
    setClock(emptyClock()); setNow(0); setBankedSeconds(0); setContext([]); setQuestion(''); setConsent(false);
    setAnswer(null); setAiError(''); setConfirmClear(null);
    setNotice(examples ? '已重新载入示例。本次编辑、计时和回答已清空。' : '本次内容已清空。可以添加任务、写笔记，或重新载入示例。');
  }, [stopRequest]);

  useEffect(() => { if (confirmClear) confirmationRef.current?.focus(); }, [confirmClear]);

  useEffect(() => {
    const controller = new AbortController();
    setConfig({ state: 'loading', available: false, model: null, reason: '正在检查真实 AI 服务是否可用…' });
    void fetch('/api/trial/config', { credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal, headers: { Accept: 'application/json' } })
      .then(async response => {
        if (!response.ok) throw new Error('暂时无法检查 AI 服务。离线功能与固定示例仍可使用。');
        const data: unknown = await response.json();
        const ai = (data as { ai?: { available?: unknown; model?: unknown; reason?: unknown } })?.ai;
        if (!ai || typeof ai.available !== 'boolean') throw new Error('AI 服务返回了无法识别的状态，请稍后重试。');
        if (!controller.signal.aborted) setConfig({ state: 'ready', available: ai.available, model: typeof ai.model === 'string' ? ai.model : null, reason: typeof ai.reason === 'string' ? ai.reason : ai.available ? '真实 AI 服务可用。' : '真实 AI 尚未配置。' });
      }).catch((error: unknown) => {
        if (!controller.signal.aborted) setConfig({ state: 'error', available: false, model: null, reason: error instanceof SyntaxError ? 'AI 服务尚未提供有效配置，仍可使用自带密钥或离线示例。' : error instanceof Error ? error.message : 'AI 服务暂时不可用。' });
      });
    return () => controller.abort();
  }, [configVersion]);

  useEffect(() => {
    const activeRequests = request.current;
    const clearOnReturn = (event: PageTransitionEvent) => { if (event.persisted) reset(true); };
    // Browser back/forward cache must not resurrect an earlier trial session.
    const clearOnLeave = () => reset(false);
    window.addEventListener('pageshow', clearOnReturn);
    window.addEventListener('pagehide', clearOnLeave);
    return () => { window.removeEventListener('pageshow', clearOnReturn); window.removeEventListener('pagehide', clearOnLeave); clearModelAccess(); activeRequests.id++; activeRequests.controller?.abort(); };
  }, [reset]);

  useEffect(() => {
    if (clock.startedAt === null) return;
    const interval = window.setInterval(() => {
      const current = performance.now(); setNow(current);
      if (clock.elapsed + (current - clock.startedAt!) / 1000 >= clock.target) {
        window.clearInterval(interval);
        setBankedSeconds(value => value + clock.target - clock.elapsed);
        setClock({ ...clock, elapsed: clock.target, startedAt: null });
        setNotice('这一段专注计时已结束。完成了任务后，可以由你标记完成。');
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [clock]);

  const liveElapsed = Math.min(clock.target, clock.elapsed + (clock.startedAt === null ? 0 : Math.max(0, (now - clock.startedAt) / 1000)));
  const focusSeconds = bankedSeconds + Math.max(0, liveElapsed - clock.elapsed);
  const activeModule = modules.find(item => item.id === module)!;
  const course = courses.find(item => item.id === courseId) || courses[0];
  const note = notes.find(item => item.id === noteId);
  const completed = tasks.filter(task => task.done).length;
  const nodeCount = courses.reduce((sum, item) => sum + item.nodes.length, 0);

  function pauseClock() {
    if (clock.startedAt === null) return;
    const elapsed = Math.min(clock.target, clock.elapsed + (performance.now() - clock.startedAt) / 1000);
    setBankedSeconds(value => value + elapsed - clock.elapsed);
    setClock({ ...clock, elapsed, startedAt: null });
  }
  function startClock() {
    const current = performance.now(); setNow(current);
    setClock({ ...clock, elapsed: clock.elapsed >= clock.target ? 0 : clock.elapsed, startedAt: current });
  }
  function resetClock() { pauseClock(); setClock({ ...clock, elapsed: 0, startedAt: null }); }
  function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = taskTitle.trim(), minutes = Number(taskMinutes);
    if (!title || !Number.isInteger(minutes) || minutes < 1 || minutes > 120) { setNotice('请输入任务名称，以及 1–120 之间的整分钟数。'); return; }
    if (tasks.length >= 50) { setNotice('本次试用最多保留 50 个任务，可先移除已完成任务。'); return; }
    setTasks(items => [...items, { id: crypto.randomUUID(), title, minutes, done: false }]);
    setTaskTitle(''); setNotice(`已在本页添加任务：${title}`);
  }
  function selectTask(task: Task) { pauseClock(); setClock({ taskId: task.id, target: task.minutes * 60, elapsed: 0, startedAt: null }); setNotice(`已选择“${task.title}”，点击开始后才计时。`); }
  function toggleTask(task: Task) {
    if (clock.taskId === task.id && !task.done) pauseClock();
    setTasks(items => items.map(item => item.id === task.id ? { ...item, done: !item.done } : item));
    setNotice(task.done ? '任务已恢复为待完成。' : '已标记完成。专注时长只按实际计时计算。');
  }
  function newNote() {
    if (notes.length >= 30) { setNotice('本次试用最多保留 30 篇笔记，可先删除不需要的内容。'); return; }
    const created = { id: crypto.randomUUID(), title: '新的观测手记', text: '' };
    setNotes(items => [created, ...items]); setNoteId(created.id); setNotice('已创建空白手记，修改即时保留在本页内存中。');
  }
  function updateNote(change: Partial<Pick<Note, 'title' | 'text'>>) { setNotes(items => items.map(item => item.id === noteId ? { ...item, ...change } : item)); }
  function chooseContext(key: string, title: string, text: string) {
    if (context.length >= 3 && !context.some(item => item.key === key)) { setNotice('最多选择 3 段资料。请先在实验舱移除一段，再添加。'); setModule('ai'); return; }
    const source = { key, title: clipText(title.trim() || '未命名资料', 120), text: clipText(text, 2000), truncated: text.length > 2000 };
    setContext(items => items.some(item => item.key === key) ? items.map(item => item.key === key ? source : item) : [...items, source]);
    setAnswer(null); setAiError(''); setModule('ai'); setNotice('已选择资料并展示预览，尚未发送给模型。');
  }
  function saveAnswerToNote(result: Answer) {
    if (notes.length >= 30) { setNotice('笔记已达本次上限，请先删除不需要的笔记。'); return; }
    const created = { id: crypto.randomUUID(), title: result.kind === 'example' ? '固定教学示例：递归' : clipText(result.question || '自带模型的学习回答', 80), text: `${result.kind === 'example' ? '【预写示例，非模型生成】' : `【真实 AI 回答 · ${result.model}】`}${result.question ? `\n问题：${result.question}` : ''}\n\n${result.text}${result.sources?.length ? '\n\n本次发送的资料快照：\n' + result.sources.map((source, index) => `\n[资料${index + 1}] ${source.title}\n${source.text}`).join('\n') : ''}` };
    setNotes(items => [created, ...items]); setNoteId(created.id); setModule('notes'); setNotice('已复制到本页手记，没有保存到服务器。');
  }
  function prepareFollowup(title: string) {
    setTaskTitle(clipText(title, 120)); setTaskMinutes('5'); setModule('focus');
    setNotice('已填写学习任务草稿。检查名称和预计时间，点击“添加任务”后才创建。');
  }
  async function sendQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !config.available || !consent || !question.trim() || question.length > 4000) return;
    const id = ++request.current.id, controller = new AbortController(); request.current.controller = controller;
    setBusy(true); setAiError(''); setAnswer(null);
    try {
      const response = await fetch('/api/trial/ai', { method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ message: question.trim(), ...(context.length ? { context: context.map(({ title, text }) => ({ title, text })) } : {}) }),
      });
      const data = await response.json() as { answer?: unknown; model?: unknown; error?: unknown; usage?: Answer['usage'] };
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : '这次请求未成功，请稍后再试。');
      if (typeof data.answer !== 'string' || typeof data.model !== 'string') throw new Error('服务没有返回有效回答。你的问题和资料仍保留在本页。');
      if (id === request.current.id) setAnswer({ kind: 'live', text: data.answer, question: question.trim(), sources: context.map(({ title, text }) => ({ title, text })), model: data.model, usage: { inputTokens: typeof data.usage?.inputTokens === 'number' ? data.usage.inputTokens : undefined, outputTokens: typeof data.usage?.outputTokens === 'number' ? data.usage.outputTokens : undefined } });
    } catch (error) {
      if (id === request.current.id) setAiError(error instanceof SyntaxError ? '服务暂时没有返回有效数据。你的问题仍保留，可稍后重试。' : error instanceof Error ? error.message : '连接失败，请检查网络后重试。');
    } finally { if (id === request.current.id) { request.current.controller = null; setBusy(false); } }
  }

  return <div className="trial-page">
    <a className="trial-skip" href="#trial-main">跳到试用内容</a>
    <header className="trial-topbar"><Link to="/explore" aria-label="退出试用，返回课灵介绍"><img src="/stellar/title_logo.png" alt="课灵 KeLing" /></Link><span className="trial-badge">免登录 · 内存试用</span><Link className="trial-exit" to="/explore">退出试用 <span aria-hidden="true">↗</span></Link></header>
    <div className="trial-container">
      <aside className="trial-boundary" aria-label="试用数据说明"><ShieldCheck size={23} aria-hidden="true"/><div><strong>放心探索，这是一间临时学习舱。</strong><p>任务、笔记和回答只保留在本页内存；刷新、退出或关闭页面后清除。无需账号，不写入学习数据库，不跨设备同步。真实 AI 发送需要你单独确认。</p></div><button type="button" className="trial-text-button" onClick={() => setConfirmClear(value => value ? null : 'clear')}>清空本次内容</button></aside>
      {confirmClear && <div className="trial-clear" role="alert"><p>{confirmClear === 'examples' ? '重新载入示例将清除本次编辑、计时、回答和模型密钥，是否继续？' : '清空本次示例、编辑、计时、回答和模型密钥？清空后无法恢复你的编辑。'}</p><div><button type="button" className="trial-danger" ref={confirmationRef} onClick={() => reset(confirmClear === 'examples')}>确认{confirmClear === 'examples' ? '重新载入' : '清空'}</button><button type="button" onClick={() => setConfirmClear(null)}>保留内容</button></div></div>}
      <nav className="trial-navigation" aria-label="试用模块">{modules.map(item => { const Icon = item.icon; return <button key={item.id} type="button" className={module === item.id ? 'selected' : ''} aria-pressed={module === item.id} onClick={() => setModule(item.id)}><Icon size={20} aria-hidden="true"/>{item.title}</button>; })}</nav>
      <main id="trial-main">
        <section className="trial-hero"><div><span className="trial-kicker">KELING / A LITTLE SPACE TO TRY</span><h1>{activeModule.title}</h1><h2>{activeModule.subtitle}</h2><p>{activeModule.description}</p><span className="trial-memory-dot">当前仅在本页 · 不会自动保存</span></div><StellarScene key={activeModule.scene} scene={activeModule.scene} eager decorative/></section>
        <p className="trial-notice" role="status" aria-live="polite">{notice || '可以自由切换模块，试着完成“看资料 → 提问题 → 写笔记 → 开始专注”的小旅程。'}</p>

        {module === 'courses' && <div className="trial-columns"><aside className="trial-panel trial-course-list"><div className="trial-panel-heading"><h2>示例课程</h2><span>{courses.length} 颗星球</span></div>{courses.map(item => <button type="button" key={item.id} className={course?.id === item.id ? 'trial-list-item selected' : 'trial-list-item'} onClick={() => setCourseId(item.id)}><BookOpen size={22} aria-hidden="true"/><span><strong>{item.title}</strong><small>{item.subject}</small></span><ChevronRight size={18} aria-hidden="true"/></button>)}<p className="trial-muted">这些内容用于体验操作，不计入任何账户的学习进度。</p><button type="button" className="trial-text-button" onClick={() => setConfirmClear('examples')}><RotateCcw size={16} aria-hidden="true"/>重新载入全部示例</button></aside><section className="trial-panel">{course ? <><div className="trial-panel-heading"><div><span className="trial-kicker">YOUR KNOWLEDGE GARDEN</span><h2>{course.title}</h2></div><span>{course.nodes.filter(node => learned.includes(node.id)).length}/{course.nodes.length} 已标记理解</span></div><div className="trial-knowledge">{course.nodes.map((node, index) => <article key={node.id}><span className="trial-node-number">0{index + 1}</span><div><h3>{node.title}</h3><p>{node.text}</p><div className="trial-actions"><button type="button" className={learned.includes(node.id) ? 'trial-soft selected' : 'trial-soft'} onClick={() => setLearned(items => items.includes(node.id) ? items.filter(id => id !== node.id) : [...items, node.id])} aria-pressed={learned.includes(node.id)}><Check size={16} aria-hidden="true"/>{learned.includes(node.id) ? '已理解 · 点击撤销' : '我已理解'}</button><button type="button" className="trial-text-button" onClick={() => chooseContext(node.id, `${course.title} · ${node.title}`, node.text)}>带资料去提问 <ChevronRight size={16} aria-hidden="true"/></button></div></div></article>)}</div></> : <div className="trial-empty"><Leaf size={36} aria-hidden="true"/><h2>星球暂时是空的</h2><p>你可以载入示例，或者先去任务和笔记模块体验。</p><button type="button" className="trial-primary" onClick={() => setConfirmClear('examples')}>重新载入示例</button></div>}</section></div>}

        {module === 'focus' && <div className="trial-columns trial-focus-layout"><section className="trial-panel"><div className="trial-panel-heading"><h2>这一小段，要做什么？</h2><span>{completed}/{tasks.length} 已完成</span></div><form className="trial-task-form" onSubmit={addTask}><label>任务名称<input value={taskTitle} maxLength={120} onChange={event => setTaskTitle(event.target.value)} placeholder="例如：用一个例子解释二分查找" required /></label><label>预计分钟<input type="number" min={1} max={120} step={1} value={taskMinutes} onChange={event => setTaskMinutes(event.target.value)} required /></label><button className="trial-primary" type="submit"><Plus size={18} aria-hidden="true"/>添加任务</button></form><div className="trial-task-list">{tasks.map(task => <article key={task.id} className={task.done ? 'is-done' : ''}><button type="button" className="trial-check" aria-label={`${task.done ? '恢复' : '完成'}任务：${task.title}`} aria-pressed={task.done} onClick={() => toggleTask(task)}>{task.done && <Check size={18} aria-hidden="true"/>}</button><div><h3>{task.title}</h3><span>预计 {task.minutes} 分钟{clock.taskId === task.id ? ' · 当前专注任务' : ''}</span></div><div className="trial-task-actions"><button type="button" className="trial-icon-button" aria-label={`带任务去提问：${task.title}`} title="带任务去提问" onClick={() => chooseContext(task.id, task.title, `任务：${task.title}\n预计 ${task.minutes} 分钟（不是实际完成时长）\n状态：${task.done ? '已手动完成' : '待完成'}`)}><FlaskConical size={16} aria-hidden="true"/></button>{!task.done && <button type="button" className="trial-text-button" onClick={() => selectTask(task)}>选择专注</button>}<button type="button" className="trial-icon-button" aria-label={`移除任务：${task.title}`} onClick={() => { if (clock.taskId === task.id) { pauseClock(); setClock(emptyClock()); } setTasks(items => items.filter(item => item.id !== task.id)); setNotice('任务已从本次试用移除。'); }}><Trash2 size={16} aria-hidden="true"/></button></div></article>)}</div>{!tasks.length && <p className="trial-empty">写下一个小目标，开始你的第一段专注。</p>}</section><aside className="trial-panel trial-timer"><span className="trial-kicker">FOCUS, ONE STEP AT A TIME</span><h2>{tasks.find(task => task.id === clock.taskId)?.title || '自由专注'}</h2><div className={`trial-timer-dial${clock.startedAt !== null ? ' is-running' : ''}`}><span className="trial-timer-time" role="timer" aria-label={`剩余 ${Math.ceil((clock.target - liveElapsed) / 60)} 分钟`}>{timeText(Math.ceil(clock.target - liveElapsed))}</span><span>{clock.startedAt !== null ? '正在专注' : liveElapsed >= clock.target ? '本段计时结束' : liveElapsed > 0 ? '已暂停' : '准备好就出发'}</span></div><div className="trial-presets" aria-label="自由专注时长">{[1, 5, 25].map(minutes => <button key={minutes} type="button" disabled={clock.startedAt !== null} aria-pressed={!clock.taskId && clock.target === minutes * 60} onClick={() => { pauseClock(); setClock({ taskId: '', target: minutes * 60, elapsed: 0, startedAt: null }); }}>{minutes} 分钟</button>)}</div><div className="trial-actions">{clock.startedAt === null ? <button type="button" className="trial-primary" onClick={startClock}><Play size={18} aria-hidden="true"/>{liveElapsed > 0 && liveElapsed < clock.target ? '继续计时' : '开始专注'}</button> : <button type="button" className="trial-primary" onClick={pauseClock}><Pause size={18} aria-hidden="true"/>暂停计时</button>}<button type="button" onClick={resetClock} aria-label="重置本段计时"><RotateCcw size={18} aria-hidden="true"/></button></div><p className="trial-muted">本次实际专注 {timeText(focusSeconds)}<br/>切换模块继续计时；离开或刷新后不保留。</p></aside></div>}

        {module === 'notes' && <div className="trial-columns"><aside className="trial-panel"><div className="trial-panel-heading"><h2>我的手记</h2><span>{notes.length}/30</span></div><button type="button" className="trial-primary trial-full" onClick={newNote}><Plus size={18} aria-hidden="true"/>新建空白手记</button><div className="trial-note-list">{notes.map(item => <button key={item.id} type="button" className={item.id === noteId ? 'trial-list-item selected' : 'trial-list-item'} onClick={() => setNoteId(item.id)}><NotebookPen size={20} aria-hidden="true"/><span><strong>{item.title.trim() || '未命名手记'}</strong><small>{item.text.length} 字符 · 仅本页</small></span></button>)}</div><p className="trial-muted">切换模块时仍可回来编辑。退出页面后，这些手记不会出现在你的账户中。</p></aside><section className="trial-panel trial-note-editor">{note ? <><div className="trial-panel-heading"><h2>编辑手记</h2><span className="trial-memory-dot">内存即时更新</span></div><label>标题<input value={note.title} maxLength={120} onChange={event => updateNote({ title: event.target.value })} placeholder="给想法起个名字"/></label><label>正文<textarea value={note.text} maxLength={12000} rows={12} onChange={event => updateNote({ text: event.target.value })} placeholder="写下问题、例子，或刚刚形成的理解…"/></label><div className="trial-editor-footer"><span>{note.text.length}/12000 字符</span><button type="button" className="trial-text-button" onClick={() => { setNotes(items => items.filter(item => item.id !== note.id)); setNoteId(notes.find(item => item.id !== note.id)?.id || ''); setNotice('这篇手记已移除；已经选到 AI 中的资料快照可在实验舱单独移除。'); }}><Trash2 size={16} aria-hidden="true"/>删除手记</button></div><button type="button" className="trial-primary" disabled={!note.text.trim()} onClick={() => chooseContext(note.id, note.title, note.text)}>带这篇笔记去提问 <ChevronRight size={16} aria-hidden="true"/></button></> : <div className="trial-empty"><NotebookPen size={36} aria-hidden="true"/><h2>给想法留个位置</h2><p>新建一篇空白手记，试着写下你自己的问题。</p><button type="button" className="trial-primary" onClick={newNote}>新建手记</button></div>}</section></div>}

        <div className="trial-ai-layout" hidden={module !== 'ai'}><section className="trial-panel"><div className="trial-panel-heading"><h2>将要使用的资料</h2><span>{context.length}/3 段</span></div><p className="trial-muted">这是选择时的内容快照，每段最多 2000 字符。编辑原笔记后，再次选择可更新。不会读取你的账户资料。</p>{context.length ? <div className="trial-context-list">{context.map((item, index) => <article key={item.key}><div><h3>资料 {index + 1} · {item.title}</h3><button type="button" className="trial-icon-button" aria-label={`移除资料：${item.title}`} onClick={() => setContext(items => items.filter(source => source.key !== item.key))} disabled={busy}><X size={18} aria-hidden="true"/></button></div><p>{item.text || '（没有正文）'}</p><small>{item.text.length} 字符{item.truncated ? ' · 已截取，后续正文不会发送' : ' · 完整选段'}</small></article>)}</div> : <div className="trial-empty trial-context-empty"><BookOpen size={30} aria-hidden="true"/><p>还没有选资料。可以直接提问，或从知识星球、观测手记带一段内容过来。</p><div className="trial-actions"><button type="button" onClick={() => setModule('courses')}>选择知识点</button><button type="button" onClick={() => setModule('notes')}>选择手记</button></div></div>}</section><section className="trial-panel">
          <ModelAccessPanel key={modelPanelEpoch} title="输入自己的 Key，试用真实 AI" message={question} onMessageChange={setQuestion} context={context} onAnswer={result => setKeyAnswer({ kind: 'live', text: result.answer, question: result.question, sources: result.context, model: result.model })}>
            {keyAnswer && <div className="trial-actions trial-byok-actions"><button type="button" onClick={() => saveAnswerToNote(keyAnswer)}>复制最新回答为本页手记</button><button type="button" onClick={() => prepareFollowup('复习刚才的 AI 回答，写出一个自己的例子')}>安排学习任务</button><span>需你点击才加入本次内存空间。</span></div>}
          </ModelAccessPanel>
          <div className="trial-example-entry"><div><strong>暂时没有模型密钥？</strong><p>可以先查看一份固定讲解，体验从回答到笔记和任务的过程。</p></div><button type="button" onClick={() => { setAnswer({ kind: 'example', text: sampleAnswer }); setAiError(''); }}>查看固定教学示例</button></div>
          <details className="trial-admin-fallback"><summary>使用本站提供的试用模型（可选备用）</summary><div className={`trial-ai-availability${config.available ? ' available' : ''}`} role="status"><span className="trial-status-dot"/><div><strong>{config.state === 'loading' ? '检查 AI 服务中' : config.available ? '真实 AI 可用' : '真实 AI 暂不可用'}</strong><p>{config.reason}{config.model ? ` · ${config.model}` : ''}</p></div><button type="button" className="trial-text-button" disabled={config.state === 'loading' || busy} onClick={() => setConfigVersion(value => value + 1)}>重新检查</button></div><form onSubmit={sendQuestion} className="trial-ai-form"><label htmlFor="trial-question">你想弄懂什么？</label><textarea ref={questionRef} id="trial-question" value={question} onChange={event => setQuestion(event.target.value)} maxLength={4000} rows={5} disabled={busy} placeholder="例如：请用生活中的例子解释递归，再给我一道小练习。"/><div className="trial-editor-footer"><span>{question.length}/4000 字符</span><span>每次独立提问 · 不发送历史对话</span></div><label className="trial-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={busy}/><span>我同意把本次问题和上方资料发给模型服务商。课灵不持久化这次问答；服务商按其政策处理内容。</span></label><div className="trial-actions"><button type="submit" className="trial-primary" disabled={!config.available || !consent || !question.trim() || question.length > 4000 || busy}>{busy ? '正在等待真实回答…' : '发送给真实 AI'}</button>{busy && <button type="button" onClick={() => { stopRequest(); setAiError('已停止等待。已经发出的内容可能仍由模型服务商处理。'); }}>停止等待</button>}<button type="button" disabled={busy} onClick={() => { setAnswer({ kind: 'example', text: sampleAnswer }); setAiError(''); }}>查看固定教学示例</button></div>{!config.available && <p className="trial-muted">你仍可编辑问题与资料。固定示例可以体验讲解结构，但不会回答当前问题。</p>}{aiError && <p className="trial-error" role="alert">{aiError}</p>}</form></details>{answer && <article className="trial-answer"><div className="trial-panel-heading"><h2>{answer.kind === 'example' ? '固定教学示例' : '本次真实回答'}</h2><span>{answer.kind === 'example' ? '非模型生成' : answer.model}</span></div>{answer.kind === 'example' && <p className="trial-example-label">预先编写的示例，与当前输入和资料无关；未调用模型。</p>}<div className="trial-answer-text">{answer.text}</div>{answer.kind === 'live' && <small>模型返回用量：输入 {answer.usage?.inputTokens ?? '未提供'} · 输出 {answer.usage?.outputTokens ?? '未提供'} tokens。回答需结合资料自行核对。</small>}<div className="trial-actions"><button type="button" onClick={() => saveAnswerToNote(answer)}>复制为本页手记</button><button type="button" onClick={() => prepareFollowup(answer.kind === 'example' ? '用自己的话解释递归，并写出终止条件' : clipText(answer.question || '复习这次 AI 回答，写出自己的例子', 120))}>安排学习任务</button><button type="button" className="trial-text-button" onClick={() => { setAnswer(null); questionRef.current?.focus(); }}>收起回答</button></div></article>}</section></div>

        {module === 'stats' && <section className="trial-panel trial-stats"><div className="trial-panel-heading"><div><span className="trial-kicker">THIS VISIT, YOUR OWN PACE</span><h2>刚刚走过的小小航程</h2></div><span>仅本次 · 无历史趋势</span></div><div className="trial-stat-grid"><article><Timer size={24} aria-hidden="true"/><strong>{timeText(focusSeconds)}</strong><span>实际计时专注</span><small>不使用任务预计时长代替</small></article><article><Check size={24} aria-hidden="true"/><strong>{completed}<small> / {tasks.length}</small></strong><span>手动确认完成的任务</span><small>示例初始均未完成</small></article><article><Leaf size={24} aria-hidden="true"/><strong>{learned.length}<small> / {nodeCount}</small></strong><span>自己标记理解的知识点</span><small>自我评估，不是 AI 测评结果</small></article><article><NotebookPen size={24} aria-hidden="true"/><strong>{notes.length}</strong><span>本页手记</span><small>含已载入且未删除的示例</small></article></div><div className="trial-next-step"><div><h3>再走完一个小闭环</h3><p>选一段资料，写下一个问题，把理解整理成笔记，最后用几分钟专注去实践。</p></div><div className="trial-actions"><button type="button" className="trial-primary" onClick={() => setModule('courses')}>回到知识星球</button><button type="button" onClick={() => setModule('focus')}>开始一段专注</button></div></div><p className="trial-muted">无需注册即可体验以上功能。试用内容不会迁移到账号，也不会与手机上的试用共享；退出后这次航程就结束。</p></section>}
      </main>
      <footer className="trial-footer"><span>课灵 · 让理解发生在下一小步</span><button type="button" className="trial-text-button" onClick={() => { setConfirmClear('clear'); window.scrollTo({ top: 0, behavior: 'instant' }); }}>清空本次内容</button><Link to="/explore">退出并返回介绍</Link></footer>
    </div>
  </div>;
}
