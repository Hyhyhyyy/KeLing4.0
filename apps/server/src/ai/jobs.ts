import { createHash, randomBytes } from 'node:crypto';
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { ZodError } from 'zod';
import { AIError } from './catalog';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { retainBackground, RetainBackground } from '../services/background';

const mode = 'NATIVE_AI_REQUEST';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const owner = (userId: string | undefined, token: string) => 'native-ai:' + (userId ? 'user:' + userId : 'guest:' + hash(token));
export async function startAiJob(db: PrismaClient, userId: string | undefined, work: (signal: AbortSignal) => Promise<unknown>, retain: RetainBackground = retainBackground) {
  const jobToken = randomBytes(32).toString('hex'), userKey = owner(userId, jobToken);
  await db.agentRun.deleteMany({ where: { mode, createdAt: { lt: new Date(Date.now() - 86400000) } } });
  if (await db.agentRun.count({ where: { mode, userId: userKey, status: 'RUNNING', expiresAt: { gt: new Date() } } }) >= 2) throw new AIError('RATE_LIMITED', '已有回答正在生成，请先查看进度', 429);
  const job = await db.agentRun.create({ data: { userId: userKey, courseId: '', goal: '妙搭公共模型生成', mode, startDate: '', examDate: '', dailyMinutes: 0, toolTokenHash: hash(jobToken), expiresAt: new Date(Date.now() + 180000) } });
  const pending = (async () => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([work(controller.signal), new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new AIError('TIMEOUT', '模型生成超时，请重试', 504)); }, 180000); })]);
      const encoded = JSON.stringify(result);
      if (!encoded || encoded.length > 200000) throw new AIError('INVALID_RESPONSE', '模型结果超出本次范围，请缩小问题后重试');
      await db.agentRun.updateMany({ where: { id: job.id, mode, status: 'RUNNING', expiresAt: { gt: new Date() } }, data: { status: 'SUCCEEDED', result: encoded } });
    } catch (error) {
      const safe = error instanceof AIError ? { code: error.code, error: error.message } : error instanceof ZodError ? { code: 'VALIDATION', error: '输入格式不正确，请保留内容后重试' } : { code: 'NATIVE_MODEL_FAILED', error: '公共模型未能完成生成，请重试' };
      await db.agentRun.updateMany({ where: { id: job.id, mode, status: 'RUNNING' }, data: { status: 'FAILED', error: JSON.stringify(safe) } });
    } finally { if (timer) clearTimeout(timer); }
  })();
  retain(pending.catch(() => console.error('Could not persist AI job outcome', job.id)));
  return { jobId: job.id, status: 'RUNNING' as const, ...(!userId ? { jobToken } : {}) };
}
export async function getAiJob(db: PrismaClient, id: string, userId?: string, token = '') {
  if (!userId && !/^[a-f0-9]{64}$/.test(token)) throw new AIError('NOT_FOUND', '生成记录不存在', 404);
  const where = { id, mode, userId: owner(userId, token) };
  await db.agentRun.updateMany({ where: { ...where, status: 'RUNNING', expiresAt: { lte: new Date() } }, data: { status: 'FAILED', error: JSON.stringify({ code: 'TIMEOUT', error: '生成已超时或服务中断，请保留输入后重试' }) } });
  const job = await db.agentRun.findFirst({ where });
  if (!job) throw new AIError('NOT_FOUND', '生成记录不存在', 404);
  if (job.status === 'SUCCEEDED') return { jobId: id, status: 'SUCCEEDED' as const, result: JSON.parse(job.result) };
  if (job.status === 'FAILED') return { jobId: id, status: 'FAILED' as const, ...JSON.parse(job.error) };
  return { jobId: id, status: 'RUNNING' as const };
}
export function aiJobRouter(db: PrismaClient) {
  const router = Router();
  router.use((req, res, next) => req.headers.authorization ? authMiddleware(req, res, next) : next());
  router.get('/:id', async (req, res) => {
    try { res.json(await getAiJob(db, String(req.params.id), (req as AuthRequest).userId, String(req.headers['x-ai-job-token'] || ''))); }
    catch (error) { if (error instanceof AIError) return res.status(error.status).json({ code: error.code, error: error.message }); return res.status(500).json({ code: 'INTERNAL', error: '读取生成进度失败，请重试' }); }
  });
  return router;
}
