import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { z, ZodError } from 'zod';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { makeSchedule, scheduleInput } from './planner';
import { LearningError, sha256 } from './materials';
const user = (req: Request) => (req as unknown as AuthRequest).userId!;
const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { void fn(req, res).catch(next); };
async function basis(db: Prisma.TransactionClient, userId: string, courseId: string) {
  const courses = await db.course.findMany({ where: { userId, isArchived: false }, orderBy: { id: 'asc' } });
  const course = courses.find(c => c.id === courseId);
  if (!course) throw new LearningError('NOT_FOUND', '课程不存在或已归档。', 404);
  const tasks = await db.task.findMany({ where: { userId, status: { notIn: ['COMPLETED', 'ABANDONED'] } }, orderBy: { id: 'asc' } });
  const hash = sha256(JSON.stringify({ courses: courses.map(c => [c.id, c.schedule, c.examDate]), tasks: tasks.map(t => [t.id, t.status, t.scheduledAt, t.estimatedMinutes, t.updatedAt]) }));
  return { course, courses, tasks, hash };
}
export function plannerRouter(db: PrismaClient) {
  const router = Router();
  // Visitors explicitly submit only their current RAM timetable. This endpoint is stateless.
  router.post('/schedule/preview', wrap(async (req, res) => {
    const input = z.object({ request: scheduleInput, tasks: z.array(z.object({ id: z.string().max(120), title: z.string().max(200), estimatedMinutes: z.number().int().min(0).max(480), scheduledAt: z.string().datetime().nullable(), status: z.string().max(30) }).strict()).max(300).default([]),
      courses: z.array(z.object({ id: z.string().max(120), name: z.string().max(120), schedule: z.array(z.object({ dayOfWeek: z.number().int(), startHour: z.number().int(), startMinute: z.number().int(), durationMinutes: z.number().int() }).strict()).max(30) }).strict()).max(50).default([]) }).strict().parse(req.body);
    try { res.json(makeSchedule(input.request, input.tasks, input.courses)); } finally { req.body = undefined; }
  }));
  router.use(['/courses/:courseId/schedule', '/schedule/:previewId/confirm'], authMiddleware);
  router.post('/courses/:courseId/schedule', wrap(async (req, res) => {
    const input = scheduleInput.parse(req.body), userId = user(req), courseId = String(req.params.courseId);
    const current = await basis(db, userId, courseId);
    if (current.course.examDate && input.examDate > new Date(current.course.examDate).toISOString().slice(0, 10)) throw new LearningError('EXAM_DEADLINE', '计划终点不能晚于课程已有考试日期。');
    const preview = makeSchedule(input, current.tasks, current.courses), id = randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
    await db.expeditionOperation.create({ data: { userId, opId: id, scope: 'SCHEDULE_PREVIEW', scopeId: courseId,
      requestHash: current.hash, payload: JSON.stringify({ request: input, expiresAt }), receipt: JSON.stringify(preview) } });
    res.json({ ...preview, previewId: id, expiresAt });
  }));
  router.post('/schedule/:previewId/confirm', wrap(async (req, res) => {
    z.object({}).strict().parse(req.body || {});
    const userId = user(req), id = String(req.params.previewId);
    const result = await db.$transaction(async tx => {
      // Same account lock used by learning awards serializes independent confirmation retries.
      await tx.user.update({ where: { id: userId }, data: { updatedAt: new Date() } });
      const stored = await tx.expeditionOperation.findUnique({ where: { userId_opId: { userId, opId: id } } });
      if (!stored || !['SCHEDULE_PREVIEW', 'SCHEDULE_CONFIRMED'].includes(stored.scope)) throw new LearningError('NOT_FOUND', '计划预览不存在。', 404);
      if (stored.scope === 'SCHEDULE_CONFIRMED') return { ...JSON.parse(stored.receipt), replayed: true };
      const payload = JSON.parse(stored.payload);
      if (new Date(payload.expiresAt).getTime() < Date.now()) throw new LearningError('PLAN_EXPIRED', '预览已过期，请重新排程。', 409);
      const current = await basis(tx, userId, stored.scopeId);
      if (current.hash !== stored.requestHash) throw new LearningError('PLAN_STALE', '课表或任务已变化，请保留预览并重新计算。', 409);
      const preview = JSON.parse(stored.receipt) as ReturnType<typeof makeSchedule>;
      if (preview.tasks.some(t => new Date(t.scheduledAt).getTime() <= Date.now())) throw new LearningError('PLAN_STALE', '预览包含已过去时段，请重新排程。', 409);
      const taskIds = [];
      for (const task of preview.tasks) taskIds.push((await tx.task.create({ data: { userId, courseId: stored.scopeId, title: task.title,
        description: '来自已确认的约束排程' + (task.objectiveKey ? '；目标 ' + task.objectiveKey : ''), type: 'DEEP_EXPLORATION', estimatedMinutes: task.minutes,
        scheduledAt: new Date(task.scheduledAt), rewardsEnergy: 0, rewardsCrystals: 0, rewardsExp: 0 } })).id);
      const receipt = { taskIds, added: taskIds.length, replayed: false };
      await tx.expeditionOperation.update({ where: { id: stored.id }, data: { scope: 'SCHEDULE_CONFIRMED', receipt: JSON.stringify(receipt) } });
      return receipt;
    });
    res.json(result);
  }));
  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof LearningError) return res.status(error.status).json({ error: error.message, code: error.code });
    if (error instanceof ZodError) return res.status(400).json({ error: '排程参数无效，请检查日期、时段和时长。', code: 'VALIDATION' });
    return res.status(409).json({ error: '排程确认未完成，请保留预览并重试。', code: 'PLAN_CONFLICT' });
  });
  return router;
}
