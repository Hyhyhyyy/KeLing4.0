import type { Achievement, CheckInRecord, Course, KnowledgeNode, Note, Task, User, UserAchievement } from '../types';
import { getGuestSessionId, subscribeGuestSession } from './guestSession';

type Versioned = { createdAt: string; updatedAt: string };
export type GuestCourse = Course & Versioned & { userId: string };
export type GuestTask = Task & Versioned & { userId: string };
export type GuestNote = Note & { userId: string };
export type GuestNode = KnowledgeNode & Versioned;
export interface GuestWorkspace {
  sessionId: string;
  user: User;
  courses: GuestCourse[];
  tasks: GuestTask[];
  notes: GuestNote[];
  nodes: GuestNode[];
  checkins: CheckInRecord[];
  achievements: UserAchievement[];
  createdCourses: number;
}

type Input = Record<string, unknown>;
let workspace: GuestWorkspace | undefined;
subscribeGuestSession(() => { workspace = undefined; });

/** Match the API error shape without sending visitor records over the network. */
export function guestDataError(status: number, error: string): never {
  throw Object.assign(new Error(error), { response: { status, data: { error } } });
}
export function guestTimestamp(previous?: string) {
  return new Date(Math.max(Date.now(), previous ? Date.parse(previous) + 1 : 0)).toISOString();
}
const clone = <T,>(value: T): T => structuredClone(value);
const id = () => crypto.randomUUID();
const has = (data: Input, key: string) => data[key] !== undefined;
function text(data: Input, key: string, fallback = '', max = 50000, required = false): string {
  if (!has(data, key) && !required) return fallback;
  if (typeof data[key] !== 'string' || (data[key] as string).length > max || (required && !(data[key] as string).trim()))
    return guestDataError(400, `${key} 内容为空或超出长度限制`);
  return data[key] as string;
}
function number(data: Input, key: string, fallback: number, min: number, max: number, integer = false) {
  if (!has(data, key)) return fallback;
  const value = data[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value)))
    return guestDataError(400, `${key} 数值无效`);
  return value;
}
function strings(data: Input, key: string, fallback: string[] = [], max = 100, length = 100): string[] {
  if (!has(data, key)) return [...fallback];
  const value = data[key];
  if (!Array.isArray(value) || value.length > max || value.some(v => typeof v !== 'string' || v.length > length))
    return guestDataError(400, `${key} 列表格式无效`);
  return [...new Set(value as string[])];
}
function boolean(data: Input, key: string, fallback: boolean) {
  if (!has(data, key)) return fallback;
  if (typeof data[key] !== 'boolean') return guestDataError(400, `${key} 格式无效`);
  return data[key] as boolean;
}
function oneOf<T extends string>(data: Input, key: string, options: readonly T[], fallback: T): T {
  if (!has(data, key)) return fallback;
  if (!options.includes(data[key] as T)) return guestDataError(400, `${key} 选项无效`);
  return data[key] as T;
}
function requiredItem<T extends { id: string }>(items: T[], key: string, label: string): T {
  return items.find(item => item.id === key) ?? guestDataError(404, `${label}不存在`);
}
const rewards = Array.from({ length: 7 }, () => ({ energy: 0, crystals: 0 }));
const achievementDefinitions: Achievement[] = [
  ['first_task', '初学者', '完成第一个学习任务', '🌱', 'LEARNING', 50, 30, 1],
  ['task_master_10', '任务达人', '累计完成10个学习任务', '📋', 'LEARNING', 100, 30, 10],
  ['task_master_50', '任务大师', '累计完成50个学习任务', '🏆', 'LEARNING', 300, 100, 50],
  ['first_course', '星际探索者', '创建第一颗知识星球', '🌍', 'EXPLORATION', 50, 30, 1],
  ['mastery_80', '知识精通', '将任意课程掌握度提升到80%以上', '✨', 'MASTERY', 200, 50, 1],
  ['streak_3', '坚持三天', '连续学习3天', '🔥', 'STREAK', 50, 30, 3],
  ['streak_7', '周周坚持', '连续学习7天', '🌟', 'STREAK', 150, 30, 7],
  ['streak_30', '月度之星', '连续学习30天', '💫', 'STREAK', 500, 200, 30],
  ['knowledge_10', '知识收集者', '解锁10个知识点', '📚', 'EXPLORATION', 80, 30, 10],
  ['notes_5', '笔记达人', '创建5篇学习笔记', '📝', 'LEARNING', 100, 30, 5],
].map(row => ({ id: String(row[0]), name: String(row[1]), description: String(row[2]), icon: String(row[3]),
  category: row[4] as Achievement['category'], rewardEnergy: Number(row[5]), rewardCrystals: Number(row[6]), maxProgress: Number(row[7]), requirement: '' }));
