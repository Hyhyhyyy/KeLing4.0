import { PrismaClient } from '@prisma/client';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { requestSchema, today, validatePlan } from './contract';
import { invokeRuntime, RunEvent } from './runtime';
import { invokeDeepSeek, planningProvider } from './deepseek';
import { retainBackground, RetainBackground } from '../services/background';

type Source={id:string;title:string;text:string};
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export class AgentService {
  constructor(private db:PrismaClient, private invoke?:typeof invokeRuntime, private retain:RetainBackground=retainBackground){}
  private async expire(userId:string){
    await this.db.agentRun.updateMany({where:{userId,status:'RUNNING',expiresAt:{lte:new Date()}},data:{status:'FAILED',error:'运行已超时或服务被重启，请重新生成计划；尚未写入任务。'}});
  }
  // Compare-and-swap keeps runtime events and tool audit events from overwriting each other.
  private async appendEvent(id:string,event:RunEvent & {sourceIds?:string[]}){
    for(let attempt=0;attempt<8;attempt++){
      const run=await this.db.agentRun.findUniqueOrThrow({where:{id}});
      if(run.status!=='RUNNING'||run.expiresAt<=new Date())throw new Error('运行已结束');
      const events=JSON.parse(run.events);
      if(events.length>=200)throw new Error('运行事件超过限制');
      events.push(event);
      const updated=await this.db.agentRun.updateMany({where:{id,status:'RUNNING',events:run.events},data:{events:JSON.stringify(events)}});
      if(updated.count)return;
    }
    throw new Error('运行轨迹繁忙，请重试');
  }
  async get(userId:string,id:string){
    await this.expire(userId);
    const run=await this.db.agentRun.findFirst({where:{id,userId}});if(!run)throw new Error('运行记录不存在');
    const {toolTokenHash,expiresAt,...safe}=run;
    return {...safe,sources:JSON.parse(run.sources),events:JSON.parse(run.events),result:run.result?JSON.parse(run.result):null};
  }
  async list(userId:string){await this.expire(userId);return this.db.agentRun.findMany({where:{userId},select:{id:true,goal:true,status:true,mode:true,createdAt:true},orderBy:{createdAt:'desc'},take:30});}
  private async prepare(userId:string,value:unknown){
    await this.expire(userId);
    if(await this.db.agentRun.count({where:{userId,status:'RUNNING'}})>=2)throw new Error('已有计划正在运行，请先查看运行历史');
    const input=requestSchema.parse(value);const startDate=today();
    if(input.examDate<startDate||Date.parse(input.examDate)-Date.parse(startDate)>90*86400000)throw new Error('考试日期须在今天到90天内');
    const course=await this.db.course.findFirst({where:{id:input.courseId,userId},include:{knowledgeNodes:true}});if(!course)throw new Error('课程不存在');
    const nodes=course.knowledgeNodes.slice(0,80);
    const notes=await this.db.note.findMany({where:{userId},orderBy:{updatedAt:'desc'},take:100});
    const related=notes.filter(n=>JSON.parse(n.relatedNodeIds).some((id:string)=>nodes.some(k=>k.id===id)) || n.title.includes(course.name));
    const sources:Source[]=[...nodes.map(n=>({id:'kg:'+n.id,title:n.name,text:n.description.slice(0,1800)})),...related.slice(0,20).map(n=>({id:'note:'+n.id,title:n.title,text:n.content.slice(0,1800)}))];
    if(!sources.length)throw new Error('请先为课程添加知识点或关联笔记，计划必须有真实资料依据');
    const token=randomBytes(32).toString('hex');
    const run=await this.db.agentRun.create({data:{userId,...input,startDate,sources:JSON.stringify(sources.map(({id,title})=>({id,title}))),toolTokenHash:hash(token),expiresAt:new Date(Date.now()+120_000)}});
    return {run,token,input,startDate,courseName:course.name};
  }
  async start(userId:string,value:unknown){
    const prepared=await this.prepare(userId,value);
    const initial=await this.get(userId,prepared.run.id);
    // The record survives a disconnect. A crashed process is detected by expiry, not silently retried/billed.
    this.retain(this.execute(prepared).catch(()=>console.error('Could not persist agent run outcome',prepared.run.id)));
    return initial;
  }
  async run(userId:string,value:unknown){
    const prepared=await this.prepare(userId,value);
    await this.execute(prepared);
    return this.get(userId,prepared.run.id);
  }
  private async execute({run,token,input,startDate,courseName}:Awaited<ReturnType<AgentService['prepare']>>){
    let pending=Promise.resolve();
    let eventFailure:unknown;
    const onEvent=(event:RunEvent)=>{
      pending=pending.then(()=>this.appendEvent(run.id,event)).catch(error=>{eventFailure=error;});
    };
    try{
      const raw=this.invoke
        ? await this.invoke({...input,startDate,courseName,runId:run.id,toolToken:token},run.id,onEvent)
        : planningProvider()==='DeepSeek'
          ? await invokeDeepSeek({...input,startDate,courseName},await this.tool(run.id,token,input.goal),onEvent)
          : await invokeRuntime({...input,startDate,courseName,runId:run.id,toolToken:token},run.id,onEvent);
      await pending;
      if(eventFailure)throw eventFailure;
      const clean=raw.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');
      const stored=await this.db.agentRun.findUniqueOrThrow({where:{id:run.id}});
      const retrieved=JSON.parse(stored.events).filter((e:any)=>e.status==='sources_retrieved');
      const sourceIds=retrieved.flatMap((e:any)=>e.sourceIds||[]) as string[];
      const plan=validatePlan(JSON.parse(clean),{startDate,examDate:input.examDate,dailyMinutes:input.dailyMinutes,sourceIds});
      await this.db.agentRun.updateMany({where:{id:run.id,status:'RUNNING',expiresAt:{gt:new Date()}},data:{status:'SUCCEEDED',result:JSON.stringify(plan)}});
    }catch(error){
      await pending;
      const message=error instanceof Error?error.message:'运行失败';
      // Do not expose parser input, credentials or arbitrary provider payloads in client errors.
      const safe=/^(AgentArts|DeepSeek|云端|运行|计划|任务|每日|来源|日期|输出|考试|尚未|未配置)/.test(message)&&message.length<500 ? message : '规划未通过校验或服务暂不可用，请调整目标后重试';
      await this.db.agentRun.updateMany({where:{id:run.id,status:'RUNNING'},data:{status:'FAILED',error:safe}});
    }
  }
  async confirm(userId:string,id:string){
    return this.db.$transaction(async tx=>{
      const run=await tx.agentRun.findFirst({where:{id,userId}});if(!run)throw new Error('运行记录不存在');
      if(run.status==='CONFIRMED')return {message:'该计划已确认，不重复创建任务'};
      if(run.status!=='SUCCEEDED')throw new Error('仅成功计划可确认');
      const course=await tx.course.findFirst({where:{id:run.courseId,userId}});if(!course)throw new Error('课程已不存在');
      const plan=validatePlan(JSON.parse(run.result),{...run,sourceIds:JSON.parse(run.events).filter((e:any)=>e.status==='sources_retrieved').flatMap((e:any)=>e.sourceIds||[])});
      if(plan.tasks.some(t=>t.date<today()))throw new Error('计划已过期，请重新生成');
      const claimed=await tx.agentRun.updateMany({where:{id,userId,status:'SUCCEEDED'},data:{status:'CONFIRMED'}});if(!claimed.count)throw new Error('计划已由其他请求确认');
      for(const item of plan.tasks)await tx.task.create({data:{userId,courseId:run.courseId,title:item.title,description:item.description+'\n依据：'+item.sourceIds.join(', '),type:'DEEP_EXPLORATION',priority:3,estimatedMinutes:item.minutes,scheduledAt:new Date(item.date+'T09:00:00+08:00')}});
      return {message:'已创建学习任务',count:plan.tasks.length};
    });
  }
  async tool(runId:string,token:string,query:string){
    const run=await this.db.agentRun.findUnique({where:{id:runId}});
    if(!run||run.status!=='RUNNING'||run.expiresAt<new Date()||!timingSafeEqual(Buffer.from(run.toolTokenHash),Buffer.from(hash(token))))throw new Error('运行工具授权无效');
    const course=await this.db.course.findFirst({where:{id:run.courseId,userId:run.userId},include:{knowledgeNodes:true}});if(!course)throw new Error('课程不存在');
    const available=JSON.parse(run.sources) as {id:string;title:string}[];
    const notes=await this.db.note.findMany({where:{userId:run.userId,id:{in:available.filter(s=>s.id.startsWith('note:')).map(s=>s.id.slice(5))}}});
    const candidates:Source[]=[...course.knowledgeNodes.map(n=>({id:'kg:'+n.id,title:n.name,text:n.description.slice(0,1800)})),...notes.map(n=>({id:'note:'+n.id,title:n.title,text:n.content.slice(0,1800)}))].filter(s=>available.some(a=>a.id===s.id));
    const terms=Array.from(new Set(query.toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fff]/g)||[]));
    const ranked=candidates.map(s=>({s,score:terms.filter(t=>(s.title+s.text).toLowerCase().includes(t)).length})).sort((a,b)=>b.score-a.score).slice(0,8).map(v=>v.s);
    const tasks=await this.db.task.findMany({where:{userId:run.userId,courseId:run.courseId},select:{title:true,status:true,estimatedMinutes:true,actualMinutes:true,scheduledAt:true},orderBy:{createdAt:'desc'},take:100});
    await this.appendEvent(runId,{name:'课程资料检索',type:'knowledge',status:'sources_retrieved',at:new Date().toISOString(),sourceIds:ranked.map(s=>s.id)});
    return {course:{name:course.name,masteryLevel:course.masteryLevel},sources:ranked,tasks};
  }
}
