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
    .slice(0, 6).map(course => `「${course.name}」的掌握度记录为 ${Math.round(course.masteryLevel * 100)}%。`);
  if (!courseRecords.length) courseRecords.push('暂无非零掌握度记录');
  const checks = ['掌握度为已有记录值'];
  if (missingTaskMinutes) checks.push(`近 7 天有 ${missingTaskMinutes} 项任务未填时长`);
  if (pendingTasks) checks.push(`当前有 ${pendingTasks} 项待办`);
  if (!completed.length) checks.push('近 7 天暂无完成记录');
  const suggestions = [
    courses.length ? '选一个概念，脱稿解释后核对资料。' : '创建课程并添加资料。',
    pendingTasks ? '完成一项待办并记录时长。' : '创建下一项学习任务。',
    '记录疑问，带着资料提问。',
  ];
  const summary = completed.length
    ? `近 7 天保留的任务中，有 ${completed.length} 项标记为已完成，已填写的任务时长合计 ${recordedTaskMinutes} 分钟${missingTaskMinutes ? `，另有 ${missingTaskMinutes} 项时长缺失` : ''}。当前 ${courses.length} 门课程的累计记录时长为 ${courseLifetimeMinutes} 分钟。`
    : `近 7 天暂无任务完成记录。当前有 ${courses.length} 门课程、${pendingTasks} 项待办；课程累计记录时长为 ${courseLifetimeMinutes} 分钟。`;
  return { accountId: user.id, startDate, endDate: now, courseLifetimeMinutes, recordedTaskMinutes, missingTaskMinutes,
    completedTasks: completed.length, totalCourses: courses.length, coursesWithStudyRecords,
    streakDays: user.streakDays || 0, pendingTasks, summary, courseRecords, checks, suggestions };
}

const dateFormatter = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });

const StudyReport: React.FC = () => {
  const navigate = useNavigate();
  const accountId = useAppStore(state => state.user?.id);
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
        if (alive) setError('读取失败，请重试。');
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
      <div className="header-title"><h1>学习轨迹报告</h1></div>
      <button className="report-refresh" onClick={refresh} disabled={isLoading}><RefreshCw size={16}/>{isLoading ? '读取中' : '刷新记录'}</button>
    </header>
    <StellarSceneBanner scene="report" title="学习记录"/>
    {error ? <div className="report-error" role="alert"><p>{error}</p><button onClick={refresh} disabled={isLoading}>重新读取</button></div>
      : !current ? <p role="status" className="report-loading">正在读取学习记录…</p>
      : <>
        <section className="report-overview" aria-labelledby="report-range-title">
          <h2 id="report-range-title">近 7 天任务记录</h2>
          <p className="date-range">{dateFormatter.format(current.startDate)} — {dateFormatter.format(current.endDate)} · 北京时间</p>
          <div className="overview-stats">
            <div className="stat-box"><BookOpen size={20}/><span className="stat-value">{current.recordedTaskMinutes}</span><span className="stat-unit">分钟</span><span className="stat-label">已填写的任务时长</span></div>
            <div className="stat-box"><CheckCircle size={20}/><span className="stat-value">{current.completedTasks}</span><span className="stat-unit">项</span><span className="stat-label">近 7 天完成</span></div>
            <div className="stat-box"><Flame size={20}/><span className="stat-value">{current.streakDays}</span><span className="stat-unit">天</span><span className="stat-label">连续签到</span></div>
          </div>
          {current.missingTaskMinutes > 0 && <p className="report-method">{current.missingTaskMinutes} 项未填时长</p>}
        </section>
        <section className="data-detail-card">
          <h3 className="card-title">累计记录</h3>
          <div className="data-rows">
            <div className="data-row"><span className="data-label">课程累计记录时长</span><span className="data-value">{current.courseLifetimeMinutes} 分钟</span></div>
            <div className="data-row"><span className="data-label">当前课程数</span><span className="data-value">{current.totalCourses} 门</span></div>
            <div className="data-row"><span className="data-label">累计有时长记录的课程</span><span className="data-value">{current.coursesWithStudyRecords} 门</span></div>
            <div className="data-row"><span className="data-label">当前待完成 / 进行中的任务</span><span className="data-value">{current.pendingTasks} 项</span></div>
          </div>
          <p className="report-method">时长来自已保存的任务记录</p>
        </section>
        <div className="report-analysis-grid">
          <section className="analysis-card">
            <div className="card-header"><div className="card-icon strong-icon"><Target size={24}/></div><h3>当前课程记录</h3></div>
            <ul className="analysis-list">{current.courseRecords.map(point => <li key={point}>{point}</li>)}</ul>
          </section>
          <section className="analysis-card">
            <div className="card-header"><div className="card-icon weak-icon"><TrendingUp size={24}/></div><h3>记录状态</h3></div>
            <ul className="analysis-list">{current.checks.map(point => <li key={point}>{point}</li>)}</ul>
          </section>
        </div>
        <section className="analysis-card">
          <div className="card-header"><div className="card-icon suggestion-icon"><Lightbulb size={24}/></div><h3>学习建议</h3></div>
          <ul className="analysis-list">{current.suggestions.map(point => <li key={point}>{point}</li>)}</ul>

        </section>
        <section className="quick-actions-card"><h3>继续学习</h3><div className="report-action-buttons">
          <button className="report-action-button" onClick={() => navigate('/ai')}><Sparkles size={20}/><span>问 AI</span><ChevronRight size={16}/></button>
          <button className="report-action-button" onClick={() => navigate('/tasks')}><CheckCircle size={20}/><span>查看任务</span><ChevronRight size={16}/></button>
        </div></section>
      </>}
  </div>;
};

export default StudyReport;
