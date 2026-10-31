# Android 完整游客工作区

> 历史记录（2026 年 10 月）。保留当时版本、操作和验证结论；当前入口与运行方式见[文档索引](../../README.md)。

本次版本：3.2.4-preview / versionCode 14。用户要求免登录体验当前完整应用，数据只在本次使用中有效。本文件取代旧独立 `TrialScreen` 的功能边界；旧源码及测试保留用于历史追溯，不再作为主游客入口。

## 入口与功能

登录页和注册页表单上方均有“游客试用全部功能”。入口进入 `FullGuestScreen`，再使用正式应用的 `MainAppContent`；顶部持续显示游客标记和退出入口，底栏、页面组件和交互处理与账号模式复用。

- 工作区首页：课程、任务和笔记统计，按北京时间签到，重复签到不重复奖励。
- 课程：创建、列表、围绕课程准备 AI 问题；智能编排中选择课程、添加和读取知识点资料。
- 任务：查看计划生成的任务、专注计时、暂停/继续、确认实际分钟、完成状态、奖励和等级更新；重复完成不重复累计。
- 笔记：新建、搜索、查看、编辑、版本冲突检查、确认删除，以及带已保存资料进入 AI。
- AI：本次会话新建、历史切换、取消和删除，课程/笔记/任务资料预览、版本核对、学习场景、检索配置、回答来源与用量、明确保存回答为笔记。没有有效模型配置时仍可查看资料和编辑问题，不能生成真实回答。
- 模型配置：复用 17 厂商目录、Key 格式候选、明确验证后的实时模型目录和手填模型功能；本次 Key 可在设置、AI、智能编排之间继续使用。游客向量检索使用聊天厂商的同一 Key 与该厂商向量模型。
- 智能编排：目标、日期、每日时间、资料、复盘选项、生成与历史、用户确认后添加本次任务；重复确认不重复创建。
- 个人资料与设置：头像、等级、累计分钟、能量与结晶、模型配置、版本检查、反馈链接和退出。
- 临时田园空间：原来“我的 → 原有本机田园数据”对应的页面仍可使用，游客入口改称“临时田园空间”。课程、知识图谱、任务、笔记、课表、签到、成就、报告等原有本机功能使用独立内存仓库；不读取旧账号数据。

与原账号版本相同，主工作区和旧田园空间是两套功能入口，内容没有自动双向合并。游客模式没有移除原本已接通的页面；它也不会把原来未接通的功能、禁用的设置或规划设想变成已实现功能。当前 Android 原生功能范围以实际路由为准，不把 Web 独有功能计为手机端已交付。

## 数据怎样流转

`FullGuestScreen` 为每次进入建立 `GuestWorkspace` 和独立 `ViewModelStore`。`WorkspaceApi`、`AgentApi`、`AssistantApi` 对本次临时标识委托内存实现；正常账号仍使用原来的网络接口。临时标识不是服务端令牌，未知或已退出的游客标识直接报错，不能回退至账号请求。

原本机功能仍由 `AppViewModel`、`DataRepository` 处理，但注入 `MemoryPreferences`。该对象仅实现仓库需要的 DataStore 接口，通过内存 StateFlow 和互斥锁读写；没有创建磁盘 DataStore、Room 数据库或任何学习文件，也没有访问 `AccountStores`。因此原功能无需另写一套简化逻辑。

真实 AI 使用无状态接口 `GET /trial/workspace/catalog`、`POST /trial/workspace/chat`、`POST /trial/workspace/plan`。无状态指服务端不创建游客账号、会话或学习数据库记录；会话和计划历史由当前手机内存维护。请求不含账号 Authorization，只有用户明确发送时才提交本次问题、资料和选定厂商 Key。公共模型只有管理员明确开启时才出现。模型商的数据处理与计费不由本机清理保证。

## 保存与清空边界

模块切换、在当前 Activity 存活期间临时切换后台，都可以继续本次内容。退出试用、结束 Activity、Activity 重建（例如旋转触发重建）或进程结束后，本次内容不恢复。这个版本不把“仅切到后台”误称为已经清空。

