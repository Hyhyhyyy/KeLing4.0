# 安全运行与迁移

本地根目录执行npm test会创建独立临时SQLite，不修改dev.db。测试fixture不是云模型调用证据。初始化现有数据前必须备份，不能对非空库执行init-local.sql。

SQLite一致性备份：`python scripts/sqlite_backup.py apps/server/prisma/dev.db 备份新文件.db`。恢复也用该命令从备份复制到全新路径，验证后停服务、人工切换DATABASE_URL；脚本拒绝覆盖已有文件。备份含个人数据，置于项目之外，勿提交或上传。

PostgreSQL增量迁移：新增prisma/migrations/20261027000100_agent_run/migration.sql。迁移仅建AgentRun表与索引，已离线生成SQL，尚未在真实PostgreSQL执行。先备份、在临时生产同版本数据库演练，再人工执行prisma migrate deploy；历史生产库若已手建AgentRun，须先核对迁移基线，不能直接重复建表。当前任务不执行生产迁移。

旧AI对话工具存在自动写入路径，不作为比赛确认执行主链路；演示使用智能编排并配置真实Runtime。Android DeepSeekClient主动禁用，未完成后端接入；不展示本地规则响应为真实模型。JWT无refresh接口，过期重新登录；可信发布需按SECURITY.md轮换历史泄露签名，不能沿用旧keystore。

API响应不应离线缓存。新构建将旧生产API改NetworkOnly并删除旧api-cache；正式部署后应注销旧Service Worker并检查共享设备浏览器站点数据。用户主动导出资料前应知悉其敏感性。
