import dagre from '@dagrejs/dagre';

export const PROTOCOL = 1;
export const WORLD_SIZE = 4096;
export const CARD = { width: 284, height: 120 };
export interface GraphNode {
  id: string; name: string; description: string; parentIds: string[];
  masteryLevel: number; difficulty: number; positionX: number; positionY: number;
}
export interface GraphPosition { id: string; positionX: number; positionY: number }
export interface GraphInput { nodes: GraphNode[]; layoutSaved: boolean; savedNodeIds: string[]; sessionId: string; courseId: string; readOnly?: boolean; fontUrl?: string }
const bounded = (value: unknown, fallback: number, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
const text = (value: unknown, max: number) => typeof value === 'string' ? value.slice(0, max) : '';
export function validateGraphInput(value: unknown): GraphInput {
  if (!value || typeof value !== 'object') throw new Error('图谱数据无效');
  const input = value as Record<string, unknown>;
  if (typeof input.courseId !== 'string' || !input.courseId || typeof input.sessionId !== 'string' || !input.sessionId) throw new Error('图谱学习空间无效');
  if (!Array.isArray(input.nodes) || input.nodes.length > 500) throw new Error('图谱最多显示 500 个知识点');
  const seen = new Set<string>();
  const nodes = input.nodes.map((raw: unknown): GraphNode => {
    if (!raw || typeof raw !== 'object') throw new Error('知识点格式无效');
    const node = raw as Record<string, unknown>;
    if (typeof node.id !== 'string' || !node.id || node.id.length > 180 || seen.has(node.id)) throw new Error('知识点标识重复或无效');
    seen.add(node.id);
    return { id: node.id, name: text(node.name, 180), description: text(node.description, 600),
      parentIds: Array.isArray(node.parentIds) ? [...new Set(node.parentIds.filter((id): id is string => typeof id === 'string' && id !== node.id))] : [],
      masteryLevel: bounded(node.masteryLevel, 0, 0, 1), difficulty: Math.round(bounded(node.difficulty, 1, 1, 5)),
      positionX: bounded(node.positionX, .5, 0, 1), positionY: bounded(node.positionY, .5, 0, 1) };
  });
  return { courseId: input.courseId, sessionId: input.sessionId, nodes, layoutSaved: input.layoutSaved === true,
    savedNodeIds: Array.isArray(input.savedNodeIds) ? input.savedNodeIds.filter((id): id is string => typeof id === 'string' && seen.has(id)) : [],
    readOnly: input.readOnly === true, fontUrl: typeof input.fontUrl === 'string' ? input.fontUrl : undefined };
}
export function graphEdges(nodes: GraphNode[]) {
  const ids = new Set(nodes.map(node => node.id));
  return nodes.flatMap(node => node.parentIds.filter(parent => ids.has(parent)).map(parent => ({ source: parent, target: node.id })));
}
export function automaticLayout(nodes: GraphNode[]) {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: 'LR', ranksep: 84, nodesep: 36, edgesep: 24, marginx: 90, marginy: 90 });
  graph.setDefaultEdgeLabel(() => ({}));
  [...nodes].sort((a,b) => a.id.localeCompare(b.id)).forEach(node => graph.setNode(node.id, { width: CARD.width, height: CARD.height }));
  graphEdges(nodes).forEach(edge => graph.setEdge(edge.source, edge.target));
  dagre.layout(graph);
  const extent = graph.graph();
  const scale = Math.min(1, (WORLD_SIZE - 160) / Math.max(extent.width || 1, extent.height || 1));
  const positions = nodes.map(node => { const point = graph.node(node.id); return { id: node.id,
    positionX: (point.x * scale + 80) / WORLD_SIZE, positionY: (point.y * scale + 80) / WORLD_SIZE }; });
  return { positions, scale };
}
export function normalizedPosition(id: string, x: number, y: number, width: number, height: number): GraphPosition {
  return { id, positionX: Math.max(width / 2, Math.min(WORLD_SIZE - width / 2, x + width / 2)) / WORLD_SIZE,
    positionY: Math.max(height / 2, Math.min(WORLD_SIZE - height / 2, y + height / 2)) / WORLD_SIZE };
}
export function positionFingerprint(positions: GraphPosition[]) {
  return JSON.stringify([...positions].sort((a,b) => a.id.localeCompare(b.id)).map(p => [p.id, Number(p.positionX.toFixed(7)), Number(p.positionY.toFixed(7))]));
}
export function initialLayout(input: GraphInput) {
  const auto = automaticLayout(input.nodes), saved = new Set(input.layoutSaved ? input.nodes.map(n => n.id) : input.savedNodeIds);
  if (!saved.size) return auto;
  const positions: GraphPosition[] = input.nodes.filter(n => saved.has(n.id)).map(n => ({id:n.id,positionX:n.positionX,positionY:n.positionY}));
  const dx = (CARD.width + 45) * auto.scale / WORLD_SIZE, dy = (CARD.height + 45) * auto.scale / WORLD_SIZE;
  for (const point of auto.positions.filter(p => !saved.has(p.id))) {
    const next = {...point};
    for(let tries=0; tries<2500 && positions.some(p => Math.abs(p.positionX-next.positionX)<dx && Math.abs(p.positionY-next.positionY)<dy); tries++) {
      next.positionY += dy;
      if(next.positionY > 1-dy/2){next.positionY=dy/2;next.positionX+=dx;}
      if(next.positionX > 1-dx/2)next.positionX=dx/2;
    }
    positions.push(next);
  }
  return {positions,scale:auto.scale};
}
