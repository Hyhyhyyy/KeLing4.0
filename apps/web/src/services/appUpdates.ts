export interface AvailableAppUpdate { activate: () => Promise<void> }

function activated(worker: ServiceWorker, timeoutMs: number, container: ServiceWorkerContainer, inScope: boolean): Promise<void> {
  const previousController = container.controller;
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      worker.removeEventListener('statechange', changed);
      container.removeEventListener('controllerchange', changed);
      if (error) reject(error); else resolve();
    };
    const changed = () => {
      const controller = container.controller;
      const controlsPage = controller === worker || (controller && controller !== previousController && controller.scriptURL === worker.scriptURL);
      if (worker.state === 'activated' && (!inScope || controlsPage)) finish();
      else if (worker.state === 'redundant') finish(new Error('更新未能启用'));
    };
    const timer = setTimeout(() => finish(new Error('更新尚未就绪')), timeoutMs);
    worker.addEventListener('statechange', changed);
    container.addEventListener('controllerchange', changed);
    if (worker.state === 'installed') {
      try { worker.postMessage({ type: 'SKIP_WAITING' }); }
      catch { finish(new Error('更新暂未就绪，请稍后重试。')); }
    }
    changed();
  });
}

/** This monitor never reloads a document or changes application storage. */
export function watchAppUpdates({ container, baseURL, pageURL = baseURL, onAvailable, onError, activationTimeoutMs = 15000 }: {
  container: ServiceWorkerContainer;
  baseURL: string;
  pageURL?: string;
  onAvailable: (update: AvailableAppUpdate) => void;
  onError?: (error: unknown) => void;
  activationTimeoutMs?: number;
}) {
  let disposed = false;
  let registration: ServiceWorkerRegistration | undefined;
  let previousController = container.controller;
  const cleanup: (() => void)[] = [];
  const offered = new Set<ServiceWorker>();
  const reportError = (error: unknown) => { if (!disposed) { try { onError?.(error); } catch { /* Reporting must not interrupt the app. */ } } };
  const offer = (worker: ServiceWorker) => {
    if (disposed || offered.has(worker)) return;
    offered.add(worker);
    const base = new URL(baseURL), page = new URL(pageURL);
    const inScope = page.origin === base.origin && page.pathname.startsWith(base.pathname);
    try { onAvailable({ activate: () => activated(worker, activationTimeoutMs, container, inScope) }); } catch (error) { reportError(error); }
  };
  const controllerChanged = () => {
    const next = container.controller;
    if (previousController && next && next !== previousController) offer(next);
    previousController = next;
  };
  container.addEventListener('controllerchange', controllerChanged);
  cleanup.push(() => container.removeEventListener('controllerchange', controllerChanged));
  const ready = Promise.resolve().then(async () => {
    const base = new URL(baseURL);
    const next = await container.register(new URL('sw.js', base).href, { scope: base.pathname, updateViaCache: 'none' });
    if (disposed) return;
    registration = next;
    const watchInstalling = () => {
      const worker = next.installing;
      if (!worker) return;
      const isUpdate = Boolean(container.controller || (next.active && next.active !== worker));
      const changed = () => { if (isUpdate && ['installed', 'activating', 'activated'].includes(worker.state)) offer(worker); };
      worker.addEventListener('statechange', changed);
      cleanup.push(() => worker.removeEventListener('statechange', changed));
      changed();
    };
    next.addEventListener('updatefound', watchInstalling);
    cleanup.push(() => next.removeEventListener('updatefound', watchInstalling));
    if (next.waiting && next.active) offer(next.waiting);
    watchInstalling();
  }).catch(reportError);
  return {
    ready,
    async check() { await ready; if (!disposed && registration && !registration.installing) await registration.update().catch(reportError); },
    dispose() { disposed = true; cleanup.forEach(remove => remove()); }
  };
}

export async function applyAppUpdate(update: AvailableAppUpdate, actions: {
  isGuest: boolean; confirm: (message: string) => boolean; reload: () => void;
}): Promise<boolean> {
  const message = actions.isGuest
    ? '请先导出本页重要内容，并保存其他课灵页面。更新会刷新页面并清空本次游客数据。继续更新？'
    : '请先保存本页及其他课灵页面的草稿，并结束计时。更新会刷新页面。继续更新？';
  if (!actions.confirm(message)) return false;
  await update.activate();
  actions.reload();
  return true;
}
