import { Request, Response } from 'express';
import { prisma } from '../database';
import { AuthRequest } from '../middleware/auth';
import { randomUUID as uuidv4 } from 'node:crypto';
import { completeOwnedTask, TaskCompletionError } from '../services/taskCompletion';
import { z } from 'zod';

// 获取所有任务
export const getTasks = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: '未认证' });
    }

    const { status, courseId } = req.query;

    const where: any = { userId: req.userId };
    if (status) where.status = String(status);
    if (courseId) where.courseId = String(courseId);

    const tasks = await prisma.task.findMany({
      where,
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    res.json({
      tasks: tasks.map(t => ({
        ...t,
        knowledgeNodeIds: JSON.parse(t.knowledgeNodeIds),
        rewards: {
          energy: t.rewardsEnergy,
          crystals: t.rewardsCrystals,
          exp: t.rewardsExp
        }
      }))
    });
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ error: '获取任务失败' });
  }
};

// 获取单个任务
export const getTask = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: '未认证' });
    }

    const taskId = String(req.params.id);

    const task = await prisma.task.findFirst({
      where: { id: taskId, userId: req.userId }
    });

    if (!task) {
      return res.status(404).json({ error: '任务不存在' });
    }

    res.json({
      task: {
        ...task,
        knowledgeNodeIds: JSON.parse(task.knowledgeNodeIds),
        rewards: {
          energy: task.rewardsEnergy,
          crystals: task.rewardsCrystals,
          exp: task.rewardsExp
        }
      }
    });
  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({ error: '获取任务失败' });
  }
};

// 创建任务
export const createTask = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: '未认证' });
    }

    const input=z.object({title:z.string().trim().min(1).max(180),description:z.string().max(4000).optional(),type:z.enum(['DAILY_CARE','DEEP_EXPLORATION','REVIEW_RITUAL','BOUNTY','RESCUE','STUDY']).optional(),courseId:z.string().nullable().optional(),knowledgeNodeIds:z.array(z.string()).max(100).optional(),priority:z.number().int().min(1).max(5).optional(),estimatedMinutes:z.number().int().min(1).max(1440).optional(),scheduledAt:z.iso.datetime({offset:true}).nullable().optional()}).safeParse(req.body);
    if(!input.success)return res.status(400).json({error:'任务字段无效'});
    if(input.data.courseId && !await prisma.course.findFirst({where:{id:input.data.courseId,userId:req.userId}}))return res.status(404).json({error:'课程不存在'});
    if(input.data.knowledgeNodeIds?.length){
      const owned=await prisma.knowledgeNode.count({where:{id:{in:[...new Set(input.data.knowledgeNodeIds)]},course:{userId:req.userId,...(input.data.courseId?{id:input.data.courseId}:{})}}});
      if(owned!==new Set(input.data.knowledgeNodeIds).size)return res.status(400).json({error:'知识点不属于所选课程或当前账户'});
    }
    const {
      title,
      description,
      type,
      courseId,
      knowledgeNodeIds,
      priority,
      estimatedMinutes,
      scheduledAt
    } = input.data;

    if (!title) {
      return res.status(400).json({ error: '任务标题为必填项' });
    }

    const multipliers:Record<string,number>={DAILY_CARE:1,DEEP_EXPLORATION:1.5,REVIEW_RITUAL:1.2,BOUNTY:2,RESCUE:1.8,STUDY:1.5};
    const minutes=estimatedMinutes ?? 25, multiplier=multipliers[type ?? 'DAILY_CARE'];
    const task = await prisma.task.create({
      data: {
        id: uuidv4(),
        userId: req.userId,
        title,
        description: description || '',
        type: type || 'DAILY_CARE',
        courseId: courseId || null,
        knowledgeNodeIds: JSON.stringify(knowledgeNodeIds || []),
        status: 'PENDING',
        priority: priority || 3,
        estimatedMinutes: estimatedMinutes || 25,
        rewardsEnergy: Math.round(Math.round(minutes*0.8)*multiplier),
        rewardsCrystals: Math.round(Math.round(minutes/15)*multiplier),
        rewardsExp: Math.round(Math.round(minutes*1.2)*multiplier),
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null
      }
    });

    res.status(201).json({
      message: '创建成功',
      task: {
        ...task,
        knowledgeNodeIds: JSON.parse(task.knowledgeNodeIds),
        rewards: {
          energy: task.rewardsEnergy,
          crystals: task.rewardsCrystals,
          exp: task.rewardsExp
        }
      }
    });
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: '创建任务失败' });
  }
};

// 更新任务
export const updateTask = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: '未认证' });
    }

    const taskId = String(req.params.id);
    const parsed = z.object({title:z.string().trim().min(1).max(180).optional(),description:z.string().max(4000).optional(),status:z.enum(['PENDING','IN_PROGRESS','ABANDONED']).optional(),priority:z.number().int().min(1).max(5).optional()}).safeParse(req.body);
    if(!parsed.success)return res.status(400).json({error:'任务字段无效；完成任务请使用完成接口'});
    const { title, description, status, priority } = parsed.data;

    const existing = await prisma.task.findFirst({
      where: { id: taskId, userId: req.userId }
    });

    if (!existing) {
      return res.status(404).json({ error: '任务不存在' });
    }

    const updateData: any = {};
    if (title) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (existing.status === 'COMPLETED')return res.status(409).json({error:'已完成任务不可重新开启或修改'});
    if (status) updateData.status = status;
    if (priority !== undefined) updateData.priority = priority;


    const task = await prisma.task.update({
      where: { id: taskId, userId:req.userId, status:{not:'COMPLETED'} },
      data: updateData
    });

    res.json({
      message: '更新成功',
      task: {
        ...task,
        knowledgeNodeIds: JSON.parse(task.knowledgeNodeIds),
        rewards: {
          energy: task.rewardsEnergy,
          crystals: task.rewardsCrystals,
          exp: task.rewardsExp
        }
      }
    });
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ error: '更新任务失败' });
  }
};

// 完成任务
export const completeTask = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: '未认证' });
    }

    const result = await completeOwnedTask(prisma, req.userId, String(req.params.id), req.body.actualMinutes ?? undefined);
    res.json({...result, message:result.alreadyCompleted?'任务已完成，未重复发放奖励':'任务完成！',task:{...result.task,knowledgeNodeIds:JSON.parse(result.task.knowledgeNodeIds)}});
  } catch (error) {
    if(error instanceof TaskCompletionError)return res.status(error.status).json({error:error.message});
    console.error('Complete task error:',error);
    res.status(500).json({error:'完成任务失败，请重试'});
  }
};

// 删除任务
export const deleteTask = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: '未认证' });
    }

    const taskId = String(req.params.id);

    const existing = await prisma.task.findFirst({
      where: { id: taskId, userId: req.userId }
    });

    if (!existing) {
      return res.status(404).json({ error: '任务不存在' });
    }

    await prisma.task.delete({
      where: { id: taskId }
    });

    res.json({ message: '删除成功' });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: '删除任务失败' });
  }
};
