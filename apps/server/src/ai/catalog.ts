import { z } from 'zod';

export type Protocol = 'openai' | 'anthropic' | 'gemini';
export type Provider = {
  id: string; name: string; protocol: Protocol; baseUrl: string; key: string;
  chatModels: string[]; embeddingModels: string[]; configured: boolean;
  tokenParameter: 'max_tokens' | 'max_completion_tokens'; documentation: string;
};
// Endpoints and allowlists are deployment configuration, never accepted from a client request.
const presets: Array<[string, string, Protocol, string, string]> = [
  ['deepseek', 'DeepSeek', 'openai', 'https://api.deepseek.com/v1', 'https://api-docs.deepseek.com/'],
  ['bailian', '阿里云百炼 · 通义', 'openai', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'https://help.aliyun.com/zh/model-studio/'],
  ['moonshot', '月之暗面 · Kimi', 'openai', 'https://api.moonshot.cn/v1', 'https://platform.moonshot.cn/docs'],
  ['zhipu', '智谱 · GLM', 'openai', 'https://open.bigmodel.cn/api/paas/v4', 'https://docs.bigmodel.cn/'],
  ['siliconflow', '硅基流动', 'openai', 'https://api.siliconflow.cn/v1', 'https://docs.siliconflow.cn/'],
  ['ark', '火山方舟 · 豆包', 'openai', 'https://ark.cn-beijing.volces.com/api/v3', 'https://www.volcengine.com/docs/82379'],
  ['hunyuan', '腾讯混元', 'openai', 'https://api.hunyuan.cloud.tencent.com/v1', 'https://cloud.tencent.com/document/product/1729'],
  ['huawei', '华为云 MaaS / ModelArts', 'openai', '', 'https://support.huaweicloud.com/modelarts/'],
  ['openai', 'OpenAI', 'openai', 'https://api.openai.com/v1', 'https://platform.openai.com/docs/api-reference'],
  ['anthropic', 'Anthropic · Claude', 'anthropic', 'https://api.anthropic.com/v1', 'https://platform.claude.com/docs/en/api/overview'],
  ['gemini', 'Google · Gemini', 'gemini', 'https://generativelanguage.googleapis.com/v1beta', 'https://ai.google.dev/api'],
  ['openrouter', 'OpenRouter', 'openai', 'https://openrouter.ai/api/v1', 'https://openrouter.ai/docs'],
  ['ollama', '本地 Ollama', 'openai', 'http://127.0.0.1:11434/v1', 'https://docs.ollama.com/api/openai-compatibility'],
  ['custom', '自建 OpenAI 兼容服务', 'openai', '', ''],
];
const modelName = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9_.:/@-]*$/);
export function modelList(raw = ''): string[] {
  return [...new Set(raw.split(',').map(x => x.trim()).filter(Boolean).map(x => modelName.parse(x)))].slice(0, 100);
}
export function validBaseUrl(raw: string, local: boolean): string {
  const u = new URL(raw);
  if (u.username || u.password || u.search || u.hash) throw new Error('模型地址不能含认证信息、查询参数或片段');
  if (u.protocol !== 'https:' && !(local && u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname))) {
    throw new Error('云端模型地址必须使用 HTTPS；Ollama 可使用回环 HTTP 地址');
  }
  return u.toString().replace(/\/+$/, '');
}
export function providers(env: NodeJS.ProcessEnv = process.env): Provider[] {
  return presets.map(([id, name, protocol, defaultBase, documentation]) => {
    const prefix = 'AI_' + id.toUpperCase();
    const key = env[prefix + '_API_KEY'] || (id === 'deepseek' ? env.DEEPSEEK_API_KEY : '') || '';
    const rawBase = env[prefix + '_BASE_URL'] || defaultBase;
    let baseUrl = '', chatModels: string[] = [], embeddingModels: string[] = [];
    try {
      baseUrl = rawBase ? validBaseUrl(rawBase, id === 'ollama') : '';
      chatModels = modelList(env[prefix + '_CHAT_MODELS'] || (id === 'deepseek' && key ? (env.DEEPSEEK_MODEL || 'deepseek-flash') : ''));
      embeddingModels = protocol === 'anthropic' ? [] : modelList(env[prefix + '_EMBEDDING_MODELS']);
    } catch { baseUrl = ''; chatModels = []; embeddingModels = []; }
    const configured = Boolean(baseUrl && (key || (id === 'ollama' && env.AI_OLLAMA_ENABLED === 'true')) && (chatModels.length || embeddingModels.length));
    return { id, name, protocol, baseUrl, key, chatModels, embeddingModels, configured, documentation,
      tokenParameter: env[prefix + '_TOKEN_PARAMETER'] === 'max_tokens' ? 'max_tokens' : env[prefix + '_TOKEN_PARAMETER'] === 'max_completion_tokens' || id === 'openai' ? 'max_completion_tokens' : 'max_tokens' };
  });
}
export function catalog() {
  return providers().map(({ key, baseUrl, tokenParameter, ...safe }) => safe);
}
export class AIError extends Error {
  constructor(public code: string, message: string, public status = 502) { super(message); }
}
export function selectedProvider(id: string, model: string, capability: 'chat' | 'embedding'): Provider {
  const p = providers().find(x => x.id === id);
  if (!p?.configured) throw new AIError('NOT_CONFIGURED', '该服务尚未配置，请选择已启用的服务', 503);
  if (!(capability === 'chat' ? p.chatModels : p.embeddingModels).includes(model)) {
    throw new AIError('MODEL_NOT_ALLOWED', '该模型未被管理员启用，或不支持所选用途', 400);
  }
  return p;
}
