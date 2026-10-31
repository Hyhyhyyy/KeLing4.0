import { hostingCredentials, hostingHeaders } from './appPath';
import api, { knowledgeAPI } from './api';
import { getGuestSessionId, subscribeGuestSession } from './guestSession';
import { getGuestWorkspace } from './guestData';
import { currentExpeditionScope } from './expedition';
import type { ExpeditionScope } from './expeditionStorage';
export interface MaterialInput { title: string; sourceName: string; format: 'TEXT' | 'MARKDOWN' | 'PDF'; text?: string; pdfBase64?: string }
export interface MaterialSpan { id?: string; ordinal: number; startUtf16: number; endUtf16: number; page: number | null; paragraphIndex: number; heading: string; textHash: string }
export interface ParsedMaterial extends Omit<MaterialInput, 'text' | 'pdfBase64'> { content: string; contentHash: string; spans: MaterialSpan[]; warnings: string[]; parserVersion: string; parseStatus: 'READY' }
export interface LearningMaterial extends Omit<ParsedMaterial, 'format'> { format: ParsedMaterial['format'] | 'SEED'; id: string; materialId: string; version: number; courseId: string; deletedAt: string | null }
export interface MaterialCandidate { title: string; description: string; source: { materialVersionId: string; spanId: string; contentHash: string; startUtf16: number; endUtf16: number; page: number | null; paragraphIndex: number; title: string; text: string } }
export type TutorSource = MaterialCandidate['source'];
let materials: LearningMaterial[] = [];
const saves = new Map<string, string>();
const confirmations = new Map<string, { hash: string; promise: Promise<unknown> }>();
subscribeGuestSession(() => { materials = []; confirmations.clear(); saves.clear(); });
const base = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '');
export function checkLearningScope(scope: ExpeditionScope) { const active = currentExpeditionScope(); if (!active || scope.kind !== active.kind || scope.id !== active.id) throw new Error('学习空间已切换，旧请求已停止。'); }
export async function publicLearningRequest<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(base + '/learning/v1' + path, { method: 'POST', headers: { ...hostingHeaders(),  'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: hostingCredentials, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30000) });
  const data = await response.json(); if (!response.ok) throw Object.assign(new Error(data.error || '资料处理失败'), { response: { status: response.status, data } }); return data;
}
export async function parseLearningMaterial(scope: ExpeditionScope, input: MaterialInput) { checkLearningScope(scope); const data = await publicLearningRequest<ParsedMaterial>('/materials/parse', input); checkLearningScope(scope); return data; }
export async function listLearningMaterials(scope: ExpeditionScope, courseId: string): Promise<LearningMaterial[]> {
  checkLearningScope(scope);
  if (scope.kind === 'guest') return structuredClone(materials.filter(item => item.courseId === courseId && !item.deletedAt && !materials.some(other => other.materialId === item.materialId && other.version > item.version)));
  const { data } = await api.get<{ materials: LearningMaterial[] }>(`/learning/v1/courses/${courseId}/materials`); checkLearningScope(scope); return data.materials;
}
export async function readLearningMaterial(scope: ExpeditionScope, id: string): Promise<LearningMaterial> {
  checkLearningScope(scope);
  if (scope.kind === 'guest') { const material = materials.find(item => item.id === id); if (!material) throw new Error('本次资料不存在'); return structuredClone(material); }
  const { data } = await api.get<{ material: LearningMaterial }>(`/learning/v1/materials/${id}`); checkLearningScope(scope); return data.material;
}
export async function saveLearningMaterial(scope: ExpeditionScope, courseId: string, input: MaterialInput, parsed: ParsedMaterial, opId: string, previous?: LearningMaterial) {
  checkLearningScope(scope);
  if (scope.kind === 'account') {
    const { data } = await api.post<{ material: LearningMaterial }>(`/learning/v1/courses/${courseId}/materials`, { ...input, opId, ...(previous ? { materialId: previous.materialId, expectedVersionId: previous.id } : {}) }); checkLearningScope(scope); return data.material;
  }
  if (!getGuestWorkspace().courses.some(course => course.id === courseId)) throw new Error('课程已不存在');
  const hash = JSON.stringify({ courseId, input, parsed, previous: previous?.id });
  const id = `guest-material:${opId}`, replay = materials.find(item => item.id === id); if (replay) { if (saves.get(opId) !== hash) throw new Error('操作编号冲突'); return structuredClone(replay); }
  if (previous && !materials.some(item => item.id === previous.id && !item.deletedAt && !materials.some(other => other.materialId === item.materialId && other.version > item.version))) throw new Error('资料版本已变化，请保留草稿后刷新');
  const material: LearningMaterial = { ...structuredClone(parsed), id, materialId: previous?.materialId || crypto.randomUUID(), version: (previous?.version || 0) + 1, courseId, deletedAt: null,
    spans: parsed.spans.map(span => ({ ...span, id: `${id}:${span.ordinal}` })) };
  saves.set(opId, hash); materials.push(material); return structuredClone(material);
}
export async function deleteLearningMaterial(scope: ExpeditionScope, id: string) {
  checkLearningScope(scope);
  if (scope.kind === 'account') { await api.delete(`/learning/v1/materials/${id}`, { data: { opId: crypto.randomUUID() } }); checkLearningScope(scope); return; }
  const selected = materials.find(item => item.id === id); if (!selected) throw new Error('资料不存在');
  materials.forEach(item => { if (item.materialId === selected.materialId) item.deletedAt = new Date().toISOString(); });
}
export async function proposeMaterialMap(scope: ExpeditionScope, courseId: string, ids: string[]): Promise<MaterialCandidate[]> {
  checkLearningScope(scope);
  if (scope.kind === 'account') { const { data } = await api.post<{ candidates: MaterialCandidate[] }>(`/learning/v1/courses/${courseId}/map-draft`, { materialVersionIds: ids }); checkLearningScope(scope); return data.candidates; }
  const current = await listLearningMaterials(scope, courseId);
  if (ids.some(id => !current.some(item => item.id === id))) throw new Error('选择的资料版本已失效');
  return current.filter(item => ids.includes(item.id)).flatMap(material => material.spans.map(span => {
    const text = material.content.slice(span.startUtf16, span.endUtf16);
    return { title: (span.heading || text.split(/[\n。.!?！？]/)[0]).slice(0, 80), description: text.slice(0, 600), source: { materialVersionId: material.id, spanId: span.id!, contentHash: material.contentHash, startUtf16: span.startUtf16, endUtf16: span.endUtf16, page: span.page, paragraphIndex: span.paragraphIndex, title: material.title, text } };
  })).slice(0, 12);
}
export async function confirmMaterialMap(scope: ExpeditionScope, courseId: string, candidates: MaterialCandidate[], opId: string) {
  checkLearningScope(scope);
  if (scope.kind === 'account') { const { data } = await api.post(`/learning/v1/courses/${courseId}/map-confirm`, { opId, candidates: candidates.map(item => ({ title: item.title, description: item.description, materialVersionId: item.source.materialVersionId, spanId: item.source.spanId, contentHash: item.source.contentHash })) }); checkLearningScope(scope); return data; }
  const hash = JSON.stringify({ courseId, candidates }), existing = confirmations.get(opId);
  if (existing) { if (existing.hash !== hash) throw new Error('确认编号已用于其他内容'); return existing.promise; }
  const session = getGuestSessionId();
  const promise = (async () => {
    const current = await listLearningMaterials(scope, courseId); checkLearningScope(scope);
    if (session !== getGuestSessionId() || candidates.some(item => !current.some(material => material.id === item.source.materialVersionId && material.contentHash === item.source.contentHash && material.spans.some(span => span.id === item.source.spanId)))) throw new Error('候选引用已变化，请重新预览。');
    return (await knowledgeAPI.batchCreateNodes(courseId, { nodes: candidates.map((item, index) => ({ name: item.title, description: `${item.description}\n\n来源：${item.source.title} · ${item.source.materialVersionId}#${item.source.spanId}`, positionX: .15 + index % 3 * .3, positionY: .15 + Math.floor(index / 3) * .2 })) })).data;
  })();
  confirmations.set(opId, { hash, promise });
  try { return await promise; } catch (error) { if (session === getGuestSessionId()) confirmations.delete(opId); throw error; }
}
export async function previewTutorSources(scope: ExpeditionScope, courseId: string, ids: string[], question: string): Promise<TutorSource[]> {
  checkLearningScope(scope);
  if (scope.kind === 'account') {
    const { data } = await api.post<{ sources: TutorSource[] }>(`/learning/v1/courses/${courseId}/materials/search`, { query: question.slice(0, 1000), materialVersionIds: ids });
    checkLearningScope(scope); return data.sources;
  }
  const candidates = await proposeMaterialMap(scope, courseId, ids);
  checkLearningScope(scope);
  // Visitors review the exact three snippets before opting in to a model call.
  return candidates.slice(0, 3).map(candidate => { const text = candidate.source.text.slice(0, 1600); return { ...candidate.source, text, endUtf16: candidate.source.startUtf16 + text.length }; });
}
export async function assertTutorSourcesCurrent(scope: ExpeditionScope, courseId: string, sources: TutorSource[]) {
  const current = await listLearningMaterials(scope, courseId); checkLearningScope(scope);
  if (sources.some(source => !current.some(material => material.id === source.materialVersionId && material.contentHash === source.contentHash && !material.deletedAt))) throw new Error('模型生成期间或保存前资料已变化，请重新预览来源后提问。');
}
export function guestMaterialContext(courseId: string) {
  if (!getGuestSessionId()) return [];
  return materials.filter(material => material.courseId === courseId && !material.deletedAt && !materials.some(other => other.materialId === material.materialId && other.version > material.version)).slice(-3).flatMap(material => {
    const span = material.spans[0]; if (!span) return [];
    const text = material.content.slice(span.startUtf16, span.endUtf16).slice(0, 1200);
    return [{ id: span.id!, kind: 'material', title: `${material.title} v${material.version}`,
      text: `资料版本 ${material.id}\n内容摘要 SHA256 ${material.contentHash}\n${span.page ? `第${span.page}页` : `第${span.paragraphIndex + 1}段`}，字符 ${span.startUtf16}–${span.startUtf16 + text.length}\n\n${text}`,
      updatedAt: `version:${material.version}`, truncated: span.endUtf16 - span.startUtf16 > text.length || span.endUtf16 < material.content.length }];
  });
}
