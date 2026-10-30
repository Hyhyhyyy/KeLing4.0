# 项目现状与差距

审查基线是当前工作区内“省赛提交成果/课灵智学编排源码”，原始对照为Keling3.0/KeLing3.0-main；不在两个副本之间自动同步。父目录不是Git仓库，原始对照只有未提交文件，成果副本无.git；不暂存、不提交、不覆盖环境变量或用户库。

|领域/要求|实际实现与证据|差距/优先级|措施与验证|
|---|---|---|---|
|R1/R2交互端|apps/web/src/App.tsx路由、Agent页面；实际React19，非介绍中的18|已实现但本轮待构建|构建及本地页面健康检查|
|R3真实数据|controllers课程/任务/笔记/签到，Prisma SQLite及PostgreSQL schema|已实现；事务完整性部分实现|真实临时SQLite测试，不读取个人数据|
|R4 AI|controllers/ai.ts真实DeepSeek HTTP代码；agentarts/runtime.ts真实Runtime调用|部分实现，当前未确认云凭据和真实调用|缺配置失败关闭、标记测试fixture，外部联调待团队提供配置|
|R5检索融合|AgentService工具读取用户知识节点和相关笔记|部分实现：原计划校验允许引用未实际检索到的来源，P1|保存实际返回来源集合，确认前约束引用，新增回归测试|
|跨端同步|Android AppViewModel.syncFromServer拉课程/任务/用户；DataStore保存本地笔记|部分实现，无WebSocket；Android云AI客户端直接抛错禁用|修正文档“实时全量同步”声明；端侧编译条件审查，暂不重写|
|安全|JWT HS256、issuer/audience、7天过期、32字节secret、CORS与限流|无refresh/revoke；旧AI对话会自动执行文本工具，P1风险|未完成硬化的旧AI工具不作为比赛主链路；新增知识编排确认事务测试|
|数据库迁移|本地全量init-local.sql，生产迁移目录为PostgreSQL旧基线|AgentRun没有对应生产增量迁移，P1|补可审阅SQL方案；不对用户生产库自动执行|
|PWA隐私|vite.config.ts原有api-cache对旧生产API使用NetworkFirst|跨账户离线缓存可能泄露，P1|API统一NetworkOnly并清除旧api-cache；构建检查|
|配置/启动|原postinstall固定生成PostgreSQL Client，与默认SQLite说明冲突|复现成本P1|显式生成脚本、隔离测试命令；不得重置现有库|
|备份|未发现备份恢复脚本|P1|补SQLite一致性备份/新文件恢复流程，禁止覆盖；临时库验收|
|签名|SECURITY.md说明历史keystore泄露；release无签名配置|尚未完成新可信签名，不可复用历史密钥|只允许debug开发验收；不生成或替换签名|
|shared|存在共享TS定义，但KnowledgeNode与服务端字段不同、API地址仍示例|部分实现|不宣称全端严格共享契约；列待统一，不做无关大重构|
|R6材料|两个已填DOCX和README、视频脚本已存在|视频尚未制作；旧ZIP不是本轮成果|整理清单，不打包/上传；PPT仅决赛素材|

本轮检查还发现签到记录与用户奖励非同一事务、完成任务奖励非原子操作，存在并发一致性风险；列P1待修，不能声称所有CRUD均已安全审计。SQLite/云部署不等同于已完成跨端实机验证。
