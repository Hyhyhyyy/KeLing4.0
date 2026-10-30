# I1 上下文问答契约（2026-10-29）

本轮实现目标：从已保存的课程、笔记、任务进入 AI；先显示真实资料预览，用户编辑问题并明确发送后才调用模型。已有共享会话协议兼容，不改数据库 schema。

## API

`POST /api/ai/context-preview`，鉴权后读取本人的数据，不调用模型。

请求：`{ "kind": "course" | "note" | "task", "id": "资源ID" }`。

响应（直接对象，无额外 data 包裹）：

```ts
interface ContextRef { kind: 'course' | 'note' | 'task'; id: string }
interface ContextSource {
  id: string; kind: 'knowledge' | 'note' | 'task' | 'course';
  title: string; text: string; updatedAt: string; truncated: boolean;
}
interface ContextPreview {
  ref: ContextRef; title: string; fingerprint: string;
  sources: ContextSource[]; warnings: string[];
}
```

`fingerprint` 是服务端计算的 SHA256 指纹，不是令牌或权限凭据。显示真实标题、每段文本、截断提示和版本时间；不要展示指纹作为用户界面内容。

`POST /api/ai/sessions/:id/turns` 新增可选字段：

```ts
{
  message: string; clientRequestId: string;
  context?: { kind: 'course' | 'note' | 'task'; id: string; fingerprint: string }
}
```

提供 context 时，本轮只使用该预览范围的资料，不执行 includeContext 的全局检索；已有会话历史仍可能参与回答。服务端重新校验归属与指纹，资料变化返回 `409 CONTEXT_CHANGED`，用户保留问题并刷新预览后再发送。失效/别人的资源均返回 `404 CONTEXT_NOT_FOUND`，不泄露资源是否存在。消息请求幂等键将 context 一并纳入：同请求同输入返回原回执，不重复调用；换上下文须换请求号。

限制：单笔记最多 6000 字符；单任务描述最多 4000 字符，附任务类型、状态和预计时间（不视为完成时长）；单课程只取本课程按最近更新时间排列的 6 个知识点，每个最多 1000 字符，另有课程名称说明。完整范围与截断由预览告知，不能声称全库检索。不会附带课程教师、邮箱等不需要的私人资料。

## 客户端

- 课程、任务和已保存笔记各有明确入口。未保存/修改中的笔记提示先保存；不能静默丢弃草稿或发送旧版本冒充当前草稿。
- 入口携带资源引用和可编辑初始问题，不能把全文放进 URL。Web 使用受账户绑定的内存状态；Android 用受账户绑定的状态/参数。刷新或进程重建导致丢失时如实提示，不发送假定资料。
- 从上下文入口启动一个新对话，避免误续其他学习会话；不自动发送、不自动创建云会话、不自动开启全库检索。
- 预览加载、重试、移除和刷新都可操作；加载/失败时阻止带不明范围发送；选择其他会话或新建对话时清除旧上下文，防串题和串账户。
- 指纹变化产生的 409 不自动重试调用。保留问题，提示刷新资料；刷新后再次由用户点击发送。
- 模型未配置时仍能查看上下文/编辑问题，发送保持禁用并显示原因。
- 每个 turn 的 `sources` 保存提交时的快照及版本，即使生成失败/取消也可核对；成功回答保存为笔记时保留引用快照。两端通过现有共享会话查看来源。
- 新 Sources 字段均为向后兼容可选字段；旧会话没有版本时显示“旧会话未记录版本”，不能伪造时间。

## 验收

覆盖三个资源类型、跨账户404、改版409、无模型时预览可用、限制/截断、上下文更换幂等、历史快照、多端协议序列化。真实模型当前未配置：测试注入的模型响应只验证传参和生命周期，不能称在线 AI 功能已经验收。

参考 [Google 来源选择和引用说明](https://support.google.com/gemininotebook/answer/16179559?hl=en) 的可选择、可核对思路；本轮只实现有限来源范围与版本预览，不宣称达到其完整检索能力。
