import { PrismaClient } from '@prisma/client';
import { selectedProvider, AIError } from './catalog';
import { embed } from './transport';
export type Source = { id: string; title: string; text: string; kind: 'knowledge' | 'note' | 'task' | 'course'; updatedAt?: string; truncated?: boolean };
function sourceExcerpt(text: string) {
  const end = text.length > 1000 && /[\uD800-\uDBFF]/.test(text[999]) ? 999 : 1000;
  return { text: text.slice(0, end), truncated: text.length > end };
}
export function cosine(a: number[], b: number[]) {
  if (a.length !== b.length || !a.length) throw new AIError('DIMENSION_MISMATCH', '向量维度不一致');
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; }
  if (!aa || !bb) throw new AIError('INVALID_EMBEDDING', '向量不能为零');
  return dot / Math.sqrt(aa * bb);
}
export async function retrieve(db: PrismaClient, userId: string, query: string, mode: string, providerId?: string, model?: string, signal?: AbortSignal): Promise<Source[]> {
  const [nodes, notes] = await Promise.all([
    db.knowledgeNode.findMany({ where: { course: { userId, isArchived: false } }, orderBy: { updatedAt: 'desc' }, take: 24 }),
    db.note.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' }, take: 12 }),
  ]);
  const sources: Source[] = [...nodes.map(x => ({ id: x.id, title: x.name, ...sourceExcerpt(x.description), updatedAt: x.updatedAt.toISOString(), kind: 'knowledge' as const })),
    ...notes.map(x => ({ id: x.id, title: x.title, ...sourceExcerpt(x.content), updatedAt: x.updatedAt.toISOString(), kind: 'note' as const }))];
  if (!sources.length) return [];
  let scores: number[];
  if (mode === 'vector') {
    const p = selectedProvider(providerId || '', model || '', 'embedding');
    const vectors = await embed(p, model!, [query, ...sources.map(x => x.title + '\n' + x.text)], signal);
    scores = sources.map((_, i) => cosine(vectors[0], vectors[i + 1]));
  } else {
    const words: string[] = Array.from(query.toLowerCase().match(/[a-z0-9_]+|[\u4e00-\u9fff]/g) || []);
    scores = sources.map(x => words.reduce((n, word) => n + ((x.title + x.text).toLowerCase().includes(word) ? 1 : 0), 0));
  }
  return sources.map((source, i) => ({ source, score: scores[i] })).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 6).map(x => x.source);
}
