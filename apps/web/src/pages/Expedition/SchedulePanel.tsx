import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CHAPTER } from '@keling/shared/expedition';
import { confirmLearningSchedule, previewLearningSchedule } from '../../services/learningSchedule';
import type { SchedulePreview } from '../../services/learningSchedule';
import { useExpeditionWorkspace } from './useExpeditionWorkspace';
import { ExpeditionNotice } from './ExpeditionNotice';
const dateAt = (offset: number) => new Date(Date.now() + 8 * 3600000 + offset * 86400000).toISOString().slice(0, 10);
export default function SchedulePanel({ courseId }: { courseId: string }) {
  const workspace = useExpeditionWorkspace(), { scope, busy, perform, setNotice } = workspace;
  const [startDate, setStart] = useState(dateAt(0)), [examDate, setExam] = useState(dateAt(7)), [dailyMinutes, setBudget] = useState(50);
  const [dayStart, setDayStart] = useState('18:30'), [dayEnd, setDayEnd] = useState('21:00');
  const [restStart, setRestStart] = useState('19:30'), [restEnd, setRestEnd] = useState('19:45'), [rest, setRest] = useState(true);
  const [excluded, setExcluded] = useState(''), [agreed, setAgreed] = useState(false), [confirmed, setConfirmed] = useState(false);
  const [preview, setPreview] = useState<SchedulePreview | null>(null), [signature, setSignature] = useState('');
  const request = { startDate, examDate, dailyMinutes, dayStart, dayEnd, rest: rest ? [{ start: restStart, end: restEnd }] : [], excludedDates: excluded.split(/[,，\s]+/).filter(Boolean),
    units: CHAPTER.objectives.map(objective => ({ title: objective.title + ' · 首章练习', minutes: 25, objectiveKey: objective.key })) };
  const currentSignature = JSON.stringify({ courseId, request });
  return <details className="exp-panel"><summary><strong>安排学习目标 · 规则排程</strong></summary>
    <ExpeditionNotice error={workspace.error} notice={workspace.notice}/><div className="exp-form-grid">
      <label>开始日期<input type="date" value={startDate} onChange={event => setStart(event.target.value)}/></label><label>截止日期<input type="date" value={examDate} onChange={event => setExam(event.target.value)}/></label>
      <label>每日总时长（分钟）<input type="number" min={10} max={240} value={dailyMinutes} onChange={event => setBudget(Number(event.target.value))}/></label>
      <label>每日开始<input type="time" value={dayStart} onChange={event => setDayStart(event.target.value)}/></label><label>每日结束<input type="time" value={dayEnd} onChange={event => setDayEnd(event.target.value)}/></label>
    </div><label className="exp-check"><input type="checkbox" checked={rest} onChange={event => setRest(event.target.checked)}/>保留每日休息时段</label>{rest && <div className="exp-form-grid"><label>休息开始<input type="time" value={restStart} onChange={event => setRestStart(event.target.value)}/></label><label>休息结束<input type="time" value={restEnd} onChange={event => setRestEnd(event.target.value)}/></label></div>}
    <label>不安排的日期（YYYY-MM-DD，空格或逗号分隔）<input value={excluded} onChange={event => setExcluded(event.target.value)} placeholder="2026-11-01 2026-11-02"/></label>
    {workspace.guest && <label className="exp-check"><input type="checkbox" checked={agreed} onChange={event => setAgreed(event.target.checked)}/>同意将课程时段、任务标题与时间发送到课灵排程服务</label>}
    <button disabled={busy || !scope || (workspace.guest && !agreed)} onClick={() => void perform(async () => { if (!scope) return; setPreview(await previewLearningSchedule(scope, courseId, request)); setSignature(currentSignature); setConfirmed(false); })}>计算预览</button>
    {preview && <section className="exp-feedback"><h3>新增 {preview.diff.added} 项 · 已有 {preview.diff.retainedExisting} 项</h3><p>北京时间</p><ul>{preview.tasks.map((task, index) => <li key={index}>{task.date} {task.startTime} · {task.title} · {task.minutes} 分钟</li>)}</ul>
      {preview.unallocated.length > 0 && <><h4>尚未安排</h4><ul>{preview.unallocated.map((task, index) => <li key={index}>{task.title}：{task.reason}</li>)}</ul></>}{preview.warnings.map(warning => <p key={warning}>{warning}</p>)}
      {signature !== currentSignature && <p className="exp-error">条件已修改，请重新预览。</p>}
      <button className="exp-primary" disabled={busy || confirmed || !preview.tasks.length || signature !== currentSignature} onClick={() => void perform(async () => { if (!scope) return; const result = await confirmLearningSchedule(scope, preview.previewId); setConfirmed(true); setNotice(`已添加 ${result.added} 项任务。`); })}>{confirmed ? '已添加' : '添加任务'}</button><Link to="/tasks">任务与计时</Link>
    </section>}
  </details>;
}
