import React, { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useNavigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAppStore } from './store/useAppStore';
import { clearModelAccess } from './services/modelAccess';
import './pages/Expedition/Expedition.css';

// 页面组件
const Login = lazy(() => import('./pages/Auth/Login'));
const Register = lazy(() => import('./pages/Auth/Register'));
const Home = lazy(() => import('./pages/Home/StellarHome'));
const ExpeditionHome = lazy(() => import('./pages/Expedition/ExpeditionPages').then(module => ({ default: module.ExpeditionHome })));
const ExpeditionChapter = lazy(() => import('./pages/Expedition/ExpeditionPages').then(module => ({ default: module.ExpeditionChapter })));
const ExpeditionBase = lazy(() => import('./pages/Expedition/ExpeditionPages').then(module => ({ default: module.ExpeditionBase })));
const ExpeditionMine = lazy(() => import('./pages/Expedition/ExpeditionPages').then(module => ({ default: module.ExpeditionMine })));
const ExpeditionEvidence = lazy(() => import('./pages/Expedition/ExpeditionPages').then(module => ({ default: module.ExpeditionEvidence })));
const ExpeditionSync = lazy(() => import('./pages/Expedition/ExpeditionPages').then(module => ({ default: module.ExpeditionSync })));
const ExpeditionRun = lazy(() => import('./pages/Expedition/ExpeditionRun'));
const AIAssistant = lazy(() => import('./pages/AI/StellarAssistant'));
const Greenhouse = lazy(() => import('./pages/Greenhouse/Greenhouse'));
const CourseDetail = lazy(() => import('./pages/Greenhouse/CourseDetail'));
const Tasks = lazy(() => import('./pages/Tasks/Tasks'));
const Profile = lazy(() => import('./pages/Profile/Profile'));
const Notes = lazy(() => import('./pages/Notes/SharedNotebook'));
const Achievements = lazy(() => import('./pages/Achievements/Achievements'));
const Settings = lazy(() => import('./pages/Settings/StellarSettings'));
const StudyReport = lazy(() => import('./pages/StudyReport/StudyReport'));
const KnowledgeGraph = lazy(() => import('./pages/KnowledgeGraph/KnowledgeGraph'));
const VisualLibrary = lazy(() => import('./pages/VisualLibrary/VisualLibrary'));
const Agent = lazy(() => import('./pages/Agent/Agent'));
const Explore = lazy(() => import('./pages/Explore/Explore'));

// 图标资源
import crystalsIcon from './assets/icons/crystals.jpg';

// 样式
import './styles/globals.css';
import './styles/stellar.css';
import './styles/typography.css';
import { StellarSprite } from './components/StellarArt';
import { avatarIndex } from './components/stellarCatalog';

const queryClient = new QueryClient();

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div className="loading-screen" role="alert">
      <h1>页面暂时未能打开</h1>
      <p>页面资源可能已更新，或当前连接中断。请刷新以加载最新版本。</p>
      <p>{useAppStore.getState().isGuest ? '刷新会清空本次游客数据，重新开启一个临时空间。' : '已经保存的账号数据不会因此删除。'}</p>
      <button className="btn btn-primary" onClick={() => window.location.reload()}>刷新并重新打开</button>
    </div>;
    return this.props.children;
  }
}

// 受保护的路由
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {isAuthenticated,isGuest,isLoading,authError,loadUser,logout,startGuest}=useAppStore();
  const [checked,setChecked]=React.useState(false);
  useEffect(()=>{
    let active=true;
    const connect = () => {
      const state = useAppStore.getState();
      return !state.token && !state.isGuest ? startGuest() : loadUser();
    };
    const refresh = () => { if (document.visibilityState === 'visible') void connect(); };
    window.addEventListener('focus', refresh);
    void connect().finally(()=>{if(active)setChecked(true);});
    return ()=>{active=false;window.removeEventListener('focus',refresh);};
  },[loadUser,startGuest,isGuest]);
  if(authError)return <div className="loading-screen" role="alert"><p>{authError}</p><button className="btn btn-primary" onClick={()=>void loadUser()}>重试连接</button><button className="btn" onClick={logout}>退出登录</button><Link className="btn btn-secondary" to="/trial">游客试用 · 无需登录 →</Link></div>;
  if(!checked||(isLoading&&!isAuthenticated))return <div className="loading-screen" role="status"><div className="loading-spinner"/><p>正在连接账户…</p><Link className="btn btn-secondary" to="/trial">游客试用 · 无需登录 →</Link></div>;
  if(!isAuthenticated&&!isGuest)return <Navigate to="/login" replace/>;
  return <>{children}</>;
};

