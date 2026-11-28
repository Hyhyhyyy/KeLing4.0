# Android 真实阶段进度与星球形象一致性

本轮 Android 版本为 **4.3.2-progress-rc1 / versionCode 34**。生成星球、重绘形象、重生单题和相似题搜索均接入服务端阶段事件；星图与课程页使用同一份已保存星球形象。此文分开记录协议测试、实际只读运行、唯一一次真实重绘及验证边界。

## 改动与调用链

`PlanetApi.kt` 在生成任务初始 202 响应、每次轮询与结束响应中读取可选 `progress`。阶段包括资料检索、内容编排、复核、形象准备、绘制与收拢结果，可以有多个阶段同时运行。元数据在 `PlanetWorkProgress.kt` 独立解析，缺失或格式错误时退回不定加载，不使原始签名草稿无效，也不改写草稿内容。

`PlanetViewModel.kt` 仅在生成及三类重生操作中记录阶段，按当前任务和递增 `revision` 接收更新；普通 GET、刷新与保存不宣称正在调用模型。取消会清理加载状态，旧任务不能通过延迟结束回调清掉新任务的忙碌状态。内容审核失败保留服务端具体错误及已有星球，关闭活动动画。

`PlanetWorkPanel.kt` 在页面顶部显示真实阶段：已完成阶段为薄荷色，正在运行的阶段为金色扫光，跳过阶段单独标注并显示灰色。黑盒模型等待期间扫光和吉祥物轻浮持续活动，提示语轮换；没有按时间虚增百分比。后台没有提供阶段时仅显示不定加载。终止后的阶段不会继续声称“正在处理”。

当前 `home`、`star_map`、`planet` 入口原本均调用 `GeneratedPlanetArt(draft)`；漏接的是课程页曾只按 `planetStyleIndex` 读取固定素材。现由 `WorkspaceViewModel` 按 **courseId** 关联 `PlanetApi.list()` 的已保存记录，课程卡复用 `GeneratedPlanetArt`，不会根据同名课程错误匹配。实际生成的课程提供“查看学习星球”入口，重绘仍在原星球内完成；普通手建课程继续使用原样式选择。

已有生成图加载中或加载失败时不再换成另一颗固定星球：显示加载状态或原图重试。非法生成图地址不会作为网络请求发送。课程形象同步失败时保留此前同课程的已读记录并提示刷新，不会清空课程资料。

## 构建与协议测试

`testDebugUnitTest`、`lintDebug` 和 `assembleDebug` 已通过：**142 项测试，0 失败、0 错误；Lint 0 错误、40 警告**。新增 7 项测试覆盖：

- 可选阶段解析、并行阶段、旧 revision 与其他任务事件隔离。
- 初始、轮询和结束阶段回调，原始签名草稿未知字段保留。
- 三类重生及预览／已保存星球两条请求路径。
- 失败阶段先于异常送达，旧服务缺少阶段时仍可返回草稿。
- 取消与普通读取的状态区分。
- 实际审核错误保留、失败不覆盖已保存星球。
- 按课程 ID 绑定形象，重绘后刷新新地址，读取失败保留同图。

以上模型和 HTTP 响应为测试夹具，不代表当前真实模型生成成功或性能提升。

最终候选安装包：`apps/android/app/build/progress-proof/keling-4.3.2-progress-rc1.apk`，**85,236,835 字节**，SHA-256：

`e93e055ce99289e308079a84057284a170f6c5db280fee19d1bfba2f3a607549`

`aapt` 核对版本 34、minSdk 26、targetSdk 34；`apksigner` 验证通过，仍为已有 Android Debug 证书，SHA-256 `e7b4d86c7a02fb6bb1d21215c393b347d2d67652e5e45dfbe3a3d6c66b7c67a3`。不是应用商店正式签名。

