/** A visitor workspace lives only for this document. Never persist this identity. */
let sessionId: string | null = null;
const listeners = new Set<() => void>();

export const getGuestSessionId = () => sessionId;
export const isGuestSession = () => sessionId !== null;
export function subscribeGuestSession(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function startGuestSession() {
  if (!sessionId) {
    sessionId = `guest-${crypto.randomUUID()}`;
    listeners.forEach(listener => listener());
  }
  return sessionId;
}
export function endGuestSession() {
  sessionId = null;
  listeners.forEach(listener => listener());
}