// 顶部导航栏
const TopNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isGuest } = useAppStore();

  const navItems = [
    { path: '/', icon: 0, label: '首页' },
    { path: '/voyage', icon: 2, label: '远航' },
    { path: '/greenhouse', icon: 4, label: '星图' },
    { path: '/base', icon: 5, label: '基地' },
    { path: '/me', icon: 7, label: '我的' },
  ];
  const activeGroup = location.pathname === '/base' || location.pathname.startsWith('/visual-library') ? '/base'
    : ['/greenhouse', '/knowledge-graph', '/notes'].some(path => location.pathname.startsWith(path)) ? '/greenhouse'
    : ['/me', '/profile', '/settings', '/study-report', '/achievements', '/voyage/evidence', '/voyage/sync'].some(path => location.pathname.startsWith(path)) ? '/me'
    : ['/voyage', '/tasks', '/agent'].some(path => location.pathname.startsWith(path)) ? '/voyage' : '/';
  const isActive = (path: string) => activeGroup === path;

  return (
    <header className="top-nav">
      <button className="nav-brand" aria-label="返回首页" onClick={() => navigate('/')}>
        <img src="/stellar/title_logo.png" alt="课灵 KeLing" className="stellar-brand-logo" />
      </button>

      <nav className="nav-links" aria-label="主导航">
        {navItems.map((item) => (
          <button
            key={item.path}
            className={`nav-link ${isActive(item.path) ? 'active' : ''}`}
            aria-current={isActive(item.path) ? 'page' : undefined}
            onClick={() => navigate(item.path)}
          >
            <StellarSprite atlas="modules" index={item.icon} size={26} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="nav-user">
        {isGuest ? <span className="nav-trial-link">游客模式</span> : <Link className="nav-trial-link" to="/trial">游客试用</Link>}
        <div className="exp-nav-tools">{location.pathname.startsWith('/voyage/runs/') ? <a href="#exp-run-ai-help">本题问星芽</a> : <Link to="/ai">问星芽</Link>}<Link to="/settings">配置 AI</Link><Link to="/voyage/sync">同步</Link></div>
        <div className="user-stats">
          <span className="stat">Lv. {user?.level || 1}</span>
          <span className="stat crystals">
            <img src={crystalsIcon} alt="结晶" className="stat-icon-img" />
            {user?.crystals || 0}
          </span>
        </div>
        <div className="user-actions">
          <button aria-label="设置" className="nav-settings-btn" onClick={() => navigate('/settings')}>
            <StellarSprite atlas="modules" index={7} size={26} />
          </button>
          <button className="user-avatar" aria-label="我的资料" onClick={() => navigate('/profile')}>
            <StellarSprite atlas="avatars" index={avatarIndex(user?.avatarUrl)} size={42} label="我的头像" />
          </button>
        </div>
      </div>
    </header>
  );
};

// 主布局
const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isGuest, endGuest, offlineAccount } = useAppStore();
  const navigate = useNavigate();
  return (
    <div className="app-layout">
      <TopNav />
      <main className="main-content">
        {isGuest && <aside className="guest-workspace-banner" aria-label="游客模式说明"><div><strong>游客模式 · 完整学习空间</strong><p>所有模块均可使用。本次数据仅在内存中，刷新、关闭或退出即清空，不跨设备同步。真实 AI 需要有效模型配置。</p></div><button onClick={() => { endGuest(); navigate('/explore'); }}>退出并清空</button></aside>}
        {offlineAccount && <aside className="exp-offline-banner" role="status">离线读取本机远征快照；云端结果与奖励尚未确认。<Link to="/voyage/sync">查看草稿与待同步</Link></aside>}
        {children}
      </main>
    </div>
  );
};

