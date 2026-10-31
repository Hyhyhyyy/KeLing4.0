# 项目文档

当前公开版本：**4.0.4-direct-cloud-preview**，Android versionCode **20**。先按当前说明运行项目，再按需要查阅设计与历史记录；历史版本的测试数字、地址或操作方式不能替代当前验证。

本次去冗余后的源码按用户要求未运行测试、构建或 CI；既有验证记录只对应删减前的提交。

## 使用、开发与部署

| 文档 | 用途 |
| --- | --- |
| [项目首页](../README.md) | 功能、有效入口、本地启动与基本检查 |
| [产品介绍](PRODUCT_INTRODUCTION.md) | 游戏化学习流程、账号与游客、AI 使用边界 |
| [贡献指南](../CONTRIBUTING.md) | 工程约定、资源与数据变更要求 |
| [部署说明](DEPLOYMENT.md) | 当前托管关系、本地与容器部署 |
| [妙搭适配源](../deploy/miaoda/README.md) | 官方模板的接入与部署副本生成 |
| [发布指南](RELEASE_GUIDE.md) | 版本、签名、安装包和下载校验 |
| [迁移与恢复](design/DATA_MIGRATION_AND_RECOVERY.md) | 数据升级、备份及失败恢复 |

## 架构与设计依据

- [总设计](MASTER_DESIGN.md)：产品问题、架构和各阶段设计依据；其中阶段性统计保留原日期。
- [AI 上下文契约](AI_CONTEXT_CONTRACT.md)：课程、笔记和任务进入 AI 的预览与确认协议。
- [远征端云契约](design/EXPEDITION_CONTRACT_V1.md)：学习规则、提交、冲突与结算边界。
- [原始游戏化升级方案](design/source/KELING_GAMIFIED_UPGRADE_PLAN_FINAL_2026-10-30.md)及[设计来源](design/source/SOURCE.md)：保留逐字提案原文及原始 SHA-256；其中相对路径属于原工作区，不改写为当前代码引用，也不将计划当作完成情况。
- [交付与设计台账](ITERATION_BACKLOG.md)：阶段历史和未实施设想，不是周期任务队列。

## 资源与验证

- [仓库整理验证](validation/repository-cleanup-2026-10-31.json)：资源去重、文件迁移、当前构建与测试结果；云端检查以对应提交的 Quality gates 为准。
- 原图与提示词：[assets/stellar](../assets/stellar)。网页副本由 `npm run assets:sync` 生成，`npm run assets:check` 检查清单和派生资源。
- Android 使用已提交的 WebP 派生文件。维护时使用 Pillow 12.3.0 运行 `python scripts/prepare-android-art.py`；`--verify` 校验摘要、尺寸、透明度和编码差异。普通 Android 构建不依赖 Python。WebP 为最高有损质量编码，不宣称像素无损。
- [Android 素材清单](auth/android-art-manifest.json)：逐张保留原图与派生文件摘要及编码验证数值。
- [4.0.4 注册登录与直连交付](auth/DIRECT_ACCESS_2026-10-31.md)及[验证数据](auth/validation-direct.json)：无代理 Chrome、Android 14 模拟器、跨端账号与完整安装包下载证据。
- [历史验证数据](validation/)与[历史截图](screenshots/)：按日期和版本解释，不代表当前所有功能已经验收。

## 历史与竞赛资料

- [历史记录索引](history/README.md)：旧版技术说明、实施记录、交付材料与旧部署方式。
- [2026—2027 华为 ICT 竞赛核验](competition/huawei-ict-2026-2027.md)：适用范围和未确认事项。
- [原省赛运行说明](competition/legacy-province-running.md)：旧分支的历史复现说明。
- [已提供提交材料的要求提取](design/SUBMISSION_REQUIREMENTS_2026-10-30.md)与 [competition](competition/)：保留原始依据，不将历史省赛要求套用到当前赛事。

真实模型效果、实体手机、长期可用性和学生学习收益需要各自的验证证据；目录、原画、模拟响应或历史单次成功不能替代这些证据。
