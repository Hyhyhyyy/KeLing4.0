# 3.2 星际学习空间：实现与复现

本轮解决三个具体问题：原助手只连接单一模型且会自动修改数据；两端学习资料与会话不完整共享；界面使用了多套不一致的视觉元素。现在以一个账号后端为事实来源，Kotlin 保留手机原生交互，网页保留大屏整理能力。本文描述已实现代码，不把模型协议测试等同于真实厂商联调。

## 怎么理解这次升级

“模型服务”是接收请求的厂商或自建服务器；“模型 ID”是该服务实际允许调用的模型名称；“协议”是请求与响应的数据格式。“向量模型”把文字变成可计算相似度的数字数组，用于找到相关资料，它与生成答案的聊天模型可以来自不同厂商。

实际入口是网页 `/ai`、Kotlin `StellarAssistantScreen`。两端调用同一组 `/api/ai/*`，密钥仅存在服务器环境变量中。界面显示的“已配置”只代表配置通过校验，不能证明余额、模型权限或网络可用。

建议亲手复现：在网页新建一篇笔记；手机设置同一后端地址并登录同一账号，点“刷新共享数据”；修改笔记后回网页重新打开。再尝试同时编辑旧版本，后提交的一端应显示冲突并保留草稿。这能直接区分“同样的界面”和“真正共享的数据”。

## 模型接入

目录位于 `apps/server/src/ai/catalog.ts`。共有 14 类入口：DeepSeek、百炼、Kimi、智谱、硅基流动、火山方舟、腾讯混元、华为云 MaaS、OpenAI、Claude、Gemini、OpenRouter、Ollama、自建兼容服务。

- OpenAI 兼容协议：`POST /chat/completions` 与 `/embeddings`。
- Claude 原生协议：`POST /messages`，系统消息、认证头和文本块单独转换；不提供原生向量选项。
- Gemini 原生协议：`generateContent` 与 `batchEmbedContents`，角色、系统指令和用量字段单独转换。

配置模板为 `apps/server/.env.ai.example`。将需要的条目追加到本地 `apps/server/.env` 或生产 `.env.deploy`，不要覆盖现有数据库地址与 JWT 密钥。每个服务使用 `AI_<ID>_API_KEY`、`_CHAT_MODELS`、`_EMBEDDING_MODELS`；所有服务均可用 `_BASE_URL` 覆盖 API 根路径。模型列表以逗号分隔，名称来自对应控制台和授权范围。云服务强制 HTTPS，地址不接受嵌入密码、查询参数或片段；只有明确启用的 Ollama 允许回环 HTTP。

例如，配置一个你有权限的聊天模型和一个向量模型后，重启后端，再打开新对话。不要把 `/chat/completions` 或 `/messages` 加到根地址尾部。Gemini 配置裸模型 ID，不带 `models/` 前缀。华为 MaaS 需填所在区域实际可访问的根地址；国内、国际站和 Coding 订阅不能默认互换。

网页“读取服务模型列表”只发现候选，不自动放进允许名单。它最多展示第一页前 500 条；服务不支持发现时可由管理员手动填写。没有内置的“所有厂商最新模型名单”，以免把不存在或未授权的型号显示成可用。客户端也不能提交任意模型 URL，避免把服务器变成可访问任意网络的代理。

`transport.ts` 实际执行认证、协议转换、75 秒请求超时、2 MiB 响应上限、完整输出检查与向量校验。向量必须数量正确、维度一致、数值有限且不全为零。401/403、429、网络、超时、截断等失败分别显示，不回传厂商原始错误中的敏感内容。用量仅显示厂商报告值。OpenAI 默认使用 `max_completion_tokens`；旧兼容模型可显式配置 `_TOKEN_PARAMETER=max_tokens`。

目前是异步整段回答，没有逐字流式输出。工具调用、图像输入、语音、Responses API、自动重试和自动跨厂商切换未实现；遇到这些输出不会冒充成功文本。

## 从输入到共享记录

```text
Web services/assistant.ts / Kotlin network/AssistantApi.kt
  → 鉴权与服务端允许名单
  → AiSession + AiTurn 持久化，认领该会话的一次生成
  → 可选 retrieve → transport.complete
  → 保存结果、引用、真实用量 → 两端查询同一会话
  → 用户点击“保存到共享笔记”才写入 Note
```

每次提交带稳定 `clientRequestId`。重复提交相同内容返回已有请求；同一 ID 改内容返回 409；同一会话同时生成也返回 409。刷新、切换设备或离开页面不等于重发请求。停止生成会先把数据库记录置为取消，迟到结果不能重新覆盖。进程重启或超过 180 秒后，通过下一次读取/提交将遗留请求标记失败，不自动再次产生模型费用。取消是尽力中断，厂商是否已计费由厂商决定。

