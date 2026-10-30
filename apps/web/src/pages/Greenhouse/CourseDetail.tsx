import { StellarSceneBanner } from '../../components/StellarScene';
import React, { useState, useEffect, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, BookOpen, Clock, MapPin, User, Trash2,
  Edit3, Target, Zap, ChevronRight, GitBranch
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { courseAPI, knowledgeAPI } from '../../services/api';
import type { Course, KnowledgeNode } from '../../types';
import AskAssistantButton from '../../components/AskAssistantButton';
import { useCourseDialogFocus } from '../../components/useCourseDialogFocus';
import { CoursePlanet, CoursePlanetPicker } from '../../components/CoursePlanet';
import { coursePlanet, coursePlanetIndex } from '../../components/planetCatalog';
import './CourseDetail.css';

const CourseDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { updateCourse, deleteCourse } = useAppStore();

  const [course, setCourse] = useState<Course | null>(null);
  const [nodes, setNodes] = useState<KnowledgeNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useCourseDialogFocus(dialogRef, showEditDialog);
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [editData, setEditData] = useState({
    name: '',
    code: '',
    teacher: '',
    location: '',
    planetStyleIndex: 0
  });

  useEffect(() => {
    loadCourseDetail();
  }, [id]);

  const loadCourseDetail = async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const [courseRes, nodesRes] = await Promise.all([
        courseAPI.getById(id),
        knowledgeAPI.getNodes(id)
      ]);
      setCourse(courseRes.data.course);
      setNodes(nodesRes.data.nodes || []);
      setEditData({
        name: courseRes.data.course.name,
        code: courseRes.data.course.code || '',
        teacher: courseRes.data.course.teacher || '',
        location: courseRes.data.course.location || '',
        planetStyleIndex: coursePlanetIndex(courseRes.data.course.planetStyleIndex)
      });
    } catch (error) {
      console.error('加载课程详情失败:', error);
      navigate('/greenhouse');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateCourse = async () => {
    if (!course || !editData.name.trim() || isSaving) return;
    setIsSaving(true);
    setEditError('');
    try {
      // Only submit changed values so changing the illustration cannot rewrite course data.
      const changes: Partial<typeof editData> = {};
      for (const key of ['name', 'code', 'teacher', 'location'] as const) {
        if (editData[key] !== (course[key] || '')) changes[key] = editData[key];
      }
      if (editData.planetStyleIndex !== coursePlanetIndex(course.planetStyleIndex)) changes.planetStyleIndex = editData.planetStyleIndex;
      if (Object.keys(changes).length > 0) await updateCourse(course.id, changes);
      setShowEditDialog(false);
      await loadCourseDetail();
    } catch (error: unknown) {
      setEditError(error instanceof Error ? error.message : '保存失败，请重试。');
    } finally {
      setIsSaving(false);
    }
  };

  const openEditor = () => {
    if (!course) return;
    setEditData({ name: course.name, code: course.code || '', teacher: course.teacher || '', location: course.location || '', planetStyleIndex: coursePlanetIndex(course.planetStyleIndex) });
    setEditError('');
    setShowEditDialog(true);
  };

  const handleDeleteCourse = async () => {
    if (!course) return;
    if (confirm('确定要删除这门课程吗？所有相关数据将被删除。')) {
      try {
        await deleteCourse(course.id);
        navigate('/greenhouse');
      } catch (error: any) {
        alert(error.message);
      }
    }
  };

  const handleCreateKnowledgeNode = async () => {
    if (!course) return;
    const name = prompt('输入知识点名称:');
    if (!name?.trim()) return;

    try {
      await knowledgeAPI.createNode(course.id, { name });
      loadCourseDetail();
    } catch (error: any) {
      alert(error.message);
    }
  };

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>加载中...</p>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="error-container">
        <p>课程不存在</p>
        <button className="btn btn-primary" onClick={() => navigate('/greenhouse')}>
          返回温室
        </button>
      </div>
    );
  }

  const masteryPercent = Math.round(course.masteryLevel * 100);

  return (
    <div className="course-detail-container">
      {/* 头部区域 */}
      <motion.div
        className="course-header"
        style={{ background: `linear-gradient(135deg, ${course.themeColor}, ${course.themeColor}dd)` }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="header-nav">
          <button className="back-btn" aria-label="返回知识星球" onClick={() => navigate('/greenhouse')}>
            <ArrowLeft size={20} />
          </button>
          <div className="header-actions">
            <button className="course-appearance-button" onClick={openEditor}><span>更换星球</span></button>
            <button className="action-btn" aria-label="编辑课程" onClick={openEditor}>
              <Edit3 size={18} />
            </button>
            <button className="action-btn delete" aria-label="删除课程" onClick={handleDeleteCourse}>
              <Trash2 size={18} />
            </button>
          </div>
        </div>

        <div className="header-content">
          <div className="course-icon">
            <CoursePlanet index={course.planetStyleIndex} size={176} />
          </div>
          <p className="course-appearance-name">{coursePlanet(course.planetStyleIndex).name}</p>
          <h1>{course.name}</h1>
          {course.code && <span className="course-code">{course.code}</span>}
        </div>

        <div className="course-meta">
          {course.teacher && (
            <span><User size={14} /> {course.teacher}</span>
          )}
          {course.location && (
            <span><MapPin size={14} /> {course.location}</span>
          )}
        </div>
      </motion.div>

      <StellarSceneBanner scene="courseDetail" eyebrow="COURSE / FIELD STATION" title="沿着一门课程，探索更深一层" description="查看知识点与学习记录，带着课程资料提问，逐步完善自己的理解。" compact/>

      <section className="exp-panel"><h2>二叉树区域 · 可玩的学习章节</h2><p>队列、栈与二叉搜索树三个目标，包含操作推演、教星芽、试炼和证据回看。其他课程资料与图谱继续保留。</p><Link className="btn btn-primary" to={`/greenhouse/${course.id}/chapter`}>进入二叉树示例章节</Link></section>

      {/* 掌握度卡片 */}
      <motion.div
        className="mastery-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="mastery-header">
          <Target size={20} />
          <h3>掌握度</h3>
        </div>
        <div className="mastery-visual">
          <div className="mastery-circle">
            <svg viewBox="0 0 100 100">
              <circle
                cx="50" cy="50" r="45"
                fill="none"
                stroke="#eee"
                strokeWidth="8"
              />
              <circle
                cx="50" cy="50" r="45"
                fill="none"
                stroke={course.themeColor}
                strokeWidth="8"
                strokeDasharray={`${masteryPercent * 2.83} 283`}
                strokeLinecap="round"
                transform="rotate(-90 50 50)"
              />
            </svg>
            <div className="mastery-value">
              {masteryPercent}%
            </div>
          </div>
        </div>
        <div className="mastery-stats">
          <div className="stat-item">
            <Clock size={16} />
            <span className="stat-value">{course.totalStudyMinutes}</span>
            <span className="stat-label">分钟</span>
          </div>
          <div className="stat-item">
            <BookOpen size={16} />
            <span className="stat-value">{nodes.length}</span>
            <span className="stat-label">知识点</span>
          </div>
          <div className="stat-item">
            <Zap size={16} />
            <span className="stat-value">{course.studySessionCount}</span>
            <span className="stat-label">次学习</span>
          </div>
        </div>
      </motion.div>

      {/* 快捷操作 */}
      <motion.div
        className="quick-actions"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="action-card" onClick={() => navigate(`/knowledge-graph/${course.id}`)}>
          <div className="action-icon" style={{ background: '#9C27B0' }}>
            <GitBranch size={24} />
          </div>
          <div className="action-content">
            <h4>知识图谱</h4>
            <p>思维导图式学习</p>
          </div>
          <ChevronRight size={20} className="chevron" />
        </div>

        <AskAssistantButton className="action-card" source={{ kind: 'course', id: course.id }} prompt="请根据这门课程的现有知识点，梳理概念之间的联系，并建议下一步该复习什么。" label={`带着课程“${course.name}”问 AI`}>
          <span className="action-icon" style={{ background: course.themeColor }}>
            <Zap size={24} aria-hidden="true" />
          </span>
          <span className="action-content">
            <strong>AI 辅导</strong>
            <small>先核对课程资料，再开始提问</small>
          </span>
          <ChevronRight size={20} className="chevron" aria-hidden="true" />
        </AskAssistantButton>

        <div className="action-card" onClick={() => navigate('/tasks')}>
          <div className="action-icon" style={{ background: '#85CDA9' }}>
            <Target size={24} />
          </div>
          <div className="action-content">
            <h4>创建任务</h4>
            <p>安排学习计划</p>
          </div>
          <ChevronRight size={20} className="chevron" />
        </div>
      </motion.div>

      {/* 知识点列表 */}
      <motion.section
        className="knowledge-section"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="section-header">
          <h3>知识节点</h3>
          <button className="btn btn-outline small" onClick={handleCreateKnowledgeNode}>
            添加
          </button>
        </div>

        {nodes.length === 0 ? (
          <div className="empty-nodes" onClick={handleCreateKnowledgeNode}>
            <BookOpen size={32} />
            <p>点击添加第一个知识点</p>
          </div>
        ) : (
          <div className="nodes-list">
            {nodes.map((node) => (
              <div key={node.id} className="node-item">
                <div className="node-info">
                  <h4>{node.name}</h4>
                  {node.description && (
                    <p className="node-desc">{node.description}</p>
                  )}
                </div>
                <div className="node-mastery">
                  <div
                    className="mini-bar"
                    style={{ background: course.themeColor, width: `${node.masteryLevel * 100}%` }}
                  />
                  <span>{Math.round(node.masteryLevel * 100)}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.section>

      {/* 编辑对话框 */}
      {showEditDialog && (
        <div className="dialog-overlay" onClick={() => { if (!isSaving) setShowEditDialog(false); }}>
          <motion.div
            className="edit-dialog"
            ref={dialogRef} tabIndex={-1}
            role="dialog" aria-modal="true" aria-labelledby="edit-course-title"
            onKeyDown={event => { if (event.key === 'Escape' && !isSaving) setShowEditDialog(false); }}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dialog-header">
              <h2 id="edit-course-title">课程与星球外观</h2>
              <button className="close-btn" aria-label="关闭编辑课程" disabled={isSaving} onClick={() => { if (!isSaving) setShowEditDialog(false); }}>×</button>
            </div>

            <div className="dialog-content">
              <CoursePlanetPicker value={editData.planetStyleIndex} disabled={isSaving}
                onChange={planetStyleIndex => setEditData({ ...editData, planetStyleIndex })} />
              <div className="form-group">
                <label htmlFor="edit-course-name">课程名称</label>
                <input
                  type="text"
                  className="input" disabled={isSaving}
                  id="edit-course-name"
                  value={editData.name}
                  onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>课程代码</label>
                <input
                  type="text"
                  className="input" disabled={isSaving}
                  value={editData.code}
                  onChange={(e) => setEditData({ ...editData, code: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>教师</label>
                <input
                  type="text"
                  className="input" disabled={isSaving}
                  value={editData.teacher}
                  onChange={(e) => setEditData({ ...editData, teacher: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>地点</label>
                <input
                  type="text"
                  className="input" disabled={isSaving}
                  value={editData.location}
                  onChange={(e) => setEditData({ ...editData, location: e.target.value })}
                />
              </div>
            </div>

            {editError && <p className="course-form-error" role="alert">{editError}</p>}
            <div className="dialog-footer">
              <button className="btn btn-outline" disabled={isSaving} onClick={() => { if (!isSaving) setShowEditDialog(false); }}>
                取消
              </button>
              <button className="btn btn-primary" onClick={handleUpdateCourse} disabled={isSaving || !editData.name.trim()}>
                {isSaving ? '保存中…' : '保存'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default CourseDetail;
