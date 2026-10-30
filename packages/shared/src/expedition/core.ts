import chapterData from './chapter.json';
import type { AccountView, Action, Answer, Chapter, Decoration, Evidence, Exercise, Feedback, ObjectiveKey, ProgressState, QuestKind, RewardCandidate, RewardGrant, RunMode, RunState, SelfReportInput, SessionTiming, SourceRef, Tree } from './types';

export const CHAPTER = chapterData as Chapter;
export const RULES = { version: 'expedition-1', cycleExp: 10, cycleCrystals: 2, dailyCycles: 5, dailyCrystals: 30, reviewDelayMs: 86400000, leaseMs: 120000 } as const;
export const DECORATIONS: Decoration[] = [
  { id: 'antenna', name: '信号天线', price: 6, description: '陈列本章广播推演记录，不改变知识评价。' },
  { id: 'archive', name: '星光档案柜', price: 9, description: '展示自己的学习档案，所有笔记始终免费可读。' },
  { id: 'observatory', name: '小型观测台', price: 12, description: '装扮基地并回看课程航线，不加成知识证据。' },
];
export class ExpeditionError extends Error {
  constructor(public code: string, message: string, public status = 409) { super(message); }
}
export function studyDay(now: string) { return new Date(Date.parse(now) + 8 * 3600000).toISOString().slice(0, 10); }
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function assert(condition: unknown, code: string, message: string, status = 409): asserts condition { if (!condition) throw new ExpeditionError(code, message, status); }
export function createProgress(): ProgressState {
  return { schemaVersion: 1, objectives: CHAPTER.objectives.map(o => ({ objectiveKey: o.key, state: 'UNEXPLORED', evidenceIds: [], review: null })), seenExerciseIds: [], companionMemories: [] };
}
export function emptyWorld(): AccountView['world'] { return { slot: { id: 'base-1', decorationId: null }, ownedDecorationIds: [] }; }

