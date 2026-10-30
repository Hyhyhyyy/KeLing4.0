# Expedition V1：首章端云合同

状态：2026-10-30 实施基线。软件行为可自动测试；种子内容均为 `human_review_pending`，没有实际人工复核、真实模型 Key、真机或学生试点证据，不称 M4 完成。

## 范围与所有权

沿用 `User.id`、`Course.id`、可选 `Task.id`。服务器从 JWT 取得用户，不接受客户端 userId。网页游客沿用 RAM 工作区用户和课程；Android 游客使用同一 JSON fixtures，退出清零。游客不向登录 API 写入，不承诺跨设备保存。登录账户的离线作答保留原版本，最终结算以服务器响应为准。

共享入口 `@keling/shared/expedition`，类型与纯规则在 `packages/shared/src/expedition/`。只接受显式传入的时间和 ID；无网络、存储、随机、系统时钟。内容为原创文字及树参数，算法含义参考 Princeton 的 BST 定义和层序遍历说明，不复制其代码、图或题。教材引用不是内容审核证明。

后端/共享核心/种子题/并发测试由后端代理维护。网页和 Kotlin 界面各由对应代理维护。材料上传解析和 AI 辅导由 root 维护；不得各自增加另一套奖励判定。

## 首章内容

`chapterId=binary-tree`，`contentVersion=1.0.0`。三个稳定目标键 `bt.bfs.queue`、`bt.dfs.stack`、`bt.bst.bounds`。18 道原创种子题：每目标 4 道路线修复题和 2 道教星芽题，含不同结构的初学、独立候选与回访候选。综合试炼依次覆盖三个目标；回访必须到期后使用新变式。训练失败不销毁历史成果。

规则通过产生 `RULE_CHECKED` 反馈和 `ATTEMPTED` 记录；开放解释、自评是 `SELF_REPORTED`，AI 只能给 `AI_SUGGESTION`。只有具备独立人工审核记录的题、未看过的新变式、无提示且首次正确，才能形成严格独立证据。当前所有种子题都待人工审核，严格独立/延迟徽章关闭。审核元数据只能随服务器内容发布，客户端无审核开关。测试中的审核 fixture 不进入生产内容。

## HTTP

统一前缀 `/api/expedition/v1`。返回 JSON；时间为 ISO UTC。错误 `{error,code,current?}`，409 保存客户端草稿，不能用最新版本静默覆盖。请求体不得携带正确性、奖励金额或徽章授权。

| 方法与路径 | 输入 | 输出 |
| --- | --- | --- |
| GET `/catalog` | 无 | `{chapter,decorations,rules}` |
| GET `/courses/:courseId/chapters/binary-tree` | 无 | `{chapter,progress,account,runs,serverTime}` |
| POST `/runs` | `{opId,courseId,questKind,objectiveKey?,mode,deviceId}` | `{run,writer,progress,account}`；重复 opId 相同内容返回原 run |
| GET `/runs/:id` | 无 | `{run,progress,account,serverTime}`，不包含 writer token |
| POST `/runs/:id/commands` | `Command` | `Receipt` |
| POST `/runs/:id/lease` | `{opId,expectedRevision,deviceId,intent,writer?}`；intent 为 acquire/renew/release/takeover | `{run,writer?,serverTime}`，token 仅返回实际获得资格的设备 |
| GET `/rewards` | 无 | `{grants,account}` |
| GET `/courses/:courseId/evidence` | 无 | `{evidence:Evidence[]}`，只含本人该课程事件 |
| POST `/progress/:id/memory` | `{opId,expectedRevision,memoryId,action:'UPDATE'|'DELETE',text?}` | `{progress,replayed}`；编辑仍是自述，不转为严格证据 |
| POST `/base/commands` | `{opId,expectedRevision,decorationId,action:'BUY'|'EQUIP'}` | `{account,grant?,replayed}` |
| POST `/self-report` | `{opId,courseId?,title,notes?,durationMinutes}` | `{account,record,rewardGrants,alreadyRecorded,replayed}` |
| GET `/self-report?cursor=...` | 可选上一页nextCursor | `{records,nextCursor}`；每页最多50条本人线下自述，可跨端回看 |

