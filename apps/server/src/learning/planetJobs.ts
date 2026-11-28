import { createHash, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { AIError } from '../ai/catalog';
import { retainBackground, RetainBackground } from '../services/background';
import { generateNativePlanet,planetGenerationInput } from './planets';
import { diagnosticForJob } from './planetDiagnostics';

const mode='LEARNING_PLANET_GENERATION';
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const ownerKey=(userId:string|undefined,token:string)=>'planet:'+(userId?'user:'+userId:'guest:'+hash(token));
export async function startPlanetGenerationJob(db:PrismaClient,raw:unknown,userId?:string,retain:RetainBackground=retainBackground){
 const input=planetGenerationInput.parse(raw);return startPlanetWorkJob(db,signal=>generateNativePlanet(input,userId,signal),userId,retain);
}
export async function startPlanetWorkJob(db:PrismaClient,operation:(signal:AbortSignal)=>Promise<unknown>,userId?:string,retain:RetainBackground=retainBackground){
 const jobToken=randomBytes(32).toString('hex'),userKey=ownerKey(userId,jobToken),now=new Date();
 // Generation jobs are temporary transport records; confirmed planets use account-owned Notes.
 await db.agentRun.deleteMany({where:{mode,createdAt:{lt:new Date(Date.now()-86400_000)}}});
 if(await db.agentRun.count({where:{mode,userId:userKey,status:'RUNNING',expiresAt:{gt:now}}})>=2)throw new AIError('RATE_LIMITED','已有星球正在生成，请先查看进度',429);
 const job=await db.agentRun.create({data:{userId:userKey,courseId:'',goal:'学习星球生成',mode,startDate:'',examDate:'',dailyMinutes:0,toolTokenHash:hash(jobToken),expiresAt:new Date(Date.now()+300_000)}});
 const work=(async()=>{let timeout:ReturnType<typeof setTimeout>|undefined;const abort=new AbortController();try{
  const result=await Promise.race([operation(abort.signal),new Promise<never>((_,reject)=>{timeout=setTimeout(()=>{abort.abort();reject(new AIError('TIMEOUT','星球生成超时，请重试',504));},300_000);})]);
  await db.agentRun.updateMany({where:{id:job.id,mode,status:'RUNNING',expiresAt:{gt:new Date()}},data:{status:'SUCCEEDED',result:JSON.stringify(result)}});
 }catch(e){const error=e instanceof AIError?{code:e.code,error:e.message,...(diagnosticForJob(e)?{diagnostic:diagnosticForJob(e)}:{})}:{code:'MODEL_FAILED',error:'公共模型暂时未能生成星球，请重试'};await db.agentRun.updateMany({where:{id:job.id,mode,status:'RUNNING'},data:{status:'FAILED',error:JSON.stringify(error)}});}finally{if(timeout)clearTimeout(timeout);}})();
 retain(work.catch(()=>console.error('Could not persist planet generation outcome',job.id)));
 return {jobId:job.id,status:'RUNNING' as const,...(!userId?{jobToken}:{})};
}
export async function getPlanetGenerationJob(db:PrismaClient,id:string,userId?:string,token=''){
 if(!userId&&!/^[a-f0-9]{64}$/.test(token))throw new AIError('NOT_FOUND','生成记录不存在',404);
 const where={id,mode,userId:ownerKey(userId,token)};
 await db.agentRun.updateMany({where:{...where,status:'RUNNING',expiresAt:{lte:new Date()}},data:{status:'FAILED',error:JSON.stringify({code:'TIMEOUT',error:'星球生成超时或服务已重启，请重新生成'})}});
 const job=await db.agentRun.findFirst({where});if(!job)throw new AIError('NOT_FOUND','生成记录不存在',404);
 if(job.status==='SUCCEEDED')return {jobId:id,status:'SUCCEEDED',...JSON.parse(job.result)};
 if(job.status==='FAILED')return {jobId:id,status:'FAILED',...JSON.parse(job.error||'{"code":"MODEL_FAILED","error":"生成失败"}')};
 return {jobId:id,status:'RUNNING'};
}
