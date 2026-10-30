import express from 'express';
import cors from 'cors';
import { prisma } from './database';
import { latestReleaseInfo, Release } from './services/release';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { allowedCorsOrigins, requireJwtSecret } from './config/security';
import { clientRateLimitKey } from './config/rate-limit';

// 导入路由
import authRoutes from './routes/auth';
import userRoutes from './routes/user';
import courseRoutes from './routes/courses';
import taskRoutes from './routes/tasks';
import knowledgeRoutes from './routes/knowledge';
import { assistantRouter } from './ai/routes';
import { modelAccessRouter } from './ai/modelAccess';
import { trialRouter } from './ai/trial';
import noteRoutes from './routes/notes';
import achievementRoutes from './routes/achievements';
import checkinRoutes from './routes/checkin';
import { agentRouter } from './agentarts/routes';

requireJwtSecret();



export const app = express();
const PORT = process.env.PORT || 3001;

const corsOrigins = allowedCorsOrigins();
app.disable('x-powered-by');
// Set only behind a private API port and the documented single Caddy hop.
if (process.env.TRUST_PROXY_HOPS === '1') app.set('trust proxy', 1);
app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || corsOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS policy'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, keyGenerator: req => clientRateLimitKey(req), standardHeaders: true, legacyHeaders: false }));
app.use(['/api/auth/login','/api/auth/register'], rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, keyGenerator: req => clientRateLimitKey(req), standardHeaders: true, legacyHeaders: false, message:{error:'登录尝试过于频繁，请稍后重试'} }));

// API 路由
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/ai', assistantRouter(prisma));
app.use('/api/model-access', modelAccessRouter());
app.use('/api/trial', trialRouter());
app.use('/api/notes', noteRoutes);
app.use('/api/achievements', achievementRoutes);
app.use('/api/checkin', checkinRoutes);
app.use('/api/agent', agentRouter(prisma));

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '3.2.5-preview'
  });
});

app.get('/api/ready', async (_req, res) => {
  try { await prisma.$queryRaw`SELECT 1`; res.json({ status: 'ready' }); }
  catch { res.status(503).json({ status: 'unavailable' }); }
});

// ==================== APP版本更新API ====================

// GitHub仓库配置
const GITHUB_REPO_OWNER = 'Hyhyhyyy';
const GITHUB_REPO_NAME = 'KeLing4.0';

// 缓存版本信息，避免频繁请求GitHub API
let cachedVersionInfo: any = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存

// 从GitHub API获取最新Release信息
async function fetchLatestRelease() {
  const now = Date.now();

  // 使用缓存
  if (cachedVersionInfo && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedVersionInfo;
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases?per_page=20`,
      {
        signal: AbortSignal.timeout(10_000),
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'KeLing-Server'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const releases = await response.json() as Release[];
    cachedVersionInfo = latestReleaseInfo(releases);

    cacheTimestamp = now;
    return cachedVersionInfo;
  } catch (error) {
    console.error('Failed to fetch GitHub release:', error);

    throw error;
  }
}

// 版本检查接口
app.get('/api/app/version', async (req, res) => {
  const clientVersionCode = parseInt(req.query.versionCode as string) || 0;
  const clientVersionName = req.query.versionName as string || '0.0.0';

  try {
    const latestVersion = await fetchLatestRelease();

    // 判断是否需要更新
    const needUpdate = clientVersionCode < latestVersion.versionCode;
    const forceUpdate = clientVersionCode < latestVersion.minVersionCode;

    res.json({
      success: true,
      currentVersion: {
        versionCode: clientVersionCode,
        versionName: clientVersionName
      },
      latestVersion: {
        versionCode: latestVersion.versionCode,
        versionName: latestVersion.versionName,
        updateUrl: latestVersion.updateUrl,
        updateLog: latestVersion.updateLog,
        fileSize: latestVersion.fileSize
      },
      needUpdate,
      forceUpdate
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      error: 'Failed to check version',
      currentVersion: {
        versionCode: clientVersionCode,
        versionName: clientVersionName
      }
    });
  }
});

// APK下载接口（重定向到GitHub Release）
app.get('/api/app/download', async (req, res) => {
  try {
    const latestVersion = await fetchLatestRelease();
    res.redirect(latestVersion.updateUrl);
  } catch (error) {
    // 重定向到GitHub Releases页面
    res.redirect(`https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/latest`);
  }
});

// 错误处理中间件
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.path.startsWith('/api/model-access') || req.path.startsWith('/api/trial')) {
    // Malformed JSON parser messages can contain body fragments, including a user's key.
    return res.status(err instanceof SyntaxError ? 400 : 500).json({ error: '请求格式不正确或服务暂时不可用', code: err instanceof SyntaxError ? 'VALIDATION' : 'INTERNAL' });
  }
  console.error('Error:', err.message);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 启动服务器
async function startServer() {
  try {
    // 测试数据库连接
    await prisma.$connect();
    console.log('✅ Database connected');

    app.listen(PORT, () => {
      console.log(`🚀 KeLing Server running on http://localhost:${PORT}`);
      console.log(`📚 API Docs: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// 优雅关闭
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  console.log('👋 Server shutdown gracefully');
  process.exit(0);
});

if(require.main===module)void startServer();
