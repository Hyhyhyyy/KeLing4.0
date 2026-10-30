// The build compiles the same Express application used locally and in Docker.
// Missing cloud credentials must never cause a fallback to temporary SQLite.
let app;
module.exports = (req, res) => {
  if (!process.env.DATABASE_URL || Buffer.byteLength(process.env.JWT_SECRET || '') < 32) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ code: 'DEPLOYMENT_NOT_CONFIGURED', error: '云端共享服务尚未连接，请先完成数据库与服务配置' });
  }
  app ||= require('../apps/server/dist/index.js').app;
  return app(req, res);
};
