import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { mutateOwnedTask } from './taskMutations';
import { LAYOUT_NOTE_TYPE } from './internalNotes';
export { LAYOUT_NOTE_TYPE } from './internalNotes';

export const layoutNoteId = (courseId: string) => `knowledge-layout:${courseId}`;
export class KnowledgeLayoutError extends Error {
  constructor(public code: 'VALIDATION' | 'NOT_FOUND' | 'LAYOUT_CONFLICT', message: string, public status: number) { super(message); }
}
const position = z.object({
  id: z.string().trim().min(1).max(180),
  positionX: z.number().finite().min(0).max(1),
  positionY: z.number().finite().min(0).max(1),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
}).strict();
const inputSchema = z.object({ positions: z.array(position).min(1).max(500) }).strict();
type Coordinates = { id: string; positionX: number; positionY: number };
type Marker = { version: 1; courseId: string; positions: Coordinates[]; savedAt: string };
type Db = PrismaClient | Prisma.TransactionClient;
const missing = () => new KnowledgeLayoutError('NOT_FOUND', '课程或知识节点不存在', 404);
const conflict = () => new KnowledgeLayoutError('LAYOUT_CONFLICT', '图谱已在另一端修改，请保留当前布局，刷新后再保存', 409);

async function readMarker(db: Db, userId: string, courseId: string): Promise<Marker | null> {
  const note = await db.note.findFirst({ where: { id: layoutNoteId(courseId), userId, sourceType: LAYOUT_NOTE_TYPE }, select: { content: true } });
  if (!note) return null;
  try {
    const marker = JSON.parse(note.content) as Marker;
    if (marker.version !== 1 || marker.courseId !== courseId || !Array.isArray(marker.positions) || !Number.isFinite(Date.parse(marker.savedAt))) return null;
    if (marker.positions.some(p => !p || typeof p.id !== 'string' || !Number.isFinite(p.positionX) || !Number.isFinite(p.positionY))) return null;
    return marker;
  } catch { return null; }
}
function markerView(nodes: Coordinates[], marker: Marker | null) {
  const saved = new Map(marker?.positions.map(p => [p.id, p]) || []);
  const savedNodeIds = nodes.filter(n => {
    const p = saved.get(n.id); return p && p.positionX === n.positionX && p.positionY === n.positionY;
  }).map(n => n.id);
  return { layoutSaved: nodes.length > 0 && savedNodeIds.length === nodes.length, savedNodeIds, layoutUpdatedAt: marker?.savedAt || null };
}
export async function getKnowledgeLayoutMetadata(db: Db, userId: string, courseId: string, nodes: Coordinates[]) {
  return markerView(nodes, await readMarker(db, userId, courseId));
}

/** Coordinates use a shared 4096-unit canvas; one transaction commits the entire submitted layout. */
export async function saveKnowledgeLayout(db: PrismaClient, userId: string, courseId: string, raw: unknown) {
  return mutateOwnedTask(db, userId, async tx => {
    const course = await tx.course.findFirst({ where: { id: courseId, userId }, select: { id: true } });
    if (!course) throw missing();
    const parsed = inputSchema.safeParse(raw);
    if (!parsed.success) throw new KnowledgeLayoutError('VALIDATION', '布局需包含 1–500 个有效节点、0–1 坐标及节点版本', 400);
    const positions = parsed.data.positions, ids = positions.map(p => p.id);
    if (new Set(ids).size !== ids.length) throw new KnowledgeLayoutError('VALIDATION', '布局不能包含重复节点', 400);
    const current = await tx.knowledgeNode.findMany({ where: { courseId, id: { in: ids } } });
    if (current.length !== ids.length) throw missing();
    const byId = new Map(current.map(n => [n.id, n]));
    if (positions.some(p => byId.get(p.id)!.updatedAt.getTime() !== Date.parse(p.expectedUpdatedAt))) throw conflict();
    const updatedAt = new Date(Math.max(Date.now(), ...current.map(n => n.updatedAt.getTime() + 1)));
    // One bounded SQL statement avoids hundreds of database round trips for a large graph.
    const xCases = Prisma.join(positions.map(p => Prisma.sql`WHEN ${p.id} THEN ${p.positionX}`), ' ');
    const yCases = Prisma.join(positions.map(p => Prisma.sql`WHEN ${p.id} THEN ${p.positionY}`), ' ');
    const versions = Prisma.join(positions.map(p => Prisma.sql`("id" = ${p.id} AND "updatedAt" = ${new Date(p.expectedUpdatedAt)})`), ' OR ');
    const changed = await tx.$executeRaw`UPDATE "knowledge_nodes"
      SET "positionX" = CASE "id" ${xCases} ELSE "positionX" END,
          "positionY" = CASE "id" ${yCases} ELSE "positionY" END,
          "updatedAt" = ${updatedAt}
      WHERE "courseId" = ${courseId} AND (${versions})`;
    if (changed !== positions.length) throw conflict();
    const allNodes = await tx.knowledgeNode.findMany({ where: { courseId } });
    const previous = await readMarker(tx, userId, courseId), previousMap = new Map(previous?.positions.map(p => [p.id, p]) || []);
    const submittedIds = new Set(ids);
    // Persist the database's returned floating-point values, not the pre-write JS representation.
    for (const n of allNodes) if (submittedIds.has(n.id)) previousMap.set(n.id, { id: n.id, positionX: n.positionX, positionY: n.positionY });
    const marker: Marker = { version: 1, courseId, savedAt: updatedAt.toISOString(), positions: allNodes.flatMap(n => {
      const p = previousMap.get(n.id); return p ? [p] : [];
    }) };
    await tx.note.upsert({ where: { id: layoutNoteId(courseId), userId, sourceType: LAYOUT_NOTE_TYPE }, create: { id: layoutNoteId(courseId), userId, title: '知识图谱布局', sourceType: LAYOUT_NOTE_TYPE, content: JSON.stringify(marker) }, update: { content: JSON.stringify(marker) } });
    const savedMap = new Map(allNodes.map(n => [n.id, n]));
    return { nodes: ids.map(id => { const n = savedMap.get(id)!; return { ...n, parentIds: JSON.parse(n.parentIds), childIds: JSON.parse(n.childIds) }; }), ...markerView(allNodes, marker) };
  });
}
