# 辽宁省ICT增量 Implementation Plan

**Goal:** 基于附件3完成证据明确的可靠性增量，保留Preview状态和已确认学习规划主路径。

**Architecture:** 不引入新平台，沿用Express/Prisma/React。模型调用保持AgentArts，读工具返回来源后才接受有引用计划；无模型凭据不伪造成功。

**Tech Stack:** TypeScript、Node测试运行器、SQLite、Prisma；Python标准库用于本地备份与审查，不新增运行时服务。

## 范围与优先级

- P0：真实模型联调和视频证据。缺团队凭据时不能完成，继续完成独立代码验证。
- P1：检索引用证据、隔离测试库、API离线缓存安全、备份恢复、生产增量迁移说明、要求矩阵与初赛材料检查。
- P2：HarmonyOS原生、多模型切换、向量检索、PPT制作，均本轮不做。

用户已明确要求A/B/C后直接实施，沿用既有批准架构；不再要求额外方案批准，不建立Git仓库或工作树。

## Task 1 检索证据闭环

文件：apps/server/src/agentarts/service.ts、tests/service.test.cjs。

- [ ] 测试先行：调用注入Runtime但不调用tool，返回存在来源，断言运行FAILED；先观察旧行为SUCCEEDED导致失败。
- [ ] tool成功时将返回的sourceIds累积为retrievedSourceIds，run只用实际检索集合校验；确认时再按该集合验证。
- [ ] 成功fixture实际调用service.tool；验证无授权、跨用户、过期令牌和重复确认。

## Task 2 复现与数据保护

文件：scripts/test-server.cjs、scripts/sqlite-backup.py、vite.config.ts、schema/生产SQL。

- [ ] npm test创建系统临时空SQLite，使用Prisma生成的SQL初始化，测试结束关闭连接；不覆盖dev.db。
- [ ] 备份脚本采用sqlite3.backup；恢复仅允许新文件，先integrity_check；临时库测试恢复与拒绝覆盖。
- [ ] API使用NetworkOnly、清理旧api-cache，构建与lint核验。
- [ ] 生成生产AgentRun增量SQL并文档化备份/审核/迁移步骤，不执行生产迁移。

## Task 3 验证和交付记录

- [ ] npm test、npm run build、npm run lint；Prisma两种schema validate；实际尝试Android Gradle并记录SDK/JDK情况。
- [ ] 材料检查明确视频缺失，DOCX和README存在；PPT列决赛素材，不计初赛缺项；不生成ZIP。
- [ ] 更新gap-analysis和verification.md，写明已验证、未验证、部分实现、尚未实现与待确认。
