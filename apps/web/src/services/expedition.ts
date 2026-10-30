import { CHAPTER } from '@keling/shared/expedition';
import type { AccountView, Action, Command, Evidence, LeaseInput, ProgressView, RewardGrant, RunView, StartRunInput, StartRunResponse, Writer } from '@keling/shared/expedition';
import api, { courseAPI } from './api';
import { getGuestSessionId } from './guestSession';
import { guestExpeditionRequest } from './guestExpedition';
import { useAppStore } from '../store/useAppStore';
import { enqueueExpeditionOperation, expeditionScopeKey, readExpeditionLocal, updateExpeditionLocal } from './expeditionStorage';
import type { ExpeditionLocalState, ExpeditionScope } from './expeditionStorage';

export type LedgerGrant = Omit<RewardGrant, 'kind'> & { kind: RewardGrant['kind'] | 'PURCHASE' };
export interface CourseSummary { id: string; name: string; planetStyleIndex: number }
export interface ChapterView { chapter: typeof CHAPTER; progress: ProgressView; account: AccountView; runs: RunView[]; serverTime: string }
export interface RunSnapshot { run: RunView; progress: ProgressView; account: AccountView; serverTime?: string }
export interface SelfReportRecord { id: string; courseId: string | null; type: 'SELF_REPORTED'; durationMinutes: number; notes: string; createdAt: string }
export interface ExpeditionSnapshot {
  selfReports?: SelfReportRecord[]; selfReportCursor?: string | null;
  courses: CourseSummary[]; chapters: Record<string, ChapterView>; runs: Record<string, RunSnapshot>;
  writers: Record<string, Writer>; account: AccountView | null; grants: LedgerGrant[]; evidence: Evidence[];
}
interface Payload { path: string; body: Record<string, unknown> }
interface Incoming extends Partial<RunSnapshot> { record?: SelfReportRecord; writer?: Writer; evidenceDelta?: Evidence[]; rewardGrants?: RewardGrant[]; grants?: LedgerGrant[]; grant?: LedgerGrant | null; evidence?: Evidence[] }
const listeners = new Set<(scope: string) => void>();
export const subscribeExpedition = (listener: (scope: string) => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const emit = (scope: ExpeditionScope) => listeners.forEach(listener => listener(expeditionScopeKey(scope)));
export function currentExpeditionScope(): ExpeditionScope | null {
  const state = useAppStore.getState(); const guest = getGuestSessionId();
  return guest ? { kind: 'guest', id: guest } : state.user?.id ? { kind: 'account', id: state.user.id } : null;
}
function assertScope(scope: ExpeditionScope) {
  const current = currentExpeditionScope();
  if (!current || expeditionScopeKey(current) !== expeditionScopeKey(scope)) throw new Error('学习空间已切换，旧操作不会写入当前账号。');
}
export function expeditionSnapshot(local: ExpeditionLocalState): ExpeditionSnapshot {
  return local.snapshot as ExpeditionSnapshot || { courses: [], chapters: {}, runs: {}, writers: {}, account: null, grants: [], evidence: [] };
}
export const expeditionError = (error: unknown) => (error as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error || (error as Error)?.message || '操作未完成，请保留草稿并重试。';
async function request<T>(scope: ExpeditionScope, path: string, body?: unknown): Promise<T> {
  assertScope(scope);
  const result = scope.kind === 'guest' ? await guestExpeditionRequest<T>(body === undefined ? 'GET' : 'POST', path, body)
    : (body === undefined ? await api.get<T>('/expedition/v1' + path) : await api.post<T>('/expedition/v1' + path, body)).data;
  assertScope(scope); return result;
}
function merge(snapshot: ExpeditionSnapshot, incoming: Incoming) {
  if (incoming.record) { const records = snapshot.selfReports ||= []; if (!records.some(record => record.id === incoming.record!.id)) records.push(incoming.record); }
  if (incoming.account && (!snapshot.account || incoming.account.revision >= snapshot.account.revision)) snapshot.account = incoming.account;
  if (incoming.run) {
    const old = snapshot.runs[incoming.run.id];
    const run = !old || incoming.run.revision >= old.run.revision ? incoming.run : old.run;
    const oldChapter = snapshot.chapters[run.courseId];
    const candidateProgress = incoming.progress || old?.progress || oldChapter?.progress;
    const progress = candidateProgress && (!oldChapter || candidateProgress.revision >= oldChapter.progress.revision) ? candidateProgress : oldChapter?.progress;
    const account = snapshot.account || old?.account || oldChapter?.account;
    if (progress && account) {
      snapshot.runs[run.id] = { run, progress, account, serverTime: incoming.serverTime || old?.serverTime };
      snapshot.chapters[run.courseId] = { chapter: CHAPTER, progress, account,
        runs: [...(oldChapter?.runs || []).filter(item => item.id !== run.id), run], serverTime: incoming.serverTime || oldChapter?.serverTime || new Date().toISOString() };
    }
    if (incoming.writer && incoming.writer.epoch >= (snapshot.writers[run.id]?.epoch || 0)) snapshot.writers[run.id] = incoming.writer;
    else if (!incoming.progress && incoming.run.revision >= (old?.run.revision || 0) && !incoming.writer) delete snapshot.writers[run.id];
  }
  if (incoming.progress) {
    const old = snapshot.chapters[incoming.progress.courseId];
    if (old && incoming.progress.revision >= old.progress.revision) old.progress = incoming.progress;
  }
  for (const evidence of incoming.evidenceDelta || incoming.evidence || []) if (!snapshot.evidence.some(item => item.id === evidence.id)) snapshot.evidence.push(evidence);
  for (const grant of [...(incoming.rewardGrants || incoming.grants || []), ...(incoming.grant ? [incoming.grant] : [])]) if (!snapshot.grants.some(item => item.id === grant.id)) snapshot.grants.push(grant);
}

async function accept(scope: ExpeditionScope, data: Incoming, operationId?: string) {
  assertScope(scope);
  await updateExpeditionLocal(scope, local => { const snapshot = expeditionSnapshot(local); merge(snapshot, data); local.snapshot = snapshot;
    local.lastSyncedAt = data.serverTime || new Date().toISOString();
    if (operationId) local.outbox = local.outbox.filter(operation => operation.id !== operationId);
  });
  assertScope(scope); emit(scope);
  if (data.account) {
    const latest = expeditionSnapshot(await readExpeditionLocal(scope)).account; assertScope(scope);
    if (latest) useAppStore.setState(state => ({ user: state.user ? { ...state.user, level: latest.level, exp: latest.exp, crystals: latest.crystals } : null }));
  }
}
export async function refreshExpeditionCourses(scope: ExpeditionScope) {
  assertScope(scope); const { data } = await courseAPI.getAll(); assertScope(scope);
  await updateExpeditionLocal(scope, local => { const snapshot = expeditionSnapshot(local); snapshot.courses = data.courses; local.snapshot = snapshot; }); emit(scope);
}
export async function refreshExpeditionChapter(scope: ExpeditionScope, courseId: string) {
  const chapter = await request<ChapterView>(scope, `/courses/${encodeURIComponent(courseId)}/chapters/binary-tree`);
  await updateExpeditionLocal(scope, local => {
    const snapshot = expeditionSnapshot(local), previous = snapshot.chapters[courseId];
    if (!previous) snapshot.chapters[courseId] = { ...chapter, runs: [] };
    merge(snapshot, { account: chapter.account, progress: chapter.progress, serverTime: chapter.serverTime });
    for (const run of chapter.runs) merge(snapshot, { run, progress: chapter.progress, account: chapter.account, serverTime: chapter.serverTime });
    local.snapshot = snapshot; local.lastSyncedAt = chapter.serverTime;
  }); emit(scope);
  const evidence = await request<{ evidence: Evidence[] }>(scope, `/courses/${encodeURIComponent(courseId)}/evidence`); await accept(scope, evidence);
  return chapter;
}
export async function refreshExpeditionRun(scope: ExpeditionScope, id: string) { const data = await request<RunSnapshot>(scope, '/runs/' + encodeURIComponent(id)); await accept(scope, data); return data; }
export async function refreshExpeditionRewards(scope: ExpeditionScope) { const data = await request<{ account: AccountView; grants: RewardGrant[] }>(scope, '/rewards'); await accept(scope, data); }
async function sendQueued(scope: ExpeditionScope, id: string) {
  const local = await readExpeditionLocal(scope), operation = local.outbox.find(item => item.id === id); if (!operation) return null;
  const payload = operation.command as Payload, snapshot = expeditionSnapshot(local), body = structuredClone(payload.body);
  // Renewal may reissue a token for the same writer epoch. Never change the answer, revision or epoch.
  const original = body.writer as Writer | undefined, latest = operation.runId ? snapshot.writers[operation.runId] : undefined;
  if (original && latest && original.deviceId === latest.deviceId && original.epoch === latest.epoch) body.writer = latest;
  try {
    const data = await request<Incoming & { replayed?: boolean }>(scope, payload.path, body); await accept(scope, data, id);
    if (data.replayed && data.run) await refreshExpeditionRun(scope, data.run.id).catch(() => {});
    return data;
  } catch (error) {
    assertScope(scope);
    const status = (error as { response?: { status?: number } }).response?.status;
    await updateExpeditionLocal(scope, state => { const queued = state.outbox.find(item => item.id === id); if (queued) { queued.status = status === 409 ? 'conflict' : status ? 'failed' : 'pending'; queued.error = expeditionError(error); } }); emit(scope);
    throw error;
  }
}
export async function mutateExpedition<T extends Incoming>(scope: ExpeditionScope, path: string, body: Record<string, unknown>, runId?: string): Promise<{ queued: boolean; data: T | null }> {
  assertScope(scope);
  const id = String(body.opId || crypto.randomUUID()), payload = { path, body: { ...body, opId: id } };
  await enqueueExpeditionOperation(scope, { id, runId, command: payload, createdAt: new Date().toISOString(), status: 'pending' }); emit(scope);
  try { return { queued: false, data: await sendQueued(scope, id) as T }; }
  catch (error) {
    if (!(error as { response?: { status?: number } }).response?.status && scope.kind === 'account') return { queued: true, data: null };
    throw error;
  }
}
export async function startExpedition(scope: ExpeditionScope, input: Omit<StartRunInput, 'opId' | 'deviceId'>) {
  const local = await readExpeditionLocal(scope);
  return mutateExpedition<StartRunResponse>(scope, '/runs', { ...input, opId: crypto.randomUUID(), deviceId: local.deviceId });
}
export async function actOnExpedition(scope: ExpeditionScope, runId: string, action: Action) {
  const local = await readExpeditionLocal(scope), snapshot = expeditionSnapshot(local), run = snapshot.runs[runId]?.run, writer = snapshot.writers[runId];
  if (!run || !writer || writer.deviceId !== local.deviceId) throw new Error('请先取得本机写入资格，草稿会保留。');
  if (local.outbox.some(item => item.runId === runId)) throw new Error('本轮仍有待同步操作，请先同步或处理冲突。');
  const command: Command = { opId: crypto.randomUUID(), expectedRevision: run.revision, writer, action };
  return mutateExpedition(scope, `/runs/${encodeURIComponent(runId)}/commands`, { ...command }, runId);
}
export async function claimExpedition(scope: ExpeditionScope, runId: string, intent: LeaseInput['intent']) {
  const local = await readExpeditionLocal(scope), snapshot = expeditionSnapshot(local), run = snapshot.runs[runId]?.run;
  if (!run) throw new Error('请先读取远征记录');
  const data = await request<{ run: RunView; writer?: Writer; serverTime: string }>(scope, `/runs/${encodeURIComponent(runId)}/lease`, {
    opId: crypto.randomUUID(), expectedRevision: run.revision, deviceId: local.deviceId, intent, writer: snapshot.writers[runId],
  });
  await accept(scope, data); return data;
}
const flushing = new Map<string, Promise<void>>();
export function flushExpedition(scope: ExpeditionScope) {
  const key = expeditionScopeKey(scope), active = flushing.get(key); if (active) return active;
  const promise = (async () => {
    const local = await readExpeditionLocal(scope);
    for (const operation of local.outbox) {
      assertScope(scope); if (operation.status !== 'pending') break;
      await sendQueued(scope, operation.id);
    }
  })().finally(() => flushing.delete(key));
  flushing.set(key, promise); return promise;
}
export async function dismissExpeditionOperation(scope: ExpeditionScope, id: string) {
  await updateExpeditionLocal(scope, local => { local.outbox = local.outbox.filter(item => item.id !== id); }); emit(scope);
}

export async function saveExpeditionPreferences(scope: ExpeditionScope, preferences: NonNullable<ExpeditionLocalState['preferences']>) { assertScope(scope); await updateExpeditionLocal(scope, local => { local.preferences = preferences; }); emit(scope); }

export async function refreshSelfReports(scope: ExpeditionScope, cursor?: string) {
  const data = await request<{ records: SelfReportRecord[]; nextCursor: string | null }>(scope, '/self-report' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''));
  await updateExpeditionLocal(scope, local => { const snapshot = expeditionSnapshot(local), existing = snapshot.selfReports ||= [];
    for (const record of data.records) if (!existing.some(item => item.id === record.id)) existing.push(record);
    snapshot.selfReportCursor = data.nextCursor; local.snapshot = snapshot;
  }); assertScope(scope); emit(scope);
}
