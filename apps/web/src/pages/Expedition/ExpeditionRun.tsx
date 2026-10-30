import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CHAPTER, sessionTiming } from '@keling/shared/expedition';
import type { Action, Attempt } from '@keling/shared/expedition';
import { actOnExpedition, claimExpedition, expeditionError, refreshExpeditionRun } from '../../services/expedition';
import { readExpeditionLocal, saveExpeditionDraft } from '../../services/expeditionStorage';
import { beginAssistantLaunch } from '../../services/assistantLaunch';
import { useExpeditionWorkspace } from './useExpeditionWorkspace';
import TreeWorkbench, { TreeDiagram } from './TreeWorkbench';
import type { AnswerDraft } from './treeOperations';
import { ExpeditionNotice } from './ExpeditionNotice';
import { statusLabel } from './expeditionLabels';
import './Expedition.css';

interface WorkingDraft extends AnswerDraft { exerciseId: string; nextStep: string; saveCompanion: boolean }
function AttemptReplay({ attempt }: { attempt: Attempt }) {
  const [step, setStep] = useState(0), exercise = CHAPTER.exercises.find(item => item.id === attempt.exerciseId);
  const order = attempt.answer.order || [], shown = Math.min(step, order.length);
  return <details className="exp-replay"><summary>{new Date(attempt.at).toLocaleString('zh-CN')} · {attempt.feedback.kind === 'SELF_REPORTED' ? '解释与自核' : attempt.feedback.correct ? '规则一致' : '需要修正'} · 使用提示 {attempt.hintsUsed} 次</summary>
    {exercise && <TreeDiagram tree={exercise.tree} visited={order.slice(0, shown)}/>}
    {order.length > 0 && <><p>访问顺序回放：{order.slice(0, shown).join(' → ') || '尚未开始'}</p><div className="exp-choice-row"><button disabled={shown === 0} onClick={() => setStep(value => Math.max(0, value - 1))}>上一步</button><span>{shown} / {order.length}</span><button disabled={shown === order.length} onClick={() => setStep(value => Math.min(order.length, value + 1))}>下一步</button></div></>}
    <p>容器／判断：{attempt.answer.structure === 'QUEUE' ? '队列' : attempt.answer.structure === 'STACK' ? '栈' : attempt.answer.validBst === true ? '满足 BST' : attempt.answer.validBst === false ? '不满足 BST' : '开放解释'}</p>
    {attempt.answer.steps && <details><summary>已提交的容器操作日志</summary><ol>{attempt.answer.steps.map((operation, index) => <li key={index}>{operation.type === 'PUSH' ? '加入' : '取出'} {operation.nodeId}</li>)}</ol></details>}
    {attempt.answer.explanation && <blockquote>{attempt.answer.explanation}</blockquote>}
    {attempt.answer.selfCheck?.length ? <p>自核：{attempt.answer.selfCheck.join('；')}</p> : null}
    <p>{attempt.feedback.message}</p><p>题目版本 {attempt.exerciseVersion} · {attempt.firstSubmission ? '该题首次提交' : '修正后的训练提交'}</p>
  </details>;
}
export default function ExpeditionRun() {
  const { id } = useParams<{ id: string }>(), navigate = useNavigate(), workspace = useExpeditionWorkspace();
  const { scope, local, snapshot, busy, perform, setNotice, setError } = workspace;
  const saved = id ? snapshot?.runs[id] : undefined, run = saved?.run;
  const exercise = CHAPTER.exercises.find(item => item.id === run?.exerciseIds[run.exerciseIndex]);
  const [draft, setDraft] = useState<WorkingDraft | null>(null), [sourceAgreed, setSourceAgreed] = useState(false);
  useEffect(() => { if (scope && id) void refreshExpeditionRun(scope, id).catch(error => setError(expeditionError(error))); }, [scope, id, setError]);
  const runId = run?.id, exerciseId = exercise?.id;
  useEffect(() => {
    if (!scope || !runId || !exerciseId) return;
    let active = true;
    void readExpeditionLocal(scope).then(stored => {
      if (!active) return;
      const kept = stored.drafts[runId]?.value as WorkingDraft | undefined;
      setDraft(kept?.exerciseId === exerciseId ? kept : { exerciseId, answer: { order: [] }, operations: [], nextStep: '', saveCompanion: false });
      setSourceAgreed(false);
    }).catch(error => { if (active) setError(expeditionError(error)); });
    return () => { active = false; };
  }, [scope, runId, exerciseId, setError]);
  const writer = run ? snapshot?.writers[run.id] : undefined;
  const own = Boolean(run && local && writer && run.writerDeviceId === local.deviceId && writer.deviceId === local.deviceId && writer.epoch === run.leaseEpoch);
  const closed = run && ['SETTLED', 'CANCELLED', 'CONTENT_STALE'].includes(run.status);
  useEffect(() => {
    if (!scope || !runId || !own || closed) return;
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine) void claimExpedition(scope, runId, 'renew').catch(() => {}); }, 45000);
    return () => window.clearInterval(timer);
  }, [scope, runId, own, closed]);
  const save = (next: WorkingDraft) => {
    setDraft(next);
    if (scope && run) void saveExpeditionDraft(scope, { runId: run.id, baseRevision: run.revision, value: next, updatedAt: new Date().toISOString() }).catch(error => setError(expeditionError(error)));
  };
  const action = (value: Action) => void perform(async () => {
    if (!scope || !run) return;
    const result = await actOnExpedition(scope, run.id, value);
    setNotice(result.queued ? '操作保存在本机待同步队列；最终结果与奖励尚未确认。你仍可查看资料和保留草稿。' : value.type === 'ACK_FEEDBACK' ? '本轮过程已记录。奖励按稳定目标去重，重复练习仍保留证据。' : '操作已保存。');
    if (value.type === 'NEXT' && result.data) setDraft(null);
  });
  const hasQueued = Boolean(local?.outbox.some(operation => operation.runId === id));
  if (!run || !exercise || !draft) return <div className="exp-page" data-motion={workspace.preferences.reducedMotion ? 'reduce' : undefined}><h1>读取远征与本机草稿</h1><ExpeditionNotice error={workspace.error} notice={workspace.notice}/><p>首次打开需要连接服务；已有本机快照将在这里恢复。</p><Link to="/voyage">返回远航</Link></div>;
  const timing = run.timing || sessionTiming(run, saved?.serverTime || run.settledAt || run.startedAt);
  const minutesLabel = (ms: number) => `${Math.floor(ms / 60000)} 分 ${Math.floor(ms % 60000 / 1000)} 秒`;
  const paragraph = CHAPTER.materialParagraphs[exercise.sourceParagraph] || CHAPTER.materialParagraphs[0];
  return <div className="exp-page" data-motion={workspace.preferences.reducedMotion ? 'reduce' : undefined}><header className="exp-heading"><div><p className="exp-eyebrow">{run.questKind === 'TRIAL' ? `综合试炼 ${run.exerciseIndex + 1}/${run.exerciseIds.length}` : exercise.template === 'TEACH_COMPANION' ? '教星芽' : '路线修复'}</p><h1>{exercise.title}</h1><p>{exercise.prompt}</p></div><Link to={`/greenhouse/${run.courseId}/chapter`}>章节地图</Link></header>
    <ExpeditionNotice error={workspace.error} notice={workspace.notice}/>
    <section className="exp-session-status" aria-label="保存与接续状态"><div><strong>{statusLabel[run.status]} · {run.mode === 'TRAINING' ? '训练' : '独立尝试'}</strong><p>{workspace.guest ? '本次游客内存' : own ? '本机持有写入资格' : run.writerDeviceId ? '其他设备或旧会话正在编辑；当前只读' : '当前没有活动编辑设备'} · 版本 {run.revision}{hasQueued ? ' · 存在待同步操作' : ' · 已确认记录'}</p></div><div className="exp-choice-row"><button disabled={busy || !scope} onClick={() => void perform(async () => { if (scope) await refreshExpeditionRun(scope, run.id); })}>刷新当前记录</button>{!closed && <button disabled={busy || !scope} onClick={() => void perform(async () => { if (!scope) return; await refreshExpeditionRun(scope, run.id); if (!own && run.writerDeviceId && !confirm('接管后，另一设备将停止写入；其未同步草稿不会被覆盖。继续接管？')) return; await claimExpedition(scope, run.id, !own && run.writerDeviceId ? 'takeover' : 'acquire'); })}>{own ? '恢复／更新本机写入资格' : '接管到本机'}</button>}{hasQueued && <Link to="/voyage/sync">处理待同步与冲突</Link>}</div></section>
    <p className="exp-caption">截至最近确认（{new Date(timing.asOf).toLocaleTimeString('zh-CN')}）：会话经过 {minutesLabel(timing.elapsedMs)}，已暂停 {minutesLabel(timing.pausedMs)}，未暂停会话 {minutesLabel(timing.runningMs)}。离开页面或休眠不代表实际学习；这些时间不是奖励依据。</p>
    {local?.drafts[run.id] && local.drafts[run.id].baseRevision !== run.revision && <p className="exp-notice">本机草稿始于版本 {local.drafts[run.id].baseRevision}，当前记录为版本 {run.revision}。请核对原记录后再提交；系统不会自动合并答案。</p>}
    <p className="exp-audit-note">内容审核：{exercise.review.humanStatus === 'APPROVED' ? '已记录人工审核' : '待独立人工审核'}。程序规则检查、自述与 AI 建议分开展示；本章当前不颁发严格知识徽章。</p>
    <div className="exp-learning-columns"><aside className="exp-panel exp-source-panel"><h2>本题来源</h2><p>{CHAPTER.materialTitle} · 版本 {CHAPTER.version} · 第 {exercise.sourceParagraph + 1} 段</p><blockquote>{paragraph}</blockquote><details><summary>检查资料版本与位置</summary><ul>{run.sources.map(source => <li key={source.spanId}>{source.materialVersionId} · 字符 {source.startUtf16}–{source.endUtf16}</li>)}</ul></details><h3 id="exp-run-ai-help" tabIndex={-1}>星芽的分级提示</h3>{workspace.preferences.hints === 'KEY_MOMENTS' && !workspace.preferences.reducedMotion && <p>操作引导：先查看结构，再尝试作答；读完反馈后，写下具体的下一步。需要答案线索时再请求下方提示。</p>}{run.hintsUsed ? <ol>{exercise.hints.slice(0, Math.min(run.hintsUsed, exercise.hints.length)).map(hint => <li key={hint}>{hint}</li>)}</ol> : <p>需要时再请求提示。使用提示会保留训练成果，不作为无提示独立证据。</p>}<button disabled={busy || !own || Boolean(closed) || hasQueued || Boolean(run.nextStep) || run.status === 'PAUSED'} onClick={() => action({ type: 'HINT' })}>查看下一条规则提示</button>
      <label className="exp-check"><input type="checkbox" checked={sourceAgreed} onChange={event => setSourceAgreed(event.target.checked)}/>带上上述已显示片段与本题问题，打开 AI 对话。发送时才会调用所选模型。</label><button disabled={!sourceAgreed || busy || !scope || !own || Boolean(closed) || hasQueued || Boolean(run.nextStep) || run.status === 'PAUSED'} onClick={() => void perform(async () => {
        if (!scope) return; const result = await actOnExpedition(scope, run.id, { type: 'HINT' });
        if (result.queued) { setNotice('提示请求待同步，尚未跳转或调用模型。'); return; }
        const key = beginAssistantLaunch(scope.id, { kind: 'course', id: run.courseId }, `请给一个最小必要提示，不要把我的解释当作已验证。题目：${exercise.prompt}\n我选择附带的原创材料（版本${CHAPTER.version}）：${paragraph}\n我的当前解释：${draft.answer.explanation || '尚未填写'}\n学习记录：${run.id}`);
        navigate('/ai', { state: { assistantContextEntry: key } });
      })}>带着本题问星芽</button><Link to="/settings">输入自己的 API Key／选择模型</Link><p className="exp-caption">上述规则提示由已发布题目提供，不伪装成实时 AI 回复。</p>
    </aside><section className="exp-panel"><h2>{closed ? '本轮已结束，可回看下方证据' : '你的学习操作'}</h2>{run.status === 'PAUSED' && <p className="exp-notice">已暂停。草稿保留，恢复后继续作答。</p>}
      <TreeWorkbench key={exercise.id} exercise={exercise} value={draft} onChange={next => save({ ...draft, ...next })} disabled={busy || !own || Boolean(closed) || Boolean(run.nextStep) || hasQueued || run.status === 'PAUSED'}/>
      {!closed && <div className="exp-choice-row"><button className="exp-primary" disabled={busy || !own || hasQueued || Boolean(run.nextStep) || run.status === 'PAUSED'} onClick={() => action({ type: 'SUBMIT', answer: { ...draft.answer, ...(draft.operations.length > 1 ? { steps: draft.operations } : {}) } })}>提交实际作答并核对</button><button disabled={busy || !own || hasQueued} onClick={() => action({ type: run.status === 'PAUSED' ? 'RESUME' : 'PAUSE' })}>{run.status === 'PAUSED' ? '恢复远征' : '暂停并保留'}</button><button disabled={busy || !own || hasQueued} onClick={() => { if (confirm('结束本轮远征？已有作答证据和本机草稿仍可回看，未确认的学习循环不会结算。')) action({ type: 'CANCEL' }); }}>结束本轮</button></div>}
      {run.feedback && <section key={run.attempts.at(-1)?.id} className="exp-feedback exp-feedback-enter" aria-live="polite"><h3>{run.feedback.kind === 'SELF_REPORTED' ? '解释已保存 · 自述反馈' : run.feedback.correct ? '本轮步骤与规则一致' : '发现需要核对的位置'}</h3><p>{run.feedback.message}</p>{run.feedback.stepDeviation != null && <p>从第 {run.feedback.stepDeviation + 1} 个容器操作开始核对；完整日志保留在下方回放。</p>}{run.feedback.expectedOrder && <p>规则参考顺序／越界节点：{run.feedback.expectedOrder.join(' → ') || '无越界节点'}</p>}<ul>{run.feedback.rubric.map(item => <li key={item}>{item}</li>)}</ul>
        {!run.nextStep && run.status === 'AWAITING_FEEDBACK' && <><label>读过反馈后，下一步准备做什么？<textarea rows={3} maxLength={600} value={draft.nextStep} onChange={event => save({ ...draft, nextStep: event.target.value })} placeholder="例如：换一棵树，先写下容器中的节点再预测访问顺序。"/></label>{exercise.template === 'TEACH_COMPANION' && <label className="exp-check"><input type="checkbox" checked={draft.saveCompanion} onChange={event => save({ ...draft, saveCompanion: event.target.checked })}/>我已核对，保存为“我教星芽的知识”（自述档案）</label>}<button className="exp-primary" disabled={busy || !own || hasQueued || draft.nextStep.trim().length < 2} onClick={() => action({ type: 'ACK_FEEDBACK', nextStep: draft.nextStep, saveCompanion: draft.saveCompanion })}>记录本轮证据与下一步</button></>}
        {run.nextStep && <p>已记录下一步：{run.nextStep}</p>}{run.nextStep && !closed && <button disabled={busy || !own || hasQueued} onClick={() => action({ type: 'NEXT' })}>进入试炼的下一个目标</button>}
      </section>}
      {run.status === 'SETTLED' && <div className="exp-choice-row"><Link className="exp-primary" to="/base">看看基地的建设选择</Link><Link to={`/voyage/evidence?course=${run.courseId}`}>回看证据与来源</Link><Link to={`/greenhouse/${run.courseId}/chapter`}>返回地图与回访安排</Link></div>}
    </section></div><section className="exp-panel"><h2>原答案与访问顺序回放</h2>{run.attempts.length ? run.attempts.map(attempt => <AttemptReplay key={attempt.id} attempt={attempt}/>) : <p>提交后的首次答案、提示情况与修正会保留在这里。操作失败不自动代表知识判断下降。</p>}</section>
  </div>;
}