/** Independent implementation of queue/stack traversal and ancestor-bound checking. */
export function expectedAnswer(exercise: Exercise): Answer {
  const tree = exercise.tree; validateTree(tree);
  const nodes = new Map(tree.nodes.map(n => [n.id, n]));
  if (exercise.objectiveKey === 'bt.bst.bounds') {
    const invalid: string[] = [];
    function visit(id: string | null, lo: number, hi: number) {
      if (!id) return; const n = nodes.get(id)!;
      if (!(n.value > lo && n.value < hi)) invalid.push(id);
      visit(n.left, lo, Math.min(hi, n.value)); visit(n.right, Math.max(lo, n.value), hi);
    }
    visit(tree.root, -Infinity, Infinity); return { validBst: !invalid.length, order: invalid };
  }
  const queue = [tree.root], order: string[] = [], bfs = exercise.objectiveKey === 'bt.bfs.queue';
  while (queue.length) {
    const id = bfs ? queue.shift()! : queue.pop()!; const n = nodes.get(id)!; order.push(id);
    for (const child of bfs ? [n.left, n.right] : [n.right, n.left]) if (child) queue.push(child);
  }
  return { order, structure: bfs ? 'QUEUE' : 'STACK' };
}
export function validateTree(tree: Tree) {
  assert(tree.nodes.length > 0 && tree.nodes.length <= 64, 'INVALID_CONTENT', '树节点数量无效', 400);
  const nodes = new Map(tree.nodes.map(n => [n.id, n])); const visited = new Set<string>();
  assert(nodes.size === tree.nodes.length, 'INVALID_CONTENT', '节点编号重复', 400);
  function visit(id: string) { const n = nodes.get(id); assert(n && Number.isFinite(n.value) && !visited.has(id), 'INVALID_CONTENT', '树包含缺失节点、环或共享孩子', 400); visited.add(id); if (n.left) visit(n.left); if (n.right) visit(n.right); }
  visit(tree.root); assert(visited.size === tree.nodes.length, 'INVALID_CONTENT', '树有未连接节点', 400);
}
export function evaluate(exercise: Exercise, answer: Answer): Feedback {
  assert(answer && typeof answer === 'object', 'INVALID_ANSWER', '请提交实际作答', 400);
  if (exercise.template === 'TEACH_COMPANION') {
    assert(typeof answer.explanation === 'string' && answer.explanation.trim().length >= 12 && answer.explanation.length <= 4000, 'INVALID_ANSWER', '请用至少12字、最多4000字解释自己的理解', 400);
    assert(!answer.selfCheck || Array.isArray(answer.selfCheck) && answer.selfCheck.length <= 12 && answer.selfCheck.every(x => typeof x === 'string' && x.length <= 200), 'INVALID_ANSWER', '自评条目无效', 400);
    return { kind: 'SELF_REPORTED', correct: null, firstDeviation: null, message: '已保留你的解释。请对照评分条目修正；自评不等于人工审核或独立知识验证。', rubric: exercise.rubric, independentEligible: false };
  }
  assert(Array.isArray(answer.order) && answer.order.length <= 64 && answer.order.every(x => typeof x === 'string' && x.length <= 80), 'INVALID_ANSWER', '请提交节点编号列表', 400);
  assert(new Set(answer.order).size === answer.order.length && answer.order.every(id => exercise.tree.nodes.some(n => n.id === id)), 'INVALID_ANSWER', '节点编号重复或不存在，请检查输入方式', 400);
  const expected = expectedAnswer(exercise);
  const choice = exercise.objectiveKey === 'bt.bst.bounds' ? typeof answer.validBst === 'boolean' : answer.structure === 'QUEUE' || answer.structure === 'STACK';
  assert(choice, 'INVALID_ANSWER', '请先选择数据结构或二叉搜索树判断', 400);
  const order = answer.order!; const wanted = expected.order!;
  const deviation = exercise.objectiveKey === 'bt.bst.bounds' ? (order.length === wanted.length && wanted.every(id => order.includes(id)) ? undefined : 0) : Array.from({ length: Math.max(order.length, wanted.length) }, (_, i) => i).find(i => order[i] !== wanted[i]);
  const choiceCorrect = exercise.objectiveKey === 'bt.bst.bounds' ? answer.validBst === expected.validBst : answer.structure === expected.structure;
  let stepDeviation: number | null = null;
  if (answer.steps !== undefined) {
    assert(Array.isArray(answer.steps) && answer.steps.length <= 256 && answer.steps.every(s => s && ['PUSH', 'POP'].includes(s.type) && typeof s.nodeId === 'string'), 'INVALID_ANSWER', '操作步骤无效', 400);
    if (exercise.objectiveKey !== 'bt.bst.bounds') {
      const canonical: NonNullable<Answer['steps']> = [{ type: 'PUSH', nodeId: exercise.tree.root }]; const nodes = new Map(exercise.tree.nodes.map(n => [n.id, n]));
      for (const id of wanted) { canonical.push({ type: 'POP', nodeId: id }); const n = nodes.get(id)!; for (const child of expected.structure === 'QUEUE' ? [n.left, n.right] : [n.right, n.left]) if (child) canonical.push({ type: 'PUSH', nodeId: child }); }
      const steps = answer.steps; stepDeviation = Array.from({ length: Math.max(steps.length, canonical.length) }, (_, i) => i).find(i => steps[i]?.type !== canonical[i]?.type || steps[i]?.nodeId !== canonical[i]?.nodeId) ?? null;
    }
  }
  const correct = choiceCorrect && deviation === undefined && stepDeviation === null;
  return { kind: 'RULE_CHECKED', correct, firstDeviation: !choiceCorrect ? 0 : deviation ?? null, stepDeviation, expectedOrder: wanted,
    message: correct ? '本次输入符合题目规则。请回看推演并说明下一步；程序判定不代表内容已经人工审核。' : !choiceCorrect ? '先检查容器或全局边界判断。阅读规则后可以修正，本题后续属于训练。' : stepDeviation !== null ? `第${stepDeviation + 1}次容器操作偏离规则；先检查压入孩子的顺序。` : `从第${(deviation ?? 0) + 1}个位置起与规则推演不一致；可对照顺序继续练习。`, rubric: exercise.rubric, independentEligible: false };
}
export function createRun(input: { id: string; courseId: string; questKind: QuestKind; objectiveKey?: ObjectiveKey; mode: RunMode; now: string; sources: SourceRef[] }, previous: ProgressState, chapter: Chapter = CHAPTER): { run: RunState; progress: ProgressState } {
  const progress = clone(previous); const objective = input.objectiveKey ?? chapter.objectives[0].key;
  assert(chapter.objectives.some(o => o.key === objective), 'INVALID_OBJECTIVE', '学习目标不存在', 400);
  assert(['EXPLORE', 'TEACH', 'TRIAL', 'REVIEW'].includes(input.questKind) && ['TRAINING', 'INDEPENDENT'].includes(input.mode), 'INVALID_QUEST', '任务或模式无效', 400);
  const keys = input.questKind === 'TRIAL' ? chapter.objectives.map(o => o.key) : [objective];
  const review = progress.objectives.find(o => o.objectiveKey === objective)!.review;
  if (input.questKind === 'REVIEW') assert(review && !review.completedAt && Date.parse(input.now) >= Date.parse(review.dueAt), 'REVIEW_NOT_DUE', '回访尚未到期；可以继续普通训练');
  const ids = keys.map(key => {
    const candidates = chapter.exercises.filter(e => e.objectiveKey === key && e.template === (input.questKind === 'TEACH' ? 'TEACH_COMPANION' : 'ROUTE_REPAIR'));
    const preferred = input.questKind === 'REVIEW' ? candidates.filter(e => e.role === 'REVIEW') : input.mode === 'INDEPENDENT' || input.questKind === 'TRIAL' ? candidates.filter(e => e.role === 'FRESH') : candidates.filter(e => e.role === 'PRACTICE');
    const unseen = (e: Exercise) => !progress.seenExerciseIds.includes(e.id + '@' + e.version);
    const selected = preferred.find(unseen) ?? candidates.find(unseen) ?? (input.mode === 'TRAINING' ? preferred[0] ?? candidates[0] : undefined);
    assert(selected, 'NO_FRESH_VARIANT', '当前没有未展示的新变式；可切换训练，不能复用旧题声明独立验证'); return selected.id;
  });
  const freshExerciseIds = ids.filter(id => { const e = chapter.exercises.find(x => x.id === id)!; return !progress.seenExerciseIds.includes(id + '@' + e.version); });
  for (const id of ids) { const e = chapter.exercises.find(x => x.id === id)!; const key = id + '@' + e.version; if (!progress.seenExerciseIds.includes(key)) progress.seenExerciseIds.push(key); }
  return { progress, run: { schemaVersion: 1, id: input.id, courseId: input.courseId, chapterId: chapter.id, contentVersion: chapter.version, questKind: input.questKind, mode: input.mode, objectiveKey: objective,
    exerciseIds: ids, exerciseIndex: 0, status: 'ACTIVE', revision: 0, hintsUsed: 0, attempts: [], feedback: null, sources: clone(input.sources), nextStep: null,
    reviewCycleId: input.questKind === 'REVIEW' ? review!.id : null, startedAt: input.now, settledAt: null, freshExerciseIds, pausedAt: null, pausedMs: 0, endedAt: null } };
}
export function reduceCommand(previous: RunState, previousProgress: ProgressState, action: Action, context: { now: string; operationId: string; chapter?: Chapter }): { run: RunState; progress: ProgressState; evidenceDelta: Evidence[]; rewardCandidates: RewardCandidate[] } {
  const run = clone(previous), progress = clone(previousProgress), chapter = context.chapter ?? CHAPTER, evidenceDelta: Evidence[] = [], rewardCandidates: RewardCandidate[] = [];
  assert(run.contentVersion === chapter.version, 'CONTENT_STALE', '关卡内容版本已变化，请保留草稿并重新开始');
  assert(!['SETTLED', 'CANCELLED', 'CONTENT_STALE'].includes(run.status), 'RUN_CLOSED', '本次远征已结束或内容已变化');
  const exercise = chapter.exercises.find(e => e.id === run.exerciseIds[run.exerciseIndex]);
  assert(exercise, 'INVALID_CONTENT', '关卡题目不存在');
  const objective = progress.objectives.find(o => o.objectiveKey === exercise.objectiveKey)!;
  const finishPause = () => { if (run.pausedAt) run.pausedMs = (run.pausedMs ?? 0) + Math.max(0, Date.parse(context.now) - Date.parse(run.pausedAt)); run.pausedAt = null; };
  if (action.type === 'CANCEL') { finishPause(); run.status = 'CANCELLED'; run.endedAt = context.now; }
  else if (action.type === 'PAUSE') { assert(run.status !== 'PAUSED', 'INVALID_STATE', '已经暂停'); run.status = 'PAUSED'; run.pausedAt = context.now; }
  else if (action.type === 'RESUME') { assert(run.status === 'PAUSED', 'INVALID_STATE', '当前未暂停'); finishPause(); run.status = run.feedback ? 'AWAITING_FEEDBACK' : 'ACTIVE'; }
  else {
    assert(run.status !== 'PAUSED', 'RUN_PAUSED', '请先恢复远征');
    if (action.type === 'HINT') { assert(!run.nextStep, 'STEP_SETTLED', '本题反馈已确认'); run.hintsUsed++; if (run.feedback) run.feedback.independentEligible = false; }
    else if (action.type === 'SUBMIT') {
      assert(!run.nextStep, 'STEP_SETTLED', '本题反馈已确认');
      const feedback = evaluate(exercise, action.answer); const firstSubmission = !run.attempts.some(a => a.exerciseId === exercise.id);
      const reviewed = exercise.review.humanStatus === 'APPROVED' && !!exercise.review.reviewer && !!exercise.review.reviewedAt;
      feedback.independentEligible = feedback.correct === true && reviewed && firstSubmission && !run.hintsUsed && run.mode === 'INDEPENDENT' && run.freshExerciseIds.includes(exercise.id);
      run.attempts.push({ id: context.operationId, exerciseId: exercise.id, exerciseVersion: exercise.version, answer: clone(action.answer), at: context.now, hintsUsed: run.hintsUsed, firstSubmission, feedback });
      if (objective.state === 'UNEXPLORED') objective.state = 'ATTEMPTED';
      run.feedback = feedback; run.status = 'AWAITING_FEEDBACK';
    } else if (action.type === 'ACK_FEEDBACK') {
      assert(run.status === 'AWAITING_FEEDBACK' && run.feedback && !run.nextStep, 'NO_FEEDBACK', '请先作答并阅读反馈');
      assert(typeof action.nextStep === 'string' && action.nextStep.trim().length >= 2 && action.nextStep.length <= 600, 'INVALID_NEXT_STEP', '请记录下一步学习安排', 400);
      run.nextStep = action.nextStep.trim();
      if (run.questKind === 'REVIEW') assert(objective.review && objective.review.id === run.reviewCycleId && Date.parse(context.now) >= Date.parse(objective.review.dueAt), 'REVIEW_CYCLE_CHANGED', '回访周期已在另一轮完成或尚未到期，请刷新');
      const strict = run.feedback.independentEligible;
      const delayed = strict && run.questKind === 'REVIEW' && objective.review?.kind === 'VALIDATION' && ['INDEPENDENT','DELAYED'].includes(objective.state);
      const kind = strict ? delayed ? 'DELAYED' : 'INDEPENDENT' : 'ATTEMPTED';
      if (kind === 'DELAYED') assert(objective.review && objective.review.id === run.reviewCycleId && Date.parse(context.now) >= Date.parse(objective.review.dueAt), 'REVIEW_NOT_DUE', '回访周期或时间已变化');
      const evidence: Evidence = { id: 'evidence:' + context.operationId, objectiveKey: objective.objectiveKey, kind, runId: run.id, exerciseId: exercise.id, exerciseVersion: exercise.version, at: context.now, sources: clone(run.sources), judgment: run.feedback.kind === 'SELF_REPORTED' ? 'SELF_REPORTED' : 'RULE_CHECKED', strict };
      evidenceDelta.push(evidence); objective.evidenceIds.push(evidence.id);
      const rank = { UNEXPLORED: 0, ATTEMPTED: 1, INDEPENDENT: 2, DELAYED: 3 };
      if (rank[kind] > rank[objective.state]) objective.state = kind;
      const cycleId = run.reviewCycleId ?? 'initial';
      rewardCandidates.push({ stableKey: `cycle:${objective.objectiveKey}:${cycleId}`, kind: 'CYCLE', exp: 10, crystals: 2, reason: '实际作答、阅读反馈并记录下一步', sourceId: evidence.id });
      if (strict) rewardCandidates.push({ stableKey: kind === 'DELAYED' ? `review:${objective.objectiveKey}:${cycleId}` : `independent:${objective.objectiveKey}`, kind: kind === 'DELAYED' ? 'REVIEW' : 'INDEPENDENT', exp: kind === 'DELAYED' ? 15 : 20, crystals: kind === 'DELAYED' ? 3 : 4, reason: kind === 'DELAYED' ? '到期且通过人工审核新变式的延迟验证' : '通过人工审核新变式的首次独立验证', sourceId: evidence.id });
      if (!objective.review || run.questKind === 'REVIEW' || strict && objective.review.kind !== 'VALIDATION') {
        const parts = objective.review?.id.split(':'); const ordinal = parts ? Number(parts[parts.length - 1]) + 1 : 1;
        objective.review = { id: `${objective.objectiveKey}:review:${ordinal}`, objectiveKey: objective.objectiveKey, dueAt: new Date(Date.parse(context.now) + RULES.reviewDelayMs).toISOString(), anchorAt: context.now, kind: ['INDEPENDENT','DELAYED'].includes(objective.state) ? 'VALIDATION' : 'PRACTICE_FOLLOWUP', completedAt: null };
      }
      if (action.saveCompanion && exercise.template === 'TEACH_COMPANION') {
        const attempt = run.attempts[run.attempts.length - 1];
        progress.companionMemories.push({ id: 'memory:' + context.operationId, objectiveKey: objective.objectiveKey, text: attempt.answer.explanation!.trim(), sources: clone(run.sources), confirmedAt: context.now, verification: 'SELF_REPORTED', deletedAt: null });
      }
      if (run.exerciseIndex === run.exerciseIds.length - 1) { run.status = 'SETTLED'; run.settledAt = context.now; run.endedAt = context.now; }
    } else if (action.type === 'NEXT') {
      assert(run.nextStep && run.exerciseIndex < run.exerciseIds.length - 1, 'NO_NEXT_STEP', '请先完成当前作答与反馈');
      run.exerciseIndex++; run.hintsUsed = 0; run.feedback = null; run.nextStep = null; run.status = 'ACTIVE';
    } else throw new ExpeditionError('INVALID_ACTION', '不支持的学习操作', 400);
  }
  run.revision++; return { run, progress, evidenceDelta, rewardCandidates };
}
export function settleRewards(previous: AccountView, candidates: RewardCandidate[], existingKeys: string[], now: string): { account: AccountView; grants: RewardGrant[] } {
  const account = clone(previous), grants: RewardGrant[] = [], keys = new Set(existingKeys), day = studyDay(now);
  if (account.quota.day !== day) account.quota = { day, cycleCount: 0, crystalsGranted: 0, selfReportCount: 0 };
  for (const candidate of candidates) {
    if (keys.has(candidate.stableKey)) continue; keys.add(candidate.stableKey);
    const allowed = candidate.kind === 'SELF_REPORT' ? (account.quota.selfReportCount ?? 0) < 5 : candidate.kind !== 'CYCLE' || account.quota.cycleCount < RULES.dailyCycles;
    const exp = allowed ? candidate.exp : 0; const crystals = allowed ? Math.min(candidate.crystals, Math.max(0, RULES.dailyCrystals - account.quota.crystalsGranted)) : 0;
    if (candidate.kind === 'CYCLE' && allowed) account.quota.cycleCount++;
    if (candidate.kind === 'SELF_REPORT' && allowed) account.quota.selfReportCount = (account.quota.selfReportCount ?? 0) + 1;
    account.quota.crystalsGranted += crystals; account.exp += exp; account.crystals += crystals;
    while (account.exp >= account.level * 100) { account.exp -= account.level * 100; account.level++; }
    grants.push({ ...candidate, id: 'grant:' + candidate.stableKey, exp, crystals, ruleVersion: RULES.version, createdAt: now });
  }
  account.revision++; return { account, grants };
}
export function applyDecoration(previous: AccountView, action: 'BUY' | 'EQUIP', decorationId: string): { account: AccountView; cost: number } {
  const account = clone(previous); const decoration = DECORATIONS.find(d => d.id === decorationId);
  assert(decoration, 'INVALID_DECORATION', '装饰不存在', 400); let cost = 0;
  if (action === 'BUY' && !account.world.ownedDecorationIds.includes(decorationId)) { assert(account.crystals >= decoration.price, 'INSUFFICIENT_CRYSTALS', '结晶不足，仍可继续所有学习功能'); cost = decoration.price; account.crystals -= cost; account.world.ownedDecorationIds.push(decorationId); }
  assert(account.world.ownedDecorationIds.includes(decorationId), 'NOT_OWNED', '尚未拥有此装饰'); account.world.slot.decorationId = decorationId; account.revision++;
  return { account, cost };
}
/** Adapters SHA-256 this exact UTF-8 string; no platform-dependent object ordering. */
export function selfReportCanonical(input: SelfReportInput, now: string): string {
  assert(typeof input.title === 'string' && input.title.trim().length >= 2 && input.title.length <= 180, 'VALIDATION', '自述标题需为2至180字', 400);
  assert(input.notes === undefined || typeof input.notes === 'string' && input.notes.length <= 2000, 'VALIDATION', '自述说明最多2000字', 400);
  assert(Number.isInteger(input.durationMinutes) && input.durationMinutes >= 1 && input.durationMinutes <= 1440, 'VALIDATION', '自述学习时长须为1至1440分钟', 400);
  return JSON.stringify([studyDay(now), input.courseId ?? '', input.title.trim(), (input.notes ?? '').trim(), String(input.durationMinutes)]);
}
export function applySelfReport(account: AccountView, stableKey: string, recordId: string, existingKeys: string[], now: string) {
  return settleRewards(account, [{ stableKey, kind: 'SELF_REPORT', exp: 2, crystals: 0, reason: '线下学习自述；不代表独立知识验证', sourceId: recordId }], existingKeys, now);
}
/** Wall-clock session accounting only. Never evidence of attendance or study duration. */
export function sessionTiming(run: RunState, now: string): SessionTiming {
  const end = run.endedAt ?? run.settledAt ?? now;
  const elapsedMs = Math.max(0, Date.parse(end) - Date.parse(run.startedAt));
  const pausedMs = Math.min(elapsedMs, (run.pausedMs ?? 0) + (run.pausedAt ? Math.max(0, Date.parse(end) - Date.parse(run.pausedAt)) : 0));
  return { asOf: now, elapsedMs, pausedMs, runningMs: elapsedMs - pausedMs, label: 'SESSION_TIME_NOT_STUDY' };
}
