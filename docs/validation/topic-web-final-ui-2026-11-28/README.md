# 课灵 Web 真实页面证据 · 2026-11-28

以下为实际生产 UI 完整视口截图，未裁剪；使用专用验证账号，不包含登录凭据或任务令牌。

| 证据 | 结果与范围 |
| --- | --- |
| [题内星芽 · 桌面](inline-hint-desktop.png) | 1600×1100，旧星球上的新题内提示接口真实成功，7.660 秒返回引导提示。 |
| [题内星芽 · 手机宽度](inline-hint-mobile.png) | 390×844，Web 手机宽度，无横向溢出；不是原生 Android 截图。 |
| [初始生成输入](initial-generation-input.png) | 奶龙学、自动语境、空目标、6 题，实际默认绘图开启。 |
| [初始生成失败](initial-generation-failure.png) | 18:32，唯一一次请求在 82.958 秒后返回 INVALID_PLANET；没有草稿或确认创建。 |
| [相似练习失败](similar-practice-failure.png) | 18:40，旧星球独立相似请求在 78.571 秒后返回 CONTENT_REVIEW_UNAVAILABLE；原记录保留。 |

机器可读记录：[星芽成功](inline-hint-evidence.json)、[初始失败](initial-generation-failure.json)、[相似失败](similar-practice-failure.json)。这些记录对应 release 7713165665041107981；旧题的每一项事实没有因提示接口成功而得到额外认证。星芽成功不代表初始生成或相似题成功。

新源码 `debf497` 的最终验证已在 release `7713177556384205823` 后执行。唯一一次初始请求在 99.029 秒后以 `CONTENT_REVIEW_FAILED` 停止，没有草稿、确认、相似、提示或新图像可验收。未自动重试，原有失败证据保留。

本次证据：[输入](final-initial-input.png)、[失败完整画面](final-initial-failure.png)、[失败记录](final-initial-failure.json)、[安全任务状态](final-initial-jobs.json)。任务号 `51fcd3fb-0d36-471c-8f44-c5da1ac73d1f`，返回未附诊断字段，因此不能从客户端断言具体哪个题目或断言不合格。


## 19:20 旧星球相似接口定向复测

在同一新发布上，单独对旧星球执行一次相似搜索，28.526 秒后成功新增两道多选题。没有初始生成、图像请求或聊天请求；原题与进度保持，未提交输入保持。此成功不覆盖上方默认初始生成失败。

- [成功后的题卡与导航](final-similar-success.png)
- [新题 1 完整页面](final-similar-question-1.png) · [新题 2 完整页面](final-similar-question-2.png)
- [学习阶段的局部来源](final-similar-learning-sources.png)
- [真实交互记录](final-similar-evidence.json) · [人工来源审读及限制](similar-content-review.md)

新题内容仍有来源身份升级与截断补写问题，详情见审读；这些画面证明使用中的功能状态，不能作为内容全面正确的证明。


## 19:22 最新星球形象只读回显

主线程完成独立重绘后，本次浏览器只读刷新旧星球及首页。实际解码 2048×2048 新图，服务标记 `miaoda-image/grounded-reference`，生成时间为 `2026-11-28T11:22:28.165Z`。视觉为单个黄色圆润球体，眼睛与地貌斑纹位于球面，有小侧突起和尾部，没有独立站在球前的人物或名称文字。详情与首页使用同一个已保存地址；浏览器模型调用 0、JavaScript 错误 0。

[星球详情完整页面](final-spherical-web-detail.png) · [首页实际显示](final-spherical-web-home.png) · [只读结果](final-spherical-web-evidence.json)。它证明独立形象重绘与回显，不证明默认初始生成成功，也不改变新增题目人工审读的限制。
