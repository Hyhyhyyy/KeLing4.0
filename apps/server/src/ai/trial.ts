import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { AIError, publicChatModel } from './catalog';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { startAiJob } from './jobs';
import { ephemeralError } from './modelAccess';
import { complete } from './transport';
import { clientRateLimitKey } from '../config/rate-limit';
import { temporaryQuestion, temporaryMessages, ephemeralRequest } from './modelAccess';
import { guestRouter } from './guest';

// No account, Prisma, cookie, file or conversation store is involved in this route.
export function trialConfig(env: NodeJS.ProcessEnv = process.env) {
  const configured = publicChatModel(env), model = configured?.model || '';
  const available = !!configured;
  return { ai: { available, model: available ? model : null,
    reason: available ? '公共试用模型已启用；发送时才会调用模型。' : '公共模型尚未启用。你可以填写自己的 API Key，或先体验课程、任务和笔记。' } };
}
export async function completeTrial(raw: unknown, signal?: AbortSignal, generate: typeof complete = complete, env: NodeJS.ProcessEnv = process.env) {
  const input = temporaryQuestion.parse(raw);
  if (!trialConfig(env).ai.available) throw new AIError('NOT_CONFIGURED', '公共试用模型尚未启用，请使用自己的 API Key', 503);
  const { model, provider:p } = publicChatModel(env)!;
  const result = await generate(p, model, temporaryMessages(input.message, input.context), signal);
  return { answer: result.content, model, usage: result.usage };
}
export function trialRouter(db?:PrismaClient) {
  const router = Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.get('/config', (_req, res) => res.json(trialConfig()));
  router.use('/workspace', guestRouter(db));
  router.use((req,res,next)=>req.headers.authorization?authMiddleware(req,res,next):next());
  router.post('/ai', rateLimit({ windowMs: 15 * 60_000, limit: 4, keyGenerator: req => clientRateLimitKey(req),
    standardHeaders: true, legacyHeaders: false, message: { error: '公共试用请求较多，请稍后再试或使用自己的 Key', code: 'RATE_LIMITED' } }),
    async (req, res) => {
      try { const input=temporaryQuestion.parse(req.body);
        if(publicChatModel()?.provider.protocol==='native'&&db){res.status(202).json(await startAiJob(db,(req as AuthRequest).userId,signal=>completeTrial(input,signal)));req.body=undefined;return;}
        await ephemeralRequest(req,res,signal=>completeTrial(input,signal));
      }catch(error){ephemeralError(error,res);}
    });
  return router;
}
