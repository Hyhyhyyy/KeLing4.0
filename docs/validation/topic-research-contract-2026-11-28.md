# 主题检索与原生能力调用合同

本记录说明 2026-11-28 的代码合同与隔离测试。它不替代发布后的真实检索、真实模型内容质量或移动端操作验收。

## 原始资料进入生成的路径

`apps/server/src/learning/topicResearch.ts` 为主题创建两条查询，分别关注词义与使用语境，以及出处、争议、应用和误区。`auto` 保留多义辨析，`general` 侧重标准概念，`internet_culture` 侧重网络流行用法。“抽象代数”“抽象概念”“计算机网络”不会因为单个字词被强制判作网梗；只有明确的网络文化线索或用户选择才切入该语境。没有为“奶龙学”设置固定答案，也没有将“学”字结尾直接等同于正式学科。

`NativePlanetService` 注册可信服务端搜索回调，通过模板导出的 `PlatformHttpClientService.instance` 使用既有应用、用户请求上下文。请求为固定平台路径 `/api/v1/studio/innerapi/integration_apis/call`，`apiName` 为 `tool.web_search`。此合同来自实际安装的官方 `@official-plugins/ai-search-summary` **1.0.14** 的 `dist/plugin.js` 中 `callSearchAPI`，其响应为 `data.output.results`，条目包含 `title`、`url`、`summary`，可选 `publish_time`。

使用原始搜索结果，是因为该插件公开的 `searchSummary` 动作只输出模型整理后的 `summary/content`，没有结构化来源列表。当前实现不从模型文字中解析或发明网址，不把普通生成答案当成联网检索结果。SDK 沿用既有鉴权，不读取生产密钥，不提供备用身份或绕过授权的接口；依赖拒绝访问时检索失败。

两条查询并行执行，单请求 30 秒超时、整体 40 秒上限，取消向下传递。来源按网址去重，保留最多十条，为每条分配稳定的本次编号。标题和摘要需存在，摘要至少 20 字符；过滤脚本协议、用户密码、字面 IP、localhost、local/internal 地址。网页摘录作为不可信资料传入模型，不执行其中指令。

`grounded` 表示至少取得两条不同网址的检索资料，**不表示资料内容已经事实核查**；`insufficient` 表示成功搜索但资料不足，`unavailable` 表示无服务或依赖失败。生成入口根据这三种状态决定是否继续，而不是用固定示例或模型记忆伪造检索成功。

## 原生模型实例

| 实例 | 官方插件与动作 | 入参与返回 |
|---|---|---|
| `keling-learning-planet` | `ai-text-to-json` 1.0.26 / `textToJson` / unary | 主题、基础、目标、语境、真实资料和题量；返回开篇、语义辨析、区域与题目、知识图谱 |
| `keling-learning-question` | `ai-text-to-json` 1.0.26 / `textToJson` / unary | 原课文、原题、资料、追加要求；只返回一个 `question` 对象 |
| `keling-planet-artwork` | `ai-text-to-image` 1.0.21 / `textToImage` / unary | `prompt`，固定 1:1、watermark=false；返回 `images:string[]` |

`plugin-hydrate.js` 已从实际 manifest 和实例 JSON 生成投影，临时原始投影保留在 `.cache/topic-research-20261128/`。标准 CLI 的 `plugin list` 不可用，另一个 capability CLI 返回命令错误，因此使用 skill 指定的本地 hydration 回退；未调用环境变量拉取命令。图像实例为根任务实现，本记录仅核对其调用结构。

课程生成提示要求六种题型，选择题四至六个选项，多选至少两个正确选项，6/12/18 题在三个区域中均分；简答为参考答案与自核要点，不宣称自动判分。知识图谱为 4—48 个有内容和来源的节点，关系分为无环层级关系与跨分支关联，模型按主题选择分支和层级。题量、结构、来源与存储保护由共享及服务端验证器另外执行，不能仅依靠提示词。

## 已执行的隔离测试

命令：`node --test apps/server/tests/topicResearch.test.cjs deploy/miaoda/server/modules/gateway/native-planet.spec.cjs`。8 项通过、0 失败，覆盖原始来源去重、检索缺失与失败、恶意网址过滤、一般化语境查询、取消、SDK 请求合同、403 错误脱敏、整星球和单题调用入参。

这些用例使用明确的合成搜索结果、替身 SDK 与模型返回，仅验证合同与失败行为，不是“真实 AI 检索成功”的证据。真实联网与模型验收须另行记录实际请求、返回内容、来源、耗时及失败样本。

完整 `npm test` 使用临时隔离 SQLite：125 项通过、0 失败。覆盖 6/12/18 题、完整图谱与环路拒绝、真实来源合同、单题预览/保存再生、所有者保护、旧答案局部清理、图片失败保留原图、无关检索主题拒答，以及既有账号和学习闭环。它们仍是程序测试，不是生产模型质量结论。

模板补齐 `@lark-apaas/nestjs-common@0.1.9` 显式依赖后，服务端/客户端类型检查、ESLint 与 Stylelint 均通过。模板四份接口测试共 24 项通过；后续 APK 元数据更换后需重跑资源测试。
