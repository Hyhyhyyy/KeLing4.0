import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AIError } from './catalog';
import type { Source } from './retrieval';
import { CHAPTER } from '@keling/shared/expedition';

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
    sources.push({ id: course.id, kind: 'course', title, text: `当前选择的课程：${title}。以下仅包含这门课程的知识点、选取的资料摘录和学习记录，不包含其他课程或独立笔记。学习记录不能当作成绩或已掌握知识的证明。`, updatedAt: course.updatedAt.toISOString(), truncated: false });
    for (const node of nodes.slice(0, 6)) sources.push({ id: node.id, kind: 'knowledge', title: node.name, ...excerpt(node.description, 1000), updatedAt: node.updatedAt.toISOString() });
    if (nodes.length > 6) warnings.push('本次仅附带该课程最近更新的 6 个知识点，不代表完整课程。');
    if (sources.some(source => source.truncated)) warnings.push('较长知识点仅附带前 1000 字符；具体内容以预览为准。');
    const [versions, progress, runs] = await Promise.all([
      db.materialVersion.findMany({ where: { userId, courseId: course.id, deletedAt: null, parseStatus: 'READY' }, orderBy: [{ version: 'desc' }, { createdAt: 'desc' }], take: 24,
        include: { spans: { orderBy: { ordinal: 'asc' }, take: 1 } } }),
      db.expeditionProgress.findFirst({ where: { userId, courseId: course.id, chapterId: CHAPTER.id } }),
      db.questRun.findMany({ where: { userId, courseId: course.id }, orderBy: { updatedAt: 'desc' }, take: 3 }),
    ]);
    const latest = versions.filter((m, i) => versions.findIndex(x => x.materialId === m.materialId) === i).slice(0, 3);
    for (const material of latest) {
      const span = material.spans[0]; if (!span) continue;
      const part = excerpt(material.content.slice(span.startUtf16, span.endUtf16), 1200);
      sources.push({ id: span.id, kind: 'material', title: `${material.title} v${material.version}`,
        text: `资料版本 ${material.id}\n内容摘要 SHA256 ${material.contentHash}\n${span.page ? `第${span.page}页` : `第${(span.paragraphIndex || 0) + 1}段`}，原文字符位置 ${span.startUtf16}–${span.startUtf16 + part.text.length}\n\n${part.text}`,
        truncated: part.truncated || span.endUtf16 < material.content.length, updatedAt: material.createdAt.toISOString() });
    }
    if (latest.length) warnings.push('资料仅附带最多 3 个当前版本各自的首个片段；完整资料辅导请到课程资料工作坊选择范围。');
    if (progress) {
      const state = JSON.parse(progress.state);
      const labels: Record<string, string> = { UNEXPLORED: '待探索', ATTEMPTED: '已尝试', INDEPENDENT: '有独立证据', DELAYED: '有延迟证据' };
      const summary = (state.objectives || []).slice(0, 3).map((o: any) => `${CHAPTER.objectives.find(x => x.key === o.objectiveKey)?.title || o.objectiveKey}：${labels[o.state] || '未知状态'}${o.review ? `；建议回访 ${o.review.dueAt}` : ''}`).join('\n');
      const memories = (state.companionMemories || []).filter((m: any) => !m.deletedAt).slice(-2).map((m: any) => '用户确认的自述解释（非已审核事实）：' + String(m.text).slice(0, 600)).join('\n');
      sources.push({ id: progress.id, kind: 'evidence', title: '本课程学习证据与星芽档案', text: summary + (memories ? '\n\n' + memories : '') + '\n\n不能根据游戏经验、结晶或单次练习预测成绩；待审核内容不能称为严格验证。', updatedAt: progress.updatedAt.toISOString(), truncated: (state.companionMemories || []).length > 2 });
    }
    for (const row of runs) {
      const run = JSON.parse(row.state), attempt = run.attempts?.at(-1);
      sources.push({ id: row.id, kind: 'evidence', title: '最近远征 · ' + (CHAPTER.objectives.find(x => x.key === run.objectiveKey)?.title || '二叉树'),
        text: `远征状态：${row.status}\n模式：${run.mode}\n已用提示：${run.hintsUsed || 0}\n` + (attempt ? `最近一次反馈类型：${attempt.feedback.kind}\n首次作答：${attempt.firstSubmission ? '是' : '否'}\n反馈：${attempt.feedback.message}\n` : '尚无作答。\n') + `下一步自述：${String(run.nextStep || '尚未确认').slice(0, 600)}\n这些是过程记录，不是 AI 可更改的评价。`,
        updatedAt: row.updatedAt.toISOString(), truncated: false });
    }
    if (!nodes.length && !latest.length) warnings.push('这门课程没有知识点或可引用材料；过程记录不能补足教材依据。');
  }
  // Version and exact excerpts both participate; refreshed metadata cannot masquerade as an old preview.
  const fingerprint = createHash('sha256').update(JSON.stringify({ version: 1, ref, title, sources, warnings })).digest('hex');
  return { ref, title, fingerprint, sources, warnings };
}
