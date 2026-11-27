import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { ZodError } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { AIError } from '../ai/catalog';
import { clientRateLimitKey } from '../config/rate-limit';
import { TaskCompletionError } from '../services/taskCompletion';
import { generatePlanet,planetCatalog,confirmPlanet,listPlanets,getPlanet,submitPlanetAnswer,usesNativePlanetGenerator } from './planets';
import { startPlanetGenerationJob,getPlanetGenerationJob } from './planetJobs';
export function planetRouter(db:PrismaClient){const router=Router();
 // An invalid supplied token must never quietly become an anonymous generation.
 router.use((req,res,next)=>req.headers.authorization?authMiddleware(req,res,next):next());
 const failure=(res:any,e:unknown)=>{if(e instanceof ZodError)return res.status(400).json({code:'VALIDATION',error:'输入内容格式不正确或超出长度限制'});if(e instanceof AIError||e instanceof TaskCompletionError)return res.status(e.status).json({code:e instanceof AIError?e.code:'NOT_FOUND',error:e.message});return res.status(500).json({code:'PLANET_ERROR',error:'星球操作未完成，请重试'});};
 router.get('/catalog',(req,res)=>res.json(planetCatalog((req as AuthRequest).userId)));
 router.post('/generate',rateLimit({windowMs:15*60_000,limit:12,keyGenerator:req=>clientRateLimitKey(req),standardHeaders:true,legacyHeaders:false,message:{code:'RATE_LIMITED',error:'星球生成较频繁，请稍后重试'}}),async(req,res)=>{const abort=new AbortController();res.on('close',()=>{if(!res.writableEnded)abort.abort();});try{if(usesNativePlanetGenerator(req.body)){res.status(202).json(await startPlanetGenerationJob(db,req.body,(req as AuthRequest).userId));return;}const result=await generatePlanet(req.body,(req as AuthRequest).userId,abort.signal);if(!abort.signal.aborted)res.json(result);}catch(e){if(!abort.signal.aborted)failure(res,e);}});
 router.get('/generation-jobs/:id',async(req,res)=>{try{res.json(await getPlanetGenerationJob(db,String(req.params.id),(req as AuthRequest).userId,String(req.headers['x-planet-job-token']||'')));}catch(e){failure(res,e);}});
 router.use(authMiddleware);
 router.get('/',async(req,res)=>{try{res.json({planets:await listPlanets(db,(req as AuthRequest).userId!)});}catch(e){failure(res,e);}});
 router.post('/confirm',async(req,res)=>{try{res.json({planet:await confirmPlanet(db,(req as AuthRequest).userId!,req.body)});}catch(e){failure(res,e);}});
 router.get('/:id',async(req,res)=>{try{res.json({planet:await getPlanet(db,(req as AuthRequest).userId!,String(req.params.id))});}catch(e){failure(res,e);}});
 router.post('/:id/answers',async(req,res)=>{try{res.json(await submitPlanetAnswer(db,(req as AuthRequest).userId!,String(req.params.id),req.body));}catch(e){failure(res,e);}});
 return router;
}
