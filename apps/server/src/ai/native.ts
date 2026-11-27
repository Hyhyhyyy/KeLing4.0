import { AIError } from './catalog';

export type NativeAiMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type NativeAiRequest = { messages: NativeAiMessage[]; maxOutputTokens: number; signal: AbortSignal; purpose?: 'study-plan' };
export type NativeAiResult = { content: string; usage?: { inputTokens?: number; outputTokens?: number } };
export type NativeAiBridge = {
  providerId: 'miaoda'; name: '妙搭公共模型'; modelId: 'miaoda-chat'; publicEnabled: boolean;
  complete: (request: NativeAiRequest) => Promise<NativeAiResult>;
};
let bridge: NativeAiBridge | undefined;
/** Only the trusted host adapter registers a capability; clients cannot supply callbacks or destinations. */
export function registerNativeAiBridge(value: NativeAiBridge | undefined): void {
  if (value && (value.providerId !== 'miaoda' || value.modelId !== 'miaoda-chat' || value.name !== '妙搭公共模型' || typeof value.complete !== 'function')) throw new Error('Unsupported native AI registration');
  bridge = value;
}
export function nativeAiBridge() { return bridge; }
export async function completeNativeAi(model: string, messages: NativeAiMessage[], maxOutputTokens: number, signal?: AbortSignal, purpose?: 'study-plan') {
  const current = bridge;
  if (!current) throw new AIError('NOT_CONFIGURED', '公共模型尚未连接', 503);
  if (model !== current.modelId) throw new AIError('MODEL_NOT_ALLOWED', '所选公共模型未启用', 400);
  if (!messages.length || messages.length > 100 || messages.some(m => !['system', 'user', 'assistant'].includes(m.role) || typeof m.content !== 'string') || messages.reduce((n, m) => n + m.content.length, 0) > 120000) throw new AIError('VALIDATION', '对话超出本次模型范围，请缩小资料后重试', 400);
  const timeout = AbortSignal.timeout(120000), combined = signal ? AbortSignal.any([timeout, signal]) : timeout;
  let stop: (() => void) | undefined;
  try {
    if (combined.aborted) throw new AIError('CANCELLED', '已停止等待模型', 409);
    const result = await Promise.race([current.complete({ messages, maxOutputTokens, signal: combined, ...(purpose?{purpose}:{}) }), new Promise<never>((_, reject) => {
      stop = () => reject(new AIError(signal?.aborted ? 'CANCELLED' : 'TIMEOUT', signal?.aborted ? '已停止等待模型' : '公共模型响应超时，请重试', signal?.aborted ? 409 : 504));
      combined.addEventListener('abort', stop, { once: true });
    })]);
    if(combined.aborted)throw new AIError(signal?.aborted?'CANCELLED':'TIMEOUT',signal?.aborted?'已停止等待模型':'公共模型响应超时，请重试',signal?.aborted?409:504);
    if (typeof result?.content !== 'string' || !result.content.trim() || result.content.length > 32000) throw new AIError('INVALID_RESPONSE', '公共模型未返回完整有效的文本答案');
    const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
    return { content: result.content, usage: { inputTokens: count(result.usage?.inputTokens), outputTokens: count(result.usage?.outputTokens) } };
  } catch (error) {
    if (error instanceof AIError) throw error;
    throw new AIError('NATIVE_MODEL_FAILED', '妙搭公共模型暂时未能完成生成，请重试');
  } finally { if (stop) combined.removeEventListener('abort', stop); }
}
