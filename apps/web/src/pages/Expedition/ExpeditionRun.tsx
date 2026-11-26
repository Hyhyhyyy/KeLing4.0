import { NavigationArrow, FlowSequence } from '../../components/NavigationArrow';
import { ModuleTitle, SectionTitle } from '../../components/ModuleTitle';
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
  return <details className="exp-replay"><summary>{new Date(attempt.at).toLocaleString('zh-CN')} · {attempt.feedback.kind === 'SELF_REPORTED' ? '解释与自核' : attempt.feedback.correct ? '规则一致' : '需要修正'} · 提示 {attempt.hintsUsed} 次</summary>
    {exercise && <TreeDiagram tree={exercise.tree} visited={order.slice(0, shown)}/>}
    {order.length > 0 && <><p>访问顺序回放：<FlowSequence items={order.slice(0, shown)} empty="尚未开始"/></p><div className="exp-choice-row"><button disabled={shown === 0} onClick={() => setStep(value => Math.max(0, value - 1))}><NavigationArrow direction="left"/>上一步</button><span>{shown} / {order.length}</span><button disabled={shown === order.length} onClick={() => setStep(value => Math.min(order.length, value + 1))}>下一步<NavigationArrow/></button></div></>}
    <p>容器／判断：{attempt.answer.structure === 'QUEUE' ? '队列' : attempt.answer.structure === 'STACK' ? '栈' : attempt.answer.validBst === true ? '满足 BST' : attempt.answer.validBst === false ? '不满足 BST' : '开放解释'}</p>
    {attempt.answer.steps && <details><summary>操作记录</summary><ol>{attempt.answer.steps.map((operation, index) => <li key={index}>{operation.type === 'PUSH' ? '加入' : '取出'} {operation.nodeId}</li>)}</ol></details>}
    {attempt.answer.explanation && <blockquote>{attempt.answer.explanation}</blockquote>}
    {attempt.answer.selfCheck?.length ? <p>自核：{attempt.answer.selfCheck.join('；')}</p> : null}
    <p>{attempt.feedback.message}</p><p>v{attempt.exerciseVersion} · {attempt.firstSubmission ? '首次作答' : '修正作答'}</p>
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
    setNotice(result.queued ? '已保存在本机，待同步确认。' : value.type === 'ACK_FEEDBACK' ? '本轮已记录。' : '操作已保存。');
    if (value.type === 'NEXT' && result.data) setDraft(null);
  });
  const hasQueued = Boolean(local?.outbox.some(operation => operation.runId === id));
  if (!run || !exercise || !draft) return <div className="exp-page" data-motion={workspace.preferences.reducedMotion ? 'reduce' : undefined}><ModuleTitle kind="voyage">正在加载远征</ModuleTitle><ExpeditionNotice error={workspace.error} notice={workspace.notice}/><Link to="/voyage">返回远航</Link></div>;
  const timing = run.timing || sessionTiming(run, saved?.serverTime || run.settledAt || run.startedAt);
  const minutesLabel = (ms: number) => `${Math.floor(ms / 60000)} 分 ${Math.floor(ms % 60000 / 1000)} 秒`;
  const paragraph = CHAPTER.materialParagraphs[exercise.sourceParagraph] || CHAPTER.materialParagraphs[0];
  return <div className="exp-page" data-motion={workspace.preferences.reducedMotion ? 'reduce' : undefined}><header className="exp-heading"><div><p className="exp-eyebrow">{run.questKind === 'TRIAL' ? `综合试炼 ${run.exerciseIndex + 1}/${run.exerciseIds.length}` : exercise.template === 'TEACH_COMPANION' ? '教星芽' : '路线修复'}</p><ModuleTitle kind="voyage">{exercise.title}</ModuleTitle><p>{exercise.prompt}</p></div><Link to={`/greenhouse/${run.courseId}/chapter`}>章节地图</Link></header>
    <ExpeditionNotice error={workspace.error} notice={workspace.notice}/>
    <section className="exp-session-status" aria-label="保存状态"><div><strong>{statusLabel[run.status]} · {run.mode === 'TRAINING' ? '训练' : '独立尝试'}</strong><p>{workspace.guest ? '游客模式' : own ? '可编辑' : run.writerDeviceId ? '其他会话正在编辑 · 只读' : '尚未接管'}{hasQueued ? ' · 待同步' : ' · 已保存'}</p></div><div className="exp-choice-row"><button disabled={busy || !scope} onClick={() => void perform(async () => { if (scope) await refreshExpeditionRun(scope, run.id); })}>刷新</button>{!closed && <button disabled={busy || !scope} onClick={() => void perform(async () => { if (!scope) return; await refreshExpeditionRun(scope, run.id); if (!own && run.writerDeviceId && !confirm('接管编辑？另一设备停止写入，其草稿保留。')) return; await claimExpedition(scope, run.id, !own && run.writerDeviceId ? 'takeover' : 'acquire'); })}>{own ? '恢复编辑' : '接管到本机'}</button>}{hasQueued && <Link to="/voyage/sync">查看同步</Link>}</div></section>
    <p className="exp-caption">会话 {minutesLabel(timing.elapsedMs)} · 暂停 {minutesLabel(timing.pausedMs)}</p>
    {local?.drafts[run.id] && local.drafts[run.id].baseRevision !== run.revision && <p className="exp-notice">记录已更新，请核对本机草稿后再提交。</p>}
    <p className="exp-audit-note">{exercise.review.humanStatus === 'APPROVED' ? '已人工审核' : '待人工审核'}</p>
    <div className="exp-learning-columns"><aside className="exp-panel exp-source-panel"><SectionTitle kind="voyage">本题来源</SectionTitle><p>{CHAPTER.materialTitle} · 版本 {CHAPTER.version} · 第 {exercise.sourceParagraph + 1} 段</p><blockquote>{paragraph}</blockquote><details><summary>引用位置</summary><ul>{run.sources.map(source => <li key={source.spanId}>{source.materialVersionId} · 字符 {source.startUtf16}–{source.endUtf16}</li>)}</ul></details><SectionTitle kind="ai" as="h3" id="exp-run-ai-help" tabIndex={-1}>规则提示</SectionTitle>{run.hintsUsed ? <ol>{exercise.hints.slice(0, Math.min(run.hintsUsed, exercise.hints.length)).map(hint => <li key={hint}>{hint}</li>)}</ol> : <p>提示后不计独立证据。</p>}<button disabled={busy || !own || Boolean(closed) || hasQueued || Boolean(run.nextStep) || run.status === 'PAUSED'} onClick={() => action({ type: 'HINT' })}>查看提示</button>
      <label className="exp-check"><input type="checkbox" checked={sourceAgreed} onChange={event => setSourceAgreed(event.target.checked)}/>将本题和上述资料带入 AI 对话</label><button disabled={!sourceAgreed || busy || !scope || !own || Boolean(closed) || hasQueued || Boolean(run.nextStep) || run.status === 'PAUSED'} onClick={() => void perform(async () => {
        if (!scope) return; const result = await actOnExpedition(scope, run.id, { type: 'HINT' });
        if (result.queued) { setNotice('提示请求待同步。'); return; }
        const key = beginAssistantLaunch(scope.id, { kind: 'course', id: run.courseId }, `请给一个最小必要提示，不要把我的解释当作已验证。题目：${exercise.prompt}\n我选择附带的原创材料（版本${CHAPTER.version}）：${paragraph}\n我的当前解释：${draft.answer.explanation || '尚未填写'}\n学习记录：${run.id}`);
        navigate('/ai', { state: { assistantContextEntry: key } });
      })}>问星芽</button><Link to="/settings">配置 AI 模型</Link>
    </aside><section className="exp-panel"><SectionTitle kind="voyage">{closed ? '本轮已结束' : '作答'}</SectionTitle>{run.status === 'PAUSED' && <p className="exp-notice">已暂停 · 草稿已保留</p>}
      <TreeWorkbench key={exercise.id} exercise={exercise} value={draft} onChange={next => save({ ...draft, ...next })} disabled={busy || !own || Boolean(closed) || Boolean(run.nextStep) || hasQueued || run.status === 'PAUSED'}/>
      {!closed && <div className="exp-choice-row"><button className="exp-primary" disabled={busy || !own || hasQueued || Boolean(run.nextStep) || run.status === 'PAUSED'} onClick={() => action({ type: 'SUBMIT', answer: { ...draft.answer, ...(draft.operations.length > 1 ? { steps: draft.operations } : {}) } })}>提交作答</button><button disabled={busy || !own || hasQueued} onClick={() => action({ type: run.status === 'PAUSED' ? 'RESUME' : 'PAUSE' })}>{run.status === 'PAUSED' ? '恢复远征' : '暂停'}</button><button disabled={busy || !own || hasQueued} onClick={() => { if (confirm('结束本轮？作答和草稿保留，未完成部分不结算。')) action({ type: 'CANCEL' }); }}>结束本轮</button></div>}
      {run.feedback && <section key={run.attempts.at(-1)?.id} className="exp-feedback exp-feedback-enter" aria-live="polite"><h3>{run.feedback.kind === 'SELF_REPORTED' ? '自述已保存' : run.feedback.correct ? '规则检查通过' : '需要修正'}</h3><p>{run.feedback.message}</p>{run.feedback.stepDeviation != null && <p>请核对第 {run.feedback.stepDeviation + 1} 步操作。</p>}{run.feedback.expectedOrder && <p>参考顺序／越界节点：<FlowSequence items={run.feedback.expectedOrder} empty="无越界节点"/></p>}<ul>{run.feedback.rubric.map(item => <li key={item}>{item}</li>)}</ul>
        {!run.nextStep && run.status === 'AWAITING_FEEDBACK' && <><label>下一步<textarea rows={3} maxLength={600} value={draft.nextStep} onChange={event => save({ ...draft, nextStep: event.target.value })} placeholder="填写下一步练习目标"/></label>{exercise.template === 'TEACH_COMPANION' && <label className="exp-check"><input type="checkbox" checked={draft.saveCompanion} onChange={event => save({ ...draft, saveCompanion: event.target.checked })}/>保存到星芽自述档案</label>}<button className="exp-primary" disabled={busy || !own || hasQueued || draft.nextStep.trim().length < 2} onClick={() => action({ type: 'ACK_FEEDBACK', nextStep: draft.nextStep, saveCompanion: draft.saveCompanion })}>保存下一步</button></>}
        {run.nextStep && <p>已记录下一步：{run.nextStep}</p>}{run.nextStep && !closed && <button disabled={busy || !own || hasQueued} onClick={() => action({ type: 'NEXT' })}>下一个目标</button>}
      </section>}
      {run.status === 'SETTLED' && <div className="exp-choice-row"><Link className="exp-primary" to="/base">前往基地</Link><Link to={`/voyage/evidence?course=${run.courseId}`}>学习证据</Link><Link to={`/greenhouse/${run.courseId}/chapter`}>返回章节</Link></div>}
    </section></div><section className="exp-panel"><SectionTitle kind="voyage">作答记录</SectionTitle>{run.attempts.length ? run.attempts.map(attempt => <AttemptReplay key={attempt.id} attempt={attempt}/>) : <p>暂无作答。</p>}</section>
  </div>;
}
