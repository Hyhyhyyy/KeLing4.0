import { Response } from 'express';
import { prisma } from '../database';
import { AuthRequest } from '../middleware/auth';
import { z } from 'zod';

// 获取用户资料
export const getProfile = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: '未认证' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        name: true,
        email: true,
        level: true,
        exp: true,
        energy: true,
        crystals: true,
        streakDays: true,
        totalStudyMinutes: true,
        lastCheckInDate: true,
        avatarUrl: true,
        bio: true,
        weeklyStudyGoal: true,
        createdAt: true,
        courses: {
          where: { isArchived: false },
          select: {
            id: true,
            name: true,
            masteryLevel: true,
            themeColor: true,
            planetStyleIndex: true
          }
        },
        _count: {
          select: {
            tasks: { where: { status: 'COMPLETED' } },
            notes: true
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: '获取资料失败' });
  }
};

// 更新用户资料
export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: '未认证' });
    }

    const parsed = z.object({ name: z.string().trim().min(1).max(60).optional(), bio: z.string().max(1000).optional(),
      avatarUrl: z.string().regex(/^stellar:avatar-[0-8]$/).optional(), weeklyStudyGoal: z.number().int().min(10).max(10080).optional() }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: '资料格式不正确，头像请从星际头像库选择' });
    const { name, bio, avatarUrl, weeklyStudyGoal } = parsed.data;

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: {
        ...(name && { name }),
        ...(bio !== undefined && { bio }),
        ...(avatarUrl && { avatarUrl }),
        ...(weeklyStudyGoal && { weeklyStudyGoal })
      }
    });

    res.json({
      message: '更新成功',
      user: {
        id: user.id,
        name: user.name,
        bio: user.bio,
        avatarUrl: user.avatarUrl,
        weeklyStudyGoal: user.weeklyStudyGoal
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: '更新失败' });
  }
};
