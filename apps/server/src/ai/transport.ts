import { AIError, Provider } from './catalog';

export type Message = { role: 'system' | 'user' | 'assistant'; content: string };
type Transport = typeof fetch;
export type Usage = { inputTokens?: number; outputTokens?: number };
const MAX_BYTES = 2 * 1024 * 1024;
function headers(p: Provider): Record<string, string> {
  if (p.protocol === 'anthropic') return { 'Content-Type': 'application/json', 'x-api-key': p.key, 'anthropic-version': '2023-06-01' };
  if (p.protocol === 'gemini') return { 'Content-Type': 'application/json', 'x-goog-api-key': p.key };
  return { 'Content-Type': 'application/json', ...(p.key ? { Authorization: 'Bearer ' + p.key } : {}) };
}
export async function requestJson(p: Provider, path: string, body: unknown, signal?: AbortSignal, transport: Transport = fetch): Promise<any> {
  const timeout = AbortSignal.timeout(75_000);
  try {
    const r = await transport(p.baseUrl + path, { method: body === undefined ? 'GET' : 'POST', headers: headers(p),
      body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: signal ? AbortSignal.any([timeout, signal]) : timeout });
    if (!r.ok) {
      await r.body?.cancel();
      const code = [401, 403].includes(r.status) ? 'PROVIDER_AUTH' : r.status === 429 ? 'PROVIDER_LIMIT' : 'PROVIDER_ERROR';
      throw new AIError(code, code === 'PROVIDER_AUTH' ? '模型服务认证失败，请管理员检查密钥和权限' : code === 'PROVIDER_LIMIT' ? '模型额度或频率受限，请稍后重试' : `模型服务返回异常（${r.status}）`);
    }
    if (!r.body) throw new AIError('EMPTY_RESPONSE', '模型服务返回空响应');
    const reader = r.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
    try {
      for (;;) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength;
        if (bytes > MAX_BYTES) throw new AIError('RESPONSE_TOO_LARGE', '模型响应过大，请缩小问题后重试'); chunks.push(part.value); }
      try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { throw new AIError('INVALID_RESPONSE', '模型服务返回了无法解析的响应'); }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  } catch (e) {
    if (e instanceof AIError) throw e;
    if (signal?.aborted) throw new AIError('CANCELLED', '已停止生成', 409);
    if (timeout.aborted) throw new AIError('TIMEOUT', '模型响应超时，请重试或选择其他模型', 504);
    throw new AIError('NETWORK', '无法连接模型服务，请检查服务配置与网络');
  }
}
const count = (x: unknown) => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0 ? x : undefined;
export async function complete(p: Provider, model: string, messages: Message[], signal?: AbortSignal, transport: Transport = fetch) {
  const system = messages.filter(x => x.role === 'system').map(x => x.content).join('\n');
  const turns = messages.filter(x => x.role !== 'system');
  let data: any, content: unknown, stop: unknown, usage: Usage;
  if (p.protocol === 'anthropic') {
    data = await requestJson(p, '/messages', { model, system, messages: turns, max_tokens: 2048 }, signal, transport);
    content = data.content?.filter((x: any) => x.type === 'text').map((x: any) => x.text).join('\n');
    stop = data.stop_reason === 'end_turn' || data.stop_reason === 'stop_sequence';
    usage = { inputTokens: count(data.usage?.input_tokens), outputTokens: count(data.usage?.output_tokens) };
  } else if (p.protocol === 'gemini') {
    data = await requestJson(p, '/models/' + encodeURIComponent(model) + ':generateContent', {
      systemInstruction: { parts: [{ text: system }] }, contents: turns.map(x => ({ role: x.role === 'assistant' ? 'model' : 'user', parts: [{ text: x.content }] })),
      generationConfig: { maxOutputTokens: 2048 },
    }, signal, transport);
    content = data.candidates?.[0]?.content?.parts?.filter((x: any) => !x.thought && typeof x.text === 'string').map((x: any) => x.text).join('\n');
    stop = data.candidates?.[0]?.finishReason === 'STOP';
    usage = { inputTokens: count(data.usageMetadata?.promptTokenCount), outputTokens: count(data.usageMetadata?.candidatesTokenCount) };
  } else {
    data = await requestJson(p, '/chat/completions', { model, messages, stream: false, [p.tokenParameter]: 2048 }, signal, transport);
    content = data.choices?.[0]?.message?.content; stop = data.choices?.[0]?.finish_reason === 'stop';
    usage = { inputTokens: count(data.usage?.prompt_tokens), outputTokens: count(data.usage?.completion_tokens) };
  }
  if (!stop) throw new AIError('INCOMPLETE', '模型未完整生成答案（可能达到长度限制或内容被拦截），请缩小问题后重试');
  if (typeof content !== 'string' || !content.trim() || content.length > 32000) throw new AIError('INVALID_RESPONSE', '模型未返回有效的文本答案');
  return { content, usage };
}
export async function embed(p: Provider, model: string, texts: string[], signal?: AbortSignal, transport: Transport = fetch): Promise<number[][]> {
  if (p.protocol === 'anthropic') throw new AIError('UNSUPPORTED', 'Claude 原生协议不提供向量模型', 400);
  if (!texts.length || texts.length > 40 || texts.some(x => x.length > 8000)) throw new AIError('EMBEDDING_LIMIT', '向量请求超出批次限制', 400);
  const data = p.protocol === 'gemini'
    ? await requestJson(p, '/models/' + encodeURIComponent(model) + ':batchEmbedContents', { requests: texts.map(text => ({ model: 'models/' + model, content: { parts: [{ text }] } })) }, signal, transport)
    : await requestJson(p, '/embeddings', { model, input: texts, encoding_format: 'float' }, signal, transport);
  let vectors: number[][];
  if (p.protocol === 'gemini') vectors = data.embeddings?.map((x: any) => x.values);
  else {
    if (!Array.isArray(data.data) || new Set(data.data.map((x: any) => x.index)).size !== texts.length) throw new AIError('INVALID_EMBEDDING', '向量响应索引不完整');
    vectors = [...data.data].sort((a: any, b: any) => a.index - b.index).map((x: any, i) => { if (x.index !== i) throw new AIError('INVALID_EMBEDDING', '向量响应顺序无效'); return x.embedding; });
  }
  const dims = vectors?.[0]?.length;
  if (!Array.isArray(vectors) || vectors.length !== texts.length || !dims || dims > 65536 || vectors.some(v => !Array.isArray(v) || v.length !== dims || v.some(x => typeof x !== 'number' || !Number.isFinite(x)) || !v.some(x => x !== 0))) {
    throw new AIError('INVALID_EMBEDDING', '向量响应数量、维度或数值无效');
  }
  return vectors;
}
export async function discover(p: Provider) {
  const data = await requestJson(p, '/models', undefined);
  const items = p.protocol === 'gemini' ? data.models : data.data;
  if (!Array.isArray(items)) throw new AIError('DISCOVERY_UNSUPPORTED', '该服务未提供模型发现接口，请管理员手动配置');
  return items.slice(0, 500).map((x: any) => ({ id: String(x.id || x.name || '').replace(/^models\//, '').slice(0, 160),
    methods: Array.isArray(x.supportedGenerationMethods) ? x.supportedGenerationMethods.filter((s: any) => typeof s === 'string') : [] })).filter(x => x.id);
}
