import type { User } from '../types';
import { getGuestSessionId, subscribeGuestSession } from './guestSession';

export type ExpeditionScope = { kind: 'account' | 'guest'; id: string };
export interface ExpeditionDraft { runId: string; baseRevision: number; value: unknown; updatedAt: string }
export interface QueuedExpeditionOperation {
  id: string; runId?: string; command: unknown; createdAt: string;
  status: 'pending' | 'conflict' | 'failed'; error?: string;
}
export interface ExpeditionLocalState {
  preferences?: { hints: 'REQUEST_ONLY' | 'KEY_MOMENTS'; narrative: 'LIGHT' | 'STANDARD'; reducedMotion: boolean };
  schemaVersion: 1; scope: string; deviceId: string; snapshot: unknown | null;
  drafts: Record<string, ExpeditionDraft>; outbox: QueuedExpeditionOperation[];
  lastSyncedAt: string | null; updatedAt: string;
}
const databaseName = 'keling-expedition-v1';
const guests = new Map<string, ExpeditionLocalState>();
subscribeGuestSession(() => guests.clear());
let opening: Promise<IDBDatabase> | null = null;
const copy = <T,>(value: T): T => structuredClone(value);
export const expeditionScopeKey = (scope: ExpeditionScope) => `${scope.kind}:${scope.id}`;
function assertScope(scope: ExpeditionScope) {
  if (!scope.id || (scope.kind === 'guest' && getGuestSessionId() !== scope.id)) throw new Error('本次学习空间已结束');
}
function fresh(scope: ExpeditionScope): ExpeditionLocalState {
  return { schemaVersion: 1, scope: expeditionScopeKey(scope), deviceId: crypto.randomUUID(), snapshot: null,
    drafts: {}, outbox: [], lastSyncedAt: null, updatedAt: new Date().toISOString() };
}
function openDatabase() {
  if (!opening) opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('workspaces')) db.createObjectStore('workspaces', { keyPath: 'scope' });
      if (!db.objectStoreNames.contains('identities')) db.createObjectStore('identities', { keyPath: 'fingerprint' });
    };
    request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); opening = null; }; resolve(db); };
    request.onerror = () => { opening = null; reject(new Error('本机学习存储暂不可用，请检查浏览器存储权限。')); };
    request.onblocked = () => { opening = null; reject(new Error('本机存储更新被其他页面占用，请关闭其他课灵页面后重试。')); };
  });
  return opening;
}
/** One read/write transaction prevents two tabs from overwriting each other's queued commands. */
export async function updateExpeditionLocal(scope: ExpeditionScope, change: (state: ExpeditionLocalState) => void): Promise<ExpeditionLocalState> {
  assertScope(scope);
  const key = expeditionScopeKey(scope);
  if (scope.kind === 'guest') {
    const next = copy(guests.get(key) || fresh(scope));
    change(next); assertScope(scope); next.updatedAt = new Date().toISOString(); guests.set(key, next);
    return copy(next);
  }
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('workspaces', 'readwrite');
    const store = transaction.objectStore('workspaces');
    const request = store.get(key);
    let result: ExpeditionLocalState;
    transaction.oncomplete = () => resolve(copy(result));
    transaction.onerror = () => reject(new Error('本机保存失败；请保留当前页面，导出草稿后再重试。'));
    transaction.onabort = () => reject(new Error('本机保存未完成，原草稿和待同步操作仍保留。'));
    request.onsuccess = () => {
      try {
        result = copy(request.result || fresh(scope));
        change(result); result.updatedAt = new Date().toISOString(); store.put(result);
      } catch { transaction.abort(); }
    };
  });
}
export const readExpeditionLocal = (scope: ExpeditionScope) => updateExpeditionLocal(scope, () => {});
export const saveExpeditionDraft = (scope: ExpeditionScope, draft: ExpeditionDraft) => updateExpeditionLocal(scope, state => {
  state.drafts[draft.runId] = copy(draft);
});
export const enqueueExpeditionOperation = (scope: ExpeditionScope, operation: QueuedExpeditionOperation) => updateExpeditionLocal(scope, state => {
  const existing = state.outbox.find(item => item.id === operation.id);
  if (existing && JSON.stringify(existing.command) !== JSON.stringify(operation.command)) throw new Error('操作编号冲突');
  if (!existing) state.outbox.push(copy(operation));
});
export const removeExpeditionOperation = (scope: ExpeditionScope, id: string) => updateExpeditionLocal(scope, state => {
  state.outbox = state.outbox.filter(item => item.id !== id);
});
export const saveExpeditionSnapshot = (scope: ExpeditionScope, snapshot: unknown, syncedAt: string) => updateExpeditionLocal(scope, state => {
  state.snapshot = copy(snapshot); state.lastSyncedAt = syncedAt;
});
export async function clearExpeditionLocal(scope: ExpeditionScope) {
  assertScope(scope);
  if (scope.kind === 'guest') { guests.delete(expeditionScopeKey(scope)); return; }
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('workspaces', 'readwrite'); tx.objectStore('workspaces').delete(expeditionScopeKey(scope));
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(new Error('清除本机草稿失败'));
  });
}
async function fingerprint(token: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))).map(byte => byte.toString(16).padStart(2, '0')).join('');
}
/** A cache is created only after the server has verified this exact credential. No token or model Key is stored here. */
export async function rememberExpeditionIdentity(user: User, token: string) {
  if (!token || !user.id || user.id.startsWith('guest-')) return;
  const key = await fingerprint(token), db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('identities', 'readwrite');
    tx.objectStore('identities').put({ fingerprint: key, user: copy(user), verifiedAt: new Date().toISOString() });
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(new Error('离线身份缓存未保存'));
  });
}
export async function readExpeditionIdentity(token: string): Promise<User | null> {
  if (!token) return null;
  const key = await fingerprint(token), db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('identities', 'readonly'); const request = tx.objectStore('identities').get(key);
    request.onsuccess = () => resolve(request.result?.user ? copy(request.result.user) : null);
    request.onerror = () => reject(new Error('无法读取本机离线身份'));
  });
}
