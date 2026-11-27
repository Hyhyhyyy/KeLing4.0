import { Prisma, PrismaClient } from '@prisma/client';
import { searchSpans } from './materials';
import { binaryTreeCourseIds } from '../expedition/courseAccess';

type Db = PrismaClient | Prisma.TransactionClient;

/** Choose the latest version before filtering tombstones; never revive an older version. */
export async function currentMaterials(db: Db, userId: string, courseId?: string, materialIds?: string[]) {
  const courses = await db.course.findMany({ where: { userId, isArchived: false, ...(courseId ? { id: courseId } : {}) }, select: { id: true, code: true } });
  if (!courses.length) return [];
  if (materialIds && !materialIds.length) return [];
  const examples = await binaryTreeCourseIds(db, userId, courses);
  const scope = { userId, courseId: { in: courses.map(c => c.id) }, ...(materialIds ? { materialId: { in: materialIds } } : {}),
    AND: [{ OR: [{ format: { not: 'SEED' } }, { courseId: { in: [...examples] } }] }] };
  const groups = await db.materialVersion.groupBy({ by: ['materialId'], where: scope,
    _max: { version: true, createdAt: true }, orderBy: { _max: { createdAt: 'desc' } }, take: 40 });
  if (!groups.length) return [];
  return db.materialVersion.findMany({ where: { ...scope, deletedAt: null, parseStatus: 'READY',
    OR: groups.map(g => ({ materialId: g.materialId, version: g._max.version! })) },
    include: { spans: { orderBy: { ordinal: 'asc' } } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] });
}

export function materialSources(materials: Awaited<ReturnType<typeof currentMaterials>>, query: string, limit: number, allowedIds?: string[]) {
  const scoped = materials.map(m => ({ ...m, spans: m.spans
    .filter(s => !allowedIds || allowedIds.includes(`material:${m.id}:${s.id}`))
    .map(s => ({ ...s, paragraphIndex: s.paragraphIndex ?? 0 })) }));
  const rows = searchSpans(scoped, query, limit);
  return rows.map(s => ({
    id: `material:${s.materialVersionId}:${s.spanId}`,
    title: `${s.title} · ${s.page ? `第 ${s.page} 页` : `第 ${s.paragraphIndex + 1} 段`}`,
    text: s.text, kind: 'material' as const,
    updatedAt: materials.find(m => m.id === s.materialVersionId)!.createdAt.toISOString(),
    truncated: false,
  }));
}

export async function assertCurrentMaterialSources(db: Db, userId: string, courseId: string, sourceIds: string[]) {
  const wanted = [...new Set(sourceIds.filter(id => id.startsWith('material:')))];
  if (!wanted.length) return;
  // Unrelated newer uploads must not push a valid reference out of the discovery window.
  const cited = await db.materialVersion.findMany({ where: { userId, courseId, id: { in: wanted.map(id => id.split(':')[1]) } }, select: { materialId: true } });
  const present = materialSources(await currentMaterials(db, userId, courseId, cited.map(m => m.materialId)), '', wanted.length, wanted).map(s => s.id);
  if (wanted.some(id => !present.includes(id))) throw new Error('来源资料已更新或移除，请重新生成计划');
}
