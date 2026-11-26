import { FlowSequence } from '../../components/NavigationArrow';
import { useMemo, useState } from 'react';
import type { Answer, Exercise, Tree } from '@keling/shared/expedition';

import { treeOperationState } from './treeOperations';
import type { TreeOperation, AnswerDraft } from './treeOperations';

export function TreeDiagram({ tree, visited = [] }: { tree: Tree; visited?: string[] }) {
  const [listOnly, setListOnly] = useState(false);
  const currentId = visited.at(-1);
  const layout = useMemo(() => {
    const nodes = new Map(tree.nodes.map(node => [node.id, node])); const positions = new Map<string, { x: number; y: number }>();
    let index = 0, depthMax = 0;
    const visit = (id: string | null, depth: number, seen: Set<string>) => {
      if (!id || seen.has(id) || !nodes.has(id)) return; seen.add(id); const node = nodes.get(id)!;
      visit(node.left, depth + 1, seen); positions.set(id, { x: 42 + index++ * 72, y: 42 + depth * 82 }); depthMax = Math.max(depthMax, depth);
      visit(node.right, depth + 1, seen);
    };
    visit(tree.root, 0, new Set()); return { nodes, positions, width: Math.max(280, index * 72 + 12), height: depthMax * 82 + 84 };
  }, [tree]);
  return <section className="exp-tree" aria-label="题目中的二叉树">
    <button type="button" onClick={() => setListOnly(value => !value)} aria-pressed={listOnly}>{listOnly ? '查看树图' : '节点列表'}</button>
    {!listOnly && <div className="exp-tree-scroll"><svg viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label="二叉树结构">
      {tree.nodes.flatMap(node => [node.left, node.right].filter((id): id is string => Boolean(id)).map(id => {
        const start = layout.positions.get(node.id), end = layout.positions.get(id);
        return start && end ? <line key={`${node.id}-${id}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#7e9d90" strokeWidth="3" /> : null;
      }))}
      {tree.nodes.map(node => { const p = layout.positions.get(node.id); if (!p) return null;
        return <g key={node.id} className={currentId === node.id ? 'exp-tree-current' : undefined}><circle cx={p.x} cy={p.y} r="24" fill={visited.includes(node.id) ? '#285950' : '#fffcf4'} stroke={currentId === node.id ? '#b16f36' : '#285950'} strokeWidth={currentId === node.id ? 5 : 2}/><text x={p.x} y={p.y + 5} textAnchor="middle" fill={visited.includes(node.id) ? '#fff' : '#14263d'} fontSize="15">{node.value}</text><text x={p.x} y={p.y + 39} textAnchor="middle" fill="#304d48" fontSize="12">{node.id}</text></g>;
      })}
    </svg></div>}
    <p className="exp-caption">当前：{currentId || '未访问'} · {visited.length} / {tree.nodes.length}</p>
    {listOnly && <ul className="exp-node-list">{tree.nodes.map(node => <li key={node.id}><strong>{node.id} · 值 {node.value}</strong><span>左孩子：{node.left || '无'}；右孩子：{node.right || '无'}{currentId === node.id ? '；当前回放步骤' : visited.includes(node.id) ? '；已访问' : ''}</span></li>)}</ul>}
  </section>;
}
export default function TreeWorkbench({ exercise, value, onChange, disabled }: { exercise: Exercise; value: AnswerDraft; onChange: (value: AnswerDraft) => void; disabled: boolean }) {
  const traditional = value.inputMode === 'ORDER';
  const answer = value.answer, structure = answer.structure;
  const isBst = exercise.objectiveKey === 'bt.bst.bounds', isTeach = exercise.template === 'TEACH_COMPANION';
  const state = useMemo(() => { try { return structure ? treeOperationState(exercise.tree, value.operations, structure) : null; } catch { return null; } }, [exercise.tree, value.operations, structure]);
  const changeAnswer = (change: Partial<Answer>) => onChange({ ...value, answer: { ...answer, ...change } });
  const append = (operation: TreeOperation) => {
    if (!structure) return;
    const operations = [...value.operations, operation], next = treeOperationState(exercise.tree, operations, structure);
    onChange({ operations, answer: { ...answer, order: next.order } });
  };
  return <div className="exp-workbench"><TreeDiagram tree={exercise.tree} visited={answer.order}/>
    {!isBst && !isTeach && <>
      <fieldset disabled={disabled}><legend>选择容器</legend><div className="exp-choice-row">{(['QUEUE', 'STACK'] as const).map(kind => <button type="button" key={kind} aria-pressed={structure === kind} disabled={value.operations.length > 1} onClick={() => onChange({ answer: { ...answer, structure: kind, order: [] }, operations: [{ type: 'PUSH', nodeId: exercise.tree.root }] })}>{kind === 'QUEUE' ? '队列 · 先进先出' : '栈 · 后进先出'}</button>)}</div></fieldset>
      <button type="button" disabled={disabled} onClick={() => { onChange({ inputMode: traditional ? 'CONTAINER' : 'ORDER', rawOrder: '', answer: { ...answer, order: [] }, operations: structure ? [{ type: 'PUSH', nodeId: exercise.tree.root }] : [] }); }}>{traditional ? '使用容器操作' : '输入访问顺序'}</button>
      {traditional ? <label>访问顺序（节点 ID，以逗号分隔）<input disabled={disabled} value={value.rawOrder ?? (answer.order || []).join(', ')} onChange={event => onChange({ ...value, rawOrder: event.target.value, answer: { ...answer, order: event.target.value.split(/[,，\s]+/).filter(Boolean) } })} placeholder={exercise.tree.nodes.map(node => node.id).join(', ')} /></label> : structure && state && <section className="exp-container-state" aria-live="polite">
        <p><strong><FlowSequence items={structure === 'QUEUE' ? ['队头', '队尾'] : ['栈底', '栈顶']}/>：</strong><FlowSequence items={state.frontier} empty="空"/></p>
        <p><strong>已经访问：</strong><FlowSequence items={state.order} empty="尚未访问"/></p>
        {state.children.length > 0 ? <><p>将子节点加入容器</p><div className="exp-choice-row">{state.children.map(id => <button type="button" key={id} disabled={disabled} onClick={() => append({ type: 'PUSH', nodeId: id })}>加入 {id}（值 {exercise.tree.nodes.find(node => node.id === id)?.value}）</button>)}</div></> : <button type="button" disabled={disabled || !state.frontier.length} onClick={() => append({ type: 'POP', nodeId: structure === 'QUEUE' ? state.frontier[0] : state.frontier[state.frontier.length - 1] })}>{state.frontier.length ? '取出并访问' : '全部处理完成'}</button>}
        <button type="button" disabled={disabled} onClick={() => onChange({ answer: { ...answer, order: [] }, operations: [{ type: 'PUSH', nodeId: exercise.tree.root }] })}>重置操作</button>
        <details><summary>操作记录（{value.operations.length} 步）</summary><ol>{value.operations.map((operation, index) => <li key={index}>{operation.type === 'PUSH' ? '加入' : '取出并访问'} {operation.nodeId}</li>)}</ol></details>
      </section>}
    </>}
    {isBst && !isTeach && <fieldset disabled={disabled}><legend>这棵树是否满足二叉搜索树的完整条件？</legend><div className="exp-choice-row"><button type="button" aria-pressed={answer.validBst === true} onClick={() => changeAnswer({ validBst: true, order: [] })}>满足</button><button type="button" aria-pressed={answer.validBst === false} onClick={() => changeAnswer({ validBst: false })}>不满足</button></div>{answer.validBst === false && <><p>选择所有越界节点</p><div className="exp-choice-row">{exercise.tree.nodes.map(node => <button type="button" key={node.id} aria-pressed={answer.order?.includes(node.id) || false} onClick={() => changeAnswer({ order: answer.order?.includes(node.id) ? answer.order.filter(id => id !== node.id) : [...(answer.order || []), node.id] })}>{node.id} · {node.value}</button>)}</div></>}</fieldset>}
    <label>{isTeach ? '用自己的话教星芽' : '判断依据（可选）'}<textarea disabled={disabled} rows={5} maxLength={4000} value={answer.explanation || ''} onChange={event => changeAnswer({ explanation: event.target.value })} placeholder="写下你的理解" /></label>
    {isTeach && <fieldset disabled={disabled}><legend>自核清单</legend>{exercise.rubric.map(item => <label className="exp-check" key={item}><input type="checkbox" checked={answer.selfCheck?.includes(item) || false} onChange={event => changeAnswer({ selfCheck: event.target.checked ? [...(answer.selfCheck || []), item] : answer.selfCheck?.filter(value => value !== item) })}/>{item}</label>)}</fieldset>}
  </div>;
}
