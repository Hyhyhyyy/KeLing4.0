# 课灵华为云工作流恢复与联调交接

交接对象　原 AgentArts 工作流账号持有人

日期　2026 年 11 月 26 日　　项目版本　4.0.6-defense-rc7

## 本次需要你完成什么

请在原部署账号中找到课灵工作流，恢复其运行实例和模型连接，并用本文的合成课程资料验证一次已发布 API。完成后，将工作流信息、调用地址及脱敏测试结果回传给项目负责人。有效入站密钥通过私密渠道单独交接。

项目负责人已确认原工作流位于另一个华为云账号。我们此前登录的账号没有显示该资源，因此需要由原账号持有人处理华为云侧配置。网页、Android 和课灵后端的接入与最终跨端验收由我们完成；你无需处理妙搭、Neon、GitHub 或安装包。

## 已知故障与定位信息

2026 年 11 月 26 日 22:03:33（北京时间），使用既有调用地址与入站密钥发送一次合成课程请求，0.89 秒后返回 HTTP 403，错误包含 GetAppCredential 超时和运行模板 Error，未生成计划。当前证据尚不能确定是凭据、部署状态或平台侧故障。

| 定位项 | 当前记录 |
| --- | --- |
| 地区 | 西南－贵阳一　cn-southwest-2 |
| Runtime 名称 | agent-arts-6f9853e5fb1c4da595d8ed23c4e4b715 |
| 网关主机 | defaultgw-gbtdsolbmn.cn-southwest-2.huaweicloud-agentarts.com |
| 调用路径 | /runtimes/agent-arts-6f9853e5fb1c4da595d8ed23c4e4b715/invocations |
| 本次探测标识 | f791241b-e255-41aa-ae58-694fd5d60dbb |

