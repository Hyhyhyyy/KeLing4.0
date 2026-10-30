import type { ContextRef } from './assistant';
import { useAppStore } from '../store/useAppStore';

export interface AssistantLaunch {
  key: string;
  accountId: string;
  ref: ContextRef;
  prompt: string;
  createdAt: number;
}

// Only an opaque entry key goes into navigation state. Resource references and
// draft questions stay in this account-bound, short-lived memory slot.
let pending: AssistantLaunch | null = null;
useAppStore.subscribe((state, previous) => {
  if (state.user?.id !== previous.user?.id) pending = null;
});

export function beginAssistantLaunch(accountId: string, ref: ContextRef, prompt: string) {
  const key = crypto.randomUUID();
  pending = { key, accountId, ref, prompt, createdAt: Date.now() };
  return key;
}

export function readAssistantLaunch(key: unknown, accountId?: string) {
  return typeof key === 'string' && pending?.key === key && pending.accountId === accountId
    && Date.now() - pending.createdAt < 15 * 60 * 1000 ? pending : null;
}

export function clearAssistantLaunch(key?: string) {
  if (!key || pending?.key === key) pending = null;
}
