import { Router } from 'express';
import { getProfile, updateProfile } from '../controllers/user';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.get('/profile', authMiddleware, getProfile);
router.put('/profile', authMiddleware, updateProfile);
// Rewards are written only by server-validated task/check-in transactions.
router.post(['/energy', '/crystals'], authMiddleware, (_req, res) => {
  res.status(410).json({ error: '请通过完成任务或签到获得奖励，客户端不能直接修改余额' });
});

export default router;
