import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { ZodError } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { AssistantService } from './service';
import { AIError, catalog, providers } from './catalog';
import { discover } from './transport';
import { resolveContext } from './context';

export function assistantRouter(db: PrismaClient) {
  const router = Router(); const service = new AssistantService(db);
  router.use(authMiddleware);
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  const costly = rateLimit({ windowMs: 15 * 60_000, limit: 30, keyGenerator: (req: AuthRequest) => req.userId!, standardHeaders: true, legacyHeaders: false, message: { error: 'AI 请求过于频繁，请稍后再试' } });
  const run = (f: (req: AuthRequest, res: any) => Promise<unknown>) => async (req: AuthRequest, res: any) => {
    try { await f(req, res); } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ error: '输入格式不正确，请检查模型、场景和消息长度', code: 'VALIDATION' });
      if (e instanceof AIError) return res.status(e.status).json({ error: e.message, code: e.code });
      res.status(500).json({ error: '服务暂时不可用，请刷新后重试', code: 'INTERNAL' });
    }
  };
  router.get('/catalog', (_req, res) => res.json({ providers: catalog(), limits: { messageChars: 6000, outputTokens: 2048, historyTurns: 10, retrievalCandidates: 36 }, planningPath: '/agent' }));
  router.post('/context-preview', run(async (req, res) => res.json(await resolveContext(db, req.userId!, req.body))));
  router.get('/providers/:id/models', costly, run(async (req, res) => {
    const p = providers().find(x => x.id === req.params.id);
    if (!p?.configured) throw new AIError('NOT_CONFIGURED', '该服务尚未配置', 503);
    res.json({ models: await discover(p), fetchedAt: new Date().toISOString(), note: '发现结果不自动启用；服务权限与模型用途仍需验证' });
  }));
  router.get('/sessions', run(async (req, res) => res.json({ sessions: await service.list(req.userId!) })));
  router.post('/sessions', costly, run(async (req, res) => res.status(201).json({ session: await service.create(req.userId!, req.body) })));
  router.get('/sessions/:id', run(async (req, res) => res.json(await service.get(req.userId!, String(req.params.id)))));
  router.post('/sessions/:id/turns', costly, run(async (req, res) => res.status(202).json(await service.start(req.userId!, String(req.params.id), req.body))));
  router.post('/sessions/:id/cancel', run(async (req, res) => { await service.cancel(req.userId!, String(req.params.id)); res.json({ ok: true }); }));
  router.delete('/sessions/:id', run(async (req, res) => { await service.remove(req.userId!, String(req.params.id)); res.json({ ok: true }); }));
  router.post('/turns/:id/note', run(async (req, res) => res.json({ note: await service.saveNote(req.userId!, String(req.params.id)) })));
  // Legacy clients must upgrade; do not retain the unsafe automatic tool-execution path.
  router.post(['/chat', '/plan', '/analyze'], (_req, res) => res.status(410).json({ error: 'AI 助手已升级，请更新客户端后使用共享会话', code: 'CLIENT_UPGRADE_REQUIRED' }));
  return router;
}
