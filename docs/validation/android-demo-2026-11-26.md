# Android 演示验证 · 2026-11-26

验证对象为 `4.0.6-defense-rc7`（versionCode `27`）的冻结 APK。验证使用新建、隔离的 Android 14 模拟器 `emulator-5582`，没有清理现有真机数据。先验证隔离游客空间，再仅对新建的线上专用验收账号进行操作，未修改既有用户数据。GUI 测试中的任务、笔记和 7/10 分钟记录均为合成测试数据，不代表真实学习时长或学习效果。

## 冻结产物

| 项目 | 值 |
|---|---|
| 文件 | `apps/android/app/build/outputs/apk/debug/app-debug.apk` |
| 大小 | 75,419,281 bytes |
| SHA-256 | `30b21d551c915e8dc2fddcda39f52a97dcf80c38d19230d976d87a59993bf9e9` |
| 签名证书 SHA-256 | `e7b4d86c7a02fb6bb1d21215c393b347d2d67652e5e45dfbe3a3d6c66b7c67a3` |
| 签名类型 | 沿用 rc6 的 Android Debug 证书 |
| 包名 / Android 要求 | `com.keling.app` / minSdk 26、targetSdk 34 |

`apksigner verify --print-certs` 验证通过。模拟器安装成功；从设备拉回的 `base.apk` 与冻结 APK 的 SHA-256 完全一致。首次冷启动记录为 3,101 ms，这只是本机一次观测，不是性能基准。检查 `AndroidRuntime:E` 未发现崩溃输出。

包内 `res/font/stzhongs.ttf` 与 `assets/fonts/STZHONGS.TTF` 逐字节一致；`assets/stellar/` 包含 64 项资源。包内章节与共享 `chapter.json` 逐字节一致，内容版本为 `1.0.1`。人工审核状态继续为 `PENDING`。

## 本次修复及调用链

- 手动任务：`CloudWorkspaceScreen → WorkspaceViewModel → WorkspaceApi → /tasks`，补齐创建、删除；游客转入 `GuestWorkspace` 内存空间，不发送生产写入请求。任务完成与删除不产生伪造奖励。
- 完成记录：任务与编排页仅在保存成功后关闭时长输入。失败时保留输入和错误，便于重试。
- 学习报告与成就：主入口改用同一 `WorkspaceViewModel` 的当前任务、课程、笔记和账号统计，避免展示登录时的旧本地快照。成就按当前可核对的记录显示已有任务、课程、笔记里程碑；不发放奖励，不把这些计数说成掌握度。
- 笔记：通过 Android 文件选择器导入 TXT/MD，先进入编辑草稿，保存后才成为笔记；UTF-8 严格解码，限制文件 200,000 字节、正文 50,000 字符。导出使用系统创建文档入口。
- 远航输入：保留用户输入原文，再单独解析访问编号；修复每输入逗号就被规范化删除、`A,B,C` 变为 `ABC` 的问题。
- 返回导航：为子页面同步维护访问历史，系统返回键可以回到进入任务/笔记/报告的总览。
- 遗留课程和任务弹窗的可见表情图标改用既有绘制图标；删除操作保留明确文字。现有主题箭头、字体与资源链继续保留。

## 最终包的实际操作证据

证据 UI 层级文件位于 `.cache/android-demo-20261126/`。测试未解除游客界面的 `FLAG_SECURE`；保留真实可访问性节点，而不是绕过截图保护。

