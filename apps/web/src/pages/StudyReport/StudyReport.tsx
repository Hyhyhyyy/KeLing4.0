import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, CheckCircle, Flame, Sparkles, Target, TrendingUp, Lightbulb, ChevronRight, RefreshCw } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { authAPI, courseAPI, taskAPI } from '../../services/api';
import type { Course, Task, User } from '../../types';
import { StellarSceneBanner } from '../../components/StellarScene';
import './StudyReport.css';

interface StudyReportData {
  accountId: string;
  startDate: Date;
  endDate: Date;
  courseLifetimeMinutes: number;
  recordedTaskMinutes: number;
  missingTaskMinutes: number;
  completedTasks: number;
  totalCourses: number;
  coursesWithStudyRecords: number;
  streakDays: number;
  pendingTasks: number;
  summary: string;
  courseRecords: string[];
  checks: string[];
  suggestions: string[];
}

// A rolling seven-day snapshot of stored records; no model call or mastery diagnosis.
function buildReport(user: User, courses: Course[], tasks: Task[], now: Date): StudyReportData {
  const startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const completed = tasks.filter(task => {
    if (task.status !== 'COMPLETED' || !task.completedAt) return false;
    const completedAt = new Date(task.completedAt).getTime();
    return completedAt >= startDate.getTime() && completedAt <= now.getTime();
  });
  const recorded = completed.filter(task => typeof task.actualMinutes === 'number' && Number.isFinite(task.actualMinutes) && task.actualMinutes >= 0);
  const recordedTaskMinutes = recorded.reduce((sum, task) => sum + task.actualMinutes!, 0);
  const missingTaskMinutes = completed.length - recorded.length;
  const courseLifetimeMinutes = courses.reduce((sum, course) => sum + Math.max(0, course.totalStudyMinutes || 0), 0);
  const coursesWithStudyRecords = courses.filter(course => course.totalStudyMinutes > 0).length;
  const pendingTasks = tasks.filter(task => task.status === 'PENDING' || task.status === 'IN_PROGRESS').length;
  const courseRecords = courses.filter(course => course.masteryLevel > 0 && course.masteryLevel <= 1)
    .slice(0, 6).map(course => `「${course.name}」的掌握度记录为 ${Math.round(course.masteryLevel * 100)}%。这是当前记录值，不是本报告测评得出的结果。`);
  if (!courseRecords.length) courseRecords.push('目前没有非零掌握度记录。默认值 0 不能区分未填写与尚未掌握，需要结合练习核实。');
  const checks = ['完成任务和签到只能反映行为记录，不能据此判断理解程度或学习效率。'];
  if (missingTaskMinutes) checks.push(`近 7 天有 ${missingTaskMinutes} 项已完成任务未记录时长，时长合计不包含这些任务。`);
  if (pendingTasks) checks.push(`当前有 ${pendingTasks} 项待完成或进行中的任务，可检查优先级和预计用时。`);
  if (!completed.length) checks.push('近 7 天没有符合统计范围的完成记录，无法据此判断学习节奏或薄弱领域。');
  const suggestions = [
    courses.length ? '选一门课程，尝试不看资料解释一个概念，再用原文核对。' : '先创建一门课程，添加你正在学习的真实资料。',
    pendingTasks ? '从待办中选一项开始专注，完成时确认本次记录时长。' : '为下一次学习创建一个范围明确、可完成的小任务。',
    '把仍有疑问的地方记入笔记；需要 AI 帮助时，带着资料与具体问题进入助手。',
  ];
  const summary = completed.length
    ? `近 7 天保留的任务中，有 ${completed.length} 项标记为已完成，已填写的任务时长合计 ${recordedTaskMinutes} 分钟${missingTaskMinutes ? `，另有 ${missingTaskMinutes} 项时长缺失` : ''}。当前 ${courses.length} 门课程的累计记录时长为 ${courseLifetimeMinutes} 分钟。这些记录尚不足以单独证明知识掌握程度。`
    : `近 7 天暂无任务完成记录。当前有 ${courses.length} 门课程、${pendingTasks} 项待办；课程累计记录时长为 ${courseLifetimeMinutes} 分钟。没有足够证据评价近期学习节奏或知识掌握情况。`;
  return { accountId: user.id, startDate, endDate: now, courseLifetimeMinutes, recordedTaskMinutes, missingTaskMinutes,
    completedTasks: completed.length, totalCourses: courses.length, coursesWithStudyRecords,
    streakDays: user.streakDays || 0, pendingTasks, summary, courseRecords, checks, suggestions };
}

const dateFormatter = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });

