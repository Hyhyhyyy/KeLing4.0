<div align="center">
  <img src="assets/stellar/app_icon.png" alt="课灵的星球标识" width="96" />
  <h1>课灵 · KeLing4.0</h1>
  <p><strong>从一次动手推演，到有依据的学习成长。</strong></p>
  <p>React 网页 × Kotlin Android · 可控 AI 辅导 · 星际像素学习空间</p>
  <p>
    <a href="https://github.com/Hyhyhyyy/KeLing4.0/releases/tag/v4.0.1-preview"><img src="https://img.shields.io/badge/构建-4.0.1--preview-D9AD54?style=flat-square" alt="4.0.1-preview" /></a>
    <a href="https://ucn5aajxnx7f.feishu.link/app/app_17h4dw5jwdg/trial"><img src="https://img.shields.io/badge/游客模式-无需注册-377A68?style=flat-square" alt="游客模式：无需注册" /></a>
    <a href="apps/android"><img src="https://img.shields.io/badge/Android-Kotlin-7F52FF?style=flat-square&logo=kotlin&logoColor=white" alt="Android：Kotlin" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-163446?style=flat-square" alt="MIT License" /></a>
  </p>
  <p>
    <a href="https://ucn5aajxnx7f.feishu.link/app/app_17h4dw5jwdg/trial"><strong>网页游客入口 ↗</strong></a>
    &nbsp; · &nbsp;
    <a href="https://github.com/Hyhyhyyy/KeLing4.0/releases/tag/v4.0.1-preview"><strong>Android 4.0 发布页</strong></a>
    &nbsp; · &nbsp;
    <a href="docs/PRODUCT_INTRODUCTION.md"><strong>产品介绍</strong></a>
    &nbsp; · &nbsp;
    <a href="#本地启动"><strong>本地运行</strong></a>
  </p>
</div>

> **当前构建：4.0.3-direct-cloud-preview · Android versionCode 19。** 已增加可直连的妙搭服务，仍使用原账号数据库；修复注册/登录等待、取消与重试，以及网页子路径和刷新恢复。Android 89 项测试通过；当前实测网络与交付边界见[注册登录修复记录](docs/auth/DIRECT_ACCESS_2026-10-31.md)。APK 为调试签名预览包，最低 Android 8.0，实体手机尚待安装后验证。

<p align="center">
  <img src="assets/stellar/expedition_voyage.png" alt="4.0 远航像素主视觉原画：二叉树通信站，非运行截图" width="100%" />
  <br/><sub>4.0 远航美术原画 · AI 辅助生成 · 不是界面运行截图</sub>
</p>

课灵把资料、实际操作、自己的解释、AI 建议和下一步任务连起来。你可以先不登录，进入当前端的完整功能界面；需要长期保存和跨端接续时，再使用共享账号。AI 提供建议，规则保留证据，保存与执行由你确认。

## 四个入口，一条学习流程

**整理资料 → 选择目标 → 操作或解释 → 阅读反馈 → 确认下一步 → 留下证据与回访安排**

| 入口 | 这一次可以做什么 |
| --- | --- |
| **远航** | 选择课程与 10 / 20 / 25 分钟内容建议，开始单目标、解释或综合练习；继续历史远征；预览课表约束下的学习安排 |
| **星图** | 查看课程目标、知识状态和来源；动手练习、教星芽；导入资料、修订版本、确认知识点候选 |
| **基地** | 用学习循环获得的结晶购买、装备像素装饰；查看、修订或删除自己确认的伙伴解释档案 |
| **我的** | 回看作答、反馈和证据；记录线下学习自述；检查历史余额、冲突副本与设置，调整提示、叙事和低动效偏好 |

首章为 **二叉树通信站**：队列层序、栈先序、祖先上下界三个目标，**18 道原创种子题、两种玩法**。路线修复可实际执行 PUSH / POP 并回看容器过程，也保留直接输入；教星芽要求写出解释并逐项自核。内置规则给出具体偏差，提示和修改仍保留训练过程。

所有生产种子题目前都标记为 **待独立人工审核**。规则正确不等于已掌握；当前不颁发严格独立或延迟知识徽章。10 / 20 / 25 分钟是内容范围建议；会话经过、暂停时间与实际学习分钟分别处理，不按挂着页面的时长发奖。

