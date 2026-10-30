// Additive, restartable SQLite migration. Production uses Prisma migrations instead.
const fs = require('node:fs'); const path = require('node:path'); const { DatabaseSync } = require('node:sqlite');
const server = path.resolve(__dirname, '../apps/server');
require(require.resolve('dotenv', { paths: [server] })).config({ path: path.join(server, '.env'), quiet: true });
if (process.env.NODE_ENV === 'production' || !process.env.DATABASE_URL?.startsWith('file:')) throw new Error('仅支持本地 SQLite');
const database = path.resolve(server, 'prisma', process.env.DATABASE_URL.slice(5));
const relative = path.relative(path.join(server, 'prisma'), database);
if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(database)) throw new Error('请先运行 setup:local，数据库必须在项目 prisma 目录内');
const db = new DatabaseSync(database);
try {
  const sql = fs.readFileSync(path.join(server, 'prisma/upgrade-assistant.sql'), 'utf8');
  db.exec('BEGIN IMMEDIATE');
  const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='AiSession'").get();
  if (!exists) db.exec(sql);
  const expeditionExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ExpeditionAccount'").get();
  if (!expeditionExists) db.exec(fs.readFileSync(path.join(server, 'prisma/upgrade-expedition.sql'), 'utf8'));
  db.exec('COMMIT'); console.log(exists ? '共享会话表已存在，保留所有数据。' : '已添加共享会话表；原课程、笔记、账户和历史记录均保留。');
} catch (e) { db.exec('ROLLBACK'); throw e; } finally { db.close(); }
