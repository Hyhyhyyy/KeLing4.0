# 4.0.1 视觉、首页与移动端导航更新

本次范围来自用户追加要求：保留原漂亮首页和已有视觉资源，调整字重、字号、颜色与阴影，将移动端“我的”底部三个固定入口提升为同级导航。此前终止的录像制作、清理与周期研发不恢复。

## 页面变化与使用路径

- Web 未登录介绍页仍为 `/explore`，无会话时 `/` 也展示它；游客或登录后的 `/` 恢复完整星际首页，旧 `/workspace` 地址继续可用。远航移到 `/voyage`，首页新增明确入口，原有远征和回放功能保留。
- Web 导航为首页、远航、星图、基地、我的。图鉴保留原有 29 幅独立场景、12 张角色与界面资源，并补齐 10 颗星球、6 张远航/基地资源；另展示 3 张图集中的头像、学科与导航图标，共覆盖现有 60 张源 PNG，没有将裁切当成新原画。
- Web 正文基准 16px，标题按屏宽为 28–38px；首页展示标题单独加强。卡片标题、数字与按钮加重，暗色面板使用奶油白和薄荷色。阴影仅用于大展示标题，正文不加阴影。手机输入保持 16px，操作文字允许换行。
- Android 底栏为远航、星图、基地、我的、资料、设置、总览。窄屏可以横向滑动，选中的页面自动进入底栏可视区；每项最小宽度 64dp，提供 Tab/选中语义。
- 三个原子入口从“我的”移除；资料保留头像、昵称与本机历史资料核对；设置保留 Key、模型目录、版本查询、帮助与退出；总览保留签到、课程、任务、笔记、AI、编排、报告及成就入口。
- 三页使用对应的原有独立星际插画与新卡片背景。资料核对、关于、退出、更新信息、专注计时和完成确认改为页面内操作，设置 Key 面板改为全页嵌入并保留防截屏标志。全局更新和游客退出提示也改为顶栏卡片，强制更新约束保留。
- Android 星舰主题统一为无衬线字体：页面标题 24–32sp、卡片标题 18–20sp、正文 15–16sp，继续尊重系统字号。卡片容器采用薄荷、暖金和纸白色。

## 可追溯实现

Web 入口在 `apps/web/src/App.tsx`；字体规则集中于 `apps/web/src/styles/typography.css`，首页与图鉴分别在 `pages/Home/StellarHome.tsx`、`pages/VisualLibrary/VisualLibrary.tsx`。

Android 路由和底栏在 `MainActivity.kt`，移除旧子入口在 `expedition/ExpeditionScreen.kt`；资料/总览共用 `ui/screens/agent/CloudWorkspaceScreen.kt`；设置在 `ui/screens/settings/PastoralSettingsScreen.kt`；主题在 `ui/components/StellarArt.kt`。未改变共享 API 与学习奖励规则。

## 实际验证

| 对象 | 本次结果 | 范围 |
| --- | --- | --- |
| Web 构建 | 成功 | TypeScript 与生产打包 |
| Web lint | 0 错误、34 警告 | 已有警告仍保留 |
| 远航 Web 测试 | 25 通过、0 失败 | 存储、游客、学习资料及工作区规则 |
| 浏览器 | 1440px 桌面与 390px 窄屏检查 | 首页、远航、设置、报告、图鉴无横向溢出；报告底部按钮约 55px 高，输入 16px；原介绍首页保留 |
| Android | 构建成功，78 测试通过 | `testDebugUnitTest assembleDebug lintDebug` |
| Android lint | 0 错误、97 警告 | 未将现存警告称为零缺陷 |
| 图片 | 60 张两端校验通过，APK 内逐张 SHA-256 一致 | 原图无删改 |
| APK 签名 | v2 验证通过 | 调试签名预览包 |

浏览器真实截图位于 `docs/screenshots/home-type-refresh/`。本地只启动 Web 开发服务器，设置页模型目录接口未连接；该错误不能作为线上服务或模型连通性证据。本次没有有效 AI Key，也没有连接 Android 真机/模拟器，因此不宣称真实模型、真机布局、系统大字号及触控流程已验收。保留入口中的历史离线深层页面未全部换皮。

复现：Web 使用 `npm run build:web`、`npm run lint`、`npm run test:expedition --workspace=keling-web`；Windows Android 使用环境变量 `ORG_GRADLE_PROJECT_KELING_API_BASE_URL=https://keling-ict-preview.vercel.app/api` 后执行 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/android-check.ps1 -Lint`。

## 安装包与发布

本地包：`releases/KeLing-ICT-4.0.1-cloud-debug.apk`；包名 `com.keling.app`；versionCode 17；Android 8.0 及以上；API 为现有 Vercel 服务。

- 字节数：175023242。
- SHA-256：`950333662d4052018ef79603eadcb82ac3111d22b5486fde6099e0d164b2d716`。
- 本地验证完成；远端发布状态在发布后补录。