<table>
  <tr>
    <td width="50%" align="center"><img src="assets/stellar/expedition_starmap.png" alt="4.0 星图独立像素原画，非运行截图" width="100%"/><br/><sub>星图 · 目标与来源</sub></td>
    <td width="50%" align="center"><img src="assets/stellar/expedition_base.png" alt="4.0 基地独立像素原画，非运行截图" width="100%"/><br/><sub>基地 · 一个可装备的建设位</sub></td>
  </tr>
</table>
<table>
  <tr>
    <td align="center" width="33%"><img src="assets/stellar/decoration_antenna.png" alt="信号天线装饰原画" width="150"/><br/><sub>信号天线</sub></td>
    <td align="center" width="34%"><img src="assets/stellar/decoration_archive.png" alt="星光档案柜装饰原画" width="150"/><br/><sub>星光档案柜</sub></td>
    <td align="center" width="33%"><img src="assets/stellar/decoration_observatory.png" alt="观测台装饰原画" width="150"/><br/><sub>小型观测台</sub></td>
  </tr>
</table>

本版新增 **3 张独立场景 + 3 张透明装饰**，共享资源总计 **60 张 PNG 视觉资源（含图标与图集）**。两端复用相同风格原画，按屏幕和功能安排布局；不是用同一图放大缩小伪装成不同模块。装饰不提高知识判定，不阻挡阅读和提示。[远征原画与提示词](assets/stellar/prompts-expedition.json)随源码保留。

### 原有工具继续可达

| 工具 | 已实现用途 | 用户掌握决定权的地方 |
| --- | --- | --- |
| 课程、知识图谱与笔记 | 整理课程、知识点、关联与理解记录；十款星球选择 | 显示资料来源；修订冲突保留输入 |
| 材料工作坊 | 文字、Markdown、文字 PDF 解析预览与版本管理 | 确认后保存；标题提取候选不是自动审核关卡；扫描件无 OCR |
| AI 助手 | 概念讲解、练习、复习、追问、会话管理与保存回答 | 预览资料范围、主动发送；没有模型配置时不伪造回答 |
| 智能编排与约束排程 | AI 计划建议；按日期、课表、已有任务、预算和休息计算可行时段 | 两种方法分别标注，先预览再确认写入；重复确认不重复建任务 |
| 任务、专注与报告 | 任务执行、计时、实际分钟确认和学习记录 | 旧手动完成与签到不再发资源，不把点击次数当作知识证据 |
| 个人与本机空间 | 头像、模型配置、历史成就、原有田园功能 | 旧资料只读核对归属；历史余额不与新账号相加 |

## 同一份学习数据，按端适配

| | Web · 集中整理 | Kotlin Android · 随身执行 |
| --- | --- | --- |
| 交互 | 宽屏场景、知识图谱画布、键盘及传统表单 | 原生 Compose、触控卡片、四入口底部导航 |
| 资料 | 文件上传、阅读、版本、候选知识点与笔记整理 | 文档选择器导入文字 / Markdown / PDF，卡片式阅读与版本操作 |
| 学习恢复 | 按账号隔离的 IndexedDB 草稿与待提交队列 | 按账号和 API 地址隔离的原子本机存档 |
| 跨端接续 | 读取已提交的远征、证据、任务和自述 | 同一后端、同一账号；另一端写入需明确接管 |
| 个性化 | 宽屏布局、伙伴提示、叙事和低动效偏好 | 移动场景布局、相同偏好、原生专注与本机入口 |

同一远征只有一个有效写入设备。断网后的原请求保留操作编号与版本，重试不重复结算；发生冲突时保留草稿，不能用旧收据覆盖较新的远端进度。偏好属于本设备账号空间，尚未宣称跨端同步。原 Android 田园数据与云工作区也不会自动双向合并。

### 十颗星球，选择自己的课程外观

每颗为独立像素原画；课程外观在登录后经同一 API 共享，游客仅本次保留。更换外观不改变学习进度或知识状态。

