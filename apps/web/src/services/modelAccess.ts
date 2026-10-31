import { hostingCredentials, hostingHeaders } from './appPath';
import { create } from 'zustand';

export interface ModelAccessProvider { id: string; name: string; documentation: string; endpointRequired: boolean; endpointHint: string; endpoints?: string[]; chat: boolean; embedding: boolean }
export interface AccessModel { id: string; capabilities: ('chat' | 'embedding' | 'unknown')[] }
export interface ModelAccessContext { title: string; text: string }
export interface ModelAccessAnswer { answer: string; model: string; usage?: { inputTokens?: number; outputTokens?: number }; question?: string; context?: ModelAccessContext[]; providerId?: string }
export interface ModelDiscovery { providerId: string; models: AccessModel[]; fetchedAt: string; note: string }
export interface ModelCredentials { providerId: string; apiKey: string; baseUrl: string }
interface ModelAccessState extends ModelCredentials {
  model: string; models: AccessModel[]; fetchedAt: string; note: string; revision: number; scopeKey: string;
}
const blank = { providerId: '', apiKey: '', baseUrl: '', model: '', models: [] as AccessModel[], fetchedAt: '', note: '' };

// Intentionally no persist middleware, storage, query string, or analytics.
export const useModelAccess = create<ModelAccessState>(() => ({ ...blank, revision: 0, scopeKey: 'guest' }));
export function clearModelAccess() { useModelAccess.setState(state => ({ ...blank, revision: state.revision + 1 })); }
export function changeModelAccessScope(scopeKey: string) {
  if (useModelAccess.getState().scopeKey !== scopeKey) useModelAccess.setState(state => ({ ...blank, scopeKey, revision: state.revision + 1 }));
}
export function changeModelCredentials(change: Partial<ModelCredentials>) {
  useModelAccess.setState(state => ({ ...change, model: '', models: [], fetchedAt: '', note: '', revision: state.revision + 1 }));
}
export function chooseAccessModel(model: string) { useModelAccess.setState({ model }); }
export function acceptDiscovery(data: ModelDiscovery, revision: number) {
  if (useModelAccess.getState().revision !== revision) return;
  const eligible = data.models.filter(model => !model.capabilities.length || model.capabilities.includes('chat') || model.capabilities.includes('unknown'));
  useModelAccess.setState({ models: data.models, fetchedAt: data.fetchedAt, note: data.note, model: eligible.find(model => model.capabilities.includes('chat'))?.id || eligible[0]?.id || '' });
}
export function suggestKeyProvider(key: string): string | null {
  if (key.startsWith('sk-ant')) return 'anthropic';
  if (key.startsWith('sk-proj') || key.startsWith('sk-svcacct')) return 'openai';
  if (key.startsWith('AIza')) return 'gemini';
  return null;
}

