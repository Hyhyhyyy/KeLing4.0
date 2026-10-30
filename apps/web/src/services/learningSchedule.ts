import api from './api';
import { getGuestWorkspace, guestTimestamp } from './guestData';
import type { GuestTask } from './guestData';
import { subscribeGuestSession } from './guestSession';
import { checkLearningScope, publicLearningRequest } from './learningMaterials';
import type { ExpeditionScope } from './expeditionStorage';
export interface ScheduleRequest {
  startDate: string; examDate: string; dailyMinutes: number; dayStart: string; dayEnd: string;
  rest: { start: string; end: string }[]; excludedDates: string[];
  units: { title: string; minutes: number; objectiveKey?: string }[];
}
export interface SchedulePreview {
  previewId: string; expiresAt: string; method: 'CONSTRAINT_SCHEDULER'; timezone: string;
  tasks: { title: string; minutes: number; date: string; startTime: string; scheduledAt: string; objectiveKey?: string }[];
  unallocated: { title: string; minutes: number; reason: string }[];
  diff: { added: number; changed: number; deleted: number; retainedExisting: number }; warnings: string[]; note: string;
}
interface Confirmation { taskIds: string[]; added: number; replayed: boolean }
const previews = new Map<string, { scopeId: string; courseId: string; basis: string; preview: SchedulePreview; receipt?: Confirmation }>();
subscribeGuestSession(() => previews.clear());
function guestBasis(courseId: string) {
  const workspace = getGuestWorkspace(), courses = workspace.courses.filter(course => !course.isArchived);
  const course = courses.find(item => item.id === courseId);
  if (!course) throw new Error('课程不存在或已归档');
  const tasks = workspace.tasks.filter(task => !['COMPLETED', 'ABANDONED'].includes(task.status));
  return { course, courses, tasks, hash: JSON.stringify({ courses, tasks }) };
}
export async function previewLearningSchedule(scope: ExpeditionScope, courseId: string, request: ScheduleRequest): Promise<SchedulePreview> {
  checkLearningScope(scope);
  if (scope.kind === 'account') {
    const { data } = await api.post<SchedulePreview>(`/learning/v1/courses/${encodeURIComponent(courseId)}/schedule`, request);
    checkLearningScope(scope); return data;
  }
  const basis = guestBasis(courseId);
  if (basis.course.examDate && request.examDate > new Date(basis.course.examDate).toISOString().slice(0, 10)) throw new Error('计划终点不能晚于课程已有考试日期。');
  const result = await publicLearningRequest<Omit<SchedulePreview, 'previewId' | 'expiresAt'>>('/schedule/preview', {
    request, tasks: basis.tasks.map(task => ({ id: task.id, title: task.title, estimatedMinutes: task.estimatedMinutes, scheduledAt: task.scheduledAt, status: task.status })),
    courses: basis.courses.map(course => ({ id: course.id, name: course.name, schedule: course.schedule })),
  });
  checkLearningScope(scope);
  if (guestBasis(courseId).hash !== basis.hash) throw new Error('预览期间课表或任务已变化，请重新计算。');
  const preview: SchedulePreview = { ...result, previewId: crypto.randomUUID(), expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() };
  previews.set(preview.previewId, { scopeId: scope.id, courseId, basis: basis.hash, preview: structuredClone(preview) });
  return preview;
}
export async function confirmLearningSchedule(scope: ExpeditionScope, previewId: string): Promise<Confirmation> {
  checkLearningScope(scope);
  if (scope.kind === 'account') {
    const { data } = await api.post<Confirmation>(`/learning/v1/schedule/${encodeURIComponent(previewId)}/confirm`, {});
    checkLearningScope(scope); return data;
  }
  const stored = previews.get(previewId);
  if (!stored || stored.scopeId !== scope.id) throw new Error('本次预览不存在，请重新计算');
  if (stored.receipt) return { ...structuredClone(stored.receipt), replayed: true };
  if (Date.parse(stored.preview.expiresAt) <= Date.now()) throw new Error('预览已过期，请重新计算');
  if (guestBasis(stored.courseId).hash !== stored.basis) throw new Error('课表或任务已变化，请保留预览并重新计算。');
  const workspace = getGuestWorkspace(), at = guestTimestamp();
  // Prepare the whole batch before the single synchronous RAM mutation: no partial plan or await gap.
  const tasks: GuestTask[] = stored.preview.tasks.map(task => {
    if (!task.title.trim() || task.title.length > 180 || !Number.isInteger(task.minutes) || task.minutes < 10 || task.minutes > 90 || !Number.isFinite(Date.parse(task.scheduledAt)) || Date.parse(task.scheduledAt) <= Date.now()) throw new Error('预览含无效或已过去的时段，请重新计算');
    return { id: crypto.randomUUID(), userId: workspace.user.id, courseId: stored.courseId, title: task.title,
      description: '来自已确认的约束排程' + (task.objectiveKey ? '；目标 ' + task.objectiveKey : ''), type: 'DEEP_EXPLORATION', status: 'PENDING',
      priority: 3, knowledgeNodeIds: [], estimatedMinutes: task.minutes, actualMinutes: null, rewards: { energy: 0, exp: 0, crystals: 0 },
      scheduledAt: task.scheduledAt, completedAt: null, createdAt: at, updatedAt: at };
  });
  if (tasks.length > 30) throw new Error('排程任务过多，请重新计算');
  workspace.tasks.push(...tasks);
  stored.receipt = { taskIds: tasks.map(task => task.id), added: tasks.length, replayed: false };
  return structuredClone(stored.receipt);
}
