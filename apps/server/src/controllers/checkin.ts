import { Response } from 'express';
import { prisma } from '../database';
import { AuthRequest } from '../middleware/auth';
import { checkInOnce, studyDate, CHECK_IN_REWARDS } from '../services/checkin';

export const checkIn = async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ error: '未认证' });
  try { res.json(await checkInOnce(prisma, req.userId)); }
  catch { res.status(500).json({ error: '签到失败，请刷新状态后重试' }); }
};
export const getCheckInRecords = async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ error: '未认证' });
  try { res.json({ records: await prisma.checkInRecord.findMany({ where: { userId: req.userId }, orderBy: { date: 'desc' }, take: 365 }) }); }
  catch { res.status(500).json({ error: '获取签到记录失败' }); }
};
export const getCheckInStatus = async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ error: '未认证' });
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { streakDays: true, lastCheckInDate: true } });
    if (!user) return res.status(404).json({ error: '用户不存在' });
    const today = studyDate();
    const todayRecord = await prisma.checkInRecord.findUnique({ where: { userId_date: { userId: req.userId, date: today } } });
    const continuing = user.lastCheckInDate === today || user.lastCheckInDate === studyDate(new Date(), -1);
    const streak = continuing ? user.streakDays : 0;
    const day = streak % 7 + 1;
    res.json({ hasCheckedInToday: Boolean(todayRecord), streakDays: streak, lastCheckInDate: user.lastCheckInDate,
      timezone: 'Asia/Shanghai', nextReward: { day, ...CHECK_IN_REWARDS[day - 1] } });
  } catch { res.status(500).json({ error: '获取签到状态失败' }); }
};
