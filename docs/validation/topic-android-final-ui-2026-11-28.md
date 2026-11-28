# Android 最终包实际运行补验

2026-11-28 使用已发布的 **4.3.1-research-rc2 / 33** 最终 APK，在 Android 14 / API 34、720 × 1560 的独立模拟器中覆盖安装并保留原测试账号。APK SHA-256 为 `889ac6559f1398037a67013de1f80c15e0ec1f18412194119804672dbfc198c2`，本次没有修改代码或安装包。

## 实际观察

读取的是此前真实生成并保存的“奶龙梗与二创探索星球”，ID `3c11a247-6ceb-4fb3-a19b-e87b2d373c80`。18:49（北京时间）的历史观察是 12 道基础题、0 道相似题；后续真实服务成功追加两道多选相似题。19:40（北京时间）最终只读 API 核对：共 **14 道题**、12 个图谱节点、14 条关系，原区域完成状态仍为 3 / 3，两道新题均没有提交答案。此次手机检查不能证明最新初始生成已经成功。

学习导航显示课文与来源；进入探索练习后收起引入、图谱、课文和来源，题卡保留“问星芽”。在第一道多选题中只更改一个本地选项，不提交：打开并关闭星芽后、更换到“回看学习”再返回后，该未提交选项均保留。最后恢复原选中状态，全程没有提交答案或修改奖励。

随后从原生题卡实际调用 **1 次**公共 `miaoda-chat`。请求为“Please give me one first-step hint in Chinese. Do not reveal the answer.”，屏幕收到中文提示，引导先区分官方原作设定与网友二次创作，再逐项判断。这次回复没有直接给出正确选项；它只能证明该次实际调用及页面响应，不代表所有模型回复都不会透露答案。

真实服务追加的两道题为 `q_16f276bbc72f40c888e79b98b1cf1eec` 和 `q_8df4cc4a09624b7690252bbf13051006`，同属原多选题的相似练习。手机只读刷新后，两题均显示“相似碎片 · 多选”、完整题干、五个选项、“问星芽”与“再做两道”。第一题根据两则材料判断官方设定，第二题根据三则材料辨识二创与网络梗，题面包含必要的材料文本；长题通过垂直滚动阅读。学习导航分别提供 2 条和 3 条所引来源，展开第一题来源可看到第七印象官方网站及百科摘要；练习卡不显示来源链接或来源摘要。没有点击再生成，也没有选择或提交新题答案。

最终再次刷新后，原生学习页成功显示新的球体形象。存储记录为 `generated`，提供方 `miaoda-image/grounded-reference`，生成时间 `2026-11-28T11:22:28.165Z`。截图可见黄色近球体本身具有眼口、浅色腹部纹理、环形地貌与小尾，画面没有文字，不再是角色站在普通球体前方。前一版参考图截图仍保留作历史追溯，不作为最终形象。

## 完整截图

16 张截图均保留 720 × 1560 完整手机画面，没有裁切或重绘。机器记录及 SHA-256 见 [JSON](topic-android-final-ui-2026-11-28.json)。

- [学习导航及资料](topic-android-final-ui-2026-11-28/final-learning-stage.png)、[探索练习](topic-android-final-ui-2026-11-28/final-practice-stage.png)
- [未提交多选](topic-android-final-ui-2026-11-28/final-unsaved-choice.png)、[关闭提示后](topic-android-final-ui-2026-11-28/final-choice-after-dialog.png)、[回看学习后](topic-android-final-ui-2026-11-28/final-choice-after-learning.png)
- [实际发送内容](topic-android-final-ui-2026-11-28/final-tutor-request.png)、[真实模型回复](topic-android-final-ui-2026-11-28/final-tutor-real-response.png)
- [最终球体形象图](topic-android-final-ui-2026-11-28/final-spherical-reference-image.png)、[前一版历史图片](topic-android-final-ui-2026-11-28/final-grounded-reference-image.png)、[键盘弹出状态](topic-android-final-ui-2026-11-28/final-tutor-keyboard.png)
- [相似题学习来源展开](topic-android-final-ui-2026-11-28/final-similar-learning-sources.png)、[第二题学习材料与来源入口](topic-android-final-ui-2026-11-28/final-similar-learning-second.png)
- [第一道相似题标记及题干](topic-android-final-ui-2026-11-28/final-similar-first-heading.png)、[第一题选项与问星芽](topic-android-final-ui-2026-11-28/final-similar-first-options.png)
- [第二道相似题标记及题干](topic-android-final-ui-2026-11-28/final-similar-second-heading.png)、[第二题选项及再做两道](topic-android-final-ui-2026-11-28/final-similar-second-options.png)

## 验证边界

早一轮 Web 全新奶龙学生成返回 `INVALID_PLANET`，相似题追加返回 `CONTENT_REVIEW_UNAVAILABLE`。服务更新后的最后一次全新初始生成仍在内容审核阶段返回 `CONTENT_REVIEW_FAILED`（99.029 秒，无草稿、无新星球）；该默认初始生成链不能声称通过。此后的独立旧题相似搜索已实际成功（28.526 秒），追加两题后由本次手机只读核验。手机未主动发起初始生成、图片生成或相似搜索，只执行前述 1 次真实问答；相似生成请求、图片重绘与手机展示是分别记录的证据。

软键盘打开时，系统向上平移提示弹窗，发送按钮可能被键盘遮住；先使用返回手势收起键盘后可发送。这是本次实际观察到的操作限制。测试运行于模拟器，不能替代所有真实手机的键盘、性能和布局兼容验证。

完成新题、新图及两阶段来源规则的只读检查后，已关闭本次自建 `emulator-5584`。`adb devices` 列表为空，原启动进程 87548 已退出；没有继续保留运行中的模拟器。原有 AVD 数据目录保留供复现。

## CI 与既有构建验证

Android 构建现在会先安装 Node 22 与共享图谱打包依赖，再执行 Gradle。修复提交 `84951581e90472b5cab875914991229e1062645c` 的 [Quality gates 运行](https://github.com/Hyhyhyyy/KeLing4.0/actions/runs/46133815092) 已实际完成，`android-debug` 与 `web-and-server` 均成功。

随后服务端修复提交 `debf4977067b48a5ecfb39025976f8248ac67ba0` 的 [新 Quality gates 运行](https://github.com/Hyhyhyyy/KeLing4.0/actions/runs/46137764405) 也已实际成功：`web-and-server` 用时 2 分 42 秒，`android-debug` 用时 3 分 52 秒。此项是新提交的 CI 结果，不能替代该版本的真实线上生成验收。

最终 APK 的 135 项原生测试、Lint 与签名信息见 [构建记录](topic-android-similar-2026-11-28.md)。其中模拟 HTTP 测试与本页真实模型证据分开解释，不能相互替代。