const StudyReport: React.FC = () => {
  const navigate = useNavigate();
  const accountId = useAppStore(state => state.user?.id);
  const isGuest = useAppStore(state => state.isGuest);
  const [report, setReport] = useState<StudyReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!accountId) return;
    let alive = true;
    let inFlight = false;
    async function load() {
      if (inFlight) return;
      inFlight = true;
      try {
        // An unavailable endpoint is not an empty record set.
        const [profile, courseList, taskList] = await Promise.all([authAPI.getMe(), courseAPI.getAll(), taskAPI.getAll()]);
        if (!alive) return;
        if (profile.data.user.id !== accountId) throw new Error('账户已切换，请重新载入报告。');
        setReport(buildReport(profile.data.user as User, courseList.data.courses as Course[], taskList.data.tasks as Task[], new Date()));
        setError('');
      } catch {
        if (alive) setError('暂时无法完整读取学习记录。请检查连接后重试；当前不显示未核实的统计。');
      } finally {
        inFlight = false;
        if (alive) setIsLoading(false);
      }
    }
    void load();
    const onFocus = () => { if (document.visibilityState === 'visible') { setIsLoading(true); void load(); } };
    window.addEventListener('focus', onFocus);
    return () => { alive = false; window.removeEventListener('focus', onFocus); };
  }, [accountId, revision]);
  const refresh = () => { setIsLoading(true); setRevision(value => value + 1); };
  const current = report?.accountId === accountId ? report : null;
  return <div className="report-container">
    <header className="page-header">
      <button className="back-btn" onClick={() => navigate(-1)}>‹ 返回</button>
      <div className="header-title"><h1>学习轨迹报告</h1><p>{isGuest ? '本次试用的实际记录 · 重新打开后不保留历史数据' : '真实记录摘要 · 近 7 天与累计数据分开展示'}</p></div>
      <button className="report-refresh" onClick={refresh} disabled={isLoading}><RefreshCw size={16}/>{isLoading ? '读取中' : '刷新记录'}</button>
    </header>
    <StellarSceneBanner scene="report" eyebrow="LEARNING / OBSERVATION LOG" title="让每一次进步，有迹可循" description="从已保存的任务和课程记录回顾学习，把需要核实的问题带到下一次探索。"/>
    {error ? <div className="report-error" role="alert"><p>{error}</p><button onClick={refresh} disabled={isLoading}>重新读取</button></div>
      : !current ? <p role="status" className="report-loading">正在读取学习记录…</p>
      : <>
        <section className="report-overview" aria-labelledby="report-range-title">
          <h2 id="report-range-title">近 7 天任务记录</h2>
          <p className="date-range">{dateFormatter.format(current.startDate)} — {dateFormatter.format(current.endDate)} · 北京时间</p>
          <div className="overview-stats">
            <div className="stat-box"><BookOpen size={20}/><span className="stat-value">{current.recordedTaskMinutes}</span><span className="stat-unit">分钟</span><span className="stat-label">已填写的任务时长</span></div>
            <div className="stat-box"><CheckCircle size={20}/><span className="stat-value">{current.completedTasks}</span><span className="stat-unit">项</span><span className="stat-label">近 7 天完成</span></div>
            <div className="stat-box"><Flame size={20}/><span className="stat-value">{current.streakDays}</span><span className="stat-unit">天</span><span className="stat-label">最近签到的连签记录</span></div>
          </div>
          <p className="report-method">按任务完成时间归入滚动 7 天，签到记录独立展示；不代表自然周或所有学习活动。{current.missingTaskMinutes > 0 && `另有 ${current.missingTaskMinutes} 项任务时长缺失，未计入合计。`}</p>
        </section>
        <section className="record-summary-card">
          <div className="card-header"><div className="card-icon record-icon"><BookOpen size={24}/></div><div><h3>记录摘要</h3><span className="report-source">依据当前记录自动整理 · 未调用 AI 模型</span></div></div>
          <p className="insight-content">{current.summary}</p>
        </section>
        <section className="data-detail-card">
          <h3 className="card-title">记录范围与统计口径</h3>
          <div className="data-rows">
            <div className="data-row"><span className="data-label">课程累计记录时长</span><span className="data-value">{current.courseLifetimeMinutes} 分钟</span></div>
            <div className="data-row"><span className="data-label">当前课程数</span><span className="data-value">{current.totalCourses} 门</span></div>
            <div className="data-row"><span className="data-label">累计有时长记录的课程</span><span className="data-value">{current.coursesWithStudyRecords} 门</span></div>
            <div className="data-row"><span className="data-label">当前待完成 / 进行中的任务</span><span className="data-value">{current.pendingTasks} 项</span></div>
          </div>
          <p className="report-method">任务时长来自保存的完成记录，可能由用户填写或沿用完成时的默认值，不等同于独立计时测量。缺失时长不会用预计时长补齐。课程累计时长未按日期拆分，不能当作近 7 天时长；已删除的课程或任务不在当前记录范围内。</p>
        </section>
        <div className="report-analysis-grid">
          <section className="analysis-card">
            <div className="card-header"><div className="card-icon strong-icon"><Target size={24}/></div><h3>当前课程记录</h3></div>
            <ul className="analysis-list">{current.courseRecords.map(point => <li key={point}>{point}</li>)}</ul>
          </section>
          <section className="analysis-card">
            <div className="card-header"><div className="card-icon weak-icon"><TrendingUp size={24}/></div><h3>值得核对的地方</h3></div>
            <ul className="analysis-list">{current.checks.map(point => <li key={point}>{point}</li>)}</ul>
          </section>
        </div>
        <section className="analysis-card">
          <div className="card-header"><div className="card-icon suggestion-icon"><Lightbulb size={24}/></div><h3>下一步可尝试</h3></div>
          <ul className="analysis-list">{current.suggestions.map(point => <li key={point}>{point}</li>)}</ul>
          <p className="report-source">以上为基于记录的通用提示，不是 AI 个性化诊断。</p>
        </section>
        <section className="quick-actions-card"><h3>继续学习</h3><div className="action-buttons">
          <button className="action-btn ai" onClick={() => navigate('/ai')}><Sparkles size={20}/><span>带着问题进入 AI 助手</span><ChevronRight size={16}/></button>
          <button className="action-btn tasks" onClick={() => navigate('/tasks')}><CheckCircle size={20}/><span>查看与完成任务</span><ChevronRight size={16}/></button>
        </div></section>
      </>}
  </div>;
};

export default StudyReport;