| 路径 | 实际观测 | 证据 |
|---|---|---|
| 登录页 → 使用指南 | 在设备浏览器打开线上 `/guide`，显示使用指南与功能目录 | `rc7-guide.xml` |
| 游客 → 远航 → 队列直接输入 | 完整保留 `A,B,C,D,E,F,G`，依次显示七个访问节点 | `rc7-order-input.xml` |
| 提交 → 反馈 | 显示“规则判定 · 正确”，未标成人工审核 | `rc7-rule-correct.xml` |
| 填下一步 → 保存 → 我的 | 1 次作答、已结算、规则练习记录、来源段落 | `rc7-expedition-history.xml` |
| 笔记 → 导入 → 保存 → 导出 | 原生文件选择器可导入、编辑并导出，回读内容与输入逐字节一致 | `rc7-note-import.xml`、`note-export.txt` |
| 新建任务 → 开始专注 | 新任务可见，真实倒计时显示 24:58 | `rc7-focus-running.xml` |
| 结束专注 → 保存合成 7 分钟 → 报告 | 已完成 1/1、当前任务 7 分钟、累计 7 分钟、1 篇笔记、任务标题与日期 | `rc7-report.xml` |
| 总览 → 学习成就 | 初学者 1/1 已达成，任务达人 1/10，课程 1/1 | `rc7-achievements-updated.xml` |
| 笔记/任务 → 系统返回 | 返回总览；游客任务和笔记仍在同一试用空间 | GUI 操作记录 |

笔记导入和导出均为 101 字节，SHA-256 均为 `6c61be7a7a13727d2f79cf24fcd21da23503a228a2208c6c5a230a78e53f072c`。

## 线上账号补验

RC7 线上发布完成后，用新建专用账号 `d798ed6d` 在实际 Android 登录页登录。成功读到预置课程、任务和笔记；在设备界面完成同一条任务并写入合成 10 分钟。报告回读为已完成 1/1、当前任务 10 分钟、累计 10 分钟、1 门课程与 1 篇笔记。

随后在设置中确认退出，重新填写凭据登录，报告仍显示同一任务标题和 10 分钟记录，证明结果由线上账号恢复，并非仅保留在之前的游客或界面内存中。后台分支另外用独立登录会话，通过网页共用的 `/tasks`、`/notes`、`/user/profile` 接口读回相同 taskId 的 `COMPLETED / actualMinutes=10`、同一 noteId 和累计 10 分钟；这项独立 API 回读不冒充浏览器页面操作。验收账号内容保留供比赛演练。

设备证据：`rc7-online-task-pending.xml`、`rc7-online-note.xml`、`rc7-online-task-completed.xml`、`rc7-online-report.xml`、`rc7-online-report-after-relogin.xml`。凭据不写入本报告或 JSON。最终再次核对 APK 哈希未变，未发现 `AndroidRuntime:E` 崩溃输出。

## 构建与回归

使用 JDK 17，执行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/android-check.ps1 -Lint
```

最终日志 `.cache/android-demo-20261126/build-rc7-final.log`：`BUILD SUCCESSFUL in 1m 21s`。18 个测试套件、94 项测试，0 failures、0 errors；lint 0 errors、40 warnings。未将既有警告称为已消除。

新增 `WorkspaceTaskTest` 覆盖游客创建/重复完成/删除、会话关闭隔离、账号最小请求字段与认证、删除冲突传播、非法课程及分钟数拒绝写入。既有远航规则、恢复、资料解析和账号隔离测试随同本次完整运行。

## 验证边界

- 此报告记录模拟器与代码回归结果；没有连接实体 Android 手机，实体设备安装和厂商系统行为尚未实测。
- 本支线没有调用付费模型，真实模型返回以根任务独立证据为准，不以游客规则练习或跨端任务同步代替 AI 验证。Android 真实账号登录、写入与退出重登恢复已完成；网页侧独立 API 读回由后台分支记录。
- APK 使用沿用的调试签名，可覆盖同证书历史构建；不等同于应用商店正式发布签名。
- 当前成就统计基于当前可见任务、课程、笔记，删除相关条目会改变当前成果计数；学习报告将当前任务分钟与账号累计分钟分别展示。
- 自动化检查与若干完整操作链不能证明所有设备、网络故障和输入组合均没有缺陷。需要用户执行的真实设备/账号操作由根任务统一放到最终清单。
