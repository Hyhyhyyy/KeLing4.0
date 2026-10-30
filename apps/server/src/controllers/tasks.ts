import { Request, Response } from 'express';
import { prisma } from '../database';
import { AuthRequest } from '../middleware/auth';
import { randomUUID as uuidv4 } from 'node:crypto';
import { completeOwnedTask, TaskCompletionError } from '../services/taskCompletion';
import { z } from 'zod';
import { mutateOwnedTask } from '../services/taskMutations';

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
          energy: 0,
          crystals: 0,
          exp: 0
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
          energy: 0,
          crystals: 0,
          exp: 0
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

    const task = await mutateOwnedTask(prisma, req.userId, async tx => {
      if(courseId && !await tx.course.findFirst({where:{id:courseId,userId:req.userId}}))throw new TaskCompletionError('课程不存在',404);
      if(knowledgeNodeIds?.length){const owned=await tx.knowledgeNode.count({where:{id:{in:[...new Set(knowledgeNodeIds)]},course:{userId:req.userId,...(courseId?{id:courseId}:{})}}});if(owned!==new Set(knowledgeNodeIds).size)throw new TaskCompletionError('知识点不属于所选课程或当前账户',400);}
      return tx.task.create({
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
        rewardsEnergy: 0,
        rewardsCrystals: 0,
        rewardsExp: 0,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null
      }
      });
    });

    res.status(201).json({
      message: '创建成功',
      task: {
        ...task,
        knowledgeNodeIds: JSON.parse(task.knowledgeNodeIds),
        rewards: {
          energy: 0,
          crystals: 0,
          exp: 0
        }
      }
    });
  } catch (error) {
    if(error instanceof TaskCompletionError)return res.status(error.status).json({error:error.message});
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

    const task = await mutateOwnedTask(prisma, req.userId, async tx => {
    const existing = await tx.task.findFirst({
      where: { id: taskId, userId: req.userId }
    });

    if (!existing) {
      throw new TaskCompletionError('任务不存在',404);
    }

    const updateData: any = {};
    if (title) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (existing.status === 'COMPLETED')throw new TaskCompletionError('已完成任务不可重新开启或修改',409);
    if (status) updateData.status = status;
    if (priority !== undefined) updateData.priority = priority;


    return tx.task.update({
      where: { id: taskId, userId:req.userId, status:{not:'COMPLETED'} },
      data: updateData
    });
    });

    res.json({
      message: '更新成功',
      task: {
        ...task,
        knowledgeNodeIds: JSON.parse(task.knowledgeNodeIds),
        rewards: {
          energy: 0,
          crystals: 0,
          exp: 0
        }
      }
    });
  } catch (error) {
    if(error instanceof TaskCompletionError)return res.status(error.status).json({error:error.message});
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

    await mutateOwnedTask(prisma, req.userId, async tx => {
    const existing = await tx.task.findFirst({
      where: { id: taskId, userId: req.userId }
    });

    if (!existing) {
      throw new TaskCompletionError('任务不存在',404);
    }

    await tx.task.delete({
      where: { id: taskId }
    });
    });

    res.json({ message: '删除成功' });
  } catch (error) {
    if(error instanceof TaskCompletionError)return res.status(error.status).json({error:error.message});
    console.error('Delete task error:', error);
    res.status(500).json({ error: '删除任务失败' });
  }
};
