import { PrismaClient } from '@prisma/client';

export class TaskCompletionError extends Error {
  constructor(message:string, public status:number){super(message);}
}

/** One transaction owns the transition, rewards, study time and achievements. */
export async function completeOwnedTask(db:PrismaClient,userId:string,id:string,minutes?:number){
  if(minutes!==undefined && (!Number.isInteger(minutes)||minutes<0||minutes>1440))
    throw new TaskCompletionError('实际学习时长须为 0 至 1440 的整数',400);
  return db.$transaction(async tx=>{
    // Write first: concurrent devices cannot both claim rewards (also avoids SQLite read/write lock upgrade).
    const claimed=await tx.task.updateMany({where:{id,userId,status:{in:['PENDING','IN_PROGRESS']}},data:{status:'COMPLETED',completedAt:new Date()}});
    const existing=await tx.task.findFirst({where:{id,userId}});
    if(!existing)throw new TaskCompletionError('任务不存在',404);
    if(!claimed.count){
      if(existing.status!=='COMPLETED')throw new TaskCompletionError('当前任务状态无法完成',409);
      return {task:existing,rewards:{energy:0,crystals:0,exp:0},alreadyCompleted:true};
    }
    const actualMinutes=minutes ?? existing.estimatedMinutes;
    const task=await tx.task.update({where:{id},data:{actualMinutes}});
    const rewards={energy:task.rewardsEnergy,crystals:task.rewardsCrystals,exp:task.rewardsExp};
    const user=await tx.user.update({where:{id:userId},data:{energy:{increment:rewards.energy},crystals:{increment:rewards.crystals},exp:{increment:rewards.exp},totalStudyMinutes:{increment:actualMinutes}}});
    let level=user.level,exp=user.exp;
    while(exp>=level*100){exp-=level*100;level++;}
    if(level!==user.level)await tx.user.update({where:{id:userId},data:{level,exp}});
    if(task.courseId)await tx.course.updateMany({where:{id:task.courseId,userId},data:{totalStudyMinutes:{increment:actualMinutes},studySessionCount:{increment:1}}});
    const count=await tx.task.count({where:{userId,status:'COMPLETED'}});
    for(const [achievementId,target] of [['first_task',1],['task_master_10',10],['task_master_50',50]] as const){
      await tx.userAchievement.updateMany({where:{userId,achievementId,isUnlocked:false},data:{progress:Math.min(count,target),isUnlocked:count>=target,unlockedAt:count>=target?new Date():null}});
    }
    return {task,rewards,alreadyCompleted:false};
  },{timeout:10_000});
}
