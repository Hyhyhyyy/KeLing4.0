import { PrismaClient } from '@prisma/client';
// Arrival records are not learning evidence and no longer mint currency.
export const CHECK_IN_REWARDS = Array.from({ length: 7 }, () => ({ energy: 0, crystals: 0 }));
// One shared study day across web, mobile and servers in different timezones.
export function studyDate(now = new Date(), offsetDays = 0) {
  return new Date(now.getTime() + 8 * 3600_000 + offsetDays * 86400_000).toISOString().slice(0, 10).replace(/-/g, '');
}
export async function checkInOnce(db: PrismaClient, userId: string, now = new Date()) {
  const date = studyDate(now);
  try {
    return await db.$transaction(async tx => {
      // The unique user/day record acquires the claim before reading and incrementing rewards.
      await tx.checkInRecord.create({ data: { userId, date, rewardReceived: false } });
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      const streakDays = user.lastCheckInDate === studyDate(now, -1) ? user.streakDays + 1 : 1;
      const dayInCycle = (streakDays - 1) % 7 + 1; const reward = CHECK_IN_REWARDS[dayInCycle - 1];
      await tx.user.update({ where: { id: userId }, data: { lastCheckInDate: date, streakDays, energy: { increment: reward.energy }, crystals: { increment: reward.crystals } } });
      for (const target of [3, 7, 30]) await tx.userAchievement.updateMany({ where: { userId, achievementId: 'streak_' + target, isUnlocked: false }, data: { progress: Math.min(streakDays, target), isUnlocked: streakDays >= target, unlockedAt: streakDays >= target ? now : null } });
      return { message: '签到成功', alreadyCheckedIn: false, rewards: reward, streakDays, dayInCycle, isSpecial: dayInCycle === 7 };
    }, { maxWait: 10000, timeout: 10000 });
  } catch (e) {
    if ((e as { code?: string }).code !== 'P2002') throw e;
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    return { message: '今日已签到', alreadyCheckedIn: true, rewards: { energy: 0, crystals: 0 }, streakDays: user.streakDays, dayInCycle: (user.streakDays - 1) % 7 + 1, isSpecial: false };
  }
}
