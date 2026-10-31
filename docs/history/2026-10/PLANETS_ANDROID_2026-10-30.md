# Android 十款知识星球：3.2.5 验收记录

> 历史记录（2026 年 10 月）。保留当时版本、操作和验证结论；当前入口与运行方式见[文档索引](../../README.md)。

本次为用户明确要求的星球选择功能升级，不恢复周期任务。版本为 **3.2.5-preview / versionCode 15**；旧版 3.2.4 的验收记录保留不变。

## 功能与保存范围

手机主工作区的“课程”页面新增星球选择：填写课程名称，选择图案，再创建知识星球；每张已有课程卡片显示实际选择，并提供“更换星球形象”。选择器使用可滚动的两列布局，提供名称、选中状态、取消和确认；保存失败保留选择并显示错误。

十款按固定编号对应同一套跨端原画：0 翡翠书环、1 珊瑚火山、2 极光冰晶、3 琥珀沙丘、4 云海雷霆、5 深海潮汐、6 苔原花园、7 紫晶洞窟、8 机械星核、9 银月陨坑。对应 `assets/stellar/planet_01.png` 至 `planet_10.png`；生成提示词见 [prompts-planets.json](../../../assets/stellar/prompts-planets.json)，图片散列见 [manifest.json](../../../assets/stellar/manifest.json)。手机按原图比例显示，没有将同一图案缩放冒充不同星球。

登录模式通过共享课程字段 `planetStyleIndex` 保存。创建请求发送名称与编号；更换请求 `PUT /courses/:id` 仅发送 `{planetStyleIndex}`，避免用默认值覆盖已有资料、课程名称、掌握度或学习时长。网页与手机使用同一字段和编号顺序。

游客模式使用 `GuestWorkspace` 的内存课程列表，相同入口和选择范围均可用，不发账号数据请求，不写入本机学习仓库或云端。退出后本次选择与其他游客数据一起失效；已结束游客标识不能回退为网络请求。

旧田园空间的课程向导、课程卡片及旧版选择器也采用这十款新选择。历史编号 10–25 继续读取原有资源，旧随机编号保留稳定显示，不迁移或清空课程。顺便修复了旧向导预览缺少 Android 资源路径，以及编辑同一课程时重复追加相同 ID 的问题。报告页返回图标缩至 24dp，同时保留 48dp 点击区域。

## 实现入口

- `data/PlanetStyles.kt`：固定编号、名称与资源对应；历史编号回退。
- `ui/components/PlanetPicker.kt`：图案显示与手机选择对话框。
- `ui/screens/agent/CloudWorkspaceScreen.kt`、`WorkspaceViewModel.kt`：创建、修改与成功后刷新。
- `network/AgentApi.kt`、`WorkspaceApi.kt`、`GuestWorkspace.kt`：共享请求和游客内存处理。
- `ui/components/CourseCreationWizard.kt`、`MainActivity.kt`、旧田园首页与花园：原入口适配；`AppViewModel.addCourse` 按已有 ID 更新。
- `network/CoursePlanetTest.kt`：登录请求范围、游客隔离与资料保留、十图资源映射和历史回退的新增自动测试。

## 验证结果与复现

2026-10-30 执行 `testDebugUnitTest assembleDebug lintDebug --console=plain --max-workers=2 --no-daemon`，通过 `scripts/android-check.ps1` 的临时副本保留 SDK 与 Windows 路径处理；设置 `ORG_GRADLE_PROJECT_KELING_API_BASE_URL=https://keling-ict-preview.vercel.app/api`。完整日志为 `.cache/android-planets-final.log`。

结果为 **BUILD SUCCESSFUL，55 项 JVM 测试，0 失败、0 错误、0 跳过**。Android Lint **0 错误、97 警告**；报告位于 `apps/android/app/build/reports/lint-results-debug.html`，测试 XML 位于 `apps/android/app/build/test-results/testDebugUnitTest/`。新增测试模拟网络响应，验证只修改图案时不会发送其他字段、游客十款切换保留原资料、不同游客实例隔离、无效编号拒绝与退出后拒绝访问；不代表真实手机或双设备同步已经实测。

人工复现：进入账号或游客 → 课程 → 输入名称并选择任一星球 → 创建 → 更换已有课程图案 → 确认资料和学习时长不变；账号在网页刷新应显示相同图案，游客退出重进应得到新空间。旧田园中编辑课程应更新原卡片而非增加重复课程。**本次未进行 Android 真机交互、真实双设备同步或模型调用验收。**

## 安装包与完整性

`KeLing-ICT-3.2.5-cloud-debug.apk`（历史本地交付包，未纳入源码仓库）

- 大小：**161,836,580 字节**。
- SHA256：`6b3fc5d0af2cf65685ca3ff63c4028a9f001e13c143f85da8b6e6cd424e50d2d`。
- 包名 `com.keling.app`，versionCode 15，versionName 3.2.5-preview，最低 API 26、目标 API 34。
- APK v2 签名校验通过；云 API 地址已在生成代码和 APK DEX 中核对为 `https://keling-ict-preview.vercel.app/api`。这是调试签名预览包，不是商店正式签名发行包。
- 包内 **54 张共享 PNG** 与根资源、Android 资源及 manifest 的文件名、字节、大小、SHA256 全部一致。
- 包内 `assets/licenses/noto-serif-sc/OFL.txt`（4,337 字节）及 `SOURCE.md`（1,253 字节）与源码逐字节一致，保留字体许可和来源。
- 完整性结果保存在 `.cache/android-planets-artifact-check.json`；构建结束后使用同版本 Gradle 执行 `--stop`，确认没有运行中的 Gradle daemon。
