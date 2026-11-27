import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { JourneyFacts, JourneyState, JourneyProfile, JourneyCalendar, JourneyDay, JourneyError, JOURNEY_NOTE_TYPE, PLANET_NOTE_TYPE, emptyJourneyState, journeyProfile, applyJourneyPatch, journeyDate } from '@keling/shared';
import { INTERNAL_NOTE_TYPES } from './internalNotes';
import { mutateOwnedTask } from './taskMutations';

type DB = PrismaClient | Prisma.TransactionClient;
export const journeyNoteId=(userId:string)=>'journey:'+createHash('sha256').update(userId).digest('hex');
const itemId=z.string().max(40);
export const journeyPatchInput=z.object({expectedRevision:z.number().int().nonnegative(),avatarId:itemId.optional(),frameId:itemId.nullable().optional(),titleId:itemId.nullable().optional(),furnitureSlots:z.array(itemId.nullable()).length(10).optional()}).strict();
const storedState=z.object({version:z.literal(1),revision:z.number().int().nonnegative(),avatarId:itemId,frameId:itemId.nullable(),titleId:itemId.nullable(),furnitureSlots:z.array(itemId.nullable()).length(10),unlockedAchievementIds:z.array(itemId).max(10)}).strict();

export async function journeyFacts(db:DB,userId:string):Promise<JourneyFacts>{
 const [user,planetsCreated,tasksCompleted,notesCreated,knowledgeNodes,checkinDays]=await Promise.all([
  db.user.findUnique({where:{id:userId},select:{totalStudyMinutes:true}}),
  db.note.count({where:{userId,sourceType:PLANET_NOTE_TYPE}}),
  db.task.count({where:{userId,status:'COMPLETED'}}),
  db.note.count({where:{userId,sourceType:{notIn:INTERNAL_NOTE_TYPES}}}),
  db.knowledgeNode.count({where:{course:{userId,isArchived:false}}}),
  db.checkInRecord.count({where:{userId}}),
 ]);
 if(!user)throw new JourneyError('NOT_FOUND','账号不存在',404);
 return {planetsCreated,tasksCompleted,notesCreated,knowledgeNodes,checkinDays,studyMinutes:user.totalStudyMinutes};
}
async function readState(db:DB,userId:string):Promise<{state:JourneyState;exists:boolean}>{
 const row=await db.note.findFirst({where:{id:journeyNoteId(userId),userId,sourceType:JOURNEY_NOTE_TYPE},select:{content:true}});
 if(!row){const state=emptyJourneyState();const user=await db.user.findUnique({where:{id:userId},select:{avatarUrl:true}});const match=/^journey:(avatar-[0-9])$/.exec(user?.avatarUrl||'');if(match)state.avatarId=match[1];return {state,exists:false};}
 try{return {state:storedState.parse(JSON.parse(row.content)) as JourneyState,exists:true};}catch{throw new JourneyError('INVALID_PROFILE','装扮记录异常，请保留数据并联系维护者',409);}
}
async function writeState(db:Prisma.TransactionClient,userId:string,state:JourneyState){
 await db.note.upsert({where:{id:journeyNoteId(userId),userId,sourceType:JOURNEY_NOTE_TYPE},create:{id:journeyNoteId(userId),userId,title:'探索者装扮与家园',sourceType:JOURNEY_NOTE_TYPE,content:JSON.stringify(state)},update:{content:JSON.stringify(state)}});
}
async function refreshed(db:Prisma.TransactionClient,userId:string){
 const [{state,exists},facts]=await Promise.all([readState(db,userId),journeyFacts(db,userId)]);
 const profile=journeyProfile(state,facts);
 if(JSON.stringify(state.unlockedAchievementIds)!==JSON.stringify(profile.state.unlockedAchievementIds))profile.state.revision++;
 if(!exists||state.revision!==profile.state.revision)await writeState(db,userId,profile.state);
 return profile;
}
export function getJourneyProfile(db:PrismaClient,userId:string):Promise<JourneyProfile>{return mutateOwnedTask(db,userId,tx=>refreshed(tx,userId));}
export function updateJourneyProfile(db:PrismaClient,userId:string,raw:unknown):Promise<JourneyProfile>{
 const input=journeyPatchInput.parse(raw);
 return mutateOwnedTask(db,userId,async tx=>{
  const profile=await refreshed(tx,userId),next=applyJourneyPatch(profile,input);
  if(next.revision!==profile.state.revision)await writeState(tx,userId,next);
  if(input.avatarId!==undefined)await tx.user.update({where:{id:userId},data:{avatarUrl:'journey:'+next.avatarId}});
  return journeyProfile(next,profile.facts);
 });
}
export function calendarBounds(month:string){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||Number(month.slice(0,4))<2000||Number(month.slice(0,4))>2100)throw new JourneyError('INVALID_MONTH','月份须为2000至2100年的 YYYY-MM');
 const [year,m]=month.split('-').map(Number),count=new Date(Date.UTC(year,m,0)).getUTCDate();
 const from=new Date(`${month}-01T00:00:00+08:00`),until=new Date(from.getTime()+count*86400000);
 return {from,until,count};
}
export async function getJourneyCalendar(db:PrismaClient,userId:string,month:string):Promise<JourneyCalendar>{
 const {from,until,count}=calendarBounds(month),range={gte:from,lt:until};
 const [tasks,records,checkins,notes]=await Promise.all([
  db.task.findMany({where:{userId,status:'COMPLETED',completedAt:range},select:{id:true,actualMinutes:true,completedAt:true}}),
  db.studyRecord.findMany({where:{userId,createdAt:range},select:{taskId:true,durationMinutes:true,createdAt:true}}),
  db.checkInRecord.findMany({where:{userId,date:{gte:month.replace('-','')+'01',lte:month.replace('-','')+String(count)}} ,select:{date:true}}),
  db.note.findMany({where:{userId,sourceType:{notIn:INTERNAL_NOTE_TYPES},createdAt:range},select:{createdAt:true}}),
 ]);
 const days:JourneyDay[]=Array.from({length:count},(_,i)=>({date:`${month}-${String(i+1).padStart(2,'0')}`,checkedIn:false,studyMinutes:0,completedTasks:0,notesCreated:0}));
 const byDate=new Map(days.map(d=>[d.date,d]));
 for(const task of tasks){const day=byDate.get(journeyDate(task.completedAt!));if(day){day.completedTasks++;day.studyMinutes+=Math.max(0,task.actualMinutes||0);}}
 // Task completions already carry their time. Skip linked record mirrors to prevent double counting.
 for(const record of records){if(record.taskId)continue;const day=byDate.get(journeyDate(record.createdAt));if(day)day.studyMinutes+=Math.max(0,record.durationMinutes);}
 for(const check of checkins){const value=check.date;const day=byDate.get(`${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}`);if(day)day.checkedIn=true;}
 for(const note of notes){const day=byDate.get(journeyDate(note.createdAt));if(day)day.notesCreated++;}
 return {month,timezone:'Asia/Shanghai',days,totals:days.reduce((s,d)=>({studyMinutes:s.studyMinutes+d.studyMinutes,completedTasks:s.completedTasks+d.completedTasks,checkinDays:s.checkinDays+(d.checkedIn?1:0),notesCreated:s.notesCreated+d.notesCreated}),{studyMinutes:0,completedTasks:0,checkinDays:0,notesCreated:0})};
}
