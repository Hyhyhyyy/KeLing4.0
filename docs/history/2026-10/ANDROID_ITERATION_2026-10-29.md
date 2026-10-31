# Kotlin 移动端：场景与交互迭代记录

> 历史记录（2026 年 10 月）。保留当时版本、操作和验证结论；当前入口与运行方式见[文档索引](../../README.md)。

本轮解决移动页面中“小插图配大空白”的问题，把网页共用的五幅星际像素场景适配成短幅卡片；账户、课程、笔记、任务和 AI 接口保持原有调用链。网页由另一条开发线维护，本记录只说明 Android 的实际改动与验证。

## 本轮实现

- `ui/components/StellarArt.kt`：图片加载前预留尺寸，避免异步解码时界面跳动；场景以二分之一采样解码，保留像素边缘，使用 12 MiB 有界位图缓存。缓存上限不是应用总内存峰值。
- 新增 `StellarSceneCard`：上方 144 dp 场景，下方独立文字面板。全景优先保留右侧星芽，其余场景的裁切向下偏移，适配绘图中主体的位置；标题加入读屏标题语义，装饰图不重复朗读。
- 场景图片使用一次性 220 ms 淡入，遵循 Compose 的系统动画时长设置，不增加常驻粒子或循环位移动画。
- `CloudWorkspaceScreen.kt`：首页观测站、AI 入口实验舱、课程生态舱、任务专注室、空笔记档案室，以及没有待办时的专注场景卡。
- `StellarAssistantScreen.kt`：空会话增加实验舱；输入区仍固定在可滚动会话区下方，保留键盘避让。标题和字数提示按剩余宽度分配空间，减少与发送按钮互相挤压的风险。
- `CloudAgentScreen.kt`：智能编排入口加入实验舱，仍展示真实服务配置状态、引用资料、确认计划和运行轨迹。
- 应用桌面名称统一为“课灵”，版本为 `3.2.1-preview`，`versionCode=11`。修正装饰按钮组件的参数顺序，减少一项静态检查警告。

## 验证与安装包

2026-10-29，在 Windows / Eclipse Adoptium JDK 17 / 本地 Gradle 8.5 与 Android SDK 34 环境运行：

```powershell
$env:ORG_GRADLE_PROJECT_KELING_API_BASE_URL = 'https://keling-ict-preview.vercel.app/api'
./scripts/android-check.ps1 -Lint
```

结果为 `BUILD SUCCESSFUL`。六个测试套件共 25 项测试通过、0 失败、0 错误；覆盖既有数据恢复、同步策略及接口协议，不代表场景布局通过了设备测试。Android Lint 为 0 错误、96 警告，剩余项包含资源位置、依赖目录管理、未用资源、旧图标和日期处理等问题，未宣称全部清零。

产物：`releases/KeLing-ICT-3.2.1-cloud-debug.apk`，87,402,634 字节。

SHA256：`fbc57593ec363e6f8b7e5ea56d96c38e64af57d9c1e90d615a5f3a5b2065cb9b`。

通过 `aapt dump badging` 核对包名 `com.keling.app`、版本 11 / 3.2.1-preview、名称“课灵”、最低 API 26、目标 API 34；生成的 BuildConfig 指向上述 HTTPS API。APK 的 v2 签名验证通过。此包采用调试签名，用于测试安装，不是应用商店发布包。

从 APK 压缩包读取的全部 20 张 `assets/stellar/*.png` 与共享源文件逐项 SHA256 一致，没有漏打包或重新绘制。原始 PNG 和图像生成提示记录由主工作线统一维护。临时 `local.properties` 已由脚本恢复，未写入开发机路径。

原始日志保留在 `.cache/android-scenes-build.log`；测试 XML 位于 `apps/android/app/build/test-results/testDebugUnitTest/`；Lint 报告位于 `apps/android/app/build/reports/lint-results-debug.html`。汇总数据见 [android-scenes-2026-10-29.json](../../validation/android-scenes-2026-10-29.json)。

## 本轮复盘与下一轮

当前优势是场景、头像和学科图集有共同源文件，网页与 Kotlin 可在不同布局下维持同一视觉身份；主要文字与操作不压在复杂插画上；聊天输入区域不会随新增装饰移入历史列表。现有云端接口没有因视觉改动而分叉。

尚未验证：`adb devices -l` 没有已连接设备，`emulator -list-avds` 没有已配置模拟器，因此没有完成真机截图、键盘弹出、横屏、TalkBack、1.3 倍和 2 倍字体、低内存设备或云端同步验收。代码中的空间分配与裁切是实现事实，实际体验仍需设备证据。

下一轮按以下顺序推进：

1. 在 Android 8 及较新系统设备上检查小屏、大字体、键盘、场景裁切和系统关闭动画；修复实际测出的遮挡或触控问题。
2. 用同一测试账户完成网页创建笔记、手机编辑、网页刷新及冲突提示；模型未配置时验证真实提示，配置后再验收 AI 请求及引用来源。
3. 将“从笔记问 AI、从课程规划、从复盘建议创建待确认任务”纳入统一跨端上下文协议。模型生成建议应展示资料范围与理由，写入共享数据仍需用户明确确认；本轮尚未实现这些新调用链。
4. 评估新增高分辨率 PNG 的安装体积、加载耗时和内存；本轮安装包较上一云端包增加约 13.3 MiB。保留原始资源追溯，再根据设备测量决定分辨率与交付格式，不以美观代替性能数据。

没有推送 GitHub，也没有执行应用商店发布。