<table>
  <tr>
    <td align="center"><img src="assets/stellar/planet_01.png" alt="翡翠书环" width="110"/><br/><sub>翡翠书环</sub></td>
    <td align="center"><img src="assets/stellar/planet_02.png" alt="珊瑚火山" width="110"/><br/><sub>珊瑚火山</sub></td>
    <td align="center"><img src="assets/stellar/planet_03.png" alt="极光冰晶" width="110"/><br/><sub>极光冰晶</sub></td>
    <td align="center"><img src="assets/stellar/planet_04.png" alt="琥珀沙丘" width="110"/><br/><sub>琥珀沙丘</sub></td>
    <td align="center"><img src="assets/stellar/planet_05.png" alt="云海雷霆" width="110"/><br/><sub>云海雷霆</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="assets/stellar/planet_06.png" alt="深海潮汐" width="110"/><br/><sub>深海潮汐</sub></td>
    <td align="center"><img src="assets/stellar/planet_07.png" alt="苔原花园" width="110"/><br/><sub>苔原花园</sub></td>
    <td align="center"><img src="assets/stellar/planet_08.png" alt="紫晶洞窟" width="110"/><br/><sub>紫晶洞窟</sub></td>
    <td align="center"><img src="assets/stellar/planet_09.png" alt="机械星核" width="110"/><br/><sub>机械星核</sub></td>
    <td align="center"><img src="assets/stellar/planet_10.png" alt="银月陨坑" width="110"/><br/><sub>银月陨坑</sub></td>
  </tr>
</table>

[十款原画与生成提示](assets/stellar/prompts-planets.json) · [3.2.5 历史验证记录](docs/PLANETS_WEB_2026-10-30.md)

## 不登录，也能完整使用

“完整游客”指当前端已实现的入口与功能不因未登录而锁定；不表示所有设想中的功能都已实现。学习、AI 配置、远征、资料、排程与基地都使用相同界面和规则，数据只保留本次内存。

| | 完整游客 | 登录账号 |
| --- | --- | --- |
| 站内 / 模块切换 | 本次课程、任务、笔记、Key、会话、草稿与远征继续可用 | 已提交数据由共享服务保存 |
| 下次打开 | 不恢复上一轮内容 | 读取账号保存内容；本设备草稿按账号恢复 |
| 多端共享 | 不参与 | 相同服务、相同账号接续已提交数据 |
| AI | 有效个人 Key，或明确开启的公共模型 | 已配置的账号服务，或个人 Key 入口 |
| 转入账号 | 不自动迁入；结束前可自行导出已支持的内容 | 不读取上一轮游客内存 |

**Web：** 站内切换保留；刷新、关闭、退出或清空重开会结束本次空间。**Android：** 模块切换或短暂后台、且 Activity 未销毁时保留；退出、Activity 销毁重建（包括旋转重建）或进程结束后清空。游客不建立云端学习账号。用户主动导出的文件与剪贴板副本不由应用自动删除。

[完整游客的基础实现](docs/FULL_GUEST_2026-10-30.md) · [4.0 Android 生命周期与验收](docs/EXPEDITION_ANDROID_2026-10-30.md)

## 用自己的 Key 连接 AI

在 **设置、AI 助手、智能编排或资料工作坊** 打开 API Key 模块：

1. 输入 Key，确认厂商及官方地域。前缀检测只提供候选，不等于认证成功。
2. 主动验证并拉取服务返回的模型目录；不支持目录时，可手填已开通的模型 ID。
3. 选择模型，检查资料预览并明确发送。使用向量检索时另选向量模型，确认可能增加的用量。
4. 核对回答与引用，按需保存笔记或确认计划。游客 Key 在本次内存跨模块共用，结束后清除。

预设 **17 家服务入口**：DeepSeek、阿里云百炼、Kimi、智谱、硅基流动、火山方舟、腾讯混元、华为云 MaaS、OpenAI、Anthropic、Google Gemini、OpenRouter、百度千帆、MiniMax、xAI、Mistral、Groq。

Key 只发给选定服务，不向多家厂商自动试探。目录可见不保证权限、额度或调用成功。明确选定课程的预览可包括该课程知识点、材料版本摘录、目标和近期反馈；只有确认后才发送，内容变化需重新预览。原有广泛检索仍是最近 **24 个知识点 + 12 篇笔记**的有界候选，不是全库向量数据库。AI 不能改写知识证据、余额或确认状态。

