import { PrismaClient, Prisma } from '@prisma/client';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { CHAPTER, RULES, createProgress, createRun, emptyWorld, reduceCommand, settleRewards, applyDecoration, applySelfReport, selfReportCanonical, sessionTiming, ExpeditionError } from '@keling/shared/expedition';
import type { AccountView, Command, Evidence, LeaseInput, ProgressState, ProgressView, Receipt, RunState, RunView, SelfReportInput, SourceRef, StartRunInput } from '@keling/shared/expedition';

type Tx = Prisma.TransactionClient;
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const parse = <T>(value: string): T => JSON.parse(value);
function canonical(value: any): string { if (value === null || typeof value !== 'object') return JSON.stringify(value); if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'; return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}'; }
function sanitized(input: any) { const value = JSON.parse(JSON.stringify(input)); if (value.writer) delete value.writer.token; return value; }
function fail(code: string, message: string, status = 409): never { throw new ExpeditionError(code, message, status); }
function idInput(value: unknown, name = '标识') { if (typeof value !== 'string' || !value.trim() || value.length > 180) fail('VALIDATION', name + '无效', 400); return value as string; }
function versionInput(value: unknown) { if (!Number.isInteger(value) || Number(value) < 0) fail('VALIDATION', '版本无效', 400); return Number(value); }
export async function transaction<T>(db: PrismaClient, operation: (tx: Tx) => Promise<T>): Promise<T> {
  for (let retry = 0; ; retry++) {
    try { return await db.$transaction(operation, { timeout: 15000, maxWait: 10000 }); }
    catch (error) { if (retry >= 3 || !['P2034', 'P2002', 'P1008'].includes((error as any)?.code)) throw error; await new Promise(resolve => setTimeout(resolve, 15 * (retry + 1))); }
  }
}
async function ownCourse(tx: Tx, userId: string, courseId: string) { const course = await tx.course.findFirst({ where: { id: courseId, userId } }); if (!course) fail('NOT_FOUND', '课程不存在', 404); if (course.isArchived) fail('COURSE_ARCHIVED', '课程已归档，请先恢复课程'); return course; }
function accountView(row: any, user: any): AccountView { return { revision: row.revision, level: user.level, exp: user.exp, crystals: user.crystals, legacy: parse(row.legacySnapshot), world: parse(row.world), quota: { day: row.quotaDay, cycleCount: row.cycleCount, crystalsGranted: row.crystalsGranted, selfReportCount: row.selfReportCount } }; }
async function lockAccount(tx: Tx, userId: string, now: Date) {
  // Shared lock order with materials, planning and legacy CRUD: user, then account.
  const locked = await tx.$executeRaw`UPDATE "users" SET "id" = "id" WHERE "id" = ${userId}`;
  if (!locked) fail('NOT_FOUND', '账户不存在', 404);
  let row = await tx.expeditionAccount.upsert({ where: { userId }, create: { userId, legacySnapshot: '', world: JSON.stringify(emptyWorld()) }, update: { updatedAt: now } });
  const user = await tx.user.findUnique({ where: { id: userId } }); if (!user) fail('NOT_FOUND', '账户不存在', 404);
  if (!row.legacySnapshot) row = await tx.expeditionAccount.update({ where: { userId }, data: { legacySnapshot: JSON.stringify({ level: user.level, exp: user.exp, crystals: user.crystals, energy: user.energy, capturedAt: now.toISOString() }) } });
  return accountView(row, user);
}
async function saveAccount(tx: Tx, userId: string, account: AccountView) {
  await tx.user.update({ where: { id: userId }, data: { level: account.level, exp: account.exp, crystals: account.crystals } });
  await tx.expeditionAccount.update({ where: { userId }, data: { revision: account.revision, world: JSON.stringify(account.world), quotaDay: account.quota.day, cycleCount: account.quota.cycleCount, crystalsGranted: account.quota.crystalsGranted, selfReportCount: account.quota.selfReportCount ?? 0 } });
}
function progressView(row: any): ProgressView { return { id: row.id, courseId: row.courseId, chapterId: row.chapterId, revision: row.revision, contentVersion: row.contentVersion, state: parse(row.state) }; }
function runView(row: any, now = new Date()): RunView { const state = parse<RunState>(row.state); if (['SETTLED','CANCELLED','CONTENT_STALE'].includes(row.status) && !state.endedAt) state.endedAt = state.settledAt ?? row.updatedAt.toISOString(); return { ...state, revision: row.revision, status: row.status, writerDeviceId: row.writerDeviceId || null, leaseEpoch: row.leaseEpoch, leaseExpiresAt: row.leaseExpiresAt?.toISOString() ?? null, timing: sessionTiming(state, now.toISOString()) }; }
async function ownedRun(tx: Tx, userId: string, runId: string) { const row = await tx.questRun.findFirst({ where: { id: runId, userId } }); if (!row) fail('NOT_FOUND', '远征不存在', 404); return row; }
async function previousOperation(tx: Tx, userId: string, opId: string, scope: string, scopeId: string, input: any) {
  idInput(opId, '操作ID'); const hash = digest(canonical(sanitized(input))); const previous = await tx.expeditionOperation.findUnique({ where: { userId_opId: { userId, opId } } });
  if (previous && (previous.requestHash !== hash || previous.scope !== scope || previous.scopeId !== scopeId)) fail('IDEMPOTENCY_CONFLICT', '此操作ID已用于不同请求，请保留原请求再核对');
  return { hash, previous: previous ? parse<any>(previous.receipt) : null };
}
async function record(tx: Tx, userId: string, opId: string, scope: string, scopeId: string, input: any, hash: string, receipt: unknown) { await tx.expeditionOperation.create({ data: { userId, opId, scope, scopeId, requestHash: hash, payload: JSON.stringify(sanitized(input)), receipt: JSON.stringify(receipt) } }); }
async function ensureProgress(tx: Tx, userId: string, courseId: string) {
  await ownCourse(tx, userId, courseId);
  return tx.expeditionProgress.upsert({ where: { userId_courseId_chapterId: { userId, courseId, chapterId: CHAPTER.id } }, create: { userId, courseId, chapterId: CHAPTER.id, contentVersion: CHAPTER.version, state: JSON.stringify(createProgress()) }, update: {} });
}
async function seedSources(tx: Tx, userId: string, courseId: string): Promise<SourceRef[]> {
  const materialId = `seed:binary-tree:${courseId}`, content = CHAPTER.materialParagraphs.join('\n\n');
  const version = await tx.materialVersion.upsert({ where: { userId_materialId_version: { userId, materialId, version: 1 } }, create: { userId, courseId, materialId, version: 1, title: CHAPTER.materialTitle, format: 'SEED', content, contentHash: digest(content), parserVersion: 'seed-1', sourceName: '课灵原创材料；算法参考来源见章节说明' }, update: {} });
  if (version.deletedAt) fail('CONTENT_STALE', '首章材料已移除，请恢复或重新确认材料');
  let start = 0; const result: SourceRef[] = [];
  for (let i = 0; i < CHAPTER.materialParagraphs.length; i++) {
    const text = CHAPTER.materialParagraphs[i]; const end = start + text.length;
    const span = await tx.sourceSpan.upsert({ where: { materialVersionId_ordinal: { materialVersionId: version.id, ordinal: i } }, create: { materialVersionId: version.id, ordinal: i, startUtf16: start, endUtf16: end, paragraphIndex: i, textHash: digest(text), heading: CHAPTER.objectives[i]?.title ?? '证据边界' }, update: {} });
    result.push({ materialVersionId: version.id, spanId: span.id, contentHash: version.contentHash, startUtf16: span.startUtf16, endUtf16: span.endUtf16, page: span.page, paragraphIndex: span.paragraphIndex }); start = end + 2;
  }
  return result;
}
async function verifySources(tx: Tx, userId: string, run: RunState) {
  for (const source of run.sources) {
    const version = await tx.materialVersion.findFirst({ where: { id: source.materialVersionId, userId, courseId: run.courseId, deletedAt: null, parseStatus: 'READY' } });
    if (!version || version.contentHash !== source.contentHash) fail('CONTENT_STALE', '引用材料已变化，请保留草稿并重新确认');
    const newer = await tx.materialVersion.findFirst({ where: { userId, materialId: version.materialId, version: { gt: version.version }, deletedAt: null, parseStatus: 'READY' } });
    if (newer) fail('CONTENT_STALE', '已有新版材料，本次旧版作答暂不结算');
    const span = await tx.sourceSpan.findFirst({ where: { id: source.spanId, materialVersionId: version.id } });
    if (!span || span.startUtf16 !== source.startUtf16 || span.endUtf16 !== source.endUtf16 || digest(version.content.slice(span.startUtf16, span.endUtf16)) !== span.textHash) fail('CONTENT_STALE', '引用位置无法核验');
  }
}
function verifyWriter(row: any, writer: any, now: Date) {
  if (!writer || row.writerDeviceId !== writer.deviceId || row.leaseEpoch !== writer.epoch || !row.leaseExpiresAt || row.leaseExpiresAt.getTime() <= now.getTime()) fail('WRITER_CHANGED', '写入设备或租约已变化，请保留草稿并查看当前进度');
  const actual = Buffer.from(digest(String(writer.token ?? ''))), expected = Buffer.from(row.leaseTokenHash);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) fail('WRITER_CHANGED', '写入资格已失效，请重新接续');
}
async function issueWriter(tx: Tx, row: any, deviceId: string, now: Date, epoch: number, revision: number) {
  const token = randomBytes(32).toString('base64url');
  const updated = await tx.questRun.update({ where: { id: row.id }, data: { writerDeviceId: deviceId, leaseEpoch: epoch, leaseTokenHash: digest(token), leaseExpiresAt: new Date(now.getTime() + RULES.leaseMs), revision } });
  return { run: runView(updated, now), writer: { deviceId, epoch, token } };
}

