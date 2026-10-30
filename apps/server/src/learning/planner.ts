import { z } from 'zod';
import { LearningError } from './materials';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const minute = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
export const scheduleInput = z.object({
  startDate: date, examDate: date, dailyMinutes: z.number().int().min(10).max(240),
  dayStart: time.default('18:30'), dayEnd: time.default('21:00'),
  rest: z.array(z.object({ start: time, end: time }).strict()).max(8).default([]),
  excludedDates: z.array(date).max(60).default([]),
  units: z.array(z.object({ title: z.string().trim().min(1).max(100), minutes: z.number().int().min(10).max(90),
    objectiveKey: z.enum(['bt.bfs.queue', 'bt.dfs.stack', 'bt.bst.bounds']).optional() }).strict()).min(1).max(30),
}).strict();
export interface ScheduleTask { id: string; title: string; estimatedMinutes: number; scheduledAt?: Date | string | null; status: string; updatedAt?: Date | string }
export interface CourseSchedule { id: string; name: string; schedule: string | unknown[]; updatedAt?: Date | string }
type Block = { start: number; end: number; reason: string };
const SHANGHAI = 8 * 60 * 60_000;
export const localDate = (value: Date) => new Date(value.getTime() + SHANGHAI).toISOString().slice(0, 10);
function overlaps(start: number, end: number, blocks: Block[]) { return blocks.some(b => start < b.end && end > b.start); }
export function makeSchedule(raw: unknown, tasks: ScheduleTask[], courses: CourseSchedule[], now = new Date()) {
  const input = scheduleInput.parse(raw), start = Date.parse(input.startDate), finish = Date.parse(input.examDate);
  if (input.startDate < localDate(now) || finish < start || finish - start > 60 * 86400_000) throw new LearningError('DATE_RANGE', '计划需从今天或以后开始，考试日期不得早于开始日期，跨度最多 60 天。');
  const dayStart = minute(input.dayStart), dayEnd = minute(input.dayEnd);
  if (dayStart < 6 * 60 || dayEnd > 23 * 60 || dayEnd <= dayStart) throw new LearningError('REST_WINDOW', '学习时段请设在 06:00–23:00 内，结束时间需晚于开始。');
  if (input.rest.some(r => minute(r.end) <= minute(r.start))) throw new LearningError('REST_WINDOW', '休息结束时间需晚于开始时间。');
  const result: Array<{ title: string; minutes: number; date: string; startTime: string; scheduledAt: string; objectiveKey?: string }> = [];
  const unallocated: Array<{ title: string; minutes: number; reason: string }> = [];
  const days: Array<{ date: string; blocks: Block[]; remaining: number; existingMinutes: number }> = [];
  const warnings = new Set<string>();
  for (let cursor = start; cursor <= finish; cursor += 86400_000) {
    const day = new Date(cursor).toISOString().slice(0, 10);
    if (input.excludedDates.includes(day)) continue;
    const blocks: Block[] = input.rest.map(r => ({ start: minute(r.start), end: minute(r.end), reason: '休息' }));
    if (day === localDate(now)) {
      const local = new Date(now.getTime() + SHANGHAI);
      blocks.push({ start: 0, end: local.getUTCHours() * 60 + local.getUTCMinutes() + 1, reason: '已过去时段' });
    }
    for (const course of courses) {
      let slots: unknown;
      try { slots = typeof course.schedule === 'string' ? JSON.parse(course.schedule) : course.schedule; } catch { slots = null; }
      if (!Array.isArray(slots)) throw new LearningError('INVALID_CLASS_SCHEDULE', '课程「' + course.name + '」课表无法读取，请先修正课表。');
      for (const slot of slots) {
        if (!slot || !Number.isInteger(slot.dayOfWeek) || slot.dayOfWeek < 1 || slot.dayOfWeek > 7 || !Number.isInteger(slot.startHour) || slot.startHour < 0 || slot.startHour > 23 || !Number.isInteger(slot.startMinute) || slot.startMinute < 0 || slot.startMinute > 59 || !Number.isInteger(slot.durationMinutes) || slot.durationMinutes < 1 || slot.durationMinutes > 720)
          throw new LearningError('INVALID_CLASS_SCHEDULE', '课程「' + course.name + '」有无效课表时段，请先修正。');
        if (slot.dayOfWeek === (new Date(cursor).getUTCDay() || 7)) {
          const begin = slot.startHour * 60 + slot.startMinute;
          blocks.push({ start: begin, end: begin + slot.durationMinutes, reason: '课程：' + course.name });
        }
      }
    }
    let existingMinutes = 0;
    for (const task of tasks.filter(t => !['COMPLETED', 'ABANDONED'].includes(t.status))) {
      if (!task.scheduledAt) { warnings.add('存在未安排日期的任务，本次无法为其预留时段；请先安排重要截止事项。'); continue; }
      const at = new Date(task.scheduledAt);
      if (Number.isNaN(at.getTime()) || localDate(at) !== day) continue;
      const local = new Date(at.getTime() + SHANGHAI), begin = local.getUTCHours() * 60 + local.getUTCMinutes();
      const minutes = Math.max(0, task.estimatedMinutes);
      existingMinutes += minutes;
      blocks.push({ start: begin, end: begin + minutes, reason: '已有任务：' + task.title });
    }
    days.push({ date: day, blocks, existingMinutes, remaining: Math.max(0, input.dailyMinutes - existingMinutes) });
  }
  for (const unit of input.units) {
    let placed = false;
    for (const day of days) {
      if (day.remaining < unit.minutes) continue;
      for (let at = dayStart; at + unit.minutes <= dayEnd; at += 5) {
        if (overlaps(at, at + unit.minutes, day.blocks)) continue;
        const hhmm = String(Math.floor(at / 60)).padStart(2, '0') + ':' + String(at % 60).padStart(2, '0');
        result.push({ ...unit, date: day.date, startTime: hhmm, scheduledAt: new Date(day.date + 'T' + hhmm + ':00+08:00').toISOString() });
        // Five-minute transitions are reserved, but do not award or inflate study time.
        day.blocks.push({ start: Math.max(dayStart, at - 5), end: at + unit.minutes + 5, reason: '新增学习单元与间隔' });
        day.remaining -= unit.minutes; placed = true; break;
      }
      if (placed) break;
    }
    if (!placed) unallocated.push({ title: unit.title, minutes: unit.minutes, reason: '可用日期、预算或连续时段不足；未超量排入。' });
  }
  return { method: 'CONSTRAINT_SCHEDULER' as const, timezone: 'Asia/Shanghai', tasks: result, unallocated,
    diff: { added: result.length, changed: 0, deleted: 0, retainedExisting: tasks.length }, warnings: [...warnings],
    days: days.map(d => ({ date: d.date, existingMinutes: d.existingMinutes, newMinutes: result.filter(t => t.date === d.date).reduce((n, t) => n + t.minutes, 0) })),
    note: '这是按明确约束计算的排程预览，不是模型输出。确认只增加新任务，不移动或删除已有任务。课表按周重复，临时停课和休假请通过排除日期填写。' };
}