> **真实模型未实测。** 用户目前暂无有效 Key。本版各厂商连通性、目录权限、回答质量、向量效果、计费与 AgentArts 运行仍未完成真实验收；自动测试中的合成响应不代表模型效果。游客转发不建立账号学习记录，但模型商仍可能按自身政策处理内容和收费。

## 技术与目录

```text
KeLing4.0/
├── apps/
│   ├── web/          React + TypeScript + Vite
│   ├── android/      Kotlin + Jetpack Compose
│   └── server/       Express + Prisma · 账号 API / 模型适配
├── packages/shared/ 首章内容、判定规则、端云合同与同源测试样例
├── assets/stellar/  60 张 PNG 视觉资源（含图标 / 图集）、清单与提示
├── scripts/         初始化、增量迁移、测试、构建与资源核验
├── docs/            产品介绍、设计、接口、迁移与验收记录
└── releases/        交付说明与离线产品介绍
```

登录数据经共享 API 保存；Web 游客使用浏览器内存，Android 游客使用独立内存工作区与 `MemoryPreferences`。账号学习结算由服务端事务执行；游客复用规则的内存实现。当前默认预览环境为 **妙搭托管 + 原 Neon 数据库**，原 Vercel 环境保留，本地开发可用 SQLite。本次连接修复见[直连记录](docs/auth/DIRECT_ACCESS_2026-10-31.md)。

华为云 MaaS 是可选模型入口，AgentArts 保留账号编排适配路径。项目按 **2026—2027 届华为 ICT 大赛创新赛**方向准备；Vercel / Neon 不是华为云，Kotlin Android 不是原生 HarmonyOS。尚缺适用附件 3 赛题细则等核对，不能宣称完整赛事合规。见[竞赛边界](docs/competition/huawei-ict-2026-2027.md)与[已提供提交材料的要求提取](docs/design/SUBMISSION_REQUIREMENTS_2026-10-30.md)。

## 本地启动

需要 **Node.js ≥ 22.13**；Android 使用 **JDK 17、SDK 34**。

```sh
git clone https://github.com/Hyhyhyyy/KeLing4.0.git
cd KeLing4.0
npm ci --ignore-scripts
npm run setup:local
npm run dev
```