function studyDate(offsetDays = 0) {
  return new Date(Date.now() + 8 * 3600000 + offsetDays * 86400000).toISOString().slice(0, 10).replaceAll('-', '');
}
function newCourse(data: Input, userId: string): GuestCourse {
  const now = guestTimestamp();
  const schedule = has(data, 'schedule') ? data.schedule : [];
  if (!Array.isArray(schedule) || schedule.length > 100) return guestDataError(400, '课程时间表格式无效');
  return { id: id(), userId, name: text(data, 'name', '', 180, true).trim(), code: text(data, 'code', '', 100),
    teacher: text(data, 'teacher', '', 180), schedule: clone(schedule), location: text(data, 'location', '', 180),
    themeColor: text(data, 'themeColor', '#67a68b', 30), masteryLevel: 0, plantStage: 0,
    planetStyleIndex: number(data, 'planetStyleIndex', 0, 0, 9, true), lastStudiedAt: null, totalStudyMinutes: 0,
    isArchived: false, semester: text(data, 'semester', '', 100), credit: number(data, 'credit', 0, 0, 100),
    studySessionCount: 0, createdAt: now, updatedAt: now };
}
function newNode(data: Input, courseId: string): GuestNode {
  const now = guestTimestamp();
  return { id: id(), courseId, name: text(data, 'name', '', 180, true).trim(), description: text(data, 'description'),
    parentIds: strings(data, 'parentIds'), childIds: [], difficulty: number(data, 'difficulty', 3, 1, 5, true),
    masteryLevel: number(data, 'masteryLevel', 0, 0, 1), positionX: number(data, 'positionX', .5, 0, 1),
    positionY: number(data, 'positionY', .5, 0, 1), isUnlocked: boolean(data, 'isUnlocked', false), createdAt: now, updatedAt: now };
}
function createWorkspace(sessionId: string): GuestWorkspace {
  const user: User = { id: sessionId, name: '游客探索者', email: '', level: 1, exp: 0, energy: 0, crystals: 0,
    streakDays: 0, totalStudyMinutes: 0, lastCheckInDate: null, avatarUrl: 'stellar:avatar-0', bio: '', weeklyStudyGoal: 300, createdAt: guestTimestamp() };
  const course = newCourse({ name: '示例：算法与思考', code: 'SAMPLE', teacher: '示例资料 · 可编辑或删除' }, sessionId);
  const first = newNode({ name: '递归与终止条件', description: '示例资料：递归把问题缩小为同类子问题，必须有终止条件。例如 0! = 1，n! = n × (n−1)!。试着展开 3!，观察何时停止。', positionX: .3, positionY: .35 }, course.id);
  const second = newNode({ name: '时间复杂度', description: '示例资料：时间复杂度描述输入规模增长时步骤数如何增长。扫描 n 个元素通常为 O(n)，有序数据的二分查找通常为 O(log n)。它不是实际运行秒数。', positionX: .7, positionY: .65 }, course.id);
  return { sessionId, user, courses: [course], nodes: [first, second], tasks: [], notes: [], checkins: [], createdCourses: 0,
    achievements: achievementDefinitions.map(achievement => ({ id: id(), achievementId: achievement.id, achievement: clone(achievement), isUnlocked: false, progress: 0, unlockedAt: null })) };
}

