import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AIError } from './catalog';
import type { Source } from './retrieval';

export const contextRefInput = z.object({
  kind: z.enum(['course', 'note', 'task']), id: z.string().trim().min(1).max(160),
}).strict();
export const contextTurnInput = contextRefInput.extend({ fingerprint: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export type ContextRef = z.infer<typeof contextRefInput>;
export type ContextSource = Source & { updatedAt: string; truncated: boolean };
export interface ContextPreview { ref: ContextRef; title: string; fingerprint: string; sources: ContextSource[]; warnings: string[] }

const missing = () => new AIError('CONTEXT_NOT_FOUND', '资料不存在或已不可访问，请返回原页面重新选择', 404);
function excerpt(text: string, limit: number) {
  // Avoid an unpaired high surrogate when a UTF-16 limit cuts through an emoji.
  const end = text.length > limit && /[\uD800-\uDBFF]/.test(text[limit - 1]) ? limit - 1 : limit;
  return { text: text.slice(0, end), truncated: text.length > end };
}

/** Read only the selected owner's records. No external models, URLs or arbitrary client text. */
export async function resolveContext(db: PrismaClient, userId: string, raw: unknown): Promise<ContextPreview> {
  const ref = contextRefInput.parse(raw);
  const sources: ContextSource[] = [];
  const warnings: string[] = [];
  let title: string;
  if (ref.kind === 'note') {
    const note = await db.note.findFirst({ where: { id: ref.id, userId }, select: { id: true, title: true, content: true, updatedAt: true } });
    if (!note) throw missing();
    title = note.title;
    const part = excerpt(note.content, 6000);
    sources.push({ id: note.id, kind: 'note', title, ...part, updatedAt: note.updatedAt.toISOString() });
    if (part.truncated) warnings.push('笔记较长，本次仅附带前 6000 字符；未显示的后续内容不会发送。');
    if (!note.content.trim()) warnings.push('这篇笔记没有正文，本次仅包含标题。');
  } else if (ref.kind === 'task') {
    const task = await db.task.findFirst({ where: { id: ref.id, userId }, select: { id: true, title: true, description: true, type: true, status: true, estimatedMinutes: true, updatedAt: true } });
    if (!task) throw missing();
    title = task.title;
    const part = excerpt(task.description, 4000);
    sources.push({ id: task.id, kind: 'task', title, text: `任务类型：${task.type}\n当前状态：${task.status}\n预计时长：${task.estimatedMinutes} 分钟（不是实际完成时长）\n\n任务说明：\n${part.text}`, truncated: part.truncated, updatedAt: task.updatedAt.toISOString() });
    if (part.truncated) warnings.push('任务说明较长，本次仅附带前 4000 字符；未显示的后续内容不会发送。');
  } else {
    const course = await db.course.findFirst({ where: { id: ref.id, userId, isArchived: false }, select: { id: true, name: true, updatedAt: true } });
    if (!course) throw missing();
    title = course.name;
    const nodes = await db.knowledgeNode.findMany({
      where: { courseId: course.id, course: { userId, isArchived: false } },
      select: { id: true, name: true, description: true, updatedAt: true },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], take: 7,
    });
    sources.push({ id: course.id, kind: 'course', title, text: `当前选择的课程：${title}。以下只包含这门课程的知识点，不包含其他课程或笔记。`, updatedAt: course.updatedAt.toISOString(), truncated: false });
    for (const node of nodes.slice(0, 6)) sources.push({ id: node.id, kind: 'knowledge', title: node.name, ...excerpt(node.description, 1000), updatedAt: node.updatedAt.toISOString() });
    if (nodes.length > 6) warnings.push('本次仅附带该课程最近更新的 6 个知识点，不代表完整课程。');
    if (sources.some(source => source.truncated)) warnings.push('较长知识点仅附带前 1000 字符；具体内容以预览为准。');
    if (!nodes.length) warnings.push('这门课程尚未添加知识点，本次只附带课程名称；模型没有课程资料依据。');
  }
  // Version and exact excerpts both participate; refreshed metadata cannot masquerade as an old preview.
  const fingerprint = createHash('sha256').update(JSON.stringify({ version: 1, ref, title, sources, warnings })).digest('hex');
  return { ref, title, fingerprint, sources, warnings };
}
