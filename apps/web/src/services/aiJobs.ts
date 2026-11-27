import { hostingCredentials, hostingHeaders } from './appPath';
import { getGuestSessionId } from './guestSession';

const base = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '');
const token = () => typeof localStorage === 'undefined' ? null : localStorage.getItem('token');
const identity = () => getGuestSessionId() ? `guest:${getGuestSessionId()}` : `account:${token() || ''}`;
function fail(message: string, code: string, status = 400): never {
  throw Object.assign(new Error(message), { response: { status, data: { error: message, code } } });
}
function wait(signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(new DOMException('Stopped', 'AbortError'));
  return new Promise<void>((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); reject(new DOMException('Stopped', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, 1500);
    signal.addEventListener('abort', cancel, { once: true });
  });
}

/** Native jobs and synchronous BYOK share the same result shape. No synthetic fallback. */
export async function requestAI<T>(path: string, body?: unknown, signal?: AbortSignal, authenticated = false): Promise<T> {
  const scope = identity(), deadline = AbortSignal.timeout(600000);
  const active = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const accountToken = authenticated && !getGuestSessionId() ? token() : null;
  const check = () => { if (identity() !== scope) fail('学习空间已切换，旧请求已停止。', 'CANCELLED', 409); };
  async function fetchResult(route: string, payload?: unknown, jobToken?: string) {
    check();
    const response = await fetch(base + route, {
      method: payload === undefined ? 'GET' : 'POST', credentials: hostingCredentials, redirect: 'error', cache: 'no-store',
      headers: { ...hostingHeaders(), 'Content-Type': 'application/json', ...(accountToken ? { Authorization: `Bearer ${accountToken}` } : {}), ...(jobToken ? { 'X-AI-Job-Token': jobToken } : {}) },
      signal: AbortSignal.any([active, AbortSignal.timeout(90000)]), ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    const data = await response.json().catch(() => null); check();
    if (!response.ok) fail(typeof data?.error === 'string' ? data.error : '模型请求未完成，请重试。', data?.code || 'PROVIDER_ERROR', response.status);
    if (!data || typeof data !== 'object') fail('模型响应无法读取，请重试。', 'INVALID_RESPONSE', 502);
    return { status: response.status, data };
  }
  try {
    const first = await fetchResult(path, body);
    if (first.status !== 202) return first.data as T;
    const { jobId, jobToken } = first.data;
    if (typeof jobId !== 'string' || !jobId || jobId.length > 200) fail('模型任务编号无效，请重试。', 'INVALID_RESPONSE', 502);
    for (;;) {
      await wait(active); check();
      const { data } = await fetchResult('/ai-jobs/' + encodeURIComponent(jobId), undefined, typeof jobToken === 'string' ? jobToken : undefined);
      if (data.status === 'RUNNING') continue;
      if (data.status === 'SUCCEEDED' && data.result !== undefined) return data.result as T;
      if (data.status === 'FAILED') fail(typeof data.error === 'string' ? data.error : '模型未完成生成，请重试。', data.code || 'PROVIDER_ERROR', 502);
      fail('模型任务响应无效，请重试。', 'INVALID_RESPONSE', 502);
    }
  } catch (error) {
    check();
    if (signal?.aborted) fail('已停止等待，输入内容已保留。', 'CANCELLED', 409);
    if (deadline.aborted || (error instanceof DOMException && error.name === 'TimeoutError')) fail('模型等待超时，输入内容已保留，请重试。', 'TIMEOUT', 504);
    if ((error as { response?: unknown })?.response) throw error;
    fail('网络连接中断，输入内容已保留，请重试。', 'NETWORK', 503);
  }
}
