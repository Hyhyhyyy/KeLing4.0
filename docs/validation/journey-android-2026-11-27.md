# Android 远航与个人空间验收 · 2026-11-27

本轮 Android 候选包为 **4.2.0-journey-rc1 / versionCode 31**。118 项单元测试通过；模拟器原生界面完成本地账号双向同步，并用最终 HTTPS 安装包独立登录线上验证账号，读回个人形象、家具和真实学习记录。实体手机仍待验收。本记录仅说明 Android 本轮证据，不替代 AI 生成质量、HarmonyOS 原生应用或真机兼容性证明。

## 安装包与静态检查

| 对象 | 实际结果 |
| --- | --- |
| 冻结安装包 | `apps/android/app/build/journey-proof/keling-4.2.0-journey-rc1.apk` |
| 文件大小 | 85,638,827 字节 |
| SHA-256 | `57eb2f8c189ed7d237ca83dff0191b07811f078dfd623a186610cd8c32a22d62` |
| 版本 | 4.2.0-journey-rc1 / 31；minSdk 26，targetSdk 34 |
| 默认 API | `https://ucn5aajxnx7f.feishu.link/app/app_17h4dw5jwdg/api` |
| 签名证书 SHA-256 | `e7b4d86c7a02fb6bb1d21215c393b347d2d67652e5e45dfbe3a3d6c66b7c67a3`；沿用既有 Android Debug 证书 |
| 最终包一致性 | 从模拟器已安装路径拉回 `base.apk`，大小及 SHA-256 与冻结包完全一致 |
| 单元测试 | 118 项，0 失败、0 错误；其中新增 Journey 测试 7 项 |
| 已完成 lint | 0 错误、40 警告，保留完整 XML |
| 打包资源 | 70 张图片，华文中宋 `res/font/stzhongs.ttf`；10 头像、10 头像框、10 称号牌、10 家具及对应 10 成就 |

lint 的已完成报告来自使用本地 API BuildConfig 的同一份生产 Kotlin 源码。最终 HTTPS 地址包随后完成 assemble 和 118 项测试；重复执行的最终 lint 因宿主长时间高负载被取消，不能称该次重复执行已完成。报告位于 `apps/android/app/build/journey-proof/lint-results-completed.xml`，完成日志为 `.cache/journey-android-local-build.log`。本轮未将剩余 40 项警告称为零警告。

测试覆盖目录契约、6000 分钟边界、未解锁装扮拦截、家具重复摆放拦截、修订冲突及幂等保存、访客真实时长累积、旧头像保留，以及仅显式换头像时才发送 `avatarId` 的 PATCH 语义。任务未启动计时直接完成时传入 0 分钟，不把预计时长累加成学习时长。

## 原生界面的双向同步

使用隔离的本地测试库和同一个专用账号，未修改原有云端用户的数据。Web 实际保存一篇笔记、计时至少 62 秒后完成一项任务、签到，并设置装扮与家具。Android 独立登录后读回；随后只在 Android 形象选择器点击“行星园丁”，看到“已保存”，由 Web 再次独立登录复读。

| 检查点 | Web 写入后 Android 读回 | Android 修改后 Web 复读 |
| --- | --- | --- |
| revision | 6 | 7 |
| 头像 | avatar-9，银河绘图师 | avatar-8，行星园丁 |
| 头像框 / 称号 | frame-2 / title-2 | 保持不变 |
| 家具 | 1 号位领航座椅、2 号位书页书桌，其余 8 位空 | 保持不变 |
| 实际学习记录 | 1 分钟、1 项任务、1 篇笔记、1 次签到 | 保持不变 |
| 100 小时成就 | 1 / 6000，仍锁定 | 未增加时长 |

Web 复读的脱敏机器证据为 `.cache/journey-20261127/android-to-web-readback.json`。本地换装与读回截图留在 `.cache/journey-20261127/screenshots/android/`；未复制登录页或任何凭据截图到公开证据目录。

## 最终 HTTPS 包线上只读验收

本地测试账号已通过“退出登录 → 确认退出”退出，之后安装上述冻结包。包管理器返回版本 31 / 4.2.0-journey-rc1，安装包回拉哈希相同。实际原生登录使用新的线上验收账号；本轮只导航和读取，未在该线上账号改装扮、完成任务或确认 AI 星球。

线上 release `7712831621329914818` 已完成发布。Android 进入故事弹窗，版本入口显示“当前无需更新”，并独立读回：

- 头像 avatar-9“银河绘图师”，头像框 frame-1“羽翼罗盘”，称号 title-2“航行记录员”。
- 家园 1 号位 furniture-1“领航座椅”、2 号位 furniture-2“书页书桌”，其余 8 个陈列位为空。
- 日历显示当月 1 分钟、2 项完成、1 篇笔记，今日已打卡；与线上验证账号对应，区别于本地账号的 1 项任务。

三张完整 720 × 1560 原始界面截图经过目视检查，无凭据、无拼接、无裁切：

- [线上个人形象](../defense/evidence/journey-20261127/android-profile-cloud.png)
- [线上家园](../defense/evidence/journey-20261127/android-home-cloud.png)
- [线上学习日历](../defense/evidence/journey-20261127/android-calendar-cloud.png)

启航故事采用手机专用驾驶舱素材、米白色文字、逐字显示及光标；实际弹窗截图另留 `online-story.png`。使用指南按钮实际发出正确公开 `/guide` URL 的浏览器 Intent；新模拟器 Chrome 首次运行页面拦住了最终网页，因此本轮不将 Android 外部浏览器中的指南正文记为已目视验收。Web 指南的独立验收由 Web 记录负责。

## 环境故障与恢复范围

原任务模拟器 5582 曾发生系统无响应和输入/UiAutomation 阻塞，在新组件完整打开前已出现。保留原 AVD 数据，关闭该模拟器；未清除用户历史数据，未终止用户的 Windows 应用，未改 BIOS 或虚拟化配置。

只读诊断确认 WHPX 加速可用。在未运行模拟器时，宿主实际 CPU 占用仍为 52%，可用内存约 12.6 GiB；C 盘剩余 152.99 GiB，D 盘剩余 188.43 GiB。没有证据把卡顿归因于磁盘空间不足或新故事组件；也未把环境恢复后的单次操作当作性能基准测试。

最终使用隔离 AVD `keling_journey_20261127`（端口 5584，Android 14 / API 34，720 × 1560），1 虚拟 CPU、2560 MiB 内存、软件 GPU、禁用 Vulkan、无快照。在其他构建完成后，原生登录、故事、个人空间、家具及日历操作完成。`StoryDialog` 的逐字与闪烁通过延时协程运行，图集使用缓存；此次观察未见因重复解码造成的新组件阻塞。验收结束关闭自有模拟器，保留 AVD 数据。

## 尚未验证

需要实体手机核对安装升级、中文输入法、不同屏幕比例、后台恢复和浏览器首次打开指南。当前证据来自 Android 14 模拟器，不等同于华为真机或原生 HarmonyOS 验收。本轮 Android 未调用新的 AI 生成请求，也未伪造星球、学习时长或成就；AI 接入的真实调用证据应查阅后端本轮独立记录。
