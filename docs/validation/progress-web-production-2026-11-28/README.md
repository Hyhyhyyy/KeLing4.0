# 4.3.2 Web 真实阶段进度验证

2026-11-28，在正式发布 `7713232662001339416` / 模板 `5bb1d57204ad64e17e4a14e9326839105d623b49` 后，通过网页正常登录专用测试账号并提交一次真实整星球生成。没有拦截或修改请求/响应，没有使用合成草稿。

**结果：`CONTENT_REVIEW_FAILED`。** 浏览器端从点击生成到读取失败共 **158.066 秒**，只调用一次生成，无其他模型调用、无自动重试。内容修订后再次核对未通过，服务端没有返回草稿，界面没有确认或创建星球。不能声称本次六题内容、初始绘图或完整生成链路通过。

输入为主题“分数的意义与等值分数”、自动识别语境、6 题、开启绘图；网页基础选项选择“初学者”，目标写“**小学五年级：认识分数、等值分数与简单比较，用生活例子解释**”。实际请求记录在 [called](fractions-initial-called.json)。

## 实际观测

收到 HTTP 202 后，网页按真实 job 轮询显示检索、内容组织、复核与形象准备。共记录 55 个初始/轮询响应，revision 为 `1, 3, 4, 8, 9, 10, 11, 12, 13`。内容复核和形象准备同时运行；复核从 `reviewing` 进入 `repairing`，再回到 `reviewing`，最终失败。页面显示已完成 2/6 个环节；形象绘制和最终保存尚未开始。没有用等待时间增加完成比例。失败后加载面板退出、活动动画停止，主题、基础、题量和学习目标仍保留在表单中；确认请求为 0。

服务端同一时钟下，检索 1.394 秒、内容组织 42.984 秒、复核 110.947 秒；任务开始至失败 155.327 秒。`visual_prepare` 的标记区间也是 110.947 秒，但其中包含等待最终内容语境及采纳结果的时间，**不能据此称绘图准备本身耗时 110.947 秒，或称并行节省了 110.947 秒**。服务端与浏览器时间存在约一分钟偏移，因此不混用两套时间相减。

初始生成失败后，没有继续确认，也没有生成可供比较的新图，因此新旧星球四页同图验证没有执行。跨页面读图应在独立成功重绘后另立证据，不能用合成界面验证替代。

本次进入生成前曾出现一次基础下拉框的脚本定位失败，**模型请求为 0**。仅修正自动化选择器后重新正常登录提交；预检失败 JSON 与画面保留为 `preflight-selector-failure.*`，不算模型生成重试。

## 证据

- [汇总 JSON](evidence.json)
- [55 条安全阶段响应与时间戳](fractions-initial-polls.json)
- [实际失败结果](fractions-initial-failure.json)
- [完整输入画面](fractions-initial-input.png)
- [手机真实加载状态](fractions-initial-loading-mobile.png)
- [桌面并行阶段画面](fractions-initial-progress-4.png)
- [修订中的阶段画面](fractions-initial-progress-7.png)
- [完整失败画面](fractions-initial-failure.png)

截图为完整浏览器视口，没有裁剪。记录不含账号凭据、job token 或草稿签名。原始模型草稿没有返回到前端，所以本目录没有六道题可供人工审读，不能推断复核失败的具体题目原因。


## 独立重绘后的四入口回读

在 Android 同轮唯一一次真实形象重绘成功后，Web 只读刷新原奶龙星球。该结果与上面的失败整球请求是两条独立路径，不能合并成一次成功整球生成。

- 真实已保存形象：`generatedAt=2026-11-28T14:58:00.904Z`，provider 为 `miaoda-image/grounded-reference`，2048×2048。
- 与 Android 独立核对 generatedAt 以及 URL SHA-256 `983aa5a9aeca1b874c077d446a2664ef768d7d17dc930447ed577c7d56ef0628` 一致。
- Web 星球详情、课程详情、课程星图、首页均读取同一已保存 URL；桌面 1600×1100 与手机 390×844 的完整视口已保存。页面错误 0，Web 模型调用 0。
- 视觉中是黄色近球体，眼睛、浅色腹部、坑纹和短尾融入球体；本项证明实际形象同步和加载，不证明所有角色形象生成必然准确。
- 本轮读回开始时新图已保存，没有拍到重绘前画面；没有为了补画面再次调用模型。

[四入口结果与 URL 校验](nailong-post-redraw-evidence.json)

- [星球详情·桌面](nailong-post-redraw-planet-detail-desktop.png)
- [星球详情·手机](nailong-post-redraw-planet-detail-mobile.png)
- [课程详情](nailong-post-redraw-course-detail.png)
- [课程星图·桌面](nailong-post-redraw-starmap-desktop.png)
- [课程星图·手机](nailong-post-redraw-starmap-mobile.png)
- [首页](nailong-post-redraw-home-desktop.png)