游客子树禁用 `SaveableStateRegistry`，避免表单通过 Android 实例状态自动保存；独立 ViewModelStore 在退出时清除，模型请求取消，Key 清除，内存仓库关闭。关闭后写入会失败，晚到模型响应不能恢复内容。游客窗口启用安全标记，以减少系统截图和最近任务预览记录。用户明确复制到剪贴板、导出或分享的内容属于用户选择的外部副本，不属于游客会话自动保存。

退出不删除或覆盖原账号登录凭据、云数据或本机旧资料。再次进入会得到新的初始空间，而不是恢复之前的游客工作区。

## 验证与复现

构建命令：

```powershell
$env:ORG_GRADLE_PROJECT_KELING_API_BASE_URL = 'https://keling-ict-preview.vercel.app/api'
./scripts/android-check.ps1 -Lint
```

新增自动测试位于 `FullGuestWorkspaceTest.kt` 和 `MemoryPreferencesTest.kt`，验证不同游客实例隔离、CRUD 不发账号网络请求、笔记版本冲突、过期游客不能回退到网络、资料变化拒绝旧预览、无状态 AI 协议与无账号头、回答保存幂等、计划确认及完成奖励幂等、同请求编号异内容拒绝、删除会话后拒绝重放、过期计划及变化资料拒绝确认、规划按课程过滤、退出清除 Key 与拒绝晚到响应、原仓库在无文件内存实现上的使用与关闭后拒写。模型响应使用明确的测试替身，这些结果不能当作真实模型连通证据。

人工复现应依次检查：进入游客 → 创建课程及资料 → 新建并编辑笔记 → 预览 AI 资料 → 配置 Key 后生成计划并确认任务 → 专注与完成 → 切换模块确认本次数据仍在 → 退出并重新进入确认数据清空；同时检查临时田园功能及旋转重建。当前无真机、无有效模型 Key，真机交互、厂商实际调用和系统生命周期行为没有完成实机验收。

最终执行结果：`BUILD SUCCESSFUL`；**52 项 JVM 测试通过，0 失败、0 错误**；Android Lint **0 错误、97 警告**。日志位置 `.cache/android-full-guest.log`；JUnit XML 位于 `apps/android/app/build/test-results/testDebugUnitTest/`，Lint 报告位于 `apps/android/app/build/reports/lint-results-debug.html`。

本地安装包：`KeLing-ICT-3.2.4-cloud-debug.apk`（历史本地交付包，未纳入源码仓库），152,784,150 字节，SHA256 `78a91cb298d638f29a96f00a0603a1b3f74ba14a20dfd2af148015bbf4941589`。`aapt` 核对包名 `com.keling.app`、versionCode 14、versionName 3.2.4-preview，最低 API 26、目标 API 34；BuildConfig 指向 `https://keling-ict-preview.vercel.app/api`。APK v2 签名校验通过，44 张共享 PNG 的逐项 SHA256 均与 manifest 一致。此为调试签名预览包，不是应用商店正式签名发布。

随后按用户授权将设置页的产品说明、问题反馈链接改为 `Hyhyhyyy/KeLing4.0`，保留原上游来源。此轮仅两个 URL 常量变化，重新执行 `assembleDebug` 并核对上述新包的版本、云地址和 v2 签名；未重复执行无逻辑变化的 52 项测试与 lint，其结果仍属于前述完整功能版本验证。链接更新构建日志为 `.cache/android-keling4-links.log`。

公开发布封装另补充 Noto Serif SC 字体许可证及来源说明，随 APK 放在 `assets/licenses/noto-serif-sc/OFL.txt` 和 `SOURCE.md`。许可依据字体内嵌名称、版本与版权信息，使用匹配 Noto CJK 字体家族的官方 SIL Open Font License 1.1；这不改变应用代码许可，也不把第三方字体视为项目原创资源。仅重新打包资源，日志为 `.cache/android-keling4-license.log`。
