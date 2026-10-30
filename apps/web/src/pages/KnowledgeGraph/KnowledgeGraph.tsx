import { StellarSceneBanner } from '../../components/StellarScene';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ZoomIn, ZoomOut, Plus, X, ArrowLeft
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { knowledgeAPI } from '../../services/api';
import type { KnowledgeNode } from '../../types';
import { assistantError } from '../../services/assistant';
import './KnowledgeGraph.css';

interface NodePosition {
  node: KnowledgeNode;
  x: number;
  y: number;
  level: number;
  children: NodePosition[];
}

type NodeDraft = Pick<KnowledgeNode, 'name' | 'description' | 'parentIds' | 'masteryLevel' | 'difficulty'>;
const blankDraft = (): NodeDraft => ({ name: '', description: '', parentIds: [], masteryLevel: 0, difficulty: 1 });

// 层级颜色
const LEVEL_COLORS = [
  '#6B5B95', // 第0层 - 深紫色
  '#88B04B', // 第1层 - 翠绿色
  '#F7CAC9', // 第2层 - 粉红色
  '#92A8D1', // 第3层 - 淡蓝色
  '#FFB07C', // 第4层 - 橙色
  '#B8E0D2', // 第5层 - 薄荷绿
  '#D4A5FF', // 第6层 - 薰衣草紫
  '#FFF3B0', // 第7层+ - 柠檬黄
];

const getLevelColor = (level: number) => {
  return LEVEL_COLORS[Math.min(level, LEVEL_COLORS.length - 1)];
};

const getLevelColorLight = (level: number) => {
  const color = getLevelColor(level);
  return color + '26'; // 添加透明度
};