export async function getChapter(db: PrismaClient, userId: string, courseId: string, now = new Date()) {
  return transaction(db, async tx => { const account = await lockAccount(tx, userId, now); const progress = await ensureProgress(tx, userId, courseId); await seedSources(tx, userId, courseId);
    const runs = await tx.questRun.findMany({ where: { userId, courseId }, orderBy: { updatedAt: 'desc' }, take: 30 }); return { chapter: CHAPTER, progress: progressView(progress), account, runs: runs.map(row => runView(row, now)), serverTime: now.toISOString() }; });
}
export async function startRun(db: PrismaClient, userId: string, input: StartRunInput, now = new Date()) {
  idInput(input.courseId); idInput(input.deviceId); return transaction(db, async tx => {
    const account = await lockAccount(tx, userId, now); const op = await previousOperation(tx, userId, input.opId, 'START', input.courseId, input);
    if (op.previous) { const row = await ownedRun(tx, userId, op.previous.run.id); if (row.writerDeviceId !== input.deviceId || !row.leaseExpiresAt || row.leaseExpiresAt <= now) fail('WRITER_CHANGED', '远征已存在，请查看当前进度并主动接续'); const issued = await issueWriter(tx, row, input.deviceId, now, row.leaseEpoch, row.revision); return { ...op.previous, ...issued }; }
    const progressRow = await ensureProgress(tx, userId, input.courseId), sources = await seedSources(tx, userId, input.courseId);
    const previous = parse<ProgressState>(progressRow.state);
    // The same seed copied to another course cannot become an unseen independent variant.
    const allProgress = await tx.expeditionProgress.findMany({ where: { userId, chapterId: CHAPTER.id } });
    previous.seenExerciseIds = [...new Set(allProgress.flatMap(p => parse<ProgressState>(p.state).seenExerciseIds))];
    const next = createRun({ ...input, id: randomUUID(), now: now.toISOString(), sources }, previous);
    const row = await tx.questRun.create({ data: { id: next.run.id, userId, courseId: input.courseId, progressId: progressRow.id, status: next.run.status, state: JSON.stringify(next.run) } });
    const progress = await tx.expeditionProgress.update({ where: { id: progressRow.id }, data: { state: JSON.stringify(next.progress), revision: { increment: 1 } } });
    const issued = await issueWriter(tx, row, input.deviceId, now, 1, 0); const receipt = { run: issued.run, progress: progressView(progress), account };
    await record(tx, userId, input.opId, 'START', input.courseId, input, op.hash, receipt); return { ...receipt, writer: issued.writer };
  });
}
export async function getRun(db: PrismaClient, userId: string, runId: string, now = new Date()) { return transaction(db, async tx => { const account = await lockAccount(tx, userId, now); const row = await ownedRun(tx, userId, runId); const progress = await tx.expeditionProgress.findUniqueOrThrow({ where: { id: row.progressId } }); return { run: runView(row, now), progress: progressView(progress), account, serverTime: now.toISOString() }; }); }
export async function commandRun(db: PrismaClient, userId: string, runId: string, input: Command, now = new Date()): Promise<Receipt> {
  versionInput(input.expectedRevision); return transaction(db, async tx => {
    const account = await lockAccount(tx, userId, now); const op = await previousOperation(tx, userId, input.opId, 'RUN', runId, input);
    if (op.previous) return { ...op.previous, replayed: true };
    const row = await ownedRun(tx, userId, runId); await ownCourse(tx, userId, row.courseId);
    if (row.revision !== input.expectedRevision) fail('VERSION_CONFLICT', '另一端已修改远征，请保留草稿并刷新'); verifyWriter(row, input.writer, now);
    const run = { ...parse<RunState>(row.state), status: row.status as RunState['status'], revision: row.revision }; await verifySources(tx, userId, run);
    const progressRow = await tx.expeditionProgress.findUniqueOrThrow({ where: { id: row.progressId } });
    const reduced = reduceCommand(run, parse(progressRow.state), input.action, { now: now.toISOString(), operationId: input.opId });
    const existing = await tx.rewardGrant.findMany({ where: { userId, stableKey: { in: reduced.rewardCandidates.map(c => c.stableKey) } }, select: { stableKey: true } });
    const settled = settleRewards(account, reduced.rewardCandidates, existing.map(g => g.stableKey), now.toISOString());
    const grants = settled.grants.map(g => ({ ...g, id: randomUUID() }));
    for (const grant of grants) await tx.rewardGrant.create({ data: { ...grant, userId, createdAt: new Date(grant.createdAt) } });
    await saveAccount(tx, userId, settled.account);
    const claimed = await tx.questRun.updateMany({ where: { id: row.id, userId, revision: input.expectedRevision, leaseEpoch: input.writer.epoch }, data: { state: JSON.stringify(reduced.run), revision: reduced.run.revision, status: reduced.run.status } });
    if (claimed.count !== 1) fail('VERSION_CONFLICT', '进度已变化，本次未结算');
    const updatedRow = await tx.questRun.findUniqueOrThrow({ where: { id: row.id } });
    const progress = await tx.expeditionProgress.update({ where: { id: progressRow.id }, data: { state: JSON.stringify(reduced.progress), revision: { increment: 1 } } });
    const receipt: Receipt = { opId: input.opId, revision: reduced.run.revision, serverTime: now.toISOString(), run: runView(updatedRow, now), progress: progressView(progress), account: settled.account, feedback: reduced.run.feedback, evidenceDelta: reduced.evidenceDelta, rewardGrants: grants, replayed: false };
    await record(tx, userId, input.opId, 'RUN', runId, input, op.hash, receipt); return receipt;
  });
}
export async function leaseRun(db: PrismaClient, userId: string, runId: string, input: LeaseInput, now = new Date()) {
  versionInput(input.expectedRevision); idInput(input.deviceId); if (!['acquire', 'renew', 'release', 'takeover'].includes(input.intent)) fail('VALIDATION', '接续操作无效', 400);
  return transaction(db, async tx => {
    await lockAccount(tx, userId, now); const op = await previousOperation(tx, userId, input.opId, 'LEASE', runId, input); const row = await ownedRun(tx, userId, runId);
    if (op.previous) {
      if (input.intent === 'release') return op.previous;
      if (row.writerDeviceId !== input.deviceId || row.leaseEpoch !== op.previous.run.leaseEpoch || !row.leaseExpiresAt || row.leaseExpiresAt <= now) fail('WRITER_CHANGED', '旧接续操作已被后续操作替代');
      return { ...await issueWriter(tx, row, input.deviceId, now, row.leaseEpoch, row.revision), serverTime: now.toISOString() };
    }
    if (row.revision !== input.expectedRevision) fail('VERSION_CONFLICT', '远征版本已变化');
    if (['SETTLED', 'CANCELLED', 'CONTENT_STALE'].includes(row.status)) fail('RUN_CLOSED', '本次远征已结束或内容失效');
    const active = row.leaseExpiresAt && row.leaseExpiresAt > now;
    if (input.intent === 'release') {
      verifyWriter(row, input.writer, now); const updated = await tx.questRun.update({ where: { id: row.id }, data: { writerDeviceId: '', leaseTokenHash: '', leaseExpiresAt: null, leaseEpoch: { increment: 1 }, revision: { increment: 1 } } });
      const receipt = { run: runView(updated, now), serverTime: now.toISOString() }; await record(tx, userId, input.opId, 'LEASE', runId, input, op.hash, receipt); return receipt;
    }
    if (input.intent === 'renew') verifyWriter(row, input.writer, now);
    if (input.intent !== 'takeover' && active && row.writerDeviceId !== input.deviceId) fail('LEASE_HELD', '另一设备正在写入，请明确选择接管');
    const sameActive = active && row.writerDeviceId === input.deviceId && input.intent !== 'takeover';
    const issued = await issueWriter(tx, row, input.deviceId, now, sameActive ? row.leaseEpoch : row.leaseEpoch + 1, sameActive ? row.revision : row.revision + 1);
    await record(tx, userId, input.opId, 'LEASE', runId, input, op.hash, { run: issued.run, serverTime: now.toISOString() }); return { ...issued, serverTime: now.toISOString() };
  });
}
export async function rewards(db: PrismaClient, userId: string, now = new Date()) { return transaction(db, async tx => ({ account: await lockAccount(tx, userId, now), grants: await tx.rewardGrant.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 300 }) })); }
export async function baseCommand(db: PrismaClient, userId: string, input: { opId: string; expectedRevision: number; decorationId: string; action: 'BUY' | 'EQUIP' }, now = new Date()) {
  versionInput(input.expectedRevision); if (!['BUY', 'EQUIP'].includes(input.action)) fail('VALIDATION', '基地操作无效', 400);
  return transaction(db, async tx => { const account = await lockAccount(tx, userId, now), op = await previousOperation(tx, userId, input.opId, 'BASE', userId, input); if (op.previous) return { ...op.previous, replayed: true };
    if (account.revision !== input.expectedRevision) fail('VERSION_CONFLICT', '基地余额或装饰已变化，请刷新');
    const result = applyDecoration(account, input.action, input.decorationId); let grant = null;
    if (result.cost) grant = await tx.rewardGrant.create({ data: { userId, stableKey: 'purchase:' + input.decorationId, kind: 'PURCHASE', exp: 0, crystals: -result.cost, ruleVersion: RULES.version, reason: '确定性基地装饰购买', sourceId: input.decorationId } });
    await saveAccount(tx, userId, result.account); const receipt = { account: result.account, grant, replayed: false }; await record(tx, userId, input.opId, 'BASE', userId, input, op.hash, receipt); return receipt; });
}
export async function courseEvidence(db: PrismaClient, userId: string, courseId: string) {
  const course = await db.course.findFirst({ where: { id: courseId, userId } }); if (!course) fail('NOT_FOUND', '课程不存在', 404);
  const runs = await db.questRun.findMany({ where: { userId, courseId }, select: { id: true } });
  const operations = await db.expeditionOperation.findMany({ where: { userId, scope: 'RUN', scopeId: { in: runs.map(r => r.id) } }, orderBy: { createdAt: 'asc' } });
  return { evidence: operations.flatMap(op => parse<Receipt>(op.receipt).evidenceDelta ?? []) as Evidence[] };
}
export async function memoryCommand(db: PrismaClient, userId: string, progressId: string, input: { opId: string; expectedRevision: number; memoryId: string; action: 'UPDATE' | 'DELETE'; text?: string }, now = new Date()) {
  versionInput(input.expectedRevision); return transaction(db, async tx => { await lockAccount(tx, userId, now); const op = await previousOperation(tx, userId, input.opId, 'MEMORY', progressId, input); if (op.previous) return { ...op.previous, replayed: true };
    const row = await tx.expeditionProgress.findFirst({ where: { id: progressId, userId } }); if (!row) fail('NOT_FOUND', '学习档案不存在', 404); if (row.revision !== input.expectedRevision) fail('VERSION_CONFLICT', '学习档案已变化');
    const state = parse<ProgressState>(row.state); const memory = state.companionMemories.find(m => m.id === input.memoryId && !m.deletedAt); if (!memory) fail('NOT_FOUND', '伙伴档案不存在', 404);
    if (input.action === 'DELETE') { memory.deletedAt = now.toISOString(); memory.text = ''; memory.sources = []; } else if (input.action === 'UPDATE' && typeof input.text === 'string' && input.text.trim().length >= 2 && input.text.length <= 4000) { memory.text = input.text.trim(); memory.confirmedAt = now.toISOString(); } else fail('VALIDATION', '修改内容无效', 400);
    const updated = await tx.expeditionProgress.update({ where: { id: row.id }, data: { revision: { increment: 1 }, state: JSON.stringify(state) } }); const receipt = { progress: progressView(updated), replayed: false }; await record(tx, userId, input.opId, 'MEMORY', progressId, input, op.hash, receipt); return receipt; });
}
/** Call inside the material update transaction where possible. No external effects. */
export async function invalidateMaterialRuns(db: PrismaClient | Tx, userId: string, materialVersionId: string): Promise<number> {
  const rows = await db.questRun.findMany({ where: { userId, status: { in: ['ACTIVE', 'PAUSED', 'AWAITING_FEEDBACK'] } } }); let count = 0;
  for (const row of rows) if (parse<RunState>(row.state).sources.some(s => s.materialVersionId === materialVersionId)) { const changed = await db.questRun.updateMany({ where: { id: row.id, userId, revision: row.revision }, data: { status: 'CONTENT_STALE', revision: { increment: 1 }, leaseEpoch: { increment: 1 }, leaseTokenHash: '', leaseExpiresAt: null } }); count += changed.count; }
  return count;
}
export async function readExpeditionContext(db: PrismaClient, userId: string, input: { courseId: string; runId?: string }) {
  await ownCourse(db as unknown as Tx, userId, input.courseId);
  const progress = await db.expeditionProgress.findFirst({ where: { userId, courseId: input.courseId, chapterId: CHAPTER.id } });
  const rows = await db.questRun.findMany({ where: { userId, courseId: input.courseId, ...(input.runId ? { id: input.runId } : {}) }, orderBy: { updatedAt: 'desc' }, take: 20 });
  if (input.runId && !rows.length) fail('NOT_FOUND', '远征不存在', 404);
  const materialVersions = await db.materialVersion.findMany({ where: { userId, courseId: input.courseId, deletedAt: null, parseStatus: 'READY' }, orderBy: { version: 'desc' } });
  const latest = materialVersions.filter((m, index, all) => all.findIndex(x => x.materialId === m.materialId) === index);
  const sourceSpans = await db.sourceSpan.findMany({ where: { materialVersionId: { in: latest.map(m => m.id) } }, orderBy: { ordinal: 'asc' } });
  return { chapter: CHAPTER, progress: progress ? progressView(progress) : null, runs: rows.map(row => runView(row)), materialVersions: latest, sourceSpans };
}
export async function selfReport(db: PrismaClient, userId: string, input: SelfReportInput, now = new Date()) {
  const stableKey = 'self-report:' + digest(selfReportCanonical(input, now.toISOString()));
  return transaction(db, async tx => {
    const account = await lockAccount(tx, userId, now), op = await previousOperation(tx, userId, input.opId, 'SELF_REPORT', userId, input);
    if (op.previous) return { ...op.previous, replayed: true };
    if (input.courseId) await ownCourse(tx, userId, input.courseId);
    const previous = await tx.rewardGrant.findUnique({ where: { userId_stableKey: { userId, stableKey } } });
    if (previous) {
      const recordRow = await tx.studyRecord.findFirst({ where: { id: previous.sourceId, userId } });
      const receipt = { account, record: recordRow, rewardGrants: [], alreadyRecorded: true, replayed: false };
      await record(tx, userId, input.opId, 'SELF_REPORT', userId, input, op.hash, receipt); return receipt;
    }
    const recordRow = await tx.studyRecord.create({ data: { userId, courseId: input.courseId || null, type: 'SELF_REPORTED', durationMinutes: input.durationMinutes, notes: input.title.trim() + (input.notes?.trim() ? '\n' + input.notes.trim() : '') } });
    const next = applySelfReport(account, stableKey, recordRow.id, [], now.toISOString());
    const grants = next.grants.map(g => ({ ...g, id: randomUUID() }));
    for (const grant of grants) await tx.rewardGrant.create({ data: { ...grant, userId, createdAt: new Date(grant.createdAt) } });
    await saveAccount(tx, userId, next.account);
    await tx.user.update({ where: { id: userId }, data: { totalStudyMinutes: { increment: input.durationMinutes } } });
    if (input.courseId) await tx.course.update({ where: { id: input.courseId }, data: { totalStudyMinutes: { increment: input.durationMinutes }, studySessionCount: { increment: 1 }, lastStudiedAt: now } });
    const receipt = { account: next.account, record: recordRow, rewardGrants: grants, alreadyRecorded: false, replayed: false };
    await record(tx, userId, input.opId, 'SELF_REPORT', userId, input, op.hash, receipt); return receipt;
  });
}
export async function selfReportHistory(db: PrismaClient, userId: string, cursor?: string) {
  if (cursor) { idInput(cursor); if (!await db.studyRecord.findFirst({ where: { id: cursor, userId, type: 'SELF_REPORTED' } })) fail('NOT_FOUND', '自述记录游标不存在', 404); }
  const rows = await db.studyRecord.findMany({ where: { userId, type: 'SELF_REPORTED' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 51, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
  const records = rows.slice(0, 50); return { records, nextCursor: rows.length > 50 ? records[records.length - 1].id : null };
}