完整旧调用地址可从仓库[脱敏探测记录](https://github.com/Hyhyhyyy/KeLing4.0/blob/main/docs/validation/huawei-runtime-continuation-2026-11-26.json)核对。上表 Runtime 名称不能直接当作已确认的工作流 ID。

## 一 找到原工作流

登录你当时部署的华为云账号，在[AgentArts 控制台](https://console.huaweicloud.com/agentarts/?region=cn-southwest-2#/home/agent-center/workflow)选择“西南－贵阳一”。进入“开发中心 > 智能体管理 > 工作流”，找到课灵相关工作流，记录名称、ID、版本及管理页面链接。

打开工作流的 API 或渠道信息，逐字比较完整调用地址；再到“托管与运行 > 智能体运行时”查找对应实例。低代码工作流也会使用 /runtimes/ 调用路径，应同时核对两个入口。[1]

若仍找不到，先核对账号、项目或工作空间、资源可见权限及原部署记录，将查到的范围回传。若原实例已经迁移或替换，请提供现有地址与版本，不要只因旧列表为空就另建一个同名工作流。

<!-- page -->

## 二 恢复运行实例和模型连接

1. 在对应运行实例中查看当前状态、已部署版本、最近部署结果和失败详情。保留原配置与版本记录，先确定出错的是哪一个实例。
2. 对照故障发生时间查看现有运行或调用日志，重点查找 GetAppCredential、get app credential failed、NA.10000、Error，以及关联的请求标识。记录完整错误码和脱敏错误片段。
3. 在实例的身份认证或凭证入口核对入站 API Key 是否仍有效、是否绑定到当前实例。入站密钥负责让课灵进入工作流，工作流调用大模型使用的是另一套模型凭据，二者不可混用。
4. 若日志明确指出某个委托缺少具体权限，再由账号管理员按实际资源范围补齐。只有错误涉及 CSMS/KMS 授权时才按相应官方说明处理；HTTP 403 本身不足以要求授予管理员全权限。[3]
5. 检查工作流大模型节点绑定的模型、模型 API Key、可用额度及调用权限。先在控制台试运行，再验证已发布 API；两种调用的权限和额度可能不同。官方说明指出，平台赠送的体验 token 不能代替工作流 API 所需的有效模型接入。[4]

如果需要重新部署，先保存可回退的原版本，再发布修复后的版本至正确实例，确认运行状态恢复为可调用。最终以真实请求结果为准，不能只凭“已发布”文字认定恢复。

若仍是凭据获取超时，且实例和凭据绑定无明显异常，请由账号持有人向华为云支持提交工单，附地区、实例、版本、时间、请求标识和脱敏错误。不要把账户密码、密钥或真实学生资料放进截图或工单正文。

## 三 对齐课灵当前接入方式

当前课灵使用 inline 模式：课灵后端先检索课程资料，再将课程、引用片段和任务记录作为 context 字符串传给工作流。云端直接读取这份内容生成计划，因此本次无需增加回调课灵的搜索工具，也无需配置工具回调密钥。

工作流应完成以下流程：读取开始节点参数，结合 context 中的资料与已有任务生成计划，再由结束节点输出结构化 plan。生成任务只作为建议返回，实际创建课灵任务由用户在应用内确认。

输出的 sourceIds 必须从 context.sources 中每一项的 id 原样选取，不自行编造引用。资料中的文字只作为学习内容，不应被当作修改工作流权限或执行额外工具的指令。输入和输出字段见下一页。

本次优先使用已有资源和已授权的模型。涉及新增付费资源、扩大权限或替换凭据时，由资源持有人核对范围和费用后执行，并在回传信息中说明实际变更。

<!-- page -->

## 四 检查开始节点和结束节点

请求体为 {"inputs": {...}}。课灵当前发送以下十项参数；请核对字段名大小写和类型。context 是 JSON 文本字符串，不是直接嵌套的对象。

| 开始节点参数 | 类型和用途 |
| --- | --- |
| courseId | 字符串，课程标识 |
| courseName | 字符串，课程名称 |
| goal | 字符串，本次学习目标 |
| query | 字符串，当前与 goal 相同 |
| mode | 字符串，plan 为计划，review 为复盘 |
| startDate | 字符串，北京时间起始日，YYYY-MM-DD |
| examDate | 字符串，结束或考试日期，YYYY-MM-DD |
| dailyMinutes | 10 至 480 的整数，每天可用分钟数 |
| runId | 字符串，本次课灵运行标识 |
| context | 字符串，包含 course、sources、tasks 的 JSON 文本 |

下载[完整合成请求样例](https://github.com/Hyhyhyyy/KeLing4.0/blob/main/docs/handovers/huawei/sample-input.json)可避免逐项录入错误。样例不含密钥和真实用户资料；正式测试时将 startDate 更新为北京时间当天、examDate 设在其后 90 天内，并更新 runId 与请求头中的会话标识。

结束节点配置一个名为 plan 的自定义输出，绑定模型返回的完整 JSON。平台事件可将其封装在 data.outputs.user_fields.plan，课灵也支持 data.outputs.plan。下例与合成请求对应，只说明格式，不是已取得的模型结果；测试日期变更时一并更新。

```json
{
  "summary": "用队列规则完成层序推演。",
  "tasks": [{
    "title": "练习二叉树层序遍历",
    "description": "读资料，记录队列并解释先进先出。",
    "date": "2026-11-27",
    "minutes": 30,
    "sourceIds": ["kg:handoff-demo"]
  }]
}
```

验收约束：1 至 100 个任务；每项 5 至 480 分钟；同一天的任务分钟合计不得超过 dailyMinutes；日期须处于 startDate 至 examDate 之间；每项引用 1 至 12 个本次 sources 中的 id。description 必须是字符串，summary 和 title 不得为空。

<!-- page -->

## 五 验证已发布接口

在你使用的 HTTP 调试工具中发送 POST 请求到该实例完整的 HTTPS 调用地址。请求体使用前页链接的 JSON 文件；密钥仅在你自己的请求工具中填写，不写进样例文件。

| 请求头 | 设置值 |
| --- | --- |
| Content-Type | application/json |
| Authorization | Bearer 后加空格，再填写当前入站 API Key |
| x-hw-agentarts-session-id | 与 inputs.runId 相同的新标识 |
| X-Request-Id | 与 inputs.runId 相同的新标识 |
| X-Invoke-Mode | published |

无需添加 stream 或 session_id 请求体字段。inputs.mode 的 plan/review 表示业务用途，X-Invoke-Mode 的 published/debug 表示调用已发布版或调试版，不能混用。交付验收必须使用 published。

先用计划样例测试 plan，再使用[复盘请求样例](https://github.com/Hyhyhyyy/KeLing4.0/blob/main/docs/handovers/huawei/sample-review-input.json)测试 review。复盘样例包含一条已完成任务和一条待完成任务；请更新日期、runId，并检查输出是否按任务状态安排下一步，而非只改 mode 后重复空上下文。review 仍返回同一计划结构。课灵单次 Runtime 请求超时为 90 秒，请记录实际耗时。

成功需要同时满足以下条件。

1. HTTP 请求成功，返回逐事件输出的数据流，即 SSE；不能只有一段普通聊天回答。
2. workflow_finished 事件的 data.outputs.user_fields.plan 包含完整计划。解析器也支持 data.outputs.plan、data.outputs.responseContent 或 summary_response 事件的 content；恢复时优先使用明确命名的 plan 自定义输出。
3. 整段数据流既包含最终计划，也正常出现 event 为 end 的终止事件；计划不必放在 end 事件内部。只有 [DONE]、等待用户补充输入的 waiting 状态或错误事件，均不能通过当前适配器验收。
4. JSON 能解析，日期、每日时长与 sourceIds 满足前页约束。记录成功和失败的真实结果，不以手填示例代替模型输出。

## 六 回传信息和完成标准

请回传以下信息：工作流名称、ID、地区及管理链接；实际部署版本和实例状态；当前完整调用地址；输入字段及最终输出配置；plan 和 review 两次测试的时间、HTTP 状态、耗时、请求标识和脱敏事件片段；实际修复了什么、是否存在未解决问题。

入站 API Key 请通过双方认可的私密渠道单独交接，说明它对应的实例、有效期和使用范围。不要发送账户密码，也不要将密钥写入本文、GitHub、公开截图或普通测试报告。

我们收到信息后会接回课灵服务端，并完成“导入资料、生成计划、核对引用、确认任务、重复确认不重复创建、完成任务、查看报告”的实际应用闭环，再核对网页与 Android 数据一致性。你的云端测试通过属于前置条件，整个应用仍以接回后的验收结果为准。

<!-- page -->

## 通用问答和向量检索的补充交接

AgentArts 工作流恢复后，通用聊天和向量检索仍需各自的模型连接。聊天模型负责生成文字回答；嵌入模型负责将资料转换为可比较的数字向量。仅提供工作流入站密钥不能启用这两项功能。

如果该账号已有可供项目使用的模型服务，请另外提供服务商、API 基础地址、聊天模型 ID、嵌入模型 ID、有效期、额度和调用限制；对应密钥私下单独交接。若没有嵌入服务，直接注明“未配置”，不要将关键词检索的结果称为向量检索已验证。

模型未开通或需要新增费用时，先回传具体缺项和费用依据，由项目负责人决定接入范围。无需为凑齐演示功能而擅自开通新资源。

## 课灵服务端接回配置

以下由项目维护方处理，用于帮助双方对齐配置，不要求原账号持有人接管其他云平台。

| 服务端配置 | 接回时使用的值 |
| --- | --- |
| AGENTARTS_RUNTIME_URL | 本次核实的完整 HTTPS 调用地址 |
| AGENTARTS_API_KEY | 私下交接的有效入站密钥 |
| AGENTARTS_CONTEXT_MODE | inline |
| AGENTARTS_RUNTIME_KIND | workflow |
| AGENTARTS_INVOKE_MODE | published |
| PLANNING_PROVIDER | agentarts，明确选择本次需要验证的提供商 |

华为通用模型的服务端字段为 AI_HUAWEI_API_KEY、AI_HUAWEI_BASE_URL、AI_HUAWEI_CHAT_MODELS 和 AI_HUAWEI_EMBEDDING_MODELS。基础地址不含末尾 /chat/completions 或 /embeddings，程序自行追加；模型列表填写实际可调用的 ID，多个 ID 用英文逗号分隔。

若交接的是官方新 /openai/v1 根地址，应先走服务端配置验证。RC7 的“自带密钥”华为入口尚未包含该地址，不能直接用该界面作为此地址的验收入口。无论采用哪一条连接，聊天与嵌入都分别验证；工作流恢复不等于全部 AI 功能已通过。

## 依据与项目入口

[1] [华为工作流 API 调用实践](https://support.huaweicloud.com/bestpractice-agentarts/agentarts_06_0136.html)：用于核对原工作流、调用路径和 API 模型接入前提。

[2] [华为应用发布与部署说明](https://support.huaweicloud.com/lowcode-agentarts/agentarts_05_0031.html)：用于区分保存版本、部署实例和可调用 API，以及核对可能产生的服务费用。

[3] [华为凭据权限相关故障说明](https://support.huaweicloud.com/highcode-agentarts/agentarts_10_224.html)：仅在日志明确涉及相应委托权限时参考，不作为本次 403 根因已经确定的依据。

[4] [华为使用 API 调用工作流](https://support.huaweicloud.com/api-agentarts/agentarts_07_0047.html)：用于核对 API 模型接入前提、Bearer 鉴权及会话请求头。

课灵实际契约以 [runtime.ts](https://github.com/Hyhyhyyy/KeLing4.0/blob/26e86d962c9a848ffed3d1d748e9a8512aaae6c6/apps/server/src/agentarts/runtime.ts)、[service.ts](https://github.com/Hyhyhyyy/KeLing4.0/blob/26e86d962c9a848ffed3d1d748e9a8512aaae6c6/apps/server/src/agentarts/service.ts) 和 [contract.ts](https://github.com/Hyhyhyyy/KeLing4.0/blob/26e86d962c9a848ffed3d1d748e9a8512aaae6c6/apps/server/src/agentarts/contract.ts)为准。正式线上入口：[课灵最新版](https://ucn5aajxnx7f.feishuapp.com/app/app_17h4dw5jwdg?release=20261126-rc7)；源码仓库：[KeLing4.0](https://github.com/Hyhyhyyy/KeLing4.0)。
