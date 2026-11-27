# 课灵 · KeLing

当前网页、API 与 Android：**4.1.2-ai-rc3**，Android **versionCode 30**。新工作区由探索者输入学科和目标，真实模型生成学习星球；资料问答、计划与复盘已接入妙搭公共模型。知识星图使用本地嵌入的 AntV X6 与 Dagre，已核对两端保存和回读。实际调用、演示与未完成项见[RC3交付记录](docs/validation/demo-ai-rc3-2026-11-27.md)。双击 `demo.bat` 或运行 `npm run demo` 可启动独立本机演示库。

原华为工作流位于另一账号，目前 API 已真实返回计划，但内部模型节点尚未独立核验。给账号持有人的[最新交接说明](docs/handovers/huawei/README.md)和[模型核验 Word 文档](docs/handovers/huawei/课灵华为云工作流模型核验补充交接20261127.docx)可直接转交；不能把妙搭模型的验证结果称为华为模型已验证。

以游戏化学习为核心的 Web 与 Android 应用。课程资料、动手练习、AI 辅导、任务与笔记使用共享账号服务；学习过程围绕「远航、星图、基地、我的」组织，手机另提供资料与设置入口。

[打开网页](https://ucn5aajxnx7f.feishuapp.com/app/app_17h4dw5jwdg) · [使用指南](https://ucn5aajxnx7f.feishuapp.com/app/app_17h4dw5jwdg/guide) · [游客试用](https://ucn5aajxnx7f.feishuapp.com/app/app_17h4dw5jwdg/trial) · [下载 Android](https://ucn5aajxnx7f.feishuapp.com/app/app_17h4dw5jwdg/download/android) · [GitHub Releases](https://github.com/Hyhyhyyy/KeLing4.0/releases)

当前公开 Android 下载为 **4.1.2-ai-rc3 / 30**，最低 Android 8.0。预览包使用调试签名，与此前公开包保持同一包名和证书。当前网页与 API 运行于妙搭，连接原 Neon PostgreSQL 数据库。`vercel.json` 已用 `git.deploymentEnabled: false` 关闭 Git 自动部署；旧 Vercel 入口暂停仍待账号持有人确认，关闭自动部署不等于旧站已经下线。当前有效入口以上述妙搭地址为准。

## 功能

- **游戏化学习：** 自选学科、生成星球、学习讲解、作答核对、记录发现与安排后续任务。二叉树保留为显式选择的规则练习示例；装饰奖励与知识掌握状态分开记录。
- **学习工作区：** 课程、资料、笔记、任务、专注与学习报告，已提交的账号数据可跨端接续。
- **可控 AI：** 先预览资料范围，再明确发送；回答和计划由用户核对、确认后保存。支持配置个人模型 Key。
- **游客体验：** 使用本次内存工作区；退出、刷新或进程结束后清空，不自动迁入账号。

本轮服务端108项、Web及图谱更新90项、Android111项、妙搭适配21项测试通过。公开接口取得十二个通用 AI 成功样本，并保留首次失败和内容问题；学科生成另有证据。RC3 实装 Android 14 模拟器，资料导师回答已保存并重开，图谱完成跨端位置与版本核对。线上构建文件与四个来源的完整 APK 摘要一致。范围见[验证索引](docs/validation/demo-ai-rc3-2026-11-27.md)，这些结果不代表全学科正确、所有模型厂商可用、实体设备通过或学习效果得到证明。

## 项目结构

```text
apps/
  web/                React + TypeScript + Vite
  server/             Express + Prisma，账号与学习 API
  android/            Kotlin + Jetpack Compose
packages/shared/      共享数据契约、学习规则与测试样例
assets/stellar/       两端共用运行素材、清单和生成来源
scripts/              开发、构建、校验与部署辅助脚本
deploy/               部署配置
docs/                 当前文档、设计依据与历史归档
```

`assets/stellar` 统一维护两端共用的 63 张 WebP 和一张 PNG 启动图标，网页与 Android 打包副本由构建生成。原 PNG 可从 Git 提交 `9583827` 追溯，不再重复保留于当前源码树。详见[资源维护说明](assets/stellar/README.md)。

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

公开妙搭部署已注册公共模型能力，无需个人 Key 即可使用已接入的 AI 入口。独立本地部署仍需配置模型服务；没有配置时，可使用课程、任务和内置规则练习，模型失败不会以示例答案冒充。不要把密钥写入客户端包或提交到 Git。

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
npm run test:updates --workspace=keling-web
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

本项目在 [CurryHeng/KeLing_ICT](https://github.com/CurryHeng/KeLing_ICT) 基础上继续开发，当前由 [Hyhyhyyy/KeLing4.0](https://github.com/Hyhyhyyy/KeLing4.0) 维护，代码采用 [MIT License](LICENSE)。当前华文中宋的来源与用户嵌入授权确认见[字体说明](assets/fonts/README.md)，不属于代码的 MIT 授权范围。旧版 Noto Serif SC 的 [SIL Open Font License](apps/android/app/src/main/assets/licenses/noto-serif-sc/OFL.txt) 与[来源说明](apps/android/app/src/main/assets/licenses/noto-serif-sc/SOURCE.md)保留供历史追溯。视觉和开发使用 AI 辅助，生成来源与原始设计资料保留在仓库中。