/** Internal mutable workspace for the visitor AI adapter; HTTP-facing results are copies. */
export function getGuestWorkspace(): GuestWorkspace {
  const sessionId = getGuestSessionId();
  if (!sessionId) return guestDataError(401, '游客试用已结束，请重新进入');
  if (!workspace || workspace.sessionId !== sessionId) workspace = createWorkspace(sessionId);
  return workspace;
}
function updateAchievements(w: GuestWorkspace) {
  const done = w.tasks.filter(t => t.status === 'COMPLETED').length;
  for (const item of w.achievements) {
    if (item.isUnlocked) continue;
    const key = item.achievementId;
    const count = key === 'first_task' || key.startsWith('task_master_') ? done
      : key === 'first_course' ? w.createdCourses
      : key === 'mastery_80' ? Number(w.courses.some(c => c.masteryLevel >= .8))
      : key.startsWith('streak_') ? w.user.streakDays
      : key === 'knowledge_10' ? w.nodes.filter(n => n.isUnlocked).length
      : key === 'notes_5' ? w.notes.length : 0;
    item.progress = Math.min(count, item.achievement.maxProgress);
    item.isUnlocked = count >= item.achievement.maxProgress;
    if (item.isUnlocked) item.unlockedAt = guestTimestamp();
  }
}
function courseResponse(w: GuestWorkspace, course: GuestCourse) {
  return { ...course, knowledgeNodeCount: w.nodes.filter(node => node.courseId === course.id).length };
}
function refreshChildren(w: GuestWorkspace) {
  for (const node of w.nodes) node.childIds = w.nodes.filter(child => child.parentIds.includes(node.id)).map(child => child.id);
}
function validateParents(w: GuestWorkspace, node: GuestNode) {
  for (const parentId of node.parentIds) {
    const parent = requiredItem(w.nodes, parentId, '父知识点');
    if (parent.courseId !== node.courseId || parent.id === node.id) return guestDataError(400, '父知识点必须属于当前课程且不能是自身');
    const visit = (key: string, seen: Set<string>): boolean => {
      if (key === node.id) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return w.nodes.find(n => n.id === key)?.parentIds.some(next => visit(next, seen)) ?? false;
    };
    if (visit(parentId, new Set())) return guestDataError(400, '知识点关系不能形成循环');
  }
}
function removeNodes(w: GuestWorkspace, removed: Set<string>) {
  w.nodes = w.nodes.filter(node => !removed.has(node.id));
  for (const node of w.nodes) node.parentIds = node.parentIds.filter(key => !removed.has(key));
  for (const task of w.tasks) task.knowledgeNodeIds = task.knowledgeNodeIds.filter(key => !removed.has(key));
  for (const note of w.notes) note.relatedNodeIds = note.relatedNodeIds.filter(key => !removed.has(key));
  refreshChildren(w);
}

