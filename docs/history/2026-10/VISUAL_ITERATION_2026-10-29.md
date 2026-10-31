# I0：完整像素场景与界面密度升级

> 历史记录（2026 年 10 月）。保留当时版本、操作和验证结论；当前入口与运行方式见[文档索引](../../README.md)。

日期：2026-10-29。对应用户提出的首页和各模块空白过多，以及多端持续研发要求。

## 问题与实现

旧 `hero_web.png` 左半边为叠加文字预留了空位，介绍页直接把它当独立图展示；多个模块只有小角色与大块背景。本轮保留旧资源，使用内置 `image_gen` 新绘五幅满幅场景：观测站、AI 实验舱、轨道档案室、知识生态舱、月光专注室。画面增加书架、仪器、植物、桌面与路径，延续星芽角色和统一配色。

源文件为 `assets/stellar/station_full.png` 和四个 `scene_*.png`；提示词与生成源路径在 `assets/stellar/prompts-filled-scenes.json`。`scripts/sync-stellar-assets.cjs` 将原图原样复制至 Web public 与 Android assets，`verify-stellar-assets.cjs` 核对尺寸和 SHA256。

Web 共用 `components/StellarScene.tsx`：首页图文分栏、任务配景、课程少量时的探索卡与三个完整模块卡；介绍页、AI 空对话及会话侧栏、笔记页及侧栏、课程、任务、报告加入场景。正文编辑区保留清晰底色。Web 卡片提供短悬停/按压反馈，并在系统减少动态效果时关闭这些位移；Android 场景增加轻量淡入。没有增加永久循环闪烁。

Kotlin 使用同一原图、短幅裁切、解码采样和有上限的位图缓存，主要操作保留原生控件。详情见 [Android 迭代记录](ANDROID_ITERATION_2026-10-29.md)。本轮未修改共享 API 或数据库 schema。

同步复查发现学习报告把规则模板称为 AI 洞察，且累计时长与周报混用，已独立修复，见 [报告口径修正](REPORT_INTEGRITY_2026-10-29.md)。报告不再宣称执行了模型调用。

## 实际验证

|对象|方法|结果|
|---|---|---|
|共享图片|资源同步与校验脚本|20 张 canonical PNG，两个客户端内容一致；5 张为本轮新增|
|Web|`npm run build:web`|TypeScript、Vite 与 PWA 构建通过|
|代码检查|`npm run lint`、`git diff --check`|0 错误，38 条保留警告；行尾检查通过。上一轮为 48 条警告|
|桌面布局|本地 1440×1000 浏览器|介绍、首页、AI、报告已查看；插画加载，页面无横向溢出|
|窄屏布局|本地 390×844 浏览器|首页、AI、笔记、任务、课程、编排、报告、介绍的文档宽度不超过视口|
|AI 快捷问题|点击“用例子解释二叉树遍历”|输入区出现对应文本；模型未配置时发送按钮仍禁用，没有伪造回复|
|报告|5 组统计边界断言 + 浏览器|空数据、时间边界、缺失时长、累计分离、状态过滤符合记录；页面明确标注未调用 AI|
|Android|单测、构建、Lint、包内核验|25/25 单测通过；Lint 0 错误、96 警告；20 张图片与源文件 hash 相同；调试签名验证通过|
|部署|Vercel 云端构建与 inspect|`dpl_Dj9qmj4tAhgjATvvyekfQzGCt432` 为 READY，稳定别名指向本轮|

本地浏览器使用专用 QA 账号。截图位于 `docs/screenshots/filled-*.jpg`，窄屏宽度记录在 `docs/validation/web-scenes-mobile-2026-10-29.json`。这是本地当前源码的界面验证；未把它称作公网或 Android 真机截图。

发布地址：[课灵预览](https://keling-ict-preview.vercel.app/explore)。Vercel 部署产物为 `https://keling-ict-preview-2k9i6ipav-hyhyhyyys-projects.vercel.app`；本轮检查部署状态和别名，未重跑上一轮的公网注册/数据库全链路测试。云构建日志保存在 `.cache/filled-scenes-vercel.log`，检查日志为 `.cache/filled-scenes-inspect.log`。

APK：`releases/KeLing-ICT-3.2.1-cloud-debug.apk`，87,402,634 字节，云端 API 地址已编入。SHA256：`fbc57593ec363e6f8b7e5ea56d96c38e64af57d9c1e90d615a5f3a5b2065cb9b`。

## 本轮复盘与后续顺序

优势：场景与功能对应更清晰；页面内容密度提高；两端共享原图但布局不同；报告结论更符合实际证据。

仍有代价：新增 PNG 共约 14.1 MB，Android 包增加约 13.3 MiB；尚未测量弱网首屏、低端设备内存、耗电和图片格式优化收益。截图没有验证键盘弹出、TalkBack、所有字体缩放及真实设备同步。当前线上模型凭据未配置，不能称全局 AI 已完成。

下一轮按 [总设计](../../MASTER_DESIGN.md) 与 [台账](../../ITERATION_BACKLOG.md) 先补明确来源范围与上下文入口，再完成一个真实 AI 学习闭环；同时用刚安装的 Google Android 性能技能和 Vercel 界面技能评估图片成本、交互与无障碍。以实际问题和验收结果决定下一步，不只增加装饰和模型数量。
