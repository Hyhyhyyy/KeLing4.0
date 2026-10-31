# Web 模块独立原画接入 I1（2026-10-29）

> 历史记录（2026 年 10 月）。保留当时版本、操作和验证结论；当前入口与运行方式见[文档索引](../../README.md)。

## 实际接入

`apps/web/src/components/stellarScenes.ts` 集中记录 29 幅场景的文件名、用途与原始尺寸；`StellarScene` 根据目录设置真实宽高属性。页面缩放只用于适应窗口，不把裁切、拉伸或改色计作新设计。新增图像由主线程生成与同步，本子任务未生成、修改或复制二进制资源。

| 主模块 | 原画文件 |
| --- | --- |
| 首页 | `station_full.png` |
| AI 助手 | `scene_lab.png` |
| 任务 | `scene_focus.png` |
| 共享笔记 | `scene_archive.png` |
| 课程温室 | `scene_garden.png` |
| 智能编排 | `scene_planning.png` |
| 学习报告 | `scene_report.png` |
| 个人资料 | `scene_profile.png` |
| 成就 | `scene_achievements.png` |
| 设置 | `scene_settings.png` |
| 知识图谱 | `scene_graph.png` |
| 课程详情 | `scene_course_detail.png` |
| 视觉图鉴 | `scene_atlas.png` |
| 课灵介绍 | `scene_arrival.png` |
| 登录 | `scene_login.png` |
| 注册 | `scene_register.png` |

| 次级展示位 | 独立原画文件 |
| --- | --- |
| AI 会话侧栏 | `scene_conversations.png` |
| 笔记侧栏 | `scene_notebook_shelf.png` |
| 首页任务区 | `scene_home_missions.png` |
| 首页课程区 | `scene_home_courses.png` |
| 首页智能编排入口 | `portal_planning.png` |
| 首页笔记入口 | `portal_notes.png` |
| 首页图鉴入口 | `portal_atlas.png` |
| 介绍页 AI 能力 | `scene_intro_ai.png` |
| 介绍页双端同步 | `scene_intro_sync.png` |
| 介绍页规划能力 | `scene_intro_plan.png` |
| 介绍页伙伴介绍 | `scene_companion.png` |
| 介绍页网页特色 | `scene_web_workspace.png` |
| 介绍页移动端特色 | `scene_mobile_rover.png` |

## 布局处理

新增横幅使用清晰的正文区域与独立原画区域。个人资料、设置、成就、课程详情使用紧凑横幅；图谱使用更窄的画幅，保留画布至少 420 px 高度。智能编排在无结果与有结果时互斥展示同一幅规划原画，有结果时缩小为 160 px 高以内的提示图，避免长图压住计划内容。

首页任务插图、首页课程展示、三张入口图、介绍页能力卡、伙伴区与双端特色、AI 侧栏和笔记侧栏都已替换到独立目录项。取消这些位置原有的固定裁切显示，使用 `object-fit: contain` 或图像自然高度呈现完整构图。登录和注册移除共用的 `hero_web.png` 背景与随机星点，改为各自的原画与说明；窄屏时说明与表单上下排列。

视觉图鉴单列「模块与展示位 · 独立原画」，按目录收录 29 张图，可通过带名称的链接打开原图。图鉴的集中展示是资源索引，不作为另一个模块场景设计。

## 合理保留的复用

- 首页课程区的空状态与少量课程时的补充卡片互斥，共用 `scene_home_courses.png`。
- 智能编排空结果与有结果视图互斥，共用 `scene_planning.png`。
- 图鉴集中展示每张原画，也展示同一套标志、头像、图标和组件框。
- 角色形象、标题标志、用户头像与同功能的图标继续共用；它们没有被宣称为新增模块原画。
- 五张既有场景只用于对应的业务主模块；首页观测站不再用于介绍页，实验舱不再用于编排，档案室不再用于报告和 AI 侧栏。

## 验证结果与尚未完成

- `npx.cmd tsc -b` 通过。
- 对本次 16 个 TS/TSX 文件执行 ESLint：0 错误、10 个既有警告（旧 any 与课程/图谱 effect 依赖）。新增目录与场景组件无警告。
- 最终资源检查：场景目录 29 项均已落盘，public manifest 对应 29 项的宽高与目录全部匹配，没有尺寸差异。
- 后 12 张独立原画由主线程完成生成与同步，实际尺寸均为 1536×1024，与已接入的目录一致。
- 尚未执行浏览器逐页截图、最终 Vite build 或部署。主线程需检查登录/注册 375 px 宽度下的表单位置、图谱画布可用高度、完整构图的留边效果、所有新图成功加载。
- 窄屏继续沿用原布局：AI 与笔记的次级侧栏插画隐藏，主场景与功能入口保留。没有为了展示次级图而增加手机端的长页面。
- 未改 App.tsx、typography.css、服务/API、Android、资源二进制或生成脚本；保留 I1 上下文问答逻辑。未增加免登录试用入口，留给主线程统一接线。未提交、推送。
