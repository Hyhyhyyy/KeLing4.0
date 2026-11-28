# 课灵 · KeLing

当前公开版本：**4.3.1-research-rc2**，Android **versionCode 33**。主题探索新增真实联网资料、语境辨析、六种可选题型、单题追加要求和定制星球形象；绘图也先检索形象资料，再将角色外形或主题结构融入星球。知识图谱在首次生成预览中即可查看，分支与层级按内容组织。使用方法见[主题知识星球](docs/design/TOPIC_PLANETS.md)，当前验证见[本轮记录](docs/validation/topic-research-release-2026-11-28.md)。此前[五分钟讲稿与16页PPT](docs/defense/README.md)保留上一轮版本，本轮没有替换材料截图。双击 `demo.bat` 或运行 `npm run demo` 可启动独立本机演示库。

原华为工作流位于另一账号，目前 API 已真实返回计划，但内部模型节点尚未独立核验。给账号持有人的[最新交接说明](docs/handovers/huawei/README.md)和[模型核验 Word 文档](docs/handovers/huawei/课灵华为云工作流模型核验补充交接20261127.docx)可直接转交；不能把妙搭模型的验证结果称为华为模型已验证。

以游戏化学习为核心的 Web 与 Android 应用。课程资料、动手练习、AI 辅导、任务与笔记使用共享账号服务；学习过程围绕「远航、星图、基地、我的」组织，手机另提供资料与设置入口。

[打开网页](https://ucn5aajxnx7f.feishuapp.com/app/app_17h4dw5jwdg) · [使用指南](https://ucn5aajxnx7f.feishuapp.com/app/app_17h4dw5jwdg/guide) · [游客试用](https://ucn5aajxnx7f.feishuapp.com/app/app_17h4dw5jwdg/trial) · [下载 Android](https://ucn5aajxnx7f.feishuapp.com/app/app_17h4dw5jwdg/download/android) · [GitHub Releases](https://github.com/Hyhyhyyy/KeLing4.0/releases)

当前公开 Android 下载为 **4.3.1-research-rc2 / 33**，最低 Android 8.0。预览包使用调试签名，与此前公开包保持同一包名和证书。当前网页与 API 运行于妙搭，连接原 Neon PostgreSQL 数据库。`vercel.json` 已用 `git.deploymentEnabled: false` 关闭 Git 自动部署；旧 Vercel 入口暂停仍待账号持有人确认，关闭自动部署不等于旧站已经下线。当前有效入口以上述妙搭地址为准。

## 功能

- **主题探索：** 输入学科、多义词或网络用语，先检索、再辨析语境，预览有来源的讲解与知识图谱后确认创建星球；资料不足时停止生成。
- **多样练习：** 可选6、12、18题，包括单选、多选、判断、填空、排序与简答自核。对单题追加要求重生，或单独重绘星球形象，保留其他内容。
- **相似碎片与星芽：** 单题可重新检索并追加两道同题型练习。学习阶段看讲解、图谱和资料，答题阶段隐藏这些内容，但随时可问星芽或回看学习；切换时保留未提交的输入。
- **游戏化学习：** 学习讲解、作答核对、记录发现与安排后续任务。二叉树保留为显式选择的规则练习示例；装饰奖励与知识掌握状态分开记录。
- **学习工作区：** 课程、资料、笔记、任务、专注与学习报告，已提交的账号数据可跨端接续。
- **个人空间：** 选择头像，按真实学习记录解锁框、称号和家具，布置十个家园位置，按日历回看分钟、任务与打卡；详见[成就规则](docs/defense/个人空间与成就规则.md)。
- **可控 AI：** 先预览资料范围，再明确发送；回答和计划由用户核对、确认后保存。支持配置个人模型 Key。
- **游客体验：** 使用本次内存工作区；退出、刷新或进程结束后清空，不自动迁入账号。

本轮服务端174项、Web96项、共享图谱6项、Android135项测试通过；测试替身只验证代码行为，真实模型、公开入口与设备证据分别记录在[本轮验收](docs/validation/topic-research-release-2026-11-28.md)。此前计时、打卡、装扮与跨端读回见[航程成长记录](docs/validation/journey-release-2026-11-27.md)，通用AI历史样本见[RC3记录](docs/validation/demo-ai-rc3-2026-11-27.md)。检索摘要不是全文事实核查，简答自核不是AI评分；这些结果不代表全学科正确、所有模型厂商可用、实体设备通过或学习效果得到证明。

最新公开实测中，两端题内星芽、相似题追加、资料隐藏与输入保留、反馈重绘已运行成功；默认“奶龙学”首次生成仍被内容复核拒绝，新增题的人工审读仍发现来源身份与截断摘录补写问题。此版本为公开测试版，不能称为任意主题稳定生成或免审阅教材。

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

`assets/stellar` 统一维护两端共用的 69 张 WebP 和一张 PNG 启动图标，网页与 Android 打包副本由构建生成。早期原 PNG 可从 Git 提交 `9583827` 追溯，新绘资源保留独立原稿和提示词记录。详见[资源维护说明](assets/stellar/README.md)。

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

Android 的 `prepareGraphEditor` 会通过 Node.js 构建两端共用的 X6 图谱。即使只构建 Android，也须先在仓库根目录执行 `npm ci --ignore-scripts`，安装锁定的 `esbuild` 等依赖；不需要启动网页或 API 服务。CI 和手动预览构建会自动完成此步骤。

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
