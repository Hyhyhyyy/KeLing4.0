import { CHAPTER, DECORATIONS, RULES, applyDecoration, createProgress, createRun, emptyWorld, reduceCommand, settleRewards, studyDay, ExpeditionError, selfReportCanonical, applySelfReport, sessionTiming } from '@keling/shared/expedition';
import type { AccountView, Command, Evidence, LeaseInput, ProgressView, Receipt, RewardGrant, RunView, SourceRef, StartRunInput, Writer, SelfReportInput } from '@keling/shared/expedition';
import { getGuestSessionId, subscribeGuestSession } from './guestSession';
import { getGuestWorkspace, guestDataError } from './guestData';

type LedgerGrant = Omit<RewardGrant, 'kind'> & { kind: RewardGrant['kind'] | 'PURCHASE' };
interface GuestExpedition {
  id: string; account: AccountView; progress: Record<string, ProgressView>; runs: Record<string, RunView>;
  writers: Record<string, Writer>; grants: LedgerGrant[]; evidence: Evidence[];
  receipts: Map<string, { hash: string; result: unknown }>; reports: { id: string; courseId: string | null; type: 'SELF_REPORTED'; durationMinutes: number; notes: string; createdAt: string }[];
}
let current: GuestExpedition | null = null;
subscribeGuestSession(() => { current = null; });
const clone = <T,>(value: T): T => structuredClone(value);
const now = () => new Date().toISOString();
function workspace() {
  const id = getGuestSessionId(); if (!id) return guestDataError(401, '本次游客空间已结束');
  if (!current || current.id !== id) {
    const user = getGuestWorkspace().user;
    current = { id, account: { revision: 0, level: user.level, exp: user.exp, crystals: user.crystals,
      legacy: { level: user.level, exp: user.exp, crystals: user.crystals, energy: user.energy, capturedAt: now() },
      world: emptyWorld(), quota: { day: studyDay(now()), cycleCount: 0, crystalsGranted: 0 } },
      progress: {}, runs: {}, writers: {}, grants: [], evidence: [], receipts: new Map(), reports: [] };
  }
  return current;
}
function courseProgress(data: GuestExpedition, courseId: string) {
  if (!getGuestWorkspace().courses.some(course => course.id === courseId && !course.isArchived)) return guestDataError(404, '课程不存在或已归档');
  return data.progress[courseId] ||= { id: 'progress:' + courseId, courseId, chapterId: CHAPTER.id, contentVersion: CHAPTER.version, revision: 0, state: createProgress() };
}
function writeWallet(data: GuestExpedition) {
  const user = getGuestWorkspace().user;
  user.level = data.account.level; user.exp = data.account.exp; user.crystals = data.account.crystals;
}
function requireRun(data: GuestExpedition, id: string) { return data.runs[id] || guestDataError(404, '远征不存在'); }
function revision(actual: number, expected: number) { if (actual !== expected) guestDataError(409, '版本已变化，请保留草稿并核对当前记录'); }
function once(data: GuestExpedition, opId: string, content: unknown, run: () => unknown) {
  if (typeof opId !== 'string' || !opId || opId.length > 160) return guestDataError(400, '操作编号无效');
  const hash = JSON.stringify(content), previous = data.receipts.get(opId);
  if (previous) {
    if (previous.hash !== hash) return guestDataError(409, '操作编号已用于其他内容');
    return { ...(clone(previous.result) as object), replayed: true };
  }
  const result = run(); data.receipts.set(opId, { hash, result: clone(result) }); return result;
}
async function seedSources(): Promise<SourceRef[]> {
  let offset = 0;
  const material = CHAPTER.materialParagraphs.join('\n\n');
  const contentHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material)))).map(value => value.toString(16).padStart(2, '0')).join('');
  return CHAPTER.materialParagraphs.map((paragraph, index) => {
    const startUtf16 = offset; offset += paragraph.length + 2;
    return { materialVersionId: `guest:binary-tree:${CHAPTER.version}`, spanId: `guest:binary-tree:${CHAPTER.version}:${index}`, contentHash, startUtf16, endUtf16: startUtf16 + paragraph.length, page: null, paragraphIndex: index };
  });
}
export async function guestExpeditionRequest<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const data = workspace(), session = data.id;
  try {
    let result: unknown;
    if (method === 'GET' && path === '/catalog') result = { chapter: CHAPTER, decorations: DECORATIONS, rules: RULES };
    else if (method === 'GET' && (path === '/self-report' || path.startsWith('/self-report?'))) {
      const cursor = new URLSearchParams(path.split('?')[1] || '').get('cursor');
      const sorted = data.reports.slice().sort((a,b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
      const at = cursor ? sorted.findIndex(record => record.id === cursor) : -1;
      if (cursor && at < 0) return guestDataError(404, '自述记录游标不存在');
      const records = sorted.slice(at + 1, at + 51); result = { records, nextCursor: sorted.length > at + 51 ? records.at(-1)!.id : null };
    } else if (method === 'GET' && path === '/rewards') result = { account: data.account, grants: data.grants };
    else if (method === 'GET' && /^\/courses\/[^/]+\/chapters\/binary-tree$/.test(path)) {
      const courseId = path.split('/')[2], progress = courseProgress(data, courseId);
      result = { chapter: CHAPTER, progress, account: data.account, runs: Object.values(data.runs).filter(run => run.courseId === courseId), serverTime: now() };
    } else if (method === 'GET' && /^\/courses\/[^/]+\/evidence$/.test(path)) {
      const courseId = path.split('/')[2]; courseProgress(data, courseId);
      result = { evidence: data.evidence.filter(item => data.runs[item.runId]?.courseId === courseId) };
    } else if (method === 'POST' && path === '/runs') {
      const input = body as StartRunInput, sources = await seedSources();
      if (getGuestSessionId() !== session) return guestDataError(401, '本次游客空间已结束');
      result = once(data, input.opId, { path, ...input }, () => {
        const progress = courseProgress(data, input.courseId), timestamp = now();
        const created = createRun({ ...input, id: crypto.randomUUID(), now: timestamp, sources }, progress.state);
        const writer: Writer = { deviceId: input.deviceId, epoch: 1, token: crypto.randomUUID() };
        const run: RunView = { ...created.run, writerDeviceId: writer.deviceId, leaseEpoch: writer.epoch, leaseExpiresAt: new Date(Date.now() + RULES.leaseMs).toISOString() };
        progress.state = created.progress; progress.revision++; data.runs[run.id] = run; data.writers[run.id] = writer;
        return { run, writer, progress, account: data.account };
      });
    } else if (/^\/runs\/[^/]+$/.test(path) && method === 'GET') {
      const run = requireRun(data, path.split('/')[2]); result = { run, progress: data.progress[run.courseId], account: data.account, serverTime: now() };
    } else if (/^\/runs\/[^/]+\/commands$/.test(path) && method === 'POST') {
      const id = path.split('/')[2], command = body as Command;
      result = once(data, command.opId, { path, expectedRevision: command.expectedRevision, writer: { deviceId: command.writer.deviceId, epoch: command.writer.epoch }, action: command.action }, () => {
        const run = requireRun(data, id), writer = data.writers[id]; revision(run.revision, command.expectedRevision);
        if (!writer || command.writer.deviceId !== writer.deviceId || command.writer.epoch !== writer.epoch || command.writer.token !== writer.token || Date.parse(run.leaseExpiresAt || '') <= Date.now()) return guestDataError(409, '本机写入资格已变化或过期，请重新取得资格');
        const progress = data.progress[run.courseId], timestamp = now();
        const next = reduceCommand(run, progress.state, command.action, { now: timestamp, operationId: command.opId });
        const settled = settleRewards(data.account, next.rewardCandidates, data.grants.map(grant => grant.stableKey), timestamp);
        const updatedRun: RunView = { ...run, ...next.run };
        data.runs[id] = updatedRun; progress.state = next.progress; progress.revision++;
        data.account = settled.account; data.grants.push(...settled.grants); data.evidence.push(...next.evidenceDelta); writeWallet(data);
        const receipt: Receipt = { opId: command.opId, revision: updatedRun.revision, serverTime: timestamp, run: updatedRun, progress, account: data.account,
          feedback: updatedRun.feedback, evidenceDelta: next.evidenceDelta, rewardGrants: settled.grants, replayed: false };
        return receipt;
      });
    } else if (/^\/runs\/[^/]+\/lease$/.test(path) && method === 'POST') {
      const id = path.split('/')[2], input = body as LeaseInput, run = requireRun(data, id);
      if (!['acquire', 'renew', 'release', 'takeover'].includes(input.intent) || !input.deviceId || !input.opId) return guestDataError(400, '接续参数无效');
      const hash = JSON.stringify({ path, ...input }), previous = data.receipts.get(input.opId);
      const occupied = Boolean(run.writerDeviceId && Date.parse(run.leaseExpiresAt || '') > Date.now());
      const verify = () => { const writer = data.writers[id]; if (!occupied || !writer || writer.token !== input.writer?.token || writer.epoch !== input.writer.epoch || writer.deviceId !== input.writer.deviceId) return guestDataError(409, '本机写入资格已变化或过期'); };
      if (previous) {
        if (previous.hash !== hash) return guestDataError(409, '操作编号已用于其他内容');
        const old = previous.result as { run: RunView };
        if (input.intent === 'release') result = previous.result;
        else {
          if (!occupied || run.writerDeviceId !== input.deviceId || run.leaseEpoch !== old.run.leaseEpoch) return guestDataError(409, '旧接续操作已被替代');
          const writer: Writer = { deviceId: input.deviceId, epoch: run.leaseEpoch, token: crypto.randomUUID() };
          data.writers[id] = writer; run.leaseExpiresAt = new Date(Date.now() + RULES.leaseMs).toISOString(); result = { run, writer, serverTime: now() };
        }
      } else {
        revision(run.revision, input.expectedRevision);
        if (['SETTLED', 'CANCELLED', 'CONTENT_STALE'].includes(run.status)) return guestDataError(409, '本次远征已结束或内容失效');
        if (input.intent === 'release') {
          verify(); run.writerDeviceId = null; run.leaseExpiresAt = null; run.leaseEpoch++; run.revision++; delete data.writers[id];
          result = { run, serverTime: now() };
        } else {
          if (input.intent === 'renew') verify();
          if (occupied && run.writerDeviceId !== input.deviceId && input.intent !== 'takeover') return guestDataError(409, '另一设备正在编辑，请明确接管');
          if (run.writerDeviceId !== input.deviceId || !occupied || input.intent === 'takeover') { run.leaseEpoch++; run.revision++; }
          const writer: Writer = { deviceId: input.deviceId, epoch: run.leaseEpoch, token: crypto.randomUUID() };
          run.writerDeviceId = input.deviceId; run.leaseExpiresAt = new Date(Date.now() + RULES.leaseMs).toISOString(); data.writers[id] = writer;
          result = { run, writer, serverTime: now() };
        }
        data.receipts.set(input.opId, { hash, result: clone(result) });
      }
    } else if (method === 'POST' && path === '/base/commands') {
      const input = body as { opId: string; expectedRevision: number; decorationId: string; action: 'BUY' | 'EQUIP' };
      result = once(data, input.opId, { path, ...input }, () => {
        revision(data.account.revision, input.expectedRevision); const changed = applyDecoration(data.account, input.action, input.decorationId);
        const grant: LedgerGrant | null = changed.cost ? { id: crypto.randomUUID(), stableKey: 'purchase:' + input.decorationId, kind: 'PURCHASE', exp: 0, crystals: -changed.cost, reason: '确定性基地装饰购买', sourceId: input.decorationId, ruleVersion: RULES.version, createdAt: now() } : null;
        data.account = changed.account; if (grant) data.grants.push(grant); writeWallet(data); return { account: data.account, grant, replayed: false };
      });
    } else if (method === 'POST' && /^\/progress\/[^/]+\/memory$/.test(path)) {
      const input = body as { opId: string; expectedRevision: number; memoryId: string; action: 'UPDATE' | 'DELETE'; text?: string };
      result = once(data, input.opId, { path, ...input }, () => {
        const progress = Object.values(data.progress).find(item => item.id === decodeURIComponent(path.split('/')[2])); if (!progress) return guestDataError(404, '学习档案不存在');
        revision(progress.revision, input.expectedRevision); const memory = progress.state.companionMemories.find(item => item.id === input.memoryId && !item.deletedAt); if (!memory) return guestDataError(404, '星芽档案不存在');
        if (input.action === 'DELETE') { memory.deletedAt = now(); memory.text = ''; memory.sources = []; }
        else if (input.action === 'UPDATE' && input.text && input.text.trim().length >= 2 && input.text.length <= 4000) { memory.text = input.text.trim(); memory.confirmedAt = now(); }
        else return guestDataError(400, '档案修改内容无效');
        progress.revision++; return { progress, replayed: false };
      });
    } else if (method === 'POST' && path === '/self-report') {
      const input = body as SelfReportInput, timestamp = now(), canonical = selfReportCanonical(input, timestamp);
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
      if (getGuestSessionId() !== session) return guestDataError(401, '本次游客空间已结束');
      const stableKey = 'self-report:' + Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
      result = once(data, input.opId, { path, ...input }, () => {
        if (input.courseId) courseProgress(data, input.courseId);
        const previous = data.grants.find(grant => grant.stableKey === stableKey);
        if (previous) return { account: data.account, record: data.reports.find(record => record.id === previous.sourceId), rewardGrants: [], alreadyRecorded: true, replayed: false };
        const record = { id: crypto.randomUUID(), courseId: input.courseId || null, type: 'SELF_REPORTED' as const, durationMinutes: input.durationMinutes, notes: input.title.trim() + (input.notes?.trim() ? '\n' + input.notes.trim() : ''), createdAt: timestamp };
        const settled = applySelfReport(data.account, stableKey, record.id, data.grants.map(grant => grant.stableKey), timestamp);
        data.account = settled.account; data.grants.push(...settled.grants); data.reports.push(record); writeWallet(data);
        const legacy = getGuestWorkspace(); legacy.user.totalStudyMinutes += input.durationMinutes;
        const course = legacy.courses.find(item => item.id === input.courseId); if (course) { course.totalStudyMinutes += input.durationMinutes; course.lastStudiedAt = timestamp; course.studySessionCount++; course.updatedAt = timestamp; }
        return { account: data.account, record, rewardGrants: settled.grants, alreadyRecorded: false, replayed: false };
      });
    } else return guestDataError(404, '本次游客未找到该远征操作');
    if (getGuestSessionId() !== session) return guestDataError(401, '本次游客空间已结束');
    const response = clone(result) as { run?: RunView; runs?: RunView[] };
    if (response.run) response.run = { ...response.run, timing: sessionTiming(response.run, now()) };
    if (response.runs) response.runs = response.runs.map(run => ({ ...run, timing: sessionTiming(run, now()) }));
    return response as T;
  } catch (error) {
    if (error instanceof ExpeditionError) return guestDataError(error.status, error.message);
    throw error;
  }
}
/** Explicit course attachment only; never expose writer tokens, unrelated courses or hidden drafts. */
export function guestExpeditionContext(courseId: string): { id: string; kind: string; title: string; text: string; updatedAt: string; truncated: boolean }[] {
  if (!current || current.id !== getGuestSessionId()) return [];
  const data = current, progress = data.progress[courseId], sources = [];
  if (progress) {
    sources.push({ id: progress.id, kind: 'evidence', title: '二叉树目标与已确认解释',
      text: JSON.stringify({ objectives: progress.state.objectives.map(objective => ({ objective: objective.objectiveKey, state: objective.state, evidenceCount: objective.evidenceIds.length, review: objective.review })),
        memories: progress.state.companionMemories.filter(memory => !memory.deletedAt).slice(-2).map(memory => ({ text: memory.text.slice(0, 1200), verification: memory.verification, confirmedAt: memory.confirmedAt })) }),
      updatedAt: `revision:${progress.revision}`, truncated: progress.state.companionMemories.filter(memory => !memory.deletedAt).length > 2 });
  }
  for (const run of Object.values(data.runs).filter(run => run.courseId === courseId).sort((a,b) => b.startedAt.localeCompare(a.startedAt)).slice(0,3)) {
    const last = run.attempts.at(-1);
    sources.push({ id: run.id, kind: 'evidence', title: '最近远征 · ' + (CHAPTER.objectives.find(objective => objective.key === run.objectiveKey)?.title || '二叉树'),
      text: `远征状态：${run.status}\n模式：${run.mode}\n已用提示：${run.hintsUsed}\n` + (last ? `最近反馈：${last.feedback.kind}\n首次作答：${last.firstSubmission ? '是' : '否'}\n${last.feedback.message}\n` : '尚无作答。\n') + `下一步自述：${run.nextStep || '尚未确认'}\n这些是过程记录，不是 AI 可更改的评价。`,
      updatedAt: `revision:${run.revision}`, truncated: false });
  }
  return clone(sources);
}