/** Same data routes as the signed-in app. Unknown paths are left to the AI/public adapter. */
export async function handleGuestData(method: string, path: string, data: Input = {}, params: Input = {}): Promise<unknown> {
  const w = getGuestWorkspace();
  const verb = method.toUpperCase();
  let result: unknown;
  if (verb === 'GET' && (path === '/auth/me' || path === '/user/profile')) {
    result = { user: { ...w.user, courses: w.courses.filter(c => !c.isArchived).map(c => courseResponse(w, c)),
      _count: { tasks: w.tasks.filter(t => t.status === 'COMPLETED').length, notes: w.notes.length } } };
  } else if (verb === 'PUT' && path === '/user/profile') {
    if (Object.keys(data).some(key => !['name', 'bio', 'avatarUrl', 'weeklyStudyGoal'].includes(key))) return guestDataError(400, '资料字段无效');
    const avatarUrl = text(data, 'avatarUrl', w.user.avatarUrl, 40);
    if (!/^stellar:avatar-[0-8]$/.test(avatarUrl)) return guestDataError(400, '请从星际头像库选择头像');
    const next = { name: text(data, 'name', w.user.name, 60, has(data, 'name')).trim(), bio: text(data, 'bio', w.user.bio, 1000),
      avatarUrl, weeklyStudyGoal: number(data, 'weeklyStudyGoal', w.user.weeklyStudyGoal, 10, 10080, true) };
    Object.assign(w.user, next);
    result = { message: '已保存在本次试用', user: w.user };
  } else if (path === '/courses') {
    if (verb === 'GET') result = { courses: w.courses.filter(c => !c.isArchived).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(c => courseResponse(w, c)) };
    if (verb === 'POST') {
      const course = newCourse(data, w.user.id); w.courses.push(course); w.createdCourses++;
      result = { message: '创建成功', course };
    }
  } else if (/^\/courses\/[^/]+(?:\/mastery)?$/.test(path)) {
    const course = requiredItem(w.courses, path.split('/')[2], '课程');
    if (verb === 'GET' && !path.endsWith('/mastery')) result = { course: { ...courseResponse(w, course), knowledgeNodes: w.nodes.filter(n => n.courseId === course.id) } };
    if (verb === 'DELETE' && !path.endsWith('/mastery')) {
      removeNodes(w, new Set(w.nodes.filter(n => n.courseId === course.id).map(n => n.id)));
      w.courses = w.courses.filter(c => c.id !== course.id);
      for (const task of w.tasks) if (task.courseId === course.id) { task.courseId = null; task.updatedAt = guestTimestamp(task.updatedAt); }
      result = { message: '删除成功' };
    }
    if (verb === 'PUT' && !path.endsWith('/mastery')) {
      const next = { ...newCourse({ ...course, ...data }, w.user.id), id: course.id, createdAt: course.createdAt,
        masteryLevel: number(data, 'masteryLevel', course.masteryLevel, 0, 1), isArchived: boolean(data, 'isArchived', course.isArchived),
        plantStage: course.plantStage, lastStudiedAt: course.lastStudiedAt, totalStudyMinutes: course.totalStudyMinutes,
        studySessionCount: course.studySessionCount, updatedAt: guestTimestamp(course.updatedAt) };
      Object.assign(course, next); result = { message: '更新成功', course };
    }
    if (verb === 'POST' && path.endsWith('/mastery')) {
      const masteryLevel = number(data, 'masteryLevel', course.masteryLevel, 0, 1);
      const minutes = number(data, 'studyMinutes', 0, 0, 1440, true);
      course.masteryLevel = masteryLevel;
      if (has(data, 'studyMinutes')) { course.totalStudyMinutes += minutes; course.studySessionCount++; course.lastStudiedAt = guestTimestamp(); w.user.totalStudyMinutes += minutes; }
      course.updatedAt = guestTimestamp(course.updatedAt); result = { message: '更新成功', course };
    }
  } else if (/^\/knowledge\/[^/]+\/nodes(?:\/batch)?$/.test(path)) {
    const course = requiredItem(w.courses, path.split('/')[2], '课程');
    if (verb === 'GET') result = { nodes: w.nodes.filter(n => n.courseId === course.id) };
    if (verb === 'POST' && !path.endsWith('/batch')) {
      const node = newNode(data, course.id); validateParents(w, node); w.nodes.push(node); refreshChildren(w);
      course.updatedAt = guestTimestamp(course.updatedAt); result = { message: '创建成功', node };
    }
    if (verb === 'POST' && path.endsWith('/batch')) {
      if (!Array.isArray(data.nodes) || data.nodes.length > 100 || data.nodes.some(n => !n || typeof n !== 'object' || Array.isArray(n))) return guestDataError(400, '节点列表格式无效（一次最多100项）');
      const inputs = data.nodes as Input[];
      const nodes = inputs.map(item => newNode(item, course.id));
      if (new Set(nodes.map(n => n.name)).size !== nodes.length) return guestDataError(400, '批量节点名称不能重复');
      const byName = new Map([...w.nodes.filter(n => n.courseId === course.id), ...nodes].map(n => [n.name, n.id]));
      inputs.forEach((item, index) => {
        if (has(item, 'parentNames')) nodes[index].parentIds = strings(item, 'parentNames').map(name => byName.get(name) ?? guestDataError(400, `父知识点 ${name} 不存在`));
      });
      const staged = { ...w, nodes: [...w.nodes, ...nodes] };
      for (const node of nodes) validateParents(staged, node);
      w.nodes.push(...nodes); refreshChildren(w); course.updatedAt = guestTimestamp(course.updatedAt);
      result = { message: '批量创建成功', nodes, count: nodes.length };
    }
  } else if (/^\/knowledge\/node\/[^/]+$/.test(path)) {
    const node = requiredItem(w.nodes, path.split('/')[3], '知识点');
    if (verb === 'GET') result = { node };
    if (verb === 'DELETE') { removeNodes(w, new Set([node.id])); result = { message: '删除成功' }; }
    if (verb === 'PUT') {
      const next = { ...newNode({ ...node, ...data }, node.courseId), id: node.id, createdAt: node.createdAt, updatedAt: guestTimestamp(node.updatedAt) };
      validateParents(w, next); Object.assign(node, next); refreshChildren(w); result = { message: '更新成功', node };
    }
    if (verb === 'PUT' || verb === 'DELETE') { const course = requiredItem(w.courses, node.courseId, '课程'); course.updatedAt = guestTimestamp(course.updatedAt); }
  } else if (path === '/tasks') {
    if (verb === 'GET') result = { tasks: w.tasks.filter(t => (!params.status || params.status === t.status) && (!params.courseId || params.courseId === t.courseId)).sort((a, b) => b.priority - a.priority || b.createdAt.localeCompare(a.createdAt)) };
    if (verb === 'POST') {
      const type = oneOf(data, 'type', ['DAILY_CARE', 'DEEP_EXPLORATION', 'REVIEW_RITUAL', 'BOUNTY', 'RESCUE', 'STUDY'] as const, 'DAILY_CARE');
      const courseId = data.courseId === null || !has(data, 'courseId') ? null : text(data, 'courseId', '', 100);
      if (courseId) requiredItem(w.courses, courseId, '课程');
      const nodeIds = strings(data, 'knowledgeNodeIds');
      for (const key of nodeIds) { const node = requiredItem(w.nodes, key, '知识点'); if (courseId && node.courseId !== courseId) return guestDataError(400, '知识点不属于所选课程'); }
      const minutes = number(data, 'estimatedMinutes', 25, 1, 1440, true);
      const scheduledAt = data.scheduledAt == null ? null : text(data, 'scheduledAt', '', 100);
      if (scheduledAt && !Number.isFinite(Date.parse(scheduledAt))) return guestDataError(400, '任务日期格式无效');
      const now = guestTimestamp();
      const task: GuestTask = { id: id(), userId: w.user.id, title: text(data, 'title', '', 180, true).trim(), description: text(data, 'description', '', 4000),
        type: type as Task['type'], courseId, knowledgeNodeIds: nodeIds, status: 'PENDING', priority: number(data, 'priority', 3, 1, 5, true),
        estimatedMinutes: minutes, actualMinutes: null, rewards: { energy: 0, crystals: 0, exp: 0 },
        scheduledAt, completedAt: null, createdAt: now, updatedAt: now };
      w.tasks.push(task); result = { message: '创建成功', task };
    }
  } else if (/^\/tasks\/[^/]+(?:\/complete)?$/.test(path)) {
    const task = requiredItem(w.tasks, path.split('/')[2], '任务');
    if (verb === 'GET' && !path.endsWith('/complete')) result = { task };
    if (verb === 'DELETE' && !path.endsWith('/complete')) { w.tasks = w.tasks.filter(t => t.id !== task.id); result = { message: '删除成功' }; }
    if (verb === 'PUT' && !path.endsWith('/complete')) {
      if (task.status === 'COMPLETED') return guestDataError(409, '已完成任务不可重新开启或修改');
      const status = oneOf(data, 'status', ['PENDING', 'IN_PROGRESS', 'ABANDONED'] as const, task.status);
      const next = { title: text(data, 'title', task.title, 180, has(data, 'title')).trim(), description: text(data, 'description', task.description, 4000),
        priority: number(data, 'priority', task.priority, 1, 5, true), status, updatedAt: guestTimestamp(task.updatedAt) };
      Object.assign(task, next); result = { message: '更新成功', task };
    }
    if (verb === 'POST' && path.endsWith('/complete')) {
      const minutes = number(data, 'actualMinutes', task.estimatedMinutes, 0, 1440, true);
      if (task.status === 'COMPLETED') result = { task, rewards: { energy: 0, crystals: 0, exp: 0 }, alreadyCompleted: true, message: '任务已完成，未重复发放奖励' };
      else {
        if (task.status === 'ABANDONED') return guestDataError(409, '当前任务状态无法完成');
        task.status = 'COMPLETED'; task.actualMinutes = minutes; task.completedAt = guestTimestamp(); task.updatedAt = guestTimestamp(task.updatedAt);
        w.user.totalStudyMinutes += minutes;
        const course = w.courses.find(c => c.id === task.courseId);
        if (course) { course.totalStudyMinutes += minutes; course.studySessionCount++; course.lastStudiedAt = task.completedAt; course.updatedAt = guestTimestamp(course.updatedAt); }
        result = { task, rewards: { energy: 0, crystals: 0, exp: 0 }, alreadyCompleted: false, message: '已记录学习；证据与建设奖励由远征结算。' };
      }
    }
  } else if (path === '/notes' && verb === 'GET') result = { notes: [...w.notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) };
  else if (path === '/notes' && verb === 'POST') {
    const now = guestTimestamp();
    const note: GuestNote = { id: id(), userId: w.user.id, title: text(data, 'title', '', 180, true).trim(), content: text(data, 'content', '', 50000, true),
      sourceType: oneOf(data, 'sourceType', ['USER_CREATED', 'AI_GENERATED', 'CLASS_CAPTURE', 'BOUNTY_REWARD'] as const, 'USER_CREATED'),
      aiExplanation: text(data, 'aiExplanation'), relatedNodeIds: strings(data, 'relatedNodeIds'), tags: strings(data, 'tags', [], 20, 50),
      reviewCount: 0, lastReviewedAt: null, createdAt: now, updatedAt: now };
    for (const key of note.relatedNodeIds) requiredItem(w.nodes, key, '知识点');
    w.notes.push(note); result = { message: '创建成功', note };
  } else if (/^\/notes\/[^/]+$/.test(path)) {
    const note = requiredItem(w.notes, path.split('/')[2], '笔记');
    if (verb === 'GET') result = { note };
    if (verb === 'DELETE') { w.notes = w.notes.filter(n => n.id !== note.id); result = { message: '删除成功' }; }
    if (verb === 'PUT') {
      if (has(data, 'expectedUpdatedAt')) {
        const expected = text(data, 'expectedUpdatedAt', '', 100);
        if (!Number.isFinite(Date.parse(expected))) return guestDataError(400, '笔记版本格式无效');
        if (Date.parse(expected) !== Date.parse(note.updatedAt)) return guestDataError(409, '笔记已在另一处修改，请保留草稿并刷新后再保存');
      }
      const next = { title: text(data, 'title', note.title, 180, has(data, 'title')).trim(), content: text(data, 'content', note.content, 50000, has(data, 'content')),
        tags: strings(data, 'tags', note.tags, 20, 50), reviewCount: number(data, 'reviewCount', note.reviewCount, 0, 100000, true), updatedAt: guestTimestamp(note.updatedAt) };
      Object.assign(note, next); result = { message: '更新成功', note };
    }
  } else if (path === '/checkin/status' && verb === 'GET') {
    const streak = w.user.lastCheckInDate === studyDate() || w.user.lastCheckInDate === studyDate(-1) ? w.user.streakDays : 0;
    const day = streak % 7 + 1;
    result = { hasCheckedInToday: w.checkins.some(r => r.date === studyDate()), streakDays: streak, lastCheckInDate: w.user.lastCheckInDate,
      timezone: 'Asia/Shanghai', nextReward: { day, ...rewards[day - 1] } };
  } else if (path === '/checkin/records' && verb === 'GET') result = { records: [...w.checkins].sort((a, b) => b.date.localeCompare(a.date)) };
  else if (path === '/checkin' && verb === 'POST') {
    const today = studyDate();
    if (w.checkins.some(r => r.date === today)) result = { message: '今日已签到', alreadyCheckedIn: true, rewards: { energy: 0, crystals: 0 }, streakDays: w.user.streakDays, dayInCycle: (w.user.streakDays - 1) % 7 + 1, isSpecial: false };
    else {
      w.user.streakDays = w.user.lastCheckInDate === studyDate(-1) ? w.user.streakDays + 1 : 1;
      const dayInCycle = (w.user.streakDays - 1) % 7 + 1;
      const reward = rewards[dayInCycle - 1]; w.user.energy += reward.energy; w.user.crystals += reward.crystals; w.user.lastCheckInDate = today;
      w.checkins.push({ id: id(), date: today, rewardReceived: false, createdAt: guestTimestamp() });
      result = { message: '签到成功', alreadyCheckedIn: false, rewards: reward, streakDays: w.user.streakDays, dayInCycle, isSpecial: dayInCycle === 7 };
    }
  } else if (path === '/achievements' && verb === 'GET') result = { achievements: achievementDefinitions };
  else if (path === '/achievements/user' && verb === 'GET') {
    updateAchievements(w);
    result = { achievements: w.achievements, stats: { total: w.achievements.length, unlocked: w.achievements.filter(a => a.isUnlocked).length,
      totalRewards: w.achievements.filter(a => a.isUnlocked).reduce((sum, a) => sum + a.achievement.rewardEnergy, 0) } };
  } else if (verb === 'POST' && (path === '/user/energy' || path === '/user/crystals')) return guestDataError(410, '请通过完成任务或签到获得奖励');
  if (result !== undefined) { updateAchievements(w); return clone(result); }
  return undefined;
}
