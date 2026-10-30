import { Router, Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { AgentService } from './service';
import { planningProvider } from './deepseek';

export function agentRouter(db:PrismaClient){
  const router=Router();const service=new AgentService(db);
  router.post('/tools/search',async(req:Request,res:Response)=>{
    try{
      const actual=String(req.headers['x-agentarts-tool-key']||'');const expected=process.env.AGENTARTS_TOOL_SECRET||'';
      if(!expected||Buffer.byteLength(actual)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))return res.status(401).json({error:'工具鉴权失败'});
      const input=z.object({runId:z.string().max(100),toolToken:z.string().length(64),query:z.string().max(1200)}).parse(req.body);
      return res.json(await service.tool(input.runId,input.toolToken,input.query));
    }catch{return res.status(403).json({error:'工具请求无效或授权已过期'});}
  });
  router.use(authMiddleware);
  router.get('/status',(_req,res)=>res.json({configured:!!planningProvider(),provider:planningProvider()}));
  router.get('/runs',async(req:AuthRequest,res:Response)=>{try{return res.json({runs:await service.list(req.userId!)});}catch{return res.status(500).json({error:'读取运行历史失败'});}});
  router.get('/runs/:id',async(req:AuthRequest,res:Response)=>{try{return res.json(await service.get(req.userId!,String(req.params.id)));}catch{return res.status(404).json({error:'运行记录不存在'});}});
  router.use('/runs',rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:true,legacyHeaders:false,
    skip:req=>req.method!=='POST'||req.path.endsWith('/confirm'),
    keyGenerator:req=>(req as AuthRequest).userId!,message:{error:'规划请求过于频繁，请稍后重试'}}));
  router.post('/runs/start',async(req:AuthRequest,res:Response)=>{
    if(!planningProvider())return res.status(503).json({error:'尚未配置学习规划服务，请检查服务端提供方配置'});
    try{return res.status(202).json(await service.start(req.userId!,req.body));}catch(error){return res.status(400).json({error:error instanceof z.ZodError?'请检查课程、目标、考试日期和每日时长':error instanceof Error?error.message:'创建运行失败'});}
  });
  router.post('/runs',async(req:AuthRequest,res:Response)=>{
    if(!planningProvider())return res.status(503).json({error:'尚未配置学习规划服务，请配置DeepSeek API Key或AgentArts运行时'});
    try{return res.json(await service.run(req.userId!,req.body));}catch(error){return res.status(400).json({error:error instanceof z.ZodError?'请检查课程、目标、考试日期和每日时长':error instanceof Error?error.message:'创建运行失败'});}
  });
  router.post('/runs/:id/confirm',async(req:AuthRequest,res:Response)=>{try{return res.json(await service.confirm(req.userId!,String(req.params.id)));}catch{return res.status(409).json({error:'该运行无法确认：请检查归属、运行状态及计划日期'});}});
  return router;
}