const messages: Record<string, string> = {
  VALIDATION: '配置或内容格式不符合要求，请检查密钥、模型 ID 与资料长度。',
  PROVIDER_AUTH: '所选服务未接受这份密钥，请检查厂商、权限与有效期。',
  PROVIDER_LIMIT: '所选服务的额度或请求限制已触发，请检查该账号的配额后再试。',
  PROVIDER_ERROR: '所选服务暂未完成请求，问题与配置仍保留，可稍后重试。',
  DISCOVERY_UNSUPPORTED: '此接口不支持用 API Key 获取完整模型目录，请查看官方文档并手动填写模型 ID。',
  NOT_CONFIGURED: '此服务或自定义地址尚未由部署管理员启用，请选择其他服务。',
  BASE_URL_NOT_ALLOWED: '该服务地址不在允许范围内，请使用所选厂商的官方 HTTPS 地址；自定义服务由管理员预置。',
  MODEL_NOT_ALLOWED: '这个模型不适合当前临时问答，请选择聊天模型或核对手动输入的模型 ID。',
  NETWORK: '暂时无法连接模型访问服务，配置和问题均已保留。',
  TIMEOUT: '请求已超时，问题已保留。再次发送可能产生新的服务商用量，请先核对。',
  CANCELLED: '已停止等待。服务商仍可能处理已送达的请求并计费。',
  INCOMPLETE: '服务商没有返回完整回答，问题已保留，可调整后重试。',
  RESPONSE_TOO_LARGE: '服务响应超过处理上限，请缩小问题或资料范围。',
  INVALID_RESPONSE: '服务响应格式暂不受支持，可核对模型与接口协议后重试。',
  RATE_LIMITED: '操作过于频繁，请稍候再手动重试。',
};
class ModelAccessRequestError extends Error {
  readonly code: string;
  constructor(code: string) { super('Model access request failed'); this.code = code; }
}
export function modelAccessError(error: unknown) {
  return error instanceof ModelAccessRequestError ? messages[error.code] || '请求未完成，配置与问题已保留；请核对所选服务后重试。' : '请求未完成，配置与问题已保留；请稍后重试。';
}
export function formatModelAccessAnswer(result: ModelAccessAnswer) {
  return `# 临时 AI 学习记录\n\n服务：${result.providerId || '未记录'}\n模型：${result.model}\n\n## 问题\n${result.question || '未记录'}\n\n## 回答\n${result.answer}\n\n## 本次附带的资料\n${result.context?.length ? result.context.map((source, index) => `### [资料 ${index + 1}] ${source.title}\n${source.text}`).join('\n\n') : '本次未附带资料。'}\n\nAI 回答可能有误，请结合原资料核实。`;
}
const base = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '');
async function request<T>(path: string, body?: unknown, signal?: AbortSignal, timeoutMs = 30000): Promise<T> {
  const abort = new AbortController(); let timedOut = false;
  const cancel = () => abort.abort(); signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) abort.abort();
  const timer = setTimeout(() => { timedOut = true; abort.abort(); }, timeoutMs);
  try {
    const response = await fetch(`${base}/model-access/${path}`, {
      method: body === undefined ? 'GET' : 'POST', credentials: hostingCredentials, cache: 'no-store', redirect: 'error',
      headers: { ...hostingHeaders(),  'Content-Type': 'application/json' }, signal: abort.signal,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json().catch(() => { throw new ModelAccessRequestError('INVALID_RESPONSE'); });
    if (!response.ok) throw new ModelAccessRequestError(typeof data?.code === 'string' ? data.code : response.status === 429 ? 'RATE_LIMITED' : 'PROVIDER_ERROR');
    return data as T;
  } catch (error) {
    if (error instanceof ModelAccessRequestError) throw error;
    throw new ModelAccessRequestError(timedOut ? 'TIMEOUT' : abort.signal.aborted ? 'CANCELLED' : 'NETWORK');
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}
function hideKey(value: string, key: string) { return key ? value.replaceAll(key, '[API Key 已隐藏]') : value; }
export const modelAccess = {
  catalog: (signal?: AbortSignal) => request<{ providers: ModelAccessProvider[] }>('catalog', undefined, signal),
  async discover(credentials: ModelCredentials, signal?: AbortSignal): Promise<ModelDiscovery> {
    const result = await request<ModelDiscovery>('discover', credentials, signal);
    if (!Array.isArray(result.models) || typeof result.providerId !== 'string') throw new ModelAccessRequestError('INVALID_RESPONSE');
    return { providerId: result.providerId, fetchedAt: typeof result.fetchedAt === 'string' ? result.fetchedAt : '', note: hideKey(typeof result.note === 'string' ? result.note : '', credentials.apiKey), models: result.models.filter(model => typeof model.id === 'string' && !model.id.includes(credentials.apiKey)).map(model => ({ id: model.id, capabilities: Array.isArray(model.capabilities) ? model.capabilities.filter(capability => ['chat', 'embedding', 'unknown'].includes(capability)) : [] })) };
  },
  async complete(credentials: ModelCredentials, model: string, message: string, context: ModelAccessContext[], signal?: AbortSignal): Promise<ModelAccessAnswer> {
    const result = await request<ModelAccessAnswer>('complete', { ...credentials, model, message, ...(context.length ? { context } : {}) }, signal, 90000);
    if (typeof result.answer !== 'string' || typeof result.model !== 'string') throw new ModelAccessRequestError('INVALID_RESPONSE');
    return { answer: hideKey(result.answer, credentials.apiKey), model: hideKey(result.model, credentials.apiKey), usage: {
      inputTokens: typeof result.usage?.inputTokens === 'number' && Number.isFinite(result.usage.inputTokens) ? result.usage.inputTokens : undefined,
      outputTokens: typeof result.usage?.outputTokens === 'number' && Number.isFinite(result.usage.outputTokens) ? result.usage.outputTokens : undefined,
    } };
  },
};