`Command={opId,expectedRevision,writer:{deviceId,epoch,token},action}`。动作是 SUBMIT（顺序/结构选择/解释）、HINT、ACK_FEEDBACK（下一步计划）、NEXT、PAUSE、RESUME、CANCEL。`Receipt={opId,revision,serverTime,run,progress,account,feedback?,evidenceDelta,rewardGrants,replayed}`。NEXT 才切换题目；不能靠自行修改 run 状态完成。

SUBMIT.answer 的 structure 为 QUEUE/STACK；order 为节点编号。可额外传 `steps:[{type:'PUSH'|'POP',nodeId}]`，含根初始 PUSH，服务器逐步核验；不传 steps 时支持传统列表输入，不声称保存了完整容器操作。BST 的 order 是全部越界节点集合，选择顺序不限。重复/不存在节点是输入错误400，保留草稿而不记为知识错误。开放解释 explanation/selfCheck 永远不能自行声明通过审核。AI 提示入口必须先记录 HINT，再请求建议。

状态：`ACTIVE/PAUSED/AWAITING_FEEDBACK/SETTLED/CANCELLED/CONTENT_STALE`。练习结果与结算分开；待同步是客户端覆盖层，不是伪造服务器的 SETTLED。

RunState 的兼容可选字段 `pausedAt/pausedMs/endedAt` 记录服务器确认的暂停区间与结束时间；RunView.timing 为 `{asOf,elapsedMs,pausedMs,runningMs,label:'SESSION_TIME_NOT_STUDY'}`。elapsed是会话起点到结束/当前的经过时间，paused含当前未恢复的暂停区间，running只是二者之差。结束、取消、内容失效后时间固定。界面只能称“会话经过/暂停时间”；没有前台证据时不能把后台挂起、锁屏或休眠自动计为真实学习分钟，经济规则完全不使用这些时长。

## 持久结构（SQLite/PostgreSQL 一致）

新增七类表，JSON 字段均在共享层有明确类型和版本；过程事件不可变，投影可重建。

1. `MaterialVersion`: `id,userId,courseId,materialId,version,title,format,content,contentHash,parseStatus,parserVersion,sourceName,supersedesId?,createdAt,deletedAt?`。`unique(userId,materialId,version)`；format=TEXT/MARKDOWN/PDF/SEED，parseStatus=READY/FAILED。content 是规范化换行后的不可变文字。增加版本，不原地覆盖；删除用 tombstone。
2. `SourceSpan`: `id,materialVersionId,ordinal,startUtf16,endUtf16,page?,paragraphIndex?,heading,textHash`；`unique(materialVersionId,ordinal)`。位置 `[start,end)`，UTF-16 code unit，page 一基、paragraphIndex 零基。UTF-8 SHA-256 对应切片；不得在截断后伪造页码。材料模型由 root 使用，schema 由后端代理统一修改。
3. `ExpeditionProgress`: `id,userId,courseId,chapterId,revision,contentVersion,state,createdAt,updatedAt`；`unique(userId,courseId,chapterId)`。state 保存三个目标摘要、回访周期、已展示题和用户确认的伙伴档案；奖励稳定目标键跨复制任务不变。
4. `QuestRun`: `id,userId,courseId,progressId,taskId?,revision,status,state,writerDeviceId,leaseEpoch,leaseTokenHash,leaseExpiresAt?,createdAt,updatedAt`。state 是 `RunState`，保存题目版本、模式、首次答案、提示和当前反馈；历史 Attempt/Evidence 在 Operation 中。
5. `ExpeditionOperation`: `id,userId,opId,scope,scopeId,requestHash,payload,receipt,createdAt`；`unique(userId,opId)`。payload/receipt 不含租约 token、Key；每次有效作答与反馈形成不可变过程证据。查询仅本用户。
6. `RewardGrant`: `id,userId,stableKey,kind,exp,crystals,ruleVersion,reason,sourceId,createdAt`；`unique(userId,stableKey)`。封顶的零金额也保存，规则升级不能重领。
7. `ExpeditionAccount`: `userId` 主键，`revision,legacySnapshot,world,quotaDay,cycleCount,selfReportCount,crystalsGranted,createdAt,updatedAt`。不是新钱包；`User.exp/level/crystals` 仍唯一余额。首次启用截图式保存旧余额及历史能量，不自动授徽，不相加本机余额。

