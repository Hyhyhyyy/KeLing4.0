import type { Answer, Tree } from '@keling/shared/expedition';

export interface TreeOperation { type: 'PUSH' | 'POP'; nodeId: string }
export interface AnswerDraft { answer: Answer; operations: TreeOperation[]; rawOrder?: string; inputMode?: 'ORDER' | 'CONTAINER' }
export function treeOperationState(tree: Tree, operations: TreeOperation[], structure: 'QUEUE' | 'STACK') {
  const byId = new Map(tree.nodes.map(node => [node.id, node]));
  const frontier: string[] = []; const order: string[] = []; let children: string[] = [];
  for (const operation of operations) {
    if (!byId.has(operation.nodeId)) throw new Error('操作包含未知节点');
    if (operation.type === 'PUSH') {
      if (!frontier.length && !order.length && operation.nodeId === tree.root) frontier.push(operation.nodeId);
      else {
        if (!children.includes(operation.nodeId) || frontier.includes(operation.nodeId) || order.includes(operation.nodeId)) throw new Error('只能加入当前节点尚未处理的孩子');
        frontier.push(operation.nodeId); children = children.filter(id => id !== operation.nodeId);
      }
    } else {
      if (children.length) throw new Error('请先处理当前节点的孩子');
      const id = structure === 'QUEUE' ? frontier.shift() : frontier.pop();
      if (id !== operation.nodeId) throw new Error('取出位置与容器规则不一致');
      order.push(id); const node = byId.get(id)!; children = [node.left, node.right].filter((value): value is string => Boolean(value));
    }
  }
  return { frontier, order, children };
}