APK 内华文中宋 SHA-256 为 `e822a3f2859a6cc982f04c6ad1eabc18371ce26d6874b710188a30c35dced0f1`，与已获授权的字体源文件逐字节一致；图谱 `editor-5Z5EDZT7.js` SHA-256 为 `31fac6b7230d7aaa55b6de18f74fa5e1b3fdee8a31674def476519d35b23c26c`，与共享构建产物一致；72 项共享素材逐项一致。构建日志、Lint 和机器核验见 `apps/android/app/build/progress-proof/`。

## 第一阶段：实际 Android 只读检查

已在独立 Android 14 / API 34、720 × 1560、density 320 的 AVD 5584 上覆盖安装上述最终字节，核对安装版本为 34，原专用测试账号登录保留。本次读取此前真实星球 `3c11a247-6ceb-4fb3-a19b-e87b2d373c80`，没有发起生成、重绘、相似搜索、星芽问答或答案提交。

星图缩略图、课程卡、课程卡进入的星球详情均显示最新黄色近球体形象，三处外观一致，入口跳转正确。完整手机截图未裁切：

- [星图卡片](topic-android-progress-2026-11-28/same-image-star-map.png)
- [课程卡片](topic-android-progress-2026-11-28/same-image-course.png)
- [课程进入的星球详情](topic-android-progress-2026-11-28/same-image-detail.png)

## 第二阶段：唯一一次真实重绘

在线服务更新至 4.3.2，且 Web 的整球任务结束后，原生界面仅点击 **1 次**“按要求重新生成”。要求保留黄色近球体、球体自身的眼口、浅色腹部地貌、环形坑与短尾，避免独立角色站在背景球前；没有自动重试，也没有提交答案。

实际捕获了 [启动与等待服务响应](topic-android-progress-2026-11-28/progress-01-start.png) 和 [完成后的画面](topic-android-progress-2026-11-28/progress-observed-02.png)。开始记录时间为 `2026-11-28T14:57:58.4292819Z`，首次观察到完成为 `2026-11-28T14:59:22.754639Z`；这是观察时间边界，不是准确服务耗时。连续观察启动时任务已完成，因此没有捕获中间分段状态，不能声称已通过手机截图验证全部阶段；没有为补截图再发请求。

任务完成后，加载面板消失，原生显示新图。前后只读记录逐字段比较确认 **14 道题、完整草稿除 artwork 外的全部字段、图谱、检索来源、学习进度与 courseId 完全相同**。新图状态为 `generated`，提供方 `miaoda-image/grounded-reference`，`generatedAt` 为 `2026-11-28T14:58:00.904Z`。此时间字段也不能替代测得的请求耗时。

再次只读核对：[新图星图卡片](topic-android-progress-2026-11-28/same-image-after-star-map.png)、[新图课程卡片](topic-android-progress-2026-11-28/same-image-after-course.png)、[新图详情](topic-android-progress-2026-11-28/same-image-after-detail.png) 均显示相同形象。Web 独立回读详情、课程、星图、首页的 URL SHA-256 与手机记录一致，为 `983aa5a9aeca1b874c077d446a2664ef768d7d17dc930447ed577c7d56ef0628`，跨端截图见 [Web 生产验证目录](progress-web-production-2026-11-28/)。

完整生成原图已保存为 [native-artwork-result.jpg](topic-android-progress-2026-11-28/native-artwork-result.jpg)，JPEG 848,651 字节，SHA-256 `f53560756ad22aa64a266b9298bd723431e208d0d2a68406df25088b0ca7b01a`，未裁切或重绘。

## 最终边界与设备关闭

这次证实的是旧星球的唯一真实重绘、内容保持和三入口同图，不能据此证明新服务初始生成成功或生成变快。Android 本轮发出 1 次真实重绘操作；底层模型子调用数量没有在此测量。原生有启动与完成画面，中间阶段契约仍主要由自动测试及 Web 独立真实 202／轮询记录支持，不把测试夹具冒充手机真实阶段画面。未进行实体手机或广泛设备兼容验证。

已关闭本次自建 `emulator-5584`；`adb devices` 列表为空，启动进程 58596 已退出，原 AVD 数据保留供复现。没有继续保留运行中的模拟器。本轮源码和 APK 未因这些验证修改，最终 SHA-256 保持上文记录。
