import { Prisma, PrismaClient } from '@prisma/client';
import { CHAPTER, ExpeditionError } from '@keling/shared/expedition';
type Db = PrismaClient | Prisma.TransactionClient;
type Course = { id: string; code: string };
/** Empty progress rows created by old page loads are not evidence of opting into this example. */
function meaningfulProgress(raw: string): boolean {
  try {
    const value = JSON.parse(raw);
    return (Array.isArray(value.seenExerciseIds) && value.seenExerciseIds.length > 0) ||
      (Array.isArray(value.companionMemories) && value.companionMemories.length > 0) ||
      (Array.isArray(value.objectives) && value.objectives.some((o: any) =>
        ['ATTEMPTED', 'INDEPENDENT', 'DELAYED'].includes(o?.state) || (Array.isArray(o?.evidenceIds) && o.evidenceIds.length > 0) || !!o?.review));
  } catch { return false; }
}
export async function binaryTreeHistoryCourseIds(db: Db, userId: string, courseIds: string[]) {
  if (!courseIds.length) return new Set<string>();
  const progress = await db.expeditionProgress.findMany({ where: { userId, courseId: { in: courseIds }, chapterId: CHAPTER.id }, select: { id: true, courseId: true, state: true } });
  const history = new Set(progress.filter(p => meaningfulProgress(p.state)).map(p => p.courseId));
  if (progress.length) {
    const runs = await db.questRun.findMany({ where: { userId, courseId: { in: courseIds }, progressId: { in: progress.map(p => p.id) } }, distinct: ['courseId'], select: { courseId: true } });
    for (const run of runs) history.add(run.courseId);
  }
  return history;
}
export function isBinaryTreeCourse(course: Course, history: Set<string>) {
  return course.code !== 'AI_PLANET' && (['SAMPLE', 'BINARY_TREE_SAMPLE'].includes(course.code) || history.has(course.id));
}
export async function binaryTreeCourseIds(db: Db, userId: string, courses: Course[]) {
  const history = await binaryTreeHistoryCourseIds(db, userId, courses.map(c => c.id));
  return new Set(courses.filter(c => isBinaryTreeCourse(c, history)).map(c => c.id));
}
export async function assertBinaryTreeCourse(db: Db, userId: string, course: Course) {
  if (!(await binaryTreeCourseIds(db, userId, [course])).has(course.id)) throw new ExpeditionError('SAMPLE_REQUIRED', '请从二叉树示例入口创建示例课程；普通学科课程不会自动加入示例资料', 409);
}
