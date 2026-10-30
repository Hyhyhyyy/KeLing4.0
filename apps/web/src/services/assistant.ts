import api from './api';
import { isGuestSession } from './guestSession';
export interface ModelProvider { id: string; name: string; protocol: string; configured: boolean; chatModels: string[]; embeddingModels: string[]; documentation: string }
export interface AssistantSession { id: string; title: string; providerId: string; modelId: string; scenario: string; includeContext: boolean; retrievalMode: string; embeddingProviderId: string; embeddingModelId: string; activeRequestId: string; updatedAt: string }
export interface Source { id: string; title: string; text: string; kind: string; updatedAt?: string; truncated?: boolean }
export interface ContextRef { kind: 'course' | 'note' | 'task'; id: string }
export interface ContextPreview { ref: ContextRef; title: string; fingerprint: string; sources: Source[]; warnings: string[] }
export type ContextAttachment = ContextRef & { fingerprint: string };
export interface Turn { id: string; status: string; userText: string; assistantText: string; error: string; errorCode: string; modelId: string; providerId: string; sources: Source[]; usage: { inputTokens?: number; outputTokens?: number }; createdAt: string }
export type SessionInput = Omit<AssistantSession, 'id' | 'activeRequestId' | 'updatedAt'>;
export const assistant = {
  catalog: (signal?: AbortSignal) => api.get<{ providers: ModelProvider[] }>('/ai/catalog', { signal }),
  sessions: (signal?: AbortSignal) => api.get<{ sessions: AssistantSession[] }>('/ai/sessions', { signal }),
  create: (data: SessionInput) => api.post<{ session: AssistantSession }>('/ai/sessions', data),
  get: (id: string, signal?: AbortSignal) => api.get<{ session: AssistantSession; turns: Turn[] }>(`/ai/sessions/${id}`, { signal }),
  preview: (ref: ContextRef, signal?: AbortSignal) => api.post<ContextPreview>('/ai/context-preview', ref, { signal }),
  send: (id: string, message: string, clientRequestId: string, context?: ContextAttachment) => api.post(`/ai/sessions/${id}/turns`, { message, clientRequestId, ...(context ? { context } : {}) }),
  cancel: (id: string) => api.post(`/ai/sessions/${id}/cancel`),
  remove: (id: string) => api.delete(`/ai/sessions/${id}`),
  saveNote: (id: string) => api.post(`/ai/turns/${id}/note`),
  discover: (id: string) => api.get<{ models: { id: string }[]; note: string }>(`/ai/providers/${id}/models`),
};
export function assistantError(error: unknown) {
  const e = error as { response?: { data?: { error?: string } } };
  return e.response?.data?.error || (isGuestSession() ? '连接暂时中断，请重新连接会话；内容仅在本次内存，不会云端保存。' : '连接暂时中断，请刷新会话；已提交的请求会继续保存在服务端');
}
export function assistantErrorCode(error: unknown) {
  return (error as { response?: { data?: { code?: string } } }).response?.data?.code;
}
