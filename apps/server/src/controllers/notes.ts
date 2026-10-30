import { Request, Response } from 'express';
import { prisma } from '../database';
import { AuthRequest } from '../middleware/auth';
import { randomUUID as uuidv4 } from 'node:crypto';
import { z } from 'zod';
const noteInput = z.object({ title: z.string().trim().min(1).max(180), content: z.string().min(1).max(50000),
  tags: z.array(z.string().max(50)).max(20).optional(), relatedNodeIds: z.array(z.string().max(100)).max(100).optional(),
  sourceType: z.enum(['USER_CREATED', 'AI_GENERATED', 'CLASS_CAPTURE', 'BOUNTY_REWARD']).optional(), aiExplanation: z.string().max(50000).optional() });

// 获取所有笔记
export const getNotes = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: '未认证' });
    }

    const { tag, sourceType } = req.query;

    const where: any = { userId: req.userId };
    // SQLite 不支持 JSON 查询，这里简化处理

    const notes = await prisma.note.findMany({
      where,
      orderBy: { updatedAt: 'desc' }
    });

    res.json({
      notes: notes.map(n => ({
        ...n,
        relatedNodeIds: JSON.parse(n.relatedNodeIds),
        tags: JSON.parse(n.tags)
      }))
    });
  } catch (error) {
    console.error('Get notes error:', error);
    res.status(500).json({ error: '获取笔记失败' });
  }
};

// 创建笔记
export const createNote = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: '未认证' });
    }

    const parsed = noteInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: '标题需为 1–180 字符，正文需为 1–50000 字符' });
    const { title, content, sourceType, aiExplanation, relatedNodeIds, tags } = parsed.data;

    if (!title || !content) {
      return res.status(400).json({ error: '标题和内容为必填项' });
    }

    const note = await prisma.note.create({
      data: {
        id: uuidv4(),
        userId: req.userId,
        title,
        content,
        sourceType: sourceType || 'USER_CREATED',
        aiExplanation,
        relatedNodeIds: JSON.stringify(relatedNodeIds || []),
        tags: JSON.stringify(tags || [])
      }
    });

    // 更新成就
    await updateNoteAchievement(req.userId);

    res.status(201).json({
      message: '创建成功',
      note: {
        ...note,
        relatedNodeIds: JSON.parse(note.relatedNodeIds),
        tags: JSON.parse(note.tags)
      }
    });
  } catch (error) {
    console.error('Create note error:', error);
    res.status(500).json({ error: '创建笔记失败' });
  }
};

// 更新笔记
export const updateNote = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: '未认证' });
    }

    const noteId = String(req.params.id);
    const parsed = noteInput.partial().extend({ reviewCount: z.number().int().min(0).max(100000).optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: '笔记内容格式不正确或超出长度限制' });
    const { title, content, tags, reviewCount } = parsed.data;

    const existing = await prisma.note.findFirst({
      where: { id: noteId, userId: req.userId }
    });

    if (!existing) {
      return res.status(404).json({ error: '笔记不存在' });
    }

    const expected = req.body.expectedUpdatedAt;
    if (expected !== undefined && (typeof expected !== 'string' || !Number.isFinite(Date.parse(expected)))) return res.status(400).json({ error: '笔记版本格式无效' });
    const changed = await prisma.note.updateMany({
      where: { id: noteId, userId: req.userId, updatedAt: expected ? new Date(expected) : existing.updatedAt },
      data: {
        ...(title && { title }),
        ...(content && { content }),
        ...(tags && { tags: JSON.stringify(tags) }),
        ...(reviewCount !== undefined && { reviewCount }),
        // Strictly advance the version even when two writes land in the same millisecond.
        updatedAt: new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1))
      }
    });

    if (changed.count !== 1) return res.status(409).json({ error: '笔记已在另一端修改，请保留草稿并刷新后再保存' });
    const note = await prisma.note.findUniqueOrThrow({ where: { id: noteId } });

    res.json({
      message: '更新成功',
      note: {
        ...note,
        relatedNodeIds: JSON.parse(note.relatedNodeIds),
        tags: JSON.parse(note.tags)
      }
    });
  } catch (error) {
    console.error('Update note error:', error);
    res.status(500).json({ error: '更新笔记失败' });
  }
};

// 删除笔记
export const deleteNote = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: '未认证' });
    }

    const noteId = String(req.params.id);

    const existing = await prisma.note.findFirst({
      where: { id: noteId, userId: req.userId }
    });

    if (!existing) {
      return res.status(404).json({ error: '笔记不存在' });
    }

    await prisma.note.delete({
      where: { id: noteId }
    });

    res.json({ message: '删除成功' });
  } catch (error) {
    console.error('Delete note error:', error);
    res.status(500).json({ error: '删除笔记失败' });
  }
};

// 辅助函数：更新笔记成就
async function updateNoteAchievement(userId: string) {
  try {
    const count = await prisma.note.count({
      where: { userId }
    });

    const ua = await prisma.userAchievement.findUnique({
      where: { userId_achievementId: { userId, achievementId: 'notes_5' } }
    });

    if (ua && !ua.isUnlocked) {
      await prisma.userAchievement.update({
        where: { id: ua.id },
        data: {
          progress: Math.min(count, 5),
          isUnlocked: count >= 5,
          unlockedAt: count >= 5 ? new Date() : null
        }
      });
    }
  } catch (error) {
    console.error('Update note achievement error:', error);
  }
}