打开 [localhost:5173](http://localhost:5173)。初始化生成本地 `.env` 和随机 JWT 密钥；保留已有数据库并执行增量升级。没有模型配置时，日常学习与内置规则练习仍可使用，AI 显示配置提示。不要提交 `.env`、Key 或令牌。

已有本地库先按[迁移与回退说明](docs/design/DATA_MIGRATION_AND_RECOVERY.md)保留一致性备份，再运行 `node scripts/upgrade-local.cjs`；不要对旧库重跑初始化 SQL。生产 PostgreSQL 的 `npm run cloud:migrate` 只用于自己已配置的目标环境，不能把临时验证库当作正式数据。

Android：在 Android Studio 打开 `apps/android`。默认 API 已指向上述妙搭服务。需要本地开发时，可使用 `-PKELING_API_BASE_URL=http://10.0.2.2:3001/api` 显式覆盖。公开预览 APK 内置 HTTPS 服务地址；签名与发布见[发布说明](docs/RELEASE_GUIDE.md)。

### 复现检查

```sh
npm test
npm run test:expedition --workspace=keling-web
node --test scripts/test-guest-data.cjs
node --test scripts/test-guest-ai.cjs
node --test scripts/guest-workspace.test.cjs
npm run check
node scripts/verify-stellar-assets.cjs
```

Windows Android：

```powershell
./scripts/android-check.ps1 -Lint
```

本次 Android 实际 Gradle 任务为 `testDebugUnitTest assembleDebug lintDebug --max-workers=2 --no-daemon`。服务端测试使用独立临时 SQLite，不修改应用数据库，也不继承付费模型凭据。

| 4.0.0 验证对象 | 结果 | 说明 |
| --- | --- | --- |
| 服务端 | **68 / 68** 测试通过 | 规则、引用版本、事务、权限、计划与上下文等；不是模型效果验证 |
| 新 Web 远征与学习工作坊 | **25 / 25** 测试通过 | 账号草稿、待提交队列、游客规则、版本与排程确认 |
| 原完整游客套件 | **24 / 24** 测试通过 | 数据 10、整合 6、AI 8；验证旧能力未因新导航被删去 |
| Android | **78 / 78** JVM 测试通过 | 16 个测试类，编译与 APK 构建成功；不替代真机验收 |
| 静态检查 | Web **0 错误 / 34 警告**；Android **0 错误 / 97 警告** | 警告如实保留，没有关闭规则凑“全绿” |
| PostgreSQL | 临时分支 **7 组真实事务验证**通过 | 独立于 SQLite；不表示正式环境已迁移 |
| 资源与安装包 | **60 张 PNG 视觉资源**一致；APK v2 签名、字体许可与章节入包通过 | 调试签名预览包，SHA-256 见交付记录 |

测试日期 **2026-10-30**。新版浏览器视觉、小屏、大字模式、Android 真机与真实双设备接续尚未验收。没有学生对照研究，不能声称提高成绩或优于所有竞品。详见[4.0 交付记录](docs/GAMIFIED_UPGRADE_2026-10-30.md)与[Android 核验](docs/EXPEDITION_ANDROID_2026-10-30.md)。

<details>
<summary><strong>历史运行截图 · 3.2.4，仅作旧版功能基线</strong></summary>

以下是 **3.2.4 历史 Web 截图**，不代表 4.0 四入口布局、新挑战、经济规则或当前视觉验收结果；手机浏览器画面也不是 Android 真机画面。

<img src="docs/screenshots/guest-entry-2026-10-30/full-workspace-desktop.png" alt="3.2.4 历史 Web 游客工作台截图，非 4.0 运行效果" width="100%"/>
<table><tr>
<td align="center" width="32%"><img src="docs/screenshots/guest-entry-2026-10-30/full-workspace-mobile.png" alt="3.2.4 历史 390px Web 截图，不是 Android 真机" width="260"/><br/><sub>3.2.4 · 手机浏览器</sub></td>
<td align="center" width="68%"><img src="docs/screenshots/guest-entry-2026-10-30/full-guest-report.png" alt="3.2.4 历史报告截图，不代表新版奖励或知识证据规则" width="640"/><br/><sub>3.2.4 · 历史学习报告</sub></td>
</tr></table>

</details>

## 文档与来源

- [产品介绍](docs/PRODUCT_INTRODUCTION.md) · [本版交付记录](docs/GAMIFIED_UPGRADE_2026-10-30.md) · [Android 实现与核验](docs/EXPEDITION_ANDROID_2026-10-30.md)
- [总设计落实跟踪](docs/design/UPGRADE_IMPLEMENTATION_2026-10-30.md) · [端云合同](docs/design/EXPEDITION_CONTRACT_V1.md) · [数据迁移与回退](docs/design/DATA_MIGRATION_AND_RECOVERY.md)
- [Vercel 部署说明](docs/VERCEL_DEPLOYMENT.md) · [模型配置模板](apps/server/.env.ai.example)
- [Web 历史功能清单](docs/WEB_FEATURE_INVENTORY_2026-10-30.md) · [Android 历史功能清单](docs/ANDROID_FEATURE_INVENTORY_2026-10-30.md) · [4.0 离线产品介绍](releases/课灵产品介绍.html)

本项目在 [CurryHeng/KeLing_ICT](https://github.com/CurryHeng/KeLing_ICT) 基础上继续开发；当前由 [Hyhyhyyy](https://github.com/Hyhyhyyy) 维护，保留原始来源和演进证据。用户已取消周期性迭代任务，本版不会启用定时研发。

代码采用 [MIT License](LICENSE)。Android 的 Noto Serif SC 字体另遵循 [SIL Open Font License 1.1](apps/android/app/src/main/assets/licenses/noto-serif-sc/OFL.txt)，[来源说明](apps/android/app/src/main/assets/licenses/noto-serif-sc/SOURCE.md)随包保留。视觉和开发使用 AI 辅助；生成来源随仓库保留，参赛或正式发布时仍须按适用规则披露和核查。

提交材料：两份正式 DOCX 与视频设计保存在本地交付目录，范围和未完成项见[材料准备记录](docs/SUBMISSION_PREPARATION_2026-10-30.md)。
