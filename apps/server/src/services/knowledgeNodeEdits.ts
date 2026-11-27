import { randomUUID } from 'node:crypto';
import { KnowledgeNode, Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { mutateOwnedTask } from './taskMutations';

export class KnowledgeNodeEditError extends Error {
  constructor(public code: 'VALIDATION' | 'NOT_FOUND', message: string, public status: number) { super(message); }
}
const missing = () => new KnowledgeNodeEditError('NOT_FOUND', '课程或知识节点不存在', 404);
const invalid = (message: string) => new KnowledgeNodeEditError('VALIDATION', message, 400);
const ids = z.array(z.string().min(1).max(180)).max(500).refine(value => new Set(value).size === value.length);
const fields = {
  name: z.string().trim().min(1).max(180),
  description: z.string().max(20000),
  parentIds: ids,
  difficulty: z.number().int().min(1).max(5),
  masteryLevel: z.number().finite().min(0).max(1),
  isUnlocked: z.boolean(),
  positionX: z.number().finite().min(0).max(1),
  positionY: z.number().finite().min(0).max(1),
};
const editSchema = z.object(fields).partial();
const createSchema = editSchema.extend({ name: fields.name, childIds: ids.optional() });
function decodeIds(raw: string): string[] {
  try { const value: unknown = JSON.parse(raw); return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []; }
  catch { return []; }
}
const publicNode = (node: KnowledgeNode) => ({ ...node, parentIds: decodeIds(node.parentIds), childIds: decodeIds(node.childIds) });

/** Validate every changed prerequisite path before writing either side of its relation. */
function validateRelations(nodes: Map<string, KnowledgeNode>, parents: Map<string, string[]>, changed: Set<string>) {
  for (const id of changed) {
    const direct = parents.get(id) || [];
    if (direct.includes(id)) throw invalid('知识点不能将自己设为前置知识');
    if (direct.some(parent => !nodes.has(parent))) throw missing();
    const visited = new Set<string>(), stack = [...direct];
    while (stack.length) {
      const next = stack.pop()!;
      if (next === id) throw invalid('前置知识不能形成循环');
      if (visited.has(next)) continue;
      visited.add(next);
      stack.push(...parents.get(next) || []);
    }
  }
}

export async function editKnowledgeNode(db: PrismaClient, userId: string, target: { courseId: string } | { nodeId: string }, raw: unknown) {
  return mutateOwnedTask(db, userId, async tx => {
    const creating = 'courseId' in target;
    const existing = creating ? null : await tx.knowledgeNode.findFirst({ where: { id: target.nodeId, course: { userId } } });
    if (!creating && !existing) throw missing();
    const courseId = creating ? target.courseId : existing!.courseId;
    if (!await tx.course.findFirst({ where: { id: courseId, userId }, select: { id: true } })) throw missing();
    const parsed = (creating ? createSchema : editSchema).safeParse(raw);
    if (!parsed.success) throw invalid('请检查名称、前置知识、1–5 级难度及 0–1 范围的数值');
    const input = parsed.data as z.infer<typeof editSchema> & { childIds?: string[] };
    const current = await tx.knowledgeNode.findMany({ where: { courseId } });
    const nodeId = existing?.id || randomUUID();
    const newNode = existing || { id: nodeId, courseId, name: input.name!, description: input.description ?? '', parentIds: '[]', childIds: '[]', difficulty: 3, masteryLevel: 0, positionX: .5, positionY: .5, isUnlocked: false, createdAt: new Date(), updatedAt: new Date() };
    const nodes = new Map(current.map(node => [node.id, node]));
    nodes.set(nodeId, newNode);
    const parents = new Map([...nodes].map(([id, node]) => [id, decodeIds(node.parentIds)]));
    const changedParents = new Set<string>();
    if (creating || input.parentIds !== undefined) { parents.set(nodeId, input.parentIds || []); changedParents.add(nodeId); }
    // Preserve the legacy create API's optional childIds, while maintaining its inverse relation.
    const children = creating ? input.childIds || [] : [];
    for (const childId of children) {
      if (!nodes.has(childId)) throw missing();
      parents.set(childId, [...new Set([...(parents.get(childId) || []), nodeId])]);
      changedParents.add(childId);
    }
    validateRelations(nodes, parents, changedParents);
    const changes = new Map<string, Prisma.KnowledgeNodeUpdateInput>();
    const { parentIds: _parents, childIds: _children, ...scalarFields } = input;
    changes.set(nodeId, scalarFields);
    for (const id of changedParents) {
      changes.set(id, { ...changes.get(id), parentIds: JSON.stringify(parents.get(id)) });
      const oldParents = decodeIds(nodes.get(id)!.parentIds), nextParents = parents.get(id)!;
      for (const parentId of new Set([...oldParents, ...nextParents])) {
        const parent = nodes.get(parentId);
        if (!parent) continue; // A removed legacy dangling edge has no inverse row to update.
        const pending = changes.get(parentId);
        const childIds = decodeIds(typeof pending?.childIds === 'string' ? pending.childIds : parent.childIds).filter(child => child !== id);
        if (nextParents.includes(parentId)) childIds.push(id);
        changes.set(parentId, { ...pending, childIds: JSON.stringify([...new Set(childIds)]) });
      }
    }
    const updatedAt = new Date(Math.max(Date.now(), ...[...changes.keys()].map(id => nodes.get(id)!.updatedAt.getTime() + 1)));
    if (creating) await tx.knowledgeNode.create({ data: { ...newNode, ...scalarFields, parentIds: JSON.stringify(parents.get(nodeId)), childIds: typeof changes.get(nodeId)?.childIds === 'string' ? changes.get(nodeId)!.childIds as string : '[]', updatedAt } });
    for (const [id, data] of changes) {
      if (creating && id === nodeId) continue;
      await tx.knowledgeNode.update({ where: { id }, data: { ...data, updatedAt } });
    }
    return publicNode((await tx.knowledgeNode.findUnique({ where: { id: nodeId } }))!);
  });
}

/** Remove only references inside the owned course, in the same transaction as deletion. */
export async function deleteKnowledgeNode(db: PrismaClient, userId: string, nodeId: string) {
  return mutateOwnedTask(db, userId, async tx => {
    const existing = await tx.knowledgeNode.findFirst({ where: { id: nodeId, course: { userId } } });
    if (!existing) throw missing();
    const siblings = await tx.knowledgeNode.findMany({ where: { courseId: existing.courseId, id: { not: nodeId } } });
    for (const sibling of siblings) {
      const parents = decodeIds(sibling.parentIds), children = decodeIds(sibling.childIds);
      if (!parents.includes(nodeId) && !children.includes(nodeId)) continue;
      await tx.knowledgeNode.update({ where: { id: sibling.id }, data: {
        parentIds: JSON.stringify(parents.filter(id => id !== nodeId)),
        childIds: JSON.stringify(children.filter(id => id !== nodeId)),
        updatedAt: new Date(Math.max(Date.now(), sibling.updatedAt.getTime() + 1)),
      } });
    }
    await tx.knowledgeNode.delete({ where: { id: nodeId } });
  });
}
