# 辽宁省ICT本轮验证及符合性矩阵

日期：2026-10-27。仅对本轮实际检查与修改负责，代码仍为Preview。

## 已执行的检查

|命令/检查|结果|边界|
|---|---|---|
|npm test|6项通过，0失败|每次独立临时SQLite；Runtime是明确的注入fixture，不是真实云模型|
|python scripts/test_backup.py|1项通过|验证一致性复制、缺失源错误、拒绝覆盖目标；未备份个人库|
|npm run build|Web/server均通过|体积大于500kB与Browserslist过期提示仍存在|
|npm run lint|0错误、59警告|未清理无关既有风格警告|
|Prisma validate 两种schema|均通过|没有执行真实PostgreSQL迁移|
|Prisma migrate diff|生成AgentRun增量SQL|不涉及生产连接；迁移部署仍待演练|
|Gradle assembleDebug与testDebugUnitTest --offline|失败|JDK17及SDK34存在；Windows非ASCII路径检查在插件加载阶段阻断，-P与-D参数均未解阻；没有测试通过结论|
|现有后端 /api/health|status=ok|运行中的开发服务健康，不代表真实云端部署|

来源回归曾在旧实现得到SUCCEEDED导致断言失败；修复后，模型不调用tool而仅引用已存在来源时运行FAILED。成功fixture实际调用tool，检索证据写入AgentRun，再由run/confirm校验来源。HTTP集成测试实际监听随机本机端口，验证未登录401、未配置503、越权404、工具鉴权401。

## 符合性矩阵

|要求|实现位置|状态|证据/剩余工作|
|---|---|---|---|
|交互软件端|apps/web/src/pages/Agent、App.tsx|已实现且已验证|Web编译通过；既有页面可交互，新增界面完整业务仍待真云验收|
|真实数据库|Prisma schema、AgentService事务|已实现且已验证（本地）|临时SQLite真实写读、重复确认仅一份任务；生产部署未验证|
|真实AI|agentarts/runtime.ts、controllers/ai.ts|部分实现|真实HTTP代码存在，无当前有效云凭据调用证据；不将关键词搜索或fixture算AI|
|知识融合及确认|agentarts/service.ts、tests/service.test.cjs|已实现且已验证（fixture边界）|实际检索来源校验、失败不创建任务；云模型质量尚未验证|
|HarmonyOS|无ArkTS/HAP|尚未实现；鼓励项|不重写Android，不声称已适配|
|跨端同步|Android AppViewModel与ApiClient、Web store/API|部分实现|Android登录拉课程/任务/用户；本地笔记、签到全链路同步未验证，非实时推送|
|安全运行|JWT/security.ts、工具令牌、NetworkOnly和缓存清理|部分实现|鉴权集成通过；缓存策略构建通过，升级旧Service Worker实机行为尚未验证；无refresh/revoke|
|备份|scripts/sqlite_backup.py|已实现且已验证|临时库备份恢复测试，拒绝覆盖|
|需求/技术材料|成果根目录两个DOCX|部分实现|此前已排版，本轮实现和测试结果以本目录为准；提交前更新附件副本|
|视频|演示脚本存在，未见视频|尚未实现|真实AI接通后录3–5分钟|
|PPT|决赛素材清单|尚未实现；非初赛必交|本轮不制作|
|截止/包目录/200MB|requirements.md冲突表|待官方规则确认|不将口头延期和问题表提问当正式限制|

## 本轮文件修改

新增docs/competition三份A/B/C输出、operations.md、submission-checklist.md和本记录；新增scripts/test-server.cjs、sqlite_backup.py、test_backup.py、HTTP routes.test.cjs、Web clearLegacyCache.ts和AgentRun生产增量迁移SQL。修改AgentService实际检索证据校验、服务集成测试、package.json测试入口、vite.config.ts旧API缓存策略、main.tsx清理旧api-cache、README版本与同步声明。未删除源文件，未改.env、用户数据库或签名材料，未新打包/上传。

## 必要后续

P0：团队配置真实模型/AgentArts Runtime与可达后端，完成知识检索—规划—确认—任务读回并录制视频。P1：在ASCII路径副本或受支持构建环境验证Android；生产迁移与云部署演练；完善签到和完成任务的原子奖励、旧AI自动写工具安全边界；同步本轮结论到两个附件副本并核对盖章材料。P2鸿蒙原生与向量检索不阻塞本轮纯软件方案，但最终评价仍由组委会决定。

旧ZIP未更新，不应作为本轮最终包。没有真实模型、视频和盖章材料时，不声称已满足全部初赛提交条件。
