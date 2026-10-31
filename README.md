# 课灵 · KeLing

以游戏化学习为核心的 Web 与 Android 应用。课程资料、动手练习、AI 辅导、任务与笔记使用共享账号服务；学习过程围绕「远航、星图、基地、我的」组织，手机另提供资料与设置入口。

[打开网页](https://ucn5aajxnx7f.feishu.link/app/app_17h4dw5jwdg) · [游客试用](https://ucn5aajxnx7f.feishu.link/app/app_17h4dw5jwdg/trial) · [下载 Android](https://ucn5aajxnx7f.feishu.link/app/app_17h4dw5jwdg/download/android) · [GitHub Releases](https://github.com/Hyhyhyyy/KeLing4.0/releases)

当前公开版本为 **4.0.4-direct-cloud-preview**，Android versionCode **20**，最低 Android 8.0。预览包使用调试签名。当前网页与 API 运行于妙搭，连接原 Neon PostgreSQL 数据库。

## 功能

- **游戏化学习：** 二叉树首章的操作练习、反馈回放、知识证据和学习装饰。装饰奖励与知识掌握状态分开记录。
- **学习工作区：** 课程、资料、笔记、任务、专注与学习报告，已提交的账号数据可跨端接续。
- **可控 AI：** 先预览资料范围，再明确发送；回答和计划由用户核对、确认后保存。支持配置个人模型 Key。
- **游客体验：** 使用本次内存工作区；退出、刷新或进程结束后清空，不自动迁入账号。

注册、登录、跨端互通及恢复登录已在关闭代理的 Chrome 与 Android 14 模拟器验证。真实模型效果、实体手机、学生学习收益与原生 HarmonyOS 尚未完成验收。详见[产品介绍](docs/PRODUCT_INTRODUCTION.md)与[验证记录](docs/auth/DIRECT_ACCESS_2026-10-31.md)。

## 项目结构

```text
apps/
  web/                React + TypeScript + Vite
  server/             Express + Prisma，账号与学习 API
  android/            Kotlin + Jetpack Compose
packages/shared/      共享数据契约、学习规则与测试样例
assets/stellar/       视觉原图、清单和生成来源
scripts/              开发、构建、校验与部署辅助脚本
deploy/               部署配置
docs/                 当前文档、设计依据与历史归档
```

原图只在 `assets/stellar` 维护。网页静态资源由脚本生成；Android 使用已提交的 WebP 派生素材。不要手动修改生成副本。详见[资源维护说明](docs/README.md#资源与验证)。

## 本地运行

需要 **Node.js 22.13 或以上版本**。Android 另需 **JDK 17、Android SDK 34**。

```sh
git clone https://github.com/Hyhyhyyy/KeLing4.0.git
cd KeLing4.0
npm ci
npm run setup:local
npm run dev
```

网页访问 `http://localhost:5173`，API 为 `http://localhost:3001/api`。本地初始化创建被 Git 忽略的环境配置和随机 JWT 密钥，使用 SQLite；已有库会保留并执行适用的增量升级。升级前先阅读[数据迁移与恢复](docs/design/DATA_MIGRATION_AND_RECOVERY.md)。

没有模型配置时，可使用课程、任务和内置规则练习；真实 AI 调用需要在界面或服务端配置有效的模型服务。不要把密钥写入客户端包或提交到 Git。

Android 在 Android Studio 中打开 `apps/android`。默认连接当前线上服务；连接本机开发 API 时，可使用模拟器地址：

```sh
cd apps/android
./gradlew assembleDebug -PKELING_API_BASE_URL=http://10.0.2.2:3001/api
```

Windows 使用 `gradlew.bat`；中文目录可从仓库根目录运行 `./scripts/android-check.ps1 -Lint`。部署方式见[部署文档](docs/DEPLOYMENT.md)。

## 构建与检查

```sh
npm run check
npm test
npm run test:web
npm run assets:check
```

```sh
cd apps/android
./gradlew testDebugUnitTest assembleDebug lintDebug
```

`npm test` 使用隔离的临时 SQLite 数据库，不应对生产库运行开发初始化。测试通过不替代真实设备、模型或学习效果验证。

## 文档与贡献

- [文档索引](docs/README.md)：当前操作说明、架构契约、资源来源与版本证据。
- [贡献指南](CONTRIBUTING.md)：工作区命令、变更边界与提交要求。
- [发布说明](docs/RELEASE_GUIDE.md)：签名、版本编号与安装包发布。
- [安全说明](SECURITY.md) · [支持与反馈](SUPPORT.md) · [后续方向](ROADMAP.md)。

历史交付、竞赛材料和原始设计保留在文档归档中，不作为当前运行入口或自动执行计划。

## 来源与许可

本项目在 [CurryHeng/KeLing_ICT](https://github.com/CurryHeng/KeLing_ICT) 基础上继续开发，当前由 [Hyhyhyyy/KeLing4.0](https://github.com/Hyhyhyyy/KeLing4.0) 维护，代码采用 [MIT License](LICENSE)。Noto Serif SC 字体另遵循 [SIL Open Font License](apps/android/app/src/main/assets/licenses/noto-serif-sc/OFL.txt)，其[来源说明](apps/android/app/src/main/assets/licenses/noto-serif-sc/SOURCE.md)随包保留。视觉和开发使用 AI 辅助，生成来源与原始设计资料保留在仓库中。