// First-time visitors can choose the public trial before any account request.
function HomeEntry() {
  const { token, isGuest } = useAppStore();
  if (!token && !isGuest) return <Explore />;
  return <ProtectedRoute><MainLayout><Home /></MainLayout></ProtectedRoute>;
}

function GuestEntry() {
  const startGuest = useAppStore(state => state.startGuest);
  const navigate = useNavigate();
  const [error, setError] = React.useState('');
  useEffect(() => {
    let alive = true;
    void startGuest().then(() => { if (alive) navigate('/', { replace: true }); })
      .catch(() => { if (alive) setError('试用空间未能打开，请刷新后重试。'); });
    return () => { alive = false; };
  }, [startGuest, navigate]);
  return <div className="loading-screen" role="status">{error || '正在打开完整游客工作台…'}</div>;
}

function App() {
  useEffect(() => {
    const unsubscribe = useAppStore.subscribe((state, previous) => {
      if (state.user?.id !== previous.user?.id || state.isGuest !== previous.isGuest) {
        clearModelAccess(); queryClient.clear();
      }
    });
    // Do not let the browser's back/forward cache revive a visitor workspace.
    const discard = () => { if (useAppStore.getState().isGuest) useAppStore.getState().endGuest(); };
    window.addEventListener('pagehide', discard);
    return () => { unsubscribe(); window.removeEventListener('pagehide', discard); };
  }, []);
  return (
    <AppErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <Router>
        <Suspense fallback={<div className="loading-screen" role="status">正在加载页面…</div>}>
        <Routes>
          <Route path="/workspace" element={<ProtectedRoute><MainLayout><Home/></MainLayout></ProtectedRoute>}/>
          <Route path="/voyage" element={<ProtectedRoute><MainLayout><ExpeditionHome/></MainLayout></ProtectedRoute>}/>
          <Route path="/greenhouse/:id/chapter" element={<ProtectedRoute><MainLayout><ExpeditionChapter/></MainLayout></ProtectedRoute>}/>
          <Route path="/voyage/runs/:id" element={<ProtectedRoute><MainLayout><ExpeditionRun/></MainLayout></ProtectedRoute>}/>
          <Route path="/voyage/evidence" element={<ProtectedRoute><MainLayout><ExpeditionEvidence/></MainLayout></ProtectedRoute>}/>
          <Route path="/voyage/sync" element={<ProtectedRoute><MainLayout><ExpeditionSync/></MainLayout></ProtectedRoute>}/>
          <Route path="/base" element={<ProtectedRoute><MainLayout><ExpeditionBase/></MainLayout></ProtectedRoute>}/>
          <Route path="/me" element={<ProtectedRoute><MainLayout><ExpeditionMine/></MainLayout></ProtectedRoute>}/>
          <Route path="/trial" element={<GuestEntry/>}/>
          <Route path="/explore" element={<Explore/>}/>
          <Route path="/explore/art" element={<VisualLibrary publicView/>}/>
          <Route path="/visual-library" element={<ProtectedRoute><MainLayout><VisualLibrary /></MainLayout></ProtectedRoute>} />
          <Route path="/agent" element={<ProtectedRoute><MainLayout><Agent /></MainLayout></ProtectedRoute>} />
          {/* 认证页面 */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* 主应用页面 */}
          <Route
            path="/"
            element={<HomeEntry />}
          />
          <Route
            path="/ai"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <AIAssistant />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/greenhouse"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <Greenhouse />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/greenhouse/:id"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <CourseDetail />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/tasks"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <Tasks />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/notes"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <Notes />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/achievements"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <Achievements />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <Profile />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <Settings />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/study-report"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <StudyReport />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/knowledge-graph/:courseId"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <KnowledgeGraph />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          {/* 默认重定向 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </Router>
    </QueryClientProvider>
    </AppErrorBoundary>
  );
}

export default App;