资料检索默认关闭，用户主动开启后才把资料摘录发送给选定服务。当前候选范围是本人最近 24 个知识点和 12 篇笔记，每条最多 1000 字符，选最多 6 条；历史对话最多 10 个成功轮次、合计 24000 字符。关键词模式不调用向量服务；语义模式对本轮候选和问题实时计算向量，再按余弦相似度排序。它是有限范围检索，尚无全库分块索引、持久向量库或重排器；每轮重新嵌入会有额外用量，低上下文上限的向量模型可能拒绝输入，需要缩短资料或换合适模型。引用是检索证据，不保证模型正确理解了证据。

智能编排保留独立入口 `/agent` / `cloud_agent`，继续使用华为 AgentArts 或显式选择的 DeepSeek 规划服务。14 类聊天入口并不等于 14 种规划引擎。规划有来源检查、运行轨迹、计划预览与确认写入；配置见 [上一轮架构文档](MULTIPLATFORM_UPGRADE.md)。

## 共享范围与端侧差异

| 数据或能力 | 网页 | Kotlin Android |
| --- | --- | --- |
| 账号、头像、课程、任务、笔记、签到、AI 会话 | 同一后端 | 同一后端 |
| 资料整理 | 长文并排编辑、MD/TXT 导入、笔记/对话导出 | 随身查看与编辑，长文使用滚动区域 |
| 专注 | 本页计时，切到浏览器其他标签仍按经过时间计算 | 单调时钟倒计时、暂停继续、保持屏幕唤醒 |
| 数据刷新 | 页面进入与窗口重新聚焦，AI 活跃轮询 | 前台生命周期、显式刷新，AI 前台轮询 |
| 原有离线资料 | 无自动合并 | 保留“原有本机田园数据”入口，未自动上传 |

两端计时状态本身不共享；确认完成后的时长、任务状态与奖励共享。手机关闭计时页或进程被回收后不保证恢复活动计时，未实现后台前台服务。笔记使用更新时间做版本检查；同毫秒写入也保证版本前进，避免较旧草稿覆盖新内容。签到统一用北京时间的学习日，在事务内先认领当天唯一记录再发奖。旧的客户端直接改能量/结晶接口返回 410。

## 像素视觉资源

`assets/stellar/` 保存 15 个原始 PNG：12 个单体资源、3 张九宫格图集，共 39 个可用视觉单元。包括标题、应用图标、网页观测站横幅、5 个星芽姿态、9 个头像、9 个学科图标、9 个模块图标及签到/计时/输入/按钮装饰。

`scripts/sync-stellar-assets.cjs` 按字节复制到 Web public 和 Android assets；`verify-stellar-assets.cjs` 核对 SHA-256 与尺寸。提示词和生成文件名保存在 `assets/stellar/prompts.json`，图集位置见 `manifest.json` 与两端 StellarArt 组件。资源由 AI 辅助生成，未使用第三方角色素材，也没有把字体图案代替界面真实文字。

网页图集使用 CSS 定位，首页宽幅场景在小屏改用单体吉祥物；Android 用 Canvas 源区域取图、采样解码和有 12 MiB 上限的共享缓存，避免 9 个头像重复解码大图。启动图标使用自适应图标安全内边距。图形保持同源，布局、文字、交互区域按端独立。网页 `/visual-library` 可查看全部资源。

## 参考与适配依据（2026-10-29 核验）

- [用户参考项目，固定提交](https://github.com/Hyhyhyyy/learn-your-project/blob/8edcf17f9057f2a18cf27577a609956525b82c63/index.html)：借鉴协议分层、模型发现和独立向量设置的严谨性；未复制实现，未确认其许可。课灵将配置与密钥移至共享服务端，适应多账号和多端。
- [DeepSeek API](https://api-docs.deepseek.com/)：兼容调用格式及当前模型说明。遗留 DeepSeek 配置的默认模型已改为文档当前示例 `deepseek-flash`，仍建议部署时显式指定。
- [Claude API](https://platform.claude.com/docs/en/api/overview)、[Gemini generateContent](https://ai.google.dev/api/generate-content)、[Gemini embeddings](https://ai.google.dev/api/embeddings)：原生认证、角色、文本结果和向量协议分离。
- [百炼 OpenAI 兼容接口](https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions/)、[硅基流动入门](https://docs.siliconflow.cn/docs/userguide/quickstart)、[智谱不同账户的端点说明](https://zcode.z.ai/en/docs/configuration)：默认根地址及账户类型差异。
- [腾讯混元兼容接口](https://cloud.tencent.com.cn/document/product/1729/111007)：既有混元地址仍列于文档；新购服务向 TokenHub 迁移，部署者须按控制台覆盖地址和模型，不能据预设推断新账户可用。
- [华为 MaaS 模型调用](https://support.huaweicloud.com/model-call-maas/model-call-020.html)、[AgentArts InvokeRuntime](https://support.huaweicloud.com/api-agentarts/InvokeRuntime.html)：MaaS 的 Bearer 模型调用与 AgentArts 编排是不同能力，分别接入。
- [Ollama OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility)：本地服务的兼容范围，容器回环地址指容器本身。

部分服务仅做兼容协议适配，未逐个取得账号实测。模型可用性、费用、上下文上限、地区和数据条款均以实际厂商账户为准。
