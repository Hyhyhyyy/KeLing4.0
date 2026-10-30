# Web 上下文问答 I1（2026-10-29）

## 已实现的行为

课程详情的「AI 辅导」、每张任务卡的「问 AI」、共享笔记编辑区的「带着笔记问 AI」现在共用一个流程：只携带资源类型和 ID 进入新的本地 AI 工作区，读取服务端预览，编辑问题，最后由用户点击发送。进入页面和刷新预览都不会创建云会话，也不会调用模型。

预览显示服务端返回的标题、段数、每段实际摘录、版本时间和截断警告；每段可以展开，长文区域可通过键盘滚动。资料读取失败、读取中或模型未配置时，发送按钮禁用并显示原因。模型未配置不影响预览、问题编辑、刷新和移除。

从资料入口进入时，全局资料检索关闭；新会话首次发送也显式保存 `includeContext: false`。每轮携带预览指纹，由服务端再次检查版本。`CONTEXT_CHANGED` 或 `CONTEXT_NOT_FOUND` 会保留问题并使旧预览失效；不会自动再次调用模型。用户刷新、核对后再发送。移除资料后保留问题，但不自动开启全局检索。

笔记入口仅在当前笔记已保存且编辑内容与保存版本一致时可用。保存返回的笔记仍留在编辑区，随后可以直接问 AI；保存请求期间禁用编辑，避免返回结果覆盖新输入。新建笔记、修改中的笔记和导入后未保存的内容均不能通过此入口发送旧版本。任务正在本机计时时，暂时禁用该页 AI 入口并说明先完成或停止计时，避免导航丢失正在计时的状态。

## 调用链与状态边界

1. `AskAssistantButton.tsx` 调用 `beginAssistantLaunch`，把账户 ID、资源引用和通用初始问题放入内存，只把随机入口号放入路由 state；URL 不包含标题、正文、资源 ID 或问题。
2. `assistantLaunch.ts` 只保留一个短期入口（15 分钟），订阅账户变化并清空。`StellarAssistant.tsx` 按账户与导航键重建工作区。刷新、返回旧入口或入口失效时如实提示重新选择，不猜测原资料。
3. `assistant.preview(ref, signal)` 调用 `POST /ai/context-preview`。预览用 AbortController 和请求序号同时防止离开、移除和刷新后的旧请求覆盖当前状态。
4. 点击发送才调用 `assistant.create` 和 `assistant.send`。发送携带 `{kind,id,fingerprint}`；请求号的复用比较同时包含问题、会话和上下文，资料版本变化会使用新的请求号。
5. 新建对话、选择历史、离开页面与账户变化清理上下文。历史加载也检查选择版本；重新点击同一个历史会话仍会重新读取，不留下空列表。
6. 所有状态下，只要 turn 含 sources，就能展开当次资料快照。旧记录缺少 updatedAt 时显示「旧会话未记录版本」，不会伪造时间；导出的 Markdown 同时带版本与截断标记。

## 验证与证据边界

- `apps/web` 中 `npx.cmd tsc -b`：通过（exit 0）。
- 针对新增组件、服务、AI 页面和笔记页面的 ESLint：0 错误、0 警告。
- 加上任务和课程详情的 8 个改动 TS/TSX 文件：0 错误、10 个既有警告。警告位于原任务计时处理、旧 catch any 和课程加载 effect，不在新增上下文逻辑。
- 已按照 [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) 检查新增控件的语义、标签、状态播报、焦点和窄屏换行；使用本地 `web-design-guidelines` 技能。本轮没有新增动画，课程入口的既有 hover 动画在 reduced-motion 下关闭。
- 子任务未执行 Vite build、浏览器实测、部署或真实模型调用；这些由主线统一完成。编译通过不能替代下面的交互验收。

## 主线浏览器验收步骤

1. 分别从课程、任务、已保存笔记进入；检查预填问题、真实摘录、时间和长文截断。网络记录只能有 catalog、sessions 和 context-preview，没有 sessions POST 或 turns POST。
2. 在没有配置模型的环境里，确认资料可展开、刷新、移除，问题可编辑；发送禁用且原因可见。用键盘 Tab / Enter 操作入口、details 和刷新按钮；在 375 px 宽度检查卡片、资料和按钮不横向溢出。
3. 编辑一篇已保存笔记但不保存，确认 AI 入口禁用且草稿还在；保存后编辑区仍显示返回版本，入口可用。测试新建、导入和保存版本冲突。
4. 预览读取过程中点移除、新建对话或历史，确认迟到结果不能恢复旧预览。重新点击同一历史会话仍可加载；刷新浏览器或后退再前进时提示入口失效。
5. 在另一端修改/删除预览中的资源，再发送：409/404 应保留问题并清空可发送预览；刷新后需用户再次发送。此项需要服务测试或已配置的测试模型，当前不能声称完成真实模型验收。
6. 查看成功、失败、取消三种带来源的历史轮次及旧无版本记录；展开快照并导出 Markdown，确认时间和截断说明一致。切换账户后不能看到旧待发资料。

## 仍有边界

本轮一次只选择一门课程、一篇笔记或一项任务；不提供多来源批量选择，也不实现全库搜索。来源范围、字符限制、权限和版本检查由 `docs/AI_CONTEXT_CONTRACT.md` 规定并由服务端执行。问题草稿没有写入浏览器存储，离开工作区或刷新会丢失；界面已提示上下文的清理行为。本轮只保护笔记到 AI 的入口，其他页面导航沿用既有草稿处理方式，未增加全站草稿路由拦截。

所有现有 StellarScene 引用、图片路径和场景资产保持原样，由主线独立完成新原画整合。此子任务未提交或推送代码。

## 本子任务文件

- `apps/web/src/services/assistant.ts`
- `apps/web/src/services/assistantLaunch.ts`（新增）
- `apps/web/src/components/AskAssistantButton.tsx`（新增）
- `apps/web/src/components/AssistantContextPanel.tsx`（新增）
- `apps/web/src/components/AssistantContextPanel.css`（新增）
- `apps/web/src/pages/AI/StellarAssistant.tsx`
- `apps/web/src/pages/Notes/SharedNotebook.tsx`
- `apps/web/src/pages/Tasks/Tasks.tsx`（仅入口导入、计时提示、卡片按钮；现有字体颜色改动不属于本子任务）
- `apps/web/src/pages/Greenhouse/CourseDetail.tsx`
- `docs/WEB_CONTEXT_I1.md`
