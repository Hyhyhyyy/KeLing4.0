import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth';
import { CHAPTER, DECORATIONS, RULES, ExpeditionError } from '@keling/shared/expedition';
import * as service from './service';
import { z } from 'zod';
const identifier = z.string().trim().min(1).max(180);
const writer = z.object({ deviceId: identifier, epoch: z.number().int().nonnegative(), token: z.string().min(1).max(200) });
const answer = z.object({ order: z.array(z.string().max(80)).max(64).optional(), structure: z.enum(['QUEUE','STACK']).optional(), validBst: z.boolean().optional(), explanation: z.string().max(4000).optional(), selfCheck: z.array(z.string().max(200)).max(12).optional(), steps: z.array(z.object({ type: z.enum(['PUSH','POP']), nodeId: z.string().max(80) })).max(256).optional() }).strict();
const action = z.discriminatedUnion('type', [z.object({ type: z.literal('SUBMIT'), answer }).strict(), z.object({ type: z.literal('ACK_FEEDBACK'), nextStep: z.string().min(2).max(600), saveCompanion: z.boolean().optional() }).strict(), ...['HINT','NEXT','PAUSE','RESUME','CANCEL'].map(type => z.object({ type: z.literal(type) }).strict())]);
const inputs = {
  start: z.object({ opId: identifier, courseId: identifier, questKind: z.enum(['EXPLORE','TEACH','TRIAL','REVIEW']), objectiveKey: z.enum(['bt.bfs.queue','bt.dfs.stack','bt.bst.bounds']).optional(), mode: z.enum(['TRAINING','INDEPENDENT']), deviceId: identifier }).strict(),
  command: z.object({ opId: identifier, expectedRevision: z.number().int().nonnegative(), writer, action }).strict(),
  lease: z.object({ opId: identifier, expectedRevision: z.number().int().nonnegative(), deviceId: identifier, intent: z.enum(['acquire','renew','release','takeover']), writer: writer.optional() }).strict(),
  base: z.object({ opId: identifier, expectedRevision: z.number().int().nonnegative(), decorationId: identifier, action: z.enum(['BUY','EQUIP']) }).strict(),
  memory: z.object({ opId: identifier, expectedRevision: z.number().int().nonnegative(), memoryId: identifier, action: z.enum(['UPDATE','DELETE']), text: z.string().min(2).max(4000).optional() }).strict(),
  selfReport: z.object({ opId: identifier, courseId: identifier.nullable().optional(), title: z.string().trim().min(2).max(180), notes: z.string().max(2000).optional(), durationMinutes: z.number().int().min(1).max(1440) }).strict(),
};
function validated(schema: z.ZodType, input: unknown): any { const parsed = schema.safeParse(input); if (!parsed.success) throw new ExpeditionError('VALIDATION','请求格式不正确，请保留草稿检查输入',400); return parsed.data; }

export function expeditionRouter(db: PrismaClient) {
  const router = Router(); router.use(authMiddleware);
  const handle = (fn: (req: any) => Promise<unknown>) => async (req: any, res: any) => {
    try { res.json(await fn(req)); }
    catch (error) {
      if (error instanceof ExpeditionError) {
        let current: unknown;
        if (error.status === 409 && req.params.id && req.path.startsWith('/runs/')) try { current = await service.getRun(db, req.userId, String(req.params.id)); } catch { /* Only return a state owned by this user. */ }
        res.status(error.status).json({ error: error.message, code: error.code, ...(current ? { current } : {}) });
      } else { res.status(500).json({ error: '远征服务暂不可用，作答草稿可保留后重试', code: 'INTERNAL' }); }
    }
  };
  router.get('/catalog', (_req, res) => res.json({ chapter: CHAPTER, decorations: DECORATIONS, rules: RULES }));
  router.get('/courses/:courseId/chapters/binary-tree', handle(req => service.getChapter(db, req.userId, String(req.params.courseId))));
  router.post('/runs', handle(req => service.startRun(db, req.userId, validated(inputs.start, req.body))));
  router.get('/runs/:id', handle(req => service.getRun(db, req.userId, String(req.params.id))));
  router.post('/runs/:id/commands', handle(req => service.commandRun(db, req.userId, String(req.params.id), validated(inputs.command, req.body))));
  router.post('/runs/:id/lease', handle(req => service.leaseRun(db, req.userId, String(req.params.id), validated(inputs.lease, req.body))));
  router.get('/rewards', handle(req => service.rewards(db, req.userId)));
  router.post('/base/commands', handle(req => service.baseCommand(db, req.userId, validated(inputs.base, req.body))));
  router.get('/courses/:courseId/evidence', handle(req => service.courseEvidence(db, req.userId, String(req.params.courseId))));
  router.post('/progress/:id/memory', handle(req => service.memoryCommand(db, req.userId, String(req.params.id), validated(inputs.memory, req.body))));
  router.post('/self-report', handle(req => service.selfReport(db, req.userId, validated(inputs.selfReport, req.body))));
  router.get('/self-report', handle(req => service.selfReportHistory(db, req.userId, typeof req.query.cursor === 'string' ? req.query.cursor : undefined)));
  return router;
}
