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

- [仓库整理验证](validation/repository-cleanup-2026-10-31.json)：删减前的资源、构建与测试历史结果，只适用于记录中的提交。
- [共享素材与提示词](../assets/stellar/README.md)：59 张 WebP 和一张 PNG 启动图标同时供 Web、Android 使用；两端打包副本均生成，不再提交 Android 独立副本。
- [统一素材清单](../assets/stellar/manifest.json)：集中保留当前素材与原 PNG 来源摘要、既有编码记录。WebP 使用有损编码，不宣称像素无损；普通 Android 构建不依赖 Python。
- 原 PNG 及旧 Android 编码清单可从 [Git 提交 9583827](https://github.com/Hyhyhyyy/KeLing4.0/tree/9583827/assets/stellar)追溯；导出和 `prepare-stellar-art.py` 再制作方法见共享素材说明。当前文件体积限制不要求删除 Git 来源历史。
- [4.0.4 注册登录与直连交付](auth/DIRECT_ACCESS_2026-10-31.md)及[验证数据](auth/validation-direct.json)：无代理 Chrome、Android 14 模拟器、跨端账号与完整安装包下载证据。
- [历史验证数据](validation/)与[历史截图](screenshots/)：按日期和版本解释，不代表当前所有功能已经验收。

## 历史与竞赛资料

- [历史记录索引](history/README.md)：旧版技术说明、实施记录、交付材料与旧部署方式。
- [2026—2027 华为 ICT 竞赛核验](competition/huawei-ict-2026-2027.md)：适用范围和未确认事项。
- [原省赛运行说明](competition/legacy-province-running.md)：旧分支的历史复现说明。
- [已提供提交材料的要求提取](design/SUBMISSION_REQUIREMENTS_2026-10-30.md)与 [competition](competition/)：保留原始依据，不将历史省赛要求套用到当前赛事。

真实模型效果、实体手机、长期可用性和学生学习收益需要各自的验证证据；目录、原画、模拟响应或历史单次成功不能替代这些证据。
