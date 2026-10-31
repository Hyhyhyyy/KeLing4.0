export const AUTH_WAIT_MS = 25_000;

/** Bound the whole operation, even if the transport ignores abort or DNS never completes. */
export function withAuthDeadline<T>(request: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal, timeoutMs = AUTH_WAIT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); };
    const fail = (code: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(Object.assign(new Error(code), { code }));
      controller.abort();
    };
    const cancel = () => fail('AUTH_CANCELLED');
    const timer = setTimeout(() => fail('AUTH_TIMEOUT'), timeoutMs);
    if (signal?.aborted) { cancel(); return; }
    signal?.addEventListener('abort', cancel, { once: true });
    Promise.resolve().then(() => {
      if (settled) return undefined as T;
      return request(controller.signal);
    }).then(value => {
      if (!settled) { settled = true; cleanup(); resolve(value); }
    }, error => {
      if (!settled) { settled = true; cleanup(); reject(error); }
    });
  });
}