MaterialVersion 和 SourceSpan 的生成、持久索引归 root；首章内置原创材料由后端幂等安装。只在拥有且未归档的 Course 下开始新 run。删除课程不得删除 RewardGrant 去重账本；历史 receipt 保留源课程 ID 和当时材料版本；删除账号整体清理。SourceSpan 引用包含 materialVersionId、hash 和位置，不能仅用 updatedAt 代替版本。

## 一致性、接续、离线

单命令事务：参数校验 → write-first 锁定 User 行、再锁 ExpeditionAccount → 同 opId 同 hash 返回原 receipt → 验证所有权及 run revision/leaseEpoch/tokenHash → 纯规则归约 → 写事件、唯一奖励、User 余额及投影 → 写 receipt → 一起提交。统一 User→业务行顺序覆盖旧任务与课程 CRUD、材料和计划确认，锁定不需要改动用户资料。相同 opId 不同内容报409；有限重试数据库写冲突。过程外部 AI 调用不能占用事务。

租约 120 秒，可主动续期；接管必须明确 takeover，epoch 增长使旧端失效。到期仍能保留本机草稿，不能继续发权威操作。GET 不含 token，历史 receipt 也不保存 token。获取租约的安全重试重新签发给该 device 的 token，使旧 token 失效。

同 device 的有效租约可通过 acquire 在重启后重签 token，保持 epoch 和 run revision；旧 token 随即失效。requestHash 排除 token，保留 deviceId/epoch/expectedRevision/action，故原操作可用新 token 重试。已提交 opId 总是返回原收据；未提交的旧 epoch 请求必须冲突。过期 acquire 和显式 takeover 均提升 epoch/revision，不能自动把旧离线队列改成新 epoch。

账户离线队列保存 opId、base revision、lease epoch、原答案；恢复时按顺序提交，遇冲突停队列并显示当前服务器与原草稿，由用户保留练习副本或采用远端。任何旧设备草稿不能静默变为新设备输入。游客无磁盘队列。材料更新或 tombstone 后未完成 run 报 CONTENT_STALE，历史已提交证据仍指向原版本。

## 经济与证据

学习循环稳定键 `cycle:{objectiveKey}:{cycleId}`；独立里程碑 `independent:{objectiveKey}`；延迟验证 `review:{objectiveKey}:{reviewCycleId}`。cycleId 只来自 initial 或服务端预约回访；不使用随机 runId 或规则版本做经济去重。3目标共享 canonical key，复制题、任务、课程不能刷新首次奖励。

有效尝试+阅读反馈+选择下一步：10 XP / 2结晶，每日最多5循环。经审核首次独立证据20/4；到期经审核新变式15/3；每日结晶总发放最多30。首次错误、提示或看解答后再答对是训练；需新变式才可独立验证。开放解释不授严格徽章。回访锚点使用服务器时间至少24小时，迟到无惩罚；待审核内容可做实践回访，但不能称延迟验证通过。

旧签到、计时和直接点击完成均不再增加能量、XP、结晶。手动线下自述使用独立表单和 `/self-report`：title 2–180字、notes最多2000字、durationMinutes为1–1440整数。每天最多5次各2XP，0能量/结晶；封顶后仍保存自述及零额账本，不改变知识状态。原opId重试回原记录；同一天相同课程/标题/说明/分钟也不重复写StudyRecord或累计分钟。稳定键是 `self-report:` + SHA256(UTF8(JSON.stringify([studyDay,courseId??'',title.trim(),(notes??'').trim(),String(durationMinutes)])))，五个数组项全部为字符串；shared `selfReportCanonical`/`applySelfReport`供游客复用。不能把旧完成按钮隐式变为自述奖励。新账号余额从0开始；旧余额不减。旧成就仍是历史荣誉，不映射知识证据。

基地仅1slot；装饰确定价格6/9/12，买一次拥有，重复装备不扣费；购买唯一键不包含客户端 opId。最低余额检查、消费和场景更新同一事务。建筑不解锁学习特权。

## 验证门槛

同事件重放、同ID异内容、并发提交/双端接管、随机新run刷目标、日上限、余额不足、资料版本变化、未审核徽章门控、提前回访、帮助后换题、退出游客后迟到结果、历史余额不重叠迁移、SQLite/PostgreSQL schema一致、Web和Kotlin同JSONfixtures。程序测试只能证明规定输入下行为，不能代替内容人工审核、模型真实调用或学习效果试点。
