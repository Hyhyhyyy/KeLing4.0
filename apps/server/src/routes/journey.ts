import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { ZodError } from 'zod';
import { JOURNEY_CATALOG, JourneyError, journeyDate } from '@keling/shared';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { TaskCompletionError } from '../services/taskCompletion';
import { getJourneyProfile, updateJourneyProfile, getJourneyCalendar } from '../services/journey';
export function journeyRouter(db:PrismaClient){
 const router=Router();
 const failure=(res:any,error:unknown)=>{
  if(error instanceof ZodError)return res.status(400).json({code:'VALIDATION',error:'装扮格式不正确'});
  if(error instanceof JourneyError)return res.status(error.status).json({code:error.code,error:error.message});
  if(error instanceof TaskCompletionError)return res.status(error.status).json({code:'NOT_FOUND',error:error.message});
  return res.status(500).json({code:'JOURNEY_ERROR',error:'读取或保存未完成，请重试'});
 };
 router.get('/catalog',(_req,res)=>res.json(JOURNEY_CATALOG));
 router.use(authMiddleware);
 router.get('/profile',async(req,res)=>{try{res.json(await getJourneyProfile(db,(req as AuthRequest).userId!));}catch(e){failure(res,e);}});
 router.patch('/profile',async(req,res)=>{try{res.json(await updateJourneyProfile(db,(req as AuthRequest).userId!,req.body));}catch(e){failure(res,e);}});
 router.get('/calendar',async(req,res)=>{try{res.json(await getJourneyCalendar(db,(req as AuthRequest).userId!,String(req.query.month||journeyDate(new Date()).slice(0,7))));}catch(e){failure(res,e);}});
 return router;
}
