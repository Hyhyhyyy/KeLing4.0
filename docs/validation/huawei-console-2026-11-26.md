# 华为云运行实例续查

日期：2026-11-26（Asia/Shanghai）。适用版本：4.0.6-defense-rc7。本次只核对云端资源，不变更已发布程序。

## 已观察到的事实

- 用户完成登录后，控制台首页位于 cn-north-1。根据现有 Runtime 调用地址，已切换至 cn-southwest-2（西南－贵阳一）。
- 当前登录账号显示为 `hw…0013`。运行时列表 `/home/runtime/list` 明确显示“您还没有托管智能体”。这证明当前账号与地区下的页面未显示目标实例，不证明实例已经删除。
- 已进一步进入“开发中心 → 智能体管理 → 工作流”，`/home/agent-center/workflow` 也明确显示“您还没有工作流”，导入、导出与创建按钮禁用。单智能体列表同样显示空状态。仍不能由此判断是原资源归属、可见权限、公测资格还是资源迁移问题。
- 页面同时显示“本服务目前处于公测阶段，仅对已获取公测权限的用户开放全部功能体验”的提示。未提交公测申请、订购套餐、创建新运行时或修改 IAM 权限。
- 原程序指向的运行时标识是 `agent-arts-6f9853e5fb1c4da595d8ed23c4e4b715`，网关位于 cn-southwest-2。需确认该实例所属账号或工作空间，才能在正确资源范围检查运行状态、凭据和日志。
- 原始连接 Word 只有调用地址与入站密钥，没有账号、工作空间、独立工作流 ID 或控制台链接。2026-11-26 22:03:33（北京时间）使用该连接对合成课程复测一次：HTTP 403，0.89 秒，仍含 GetAppCredential 超时和模板 Error，没有成功计划。脱敏证据见[huawei-runtime-continuation-2026-11-26.json](huawei-runtime-continuation-2026-11-26.json)。

## 结论与下一步

当前阻碍已从“控制台未登录”更新为“已登录，但当前资源范围没有显示原实例”。随后用户明确确认原工作流在另一个账号，已为原账号持有人整理[恢复与联调交接](../handovers/huawei/README.md)。实例是否迁移以及当前凭据是否仍有效，仍未取得证据。不能仅凭 HTTP 403 将原因确定为缺少某项 IAM 权限，也不能把新建智能体当作旧实例恢复。

先确认原部署账号或工作空间；找到同一实例后，检查实例状态与凭据获取日志，再进行一次合成课程的真实规划调用。只有取得实际模型输出并验证计划确认闭环，才更新真实 AI 验收结论。既有课程、笔记、任务、规则练习和跨端验证保持原有证据范围。

浏览器核对入口：[西南－贵阳一工作流列表](https://console.huaweicloud.com/agentarts/?region=cn-southwest-2#/home/agent-center/workflow)、[运行时列表](https://console.huaweicloud.com/agentarts/?region=cn-southwest-2#/home/runtime/list)。本记录不包含密钥或浏览器会话信息。

低代码工作流也使用 `/runtimes/.../invocations` 调用路径，因此本次同时检查工作流与运行时入口。定位顺序参考[华为官方工作流调用实践](https://support.huaweicloud.com/bestpractice-agentarts/agentarts_06_0136.html)：先匹配原工作流及完整调用地址，再查对应运行时与凭证。接口路径本身不能证明原应用属于哪种开发方式。
