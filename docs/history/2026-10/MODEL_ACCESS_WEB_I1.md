# Web 自带 API Key 临时问答（2026-10-30）

> 历史记录（2026 年 10 月）。保留当时版本、操作和验证结论；当前入口与运行方式见[文档索引](../../README.md)。

## 用户可以怎样使用

常规 AI 页顶部提供「共享学习会话」和「我的 API Key · 临时问答」。后者直接展示密钥输入框，不需要查找部署环境变量。设置页也提供明显的「API Key 与模型配置」面板。试用页复用同一组件，使用匿名接口，不依赖登录 token。

1. 粘贴自己的 API Key。程序只在本地检查格式，不向厂商发送试探请求。`sk-ant`、`sk-proj` / `sk-svcacct` 和 `AIza` 分别显示 Anthropic、OpenAI、Gemini 的候选；普通 `sk-`、JWT 和未知格式要求手动选择，格式本身不证明密钥有效。
2. 选择实际的服务商。需要地域或工作空间地址时，选择服务端给出的官方候选，或填写该厂商允许的官方地址。默认候选不是账号所属区域的保证，仍需核对。
3. 点击「验证并获取模型」，只向这一家服务发送一次发现请求。显示本次返回的模型、聊天/向量/未知能力标签、获取时间与服务端范围说明。再次点击才刷新，不后台轮询、不按旧清单冒充实时结果。
4. 选聊天模型，或手动填写模型 ID。向量模型不能当作聊天模型选择；能力未知的条目可以尝试，但界面明确说明目录可见不代表有权限或余额。
5. 输入问题，明确勾选需要附带的资料。可以展开并手动编辑「本次摘录」，不修改原课程或笔记。问题最多 4000 字符；最多 3 段资料，每段标题 120、正文 2000 字符。超过限制保留文本并阻止发送，不静默截断。
6. 点击「使用我的 Key 发送问题」才调用模型，内容与所选摘录交给当前服务商，可能消耗该服务商额度。不会读取共享会话历史。
7. 回答返回后可复制问题、回答与资料快照。已登录的常规 AI 面板还提供「保存到共享笔记（云端）」按钮；只有点击才写云端笔记，不保存 Key。试用页的保存由父页面明确写入本次内存笔记。

常规 AI 里切换模式保留共享会话的草稿。课程/任务/笔记入口已取得的预览，可以作为自带 Key 面板的候选资料，仍须重新明确勾选；临时问答发送的是可编辑快照，不执行共享会话 API 的资料指纹校验。资料版本和服务端截断说明被带入摘录，便于用户核对。

## 密钥与数据生命周期

`services/modelAccess.ts` 使用没有 persist 中间件的内存状态，不读取或写入 localStorage、sessionStorage、Cookie 或账号存储。请求使用独立 fetch、`credentials: omit`、`cache: no-store`，Key 仅在 JSON POST 请求体中，客户端 URL 和错误文案中不放 Key。

`ModelAccessPanel` 的 `scopeKey` 隔离登录账户与匿名试用。切换 scope 时先清空，再显示新表单；离开面板、刷新、点击一键清除、退出或切换账号均应清空。组件卸载会清空，App 层由主线注册账户变化清空，试用父页面另负责退出、pagehide 和重置。设置页跳到问答页后需重新粘贴 Key，界面已说明。

错误显示固定的可恢复中文提示，不显示原始上游 error。返回值按已知字段取用，已知 Key 字符串会从模型返回内容中隐藏，避免错误或异常响应回显。停止等待、换配置和离开页面会中断客户端请求，并丢弃迟到结果；已送达服务商的请求仍可能继续计费，因此不会承诺取消即免计费。

## 组件与调用链

- `ModelAccessPanel.tsx/.css`：可复用配置、显隐、格式候选、资料选择和临时问答 UI；不导入账号 store 或普通认证 API。
- `services/modelAccess.ts`：内存配置、scope、格式候选、JSON 接口、固定错误映射和带来源的 Markdown 导出。
- `GET /api/model-access/catalog` → 服务商选择与官方地址候选；实际当前后端返回 17 个云服务商，可由管理员额外预置一个 custom 服务。
- `POST /api/model-access/discover` → 用户主动获取目录，成功后优先选已知聊天模型，否则选能力未知条目；不会默认选仅向量模型。
- `POST /api/model-access/complete` → 单轮问题和用户勾选的摘录；无共享 session 创建。
- 常规 AI 的显式保存 → 现有 `noteAPI.create`，保存问题、答案、模型与实际发送的来源快照。

组件接口：`variant` 为 `full` 或 `configuration`；支持 `message/onMessageChange` 受控问题、`initialMessage`、`context` 候选摘录、`onAnswer`、`onSaveAnswer`、`scopeKey` 和底部 children。`onAnswer` 返回 answer/model/usage，以及客户端补充的 question/context/providerId。`formatModelAccessAnswer` 统一生成可保存的内容。独立父页面可调用 `clearModelAccess()` 重置。

## 官方资料与实现边界

- [OpenAI List models](https://developers.openai.com/api/reference/resources/models/methods/list)：从当前服务 API 获取模型条目，不把硬编码模型名列表当实时目录。目录未提供足够能力元数据时保持未知。
- [Anthropic List Models](https://platform.claude.com/docs/en/api/models/list)：模型目录可以用于判断 API 可见的模型，分页与顺序由服务端协议处理；浏览器不直接持 Key 请求第三方。
- [Gemini Models](https://ai.google.dev/api/models)：接口提供模型元数据及支持能力，区分生成内容与嵌入能力，不能把列出的所有模型都当成聊天模型。
- 华为云大陆与香港区域、火山方舟 API Key 与 AK 签名的目录差异由主线后端核验；UI 按主线契约显示区域限制和手填路径。本文没有独立验证每家供应商的真实 Key、权限和额度，不声称所有平台已在线验收。

## 本子任务验证

- `npx.cmd tsc -b`：通过。
- 对服务、组件、常规 AI 和设置页执行 ESLint：0 错误、0 警告。
- 使用 esbuild 在内存构建服务模块并注入 mock fetch，断言通过：三类格式候选与普通 Key/JWT 不可靠分支、scope 清空、旧请求 revision 防覆盖、优先聊天模型、只向所选服务 POST、请求不带账号凭据且 URL 不含 Key、固定错误不泄露原错误、响应白名单与已知 Key 脱敏、一键清空。
- 上述 mock 只验证客户端控制与传参，不代表真实供应商调用成功。主线最终 Web build 与远程部署构建通过，浏览器实际检查了 390px/桌面布局、17 个目录入口、合成 Key 本地候选与手选、清空和禁用状态。无有效 Key，用户已明确接受真实模型调用未实测的交付；不再等待凭据。详细覆盖见 `FINAL_DELIVERY_2026-10-30.md`，不能把未执行的重点步骤也计为通过。

重点浏览器步骤：有无 Key 时的禁用原因；粘贴未知 Key 不能触发网络；选择厂商不会自动验证；长问题与超长摘录保留并可编辑；验证失败仍可手填；停止等待后迟到回复不覆盖；两模式切换共享草稿保留但 Key 清除；一键清空、退出与匿名/登录 scope 不串 Key；明确保存后的共享笔记包括真实资料快照，不含密钥。