const KnowledgeGraph: React.FC = () => {
  const navigate = useNavigate();
  const { courseId } = useParams<{ courseId: string }>();
  const { courses } = useAppStore();

  const [nodes, setNodes] = useState<KnowledgeNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingNode, setEditingNode] = useState<KnowledgeNode | null>(null);
  const [draft, setDraft] = useState<NodeDraft>(blankDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const canvasRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  // 找到课程
  const course = courses.find(c => c.id === courseId);

  // 加载知识点
  useEffect(() => {
    if (courseId) {
      loadNodes();
    }
  }, [courseId]);

  const loadNodes = async () => {
    try {
      const { data } = await knowledgeAPI.getNodes(courseId!);
      setNodes(data.nodes || []);
    } catch (error) {
      setError(assistantError(error));
    } finally {
      setIsLoading(false);
    }
  };

  // 计算思维导图布局
  const calculateLayout = useCallback((nodes: KnowledgeNode[]): NodePosition[] => {
    if (nodes.length === 0) return [];

    const nodeMap = nodes.reduce((map, node) => {
      map[node.id] = node;
      return map;
    }, {} as Record<string, KnowledgeNode>);

    const childMap: Record<string, string[]> = {};
    const rootNodes: KnowledgeNode[] = [];

    // 找出根节点和子节点关系
    nodes.forEach(node => {
      if (node.parentIds.length === 0) {
        rootNodes.push(node);
      } else {
        const validParents = node.parentIds.filter(id => nodeMap[id]);
        if (validParents.length === 0) {
          rootNodes.push(node);
        } else {
          validParents.forEach(parentId => {
            if (!childMap[parentId]) childMap[parentId] = [];
            childMap[parentId].push(node.id);
          });
        }
      }
    });

    if (rootNodes.length === 0 && nodes.length > 0) {
      rootNodes.push(...nodes);
    }

    const positions: NodePosition[] = [];
    let currentY = 0;

    const visited = new Set<string>();
    const calculateSubtree = (
      node: KnowledgeNode,
      level: number,
      startY: number
    ): [NodePosition, number] => {
      visited.add(node.id);
      const x = level * 280 + 50;
      const childIds = childMap[node.id] || [];
      const childNodes = childIds.map(id => nodeMap[id]).filter(child => child && !visited.has(child.id));

      if (childNodes.length === 0) {
        const pos = {
          node,
          x,
          y: startY,
          level,
          children: [],
        };
        return [pos, startY + 80];
      }

      const childPositions: NodePosition[] = [];
      let childY = startY;

      childNodes.sort((a, b) => a.name.localeCompare(b.name)).forEach(child => {
        if (visited.has(child.id)) return;
        const [childPos, nextY] = calculateSubtree(child, level + 1, childY);
        childPositions.push(childPos);
        childY = nextY;
      });

      const parentY = childPositions.length > 0
        ? (childPositions[0].y + childPositions[childPositions.length - 1].y) / 2
        : startY;

      return [{
        node,
        x,
        y: parentY,
        level,
        children: childPositions,
      }, childY];
    };

    // Draw each node once, including disconnected/cyclic legacy data.
    [...rootNodes.sort((a, b) => a.name.localeCompare(b.name)), ...[...nodes].sort((a, b) => a.name.localeCompare(b.name))].forEach(rootNode => {
      if (visited.has(rootNode.id)) return;
      const [pos, nextY] = calculateSubtree(rootNode, 0, currentY);
      positions.push(pos);
      currentY = nextY + 40;
    });

    return positions;
  }, []);

  // 展平所有节点位置
  const flattenPositions = useCallback((positions: NodePosition[]): NodePosition[] => {
    const result: NodePosition[] = [];
    const collect = (pos: NodePosition) => {
      result.push(pos);
      pos.children.forEach(collect);
    };
    positions.forEach(collect);
    return result;
  }, []);

  const positions = useMemo(() => calculateLayout(nodes), [calculateLayout, nodes]);
  const allPositions = useMemo(() => flattenPositions(positions), [flattenPositions, positions]);

  // 计算内容边界用于初始居中
  useEffect(() => {
    if (allPositions.length > 0 && canvasRef.current) {
      const canvas = canvasRef.current;
      const canvasWidth = canvas.clientWidth;
      const canvasHeight = canvas.clientHeight;

      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;

      allPositions.forEach(pos => {
        minX = Math.min(minX, pos.x);
        maxX = Math.max(maxX, pos.x + 200);
        minY = Math.min(minY, pos.y);
        maxY = Math.max(maxY, pos.y + 60);
      });

      const contentWidth = maxX - minX;
      const contentHeight = maxY - minY;

      const initialScale = Math.min(
        canvasWidth / contentWidth,
        canvasHeight / contentHeight,
        1.5
      );

      const clampedScale = Math.max(0.5, Math.min(2, initialScale));

      setScale(clampedScale);
      setOffset({
        x: (canvasWidth - contentWidth * clampedScale) / 2 - minX * clampedScale,
        y: (canvasHeight - contentHeight * clampedScale) / 2 - minY * clampedScale,
      });
    }
  }, [allPositions]);

  // 处理拖拽和缩放
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      isDragging.current = true;
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging.current) {
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale(prev => Math.max(0.3, Math.min(3, prev * delta)));
  };

  // 缩放控制
  const handleZoomIn = () => {
    setScale(prev => Math.min(3, prev * 1.25));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(0.3, prev * 0.8));
  };

  // 创建/编辑节点
  const handleSaveNode = async () => {
    if (saving || !draft.name.trim()) return;
    setSaving(true);
    setError('');
    const nodeData = { ...draft, name: draft.name.trim() };
    try {
      if (editingNode) {
        await knowledgeAPI.updateNode(editingNode.id, nodeData);
      } else {
        const { data } = await knowledgeAPI.createNode(courseId!, {
          name: nodeData.name || '',
          description: nodeData.description || '',
          parentIds: nodeData.parentIds || [],
          difficulty: nodeData.difficulty || 1,
        });
        // A retry after a mastery update failure must update this node, not create a duplicate.
        setEditingNode(data.node);
        if (nodeData.masteryLevel > 0) await knowledgeAPI.updateNode(data.node.id, { masteryLevel: nodeData.masteryLevel });
      }
      await loadNodes();
      setShowEditDialog(false);
      setEditingNode(null);
    } catch (error) {
      setError(assistantError(error));
    } finally { setSaving(false); }
  };

  const handleDeleteNode = async () => {
    if (saving) return;
    if (editingNode && confirm('确定要删除这个知识点吗？')) {
      setSaving(true);
      setError('');
      try {
        await knowledgeAPI.deleteNode(editingNode.id);
        await loadNodes();
        setShowEditDialog(false);
        setEditingNode(null);
      } catch (error) {
        setError(assistantError(error));
      } finally { setSaving(false); }
    }
  };

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>加载知识图谱...</p>
      </div>
    );
  }

  return (
    <div className="knowledge-graph-container">
      {error && <p role="alert">{error}</p>}
      {/* 顶部导航 */}
      <motion.div
        className="graph-header"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <button className="back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
          返回
        </button>
        <div className="header-info">
          <h1>{course?.name || '知识图谱'}</h1>
          <p>共 {nodes.length} 个知识点</p>
        </div>
        <div className="zoom-controls">
          <button className="zoom-btn" onClick={handleZoomOut}>
            <ZoomOut size={18} />
          </button>
          <span className="zoom-percent">{Math.round(scale * 100)}%</span>
          <button className="zoom-btn" onClick={handleZoomIn}>
            <ZoomIn size={18} />
          </button>
        </div>
      </motion.div>

      <StellarSceneBanner scene="graph" eyebrow="KNOWLEDGE / CONNECTION MAP" title="把零散概念，连成可以理解的关系" description="添加或编辑知识点，缩放画布查看连接。图中的结构来自你保存的课程资料。" compact/>

      {/* 主画布区域 */}
      {nodes.length === 0 ? (
        <motion.div
          className="empty-state"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <span className="empty-icon">📭</span>
          <h2>{course ? `${course.name} 还没有知识点` : '请先选择一个课程'}</h2>
          <p>
            {course
              ? '点击添加知识点，整理概念与关系；也可以带着资料向 AI 提问。'
              : '返回温室选择一个星球'}
          </p>
          {course && (
            <button className="btn btn-primary" onClick={() => navigate('/ai')}>
              和 AI 聊聊
            </button>
          )}
        </motion.div>
      ) : (
        <div
          ref={canvasRef}
          className="graph-canvas"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        >
          {/* SVG 绘制连线 */}
          <svg
            className="connections-svg"
            style={{
              transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
            }}
          >
            {positions.map(rootPos => {
              const drawConnections = (pos: NodePosition): React.ReactNode[] => {
                const lines: React.ReactNode[] = [];
                pos.children.forEach(child => {
                  const startX = pos.x + 180;
                  const startY = pos.y + 30;
                  const endX = child.x;
                  const endY = child.y + 30;
                  const midX = (startX + endX) / 2;

                  const path = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
                  lines.push(
                    <path
                      key={`${pos.node.id}-${child.node.id}`}
                      d={path}
                      stroke={getLevelColor(pos.level)}
                      strokeWidth="2"
                      fill="none"
                      opacity="0.4"
                    />
                  );
                  lines.push(...drawConnections(child));
                });
                return lines;
              };
              return drawConnections(rootPos);
            })}
          </svg>

          {/* 节点 */}
          <div
            className="nodes-container"
            style={{
              transform: `scale(${scale}) translate(${offset.x}px, ${offset.y}px)`,
            }}
          >
            {allPositions.map(pos => (
              <div
                key={pos.node.id}
                className="mind-map-node"
                style={{
                  left: pos.x,
                  top: pos.y,
                  backgroundColor: getLevelColorLight(pos.level),
                  borderColor: getLevelColor(pos.level),
                }}
                onClick={() => {
                  setEditingNode(pos.node);
                  setDraft({ name: pos.node.name, description: pos.node.description, parentIds: [...pos.node.parentIds], masteryLevel: pos.node.masteryLevel, difficulty: pos.node.difficulty });
                  setError('');
                  setShowEditDialog(true);
                }}
              >
                <span className="node-name">{pos.node.name}</span>
                <div className="node-progress">
                  <div
                    className="node-progress-fill"
                    style={{
                      width: `${pos.node.masteryLevel * 100}%`,
                      backgroundColor: getLevelColor(pos.level),
                    }}
                  />
                </div>
                <span className="node-mastery">
                  {Math.round(pos.node.masteryLevel * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 层级图例 */}
      <motion.div
        className="legend-card"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        <h3>层级图例</h3>
        <div className="legend-list">
          {LEVEL_COLORS.slice(0, 5).map((color, index) => (
            <div key={index} className="legend-item">
              <span className="legend-dot" style={{ backgroundColor: color }} />
              <span className="legend-label">第{index + 1}层</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* 添加知识点按钮 */}
      {courseId && (
        <motion.button
          className="add-node-btn"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            setEditingNode(null);
            setDraft(blankDraft());
            setError('');
            setShowEditDialog(true);
          }}
        >
          <Plus size={20} />
          <span>添加知识点</span>
        </motion.button>
      )}

      {/* 编辑对话框 */}
      {showEditDialog && (
        <div className="dialog-overlay" onClick={() => { if (!saving) setShowEditDialog(false); }}>
          <motion.div
            className="node-edit-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="node-dialog-title"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="dialog-header">
              <h2 id="node-dialog-title">{editingNode ? '编辑知识点' : '添加知识点'}</h2>
              <button className="close-btn" aria-label="关闭知识点编辑" disabled={saving} onClick={() => setShowEditDialog(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="dialog-content">
              {error && <p role="alert">{error}</p>}
              <div className="form-group">
                <label>名称 *</label>
                <input
                  type="text"
                  className="input"
                  placeholder="知识点名称"
                  aria-label="知识点名称"
                  disabled={saving}
                  value={draft.name}
                  onChange={e => setDraft(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>

              <div className="form-group">
                <label>描述</label>
                <textarea
                  className="input textarea"
                  placeholder="知识点描述"
                  aria-label="知识点描述"
                  disabled={saving}
                  value={draft.description}
                  onChange={e => setDraft(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>

              <div className="form-group">
                <label>父节点</label>
                <select
                  className="input"
                  aria-label="父节点"
                  disabled={saving}
                  value={draft.parentIds[0] || ''}
                  onChange={e => setDraft(prev => ({ ...prev, parentIds: e.target.value ? [e.target.value] : [] }))}
                >
                  <option value="">无（作为根节点）</option>
                  {nodes.filter(n => n.id !== editingNode?.id).map(node => (
                    <option key={node.id} value={node.id}>{node.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>掌握度</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  aria-label="掌握度"
                  disabled={saving}
                  value={Math.round(draft.masteryLevel * 100)}
                  onChange={e => setDraft(prev => ({ ...prev, masteryLevel: parseInt(e.target.value) / 100 }))}
                />
                <span className="range-value">{Math.round(draft.masteryLevel * 100)}%</span>
              </div>

              <div className="form-group">
                <label>难度</label>
                <div className="difficulty-selector">
                  {[1, 2, 3, 4, 5].map(level => (
                    <button
                      key={level}
                      className={`difficulty-option ${draft.difficulty === level ? 'selected' : ''}`}
                      disabled={saving}
                      aria-pressed={draft.difficulty === level}
                      onClick={() => setDraft(prev => ({ ...prev, difficulty: level }))}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="dialog-footer">
              {editingNode && (
                <button className="btn btn-danger" disabled={saving} onClick={handleDeleteNode}>
                  删除
                </button>
              )}
              <button className="btn btn-outline" disabled={saving} onClick={() => setShowEditDialog(false)}>
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={() => void handleSaveNode()}
                disabled={saving || !draft.name.trim()}
              >
                {saving ? '正在保存…' : '保存'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default KnowledgeGraph;
