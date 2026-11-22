# AgentArts 内联接入与提交状态

2026-11-22（北京时间）。本轮依据用户提供的《01 妙搭发布负责人交接与AgentArts联调.md》、后端补丁、连接信息 Word 和两张配置截图实施。附件中的历史成功记录是交接方陈述，不作为本轮线上验收结果。本文记录接入工作，不是比赛申报正文或完整合规证明。

## 当前结论

主仓已接入 inline 模式并生成妙搭待发布产物；线上发布、真实网页规划与复盘、操作录屏尚未完成。阻塞来自飞书 CLI 缺少用户授权，以及华为云 Runtime 返回模板 Error 状态。不能据此填写“已满足全部提交要求”。

工作主仓为 `C:/Users/lenovo/Documents/ChatGPT/KeLing_ICT`，基线提交 `da1200b`，分支 `codex/agentarts-inline-20261122`。现有妙搭模板为 `C:/Users/lenovo/Documents/ChatGPT/课灵/keling-access-gateway`，本地基线提交 `2227303`，目标应用 `app_17h4dw5jwdg`。未核实当前远端发布版本，未推送或修改线上环境变量。本轮保留原有 APK 摘要删除状态及早期目录的未提交修改。

## 接入怎样工作

网页智能编排经现有 Agent API 进入 `AgentService`。`prepare` 校验当前用户、课程与考试日期并建立运行记录；`execute` 在 inline 模式调用现有 `tool`，取得课程资料和任务状态并记录实际来源 ID，将结果序列化为 `context` 字符串交给华为云。调用仍在服务器执行，浏览器不持有入站密钥。

`runtime.ts` 发送 HTTPS 请求并读取事件流；返回计划仍经过日期、每日总时长与实际检索来源校验。只有学生确认才通过事务创建任务；重复确认不重复写入。复盘把已有任务的完成状态、预计和实际用时作为上下文。回调模式保留原工具密钥要求。没有改数据库结构或运行生产迁移。

新增测试使用临时 SQLite 中的独立记录和模拟 Runtime，覆盖当前用户与课程资料范围、context 输入、真实记录的完成状态、来源审计、确认前不写任务、重复确认、越权确认、伪造引用和无资料失败。它证明本地接口行为，不证明华为模型效果；同名课程及标题关联的资料边界仍沿用既有实现。

## 本轮验证

- 主仓 `npm run build` 成功；网页前缀 `/app/app_17h4dw5jwdg/`，API 根路径 `/app/app_17h4dw5jwdg/api`，托管平台 miaoda。
- 主仓 Web lint：0 错误、34 警告；未在本轮扩大范围修改既有警告。
- 妙搭模板 lint、前后端类型检查、CSS 检查通过；4 项网关路径测试通过。
- 模板 Nest 后端和 Vite 前端本地构建成功；`dist/vendor/keling-server.cjs` 与当前 `vendor` 后端 SHA-256 一致；生成的 Prisma 客户端与运行包已核对存在。
- 未执行完整云端 Bash 构建与依赖裁剪后的平台启动验证；本地分步构建不能代替该项。
- 服务端测试结果见同目录 JSON。本轮首次新增测试因 fixture 缺少必填 description 失败，已修复后重跑。

## 真实 Runtime 探测

两次使用附件提供的地址与入站凭证，发送明确标记为接口测试的合成二叉树资料；没有发送个人笔记或生产数据。均使用 published 模式、inline context，没有 toolToken。

| 请求 | HTTP | 耗时 | 运行 ID |
| --- | --- | --- | --- |
| 1 | 403 | 1.51 秒 | 145a20cb-241b-4fff-b72d-c63e9e9dfaa1 |
| 2 | 403 | 0.92 秒 | ad4b22c0-808d-4ddb-ae29-bc3a3f4d7ee7 |

第二次响应可读片段显示 `can not create sandbox of template in Error status, should in [Initialized Ready] status`，并出现 `NA.10000` 和 `get app credential failed`。这是 Runtime 返回的错误，不是妙搭入站网关错误。当前证据不足以确认入站 Key 是否有效或判断哪一项云端凭证异常；需要华为云账号持有人检查该运行模板及部署日志，恢复可运行状态后重试。失败发生在取得工作流输出之前，因此 toolToken 可选性、真实事件格式、模型任务字段仍未验证。

## 发布与验收的未完成项

1. 完成飞书用户授权，回读当前发布版本、远端代码和在线环境配置。保留回滚基线，再将本地模板与最新远端合并。
2. 华为云运行实例恢复后确认开始节点 toolToken 为可选；先验证 published API 能返回结构化计划，按实际响应检查解析兼容性。
3. 在妙搭服务端配置 `PLANNING_PROVIDER=agentarts`、`AGENTARTS_CONTEXT_MODE=inline`、完整 `AGENTARTS_RUNTIME_URL` 和只含值的 `AGENTARTS_API_KEY`。原 Word 是私密连接材料，不放进共享包。附件曾提示旧凭证暴露，凭证是否已更换尚未核实。
4. 推送确认后的模板提交，发起发布，记录本次 release_id、finished 状态、提交与时间，检查线上 `/api/agent/status`。
5. 用网页演示账号创建独特笔记，实测规划、引用、日期和每日 30 分钟约束；确认入库并重复确认，验证新增为零；完成一条任务后复盘；空资料失败后任务不增加。保存真实运行记录和操作录屏原片。
6. 回传发布版本、脱敏规划与复盘记录、入口、原片、逐项结果及失败项。当前无真实成功样本、线上录屏或新发布版本，不能补写成功数据。

交接给出的现有网页入口：https://ucn5aajxnx7f.feishu.link/app/app_17h4dw5jwdg 。该地址不是本轮新发布成功的证明。本次附件未包含完整赛事官方提交规则，不能扩大宣称已完成全部赛事合规核验。
