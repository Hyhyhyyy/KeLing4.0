# 3.2.0-preview 验证记录

> 历史记录（2026 年 10 月）。保留当时版本、操作和验证结论；当前入口与运行方式见[文档索引](../../README.md)。

验证环境：Windows、Node 24.18、JDK 17.0.20、Android SDK / build-tools 34、Gradle 8.5、AGP 8.2、Kotlin 1.9.22。没有连接 Android 真机或模拟器。后端使用隔离 SQLite 单元测试数据库；浏览器另用本地验收账号，未操作生产用户数据。

## 自动验证结果

| 检验对象 | 方法与指标 | 本轮结果 |
| --- | --- | --- |
| 服务端协议、权限与数据状态 | `npm test`；包括三种模型协议、向量完整性、用户隔离、重复提交、取消后迟到响应、显式存笔记、跨端版本冲突、重复签到、奖励写入边界 | 23 / 23 通过，0 失败 |
| Kotlin 数据与接口 | `testDebugUnitTest`；账号存储、同步策略、认证、共享会话字段与稳定请求 ID、笔记冲突传递等 | 25 / 25 通过，0 失败（含原有示例测试 1 项） |
| Web / server 构建 | `npm run check`：TypeScript、ESLint、Vite、服务端编译 | 通过；ESLint 48 条 Warning、0 Error |
| Android 构建与静态分析 | `assembleDebug lintDebug` | 通过；Lint 97 条 Warning、0 Error，部分 Compose 自定义检查因现有 AGP/Lint API 不兼容被跳过，不能解释为无静态问题 |
| 生产依赖 | `npm audit --omit=dev --audit-level=high` | 0 漏洞（仅本次审计时间点和该依赖范围） |
| 跨端图像一致性 | `node scripts/verify-stellar-assets.cjs`；原图、两端副本、启动图标 SHA-256 与尺寸 | 15 张原图一致，39 个视觉单元 |
| 容器配置 | `docker compose --env-file .env.deploy config --quiet` | 解析成功；Docker Linux 引擎连接失败，未执行容器构建与启动 |
| APK 包与签名 | `aapt dump badging`、`apksigner verify --verbose` | 包名 com.keling.app，versionCode 10，versionName 3.2.0-preview，minSdk 26，targetSdk 34，debug APK v2 签名验证通过 |

APK 大小 73,084,538 字节，SHA-256：

`8e90613dc210b8f752a29b7891e195f2da3a58c3c94d1c4e052f0480237c02f4`

调试包包含旧版离线资源、新原图与调试依赖，体积约 69.7 MiB。未把它称为经过商店体积优化或正式签名的发布包。

## 浏览器实际操作

使用 `http://127.0.0.1:4173` 的生产前端构建，通过相同本地 API 连接账号。宽屏为 1440×1000，窄屏为 390×844；读取实际 `innerWidth` 确认尺寸，首页、助手和图鉴没有页面级横向溢出。窄屏导航区域本身允许横向滚动。

实际完成：登录；签到后能量 100→110、结晶 10→15，再进入首页显示今日已签到；保存“跨端验证：二叉树遍历”笔记；选择赤狐头像并看到保存状态；切换 Gemini 配置后协议显示 gemini；开启资料授权与向量模式后出现独立向量服务/模型控件；未配置密钥时发送按钮保持禁用；图鉴全部资源无失败图片。

初次生产预览因已有 `.env` 只允许 5173，登录失败；补入 4173 的开发来源后复验成功。新环境模板已修正。视觉复验发现输入框边框与文字安全区不足、窄屏发送按钮换行，已调整内边距与最小宽度。PWA 新构建在工作线程更新激活后刷新生效；没有缓存私人 API 响应。

截图是实际页面，不是设计效果图：

- [宽屏首页](../../screenshots/stellar-home-desktop.jpg)
- [手机宽度网页首页](../../screenshots/stellar-home-mobile-web.jpg)
- [宽屏 AI 助手](../../screenshots/stellar-ai-desktop.jpg)
- [手机宽度网页 AI 助手](../../screenshots/stellar-ai-mobile-web.jpg)
- [全套视觉图鉴](../../screenshots/stellar-visual-library.jpg)

手机宽度网页截图不是 Kotlin 真机截图。Kotlin 当前证据是编译、单测、静态分析和接口契约，不宣称已完成实机视觉验收。

## 仍未完成的外部验证与发布

1. 没有真实模型密钥：没有执行任何付费厂商调用，三协议测试使用模拟响应；真实模型、向量与 AgentArts 联调待配置。
2. 没有生产主机、域名和部署凭据：未公网部署、未验证 PostgreSQL 的生产并发、证书与灾备恢复。
3. 本机 Docker 引擎不可连接：Compose 可解析，不代表镜像或容器已经运行。
4. 没有 Android / 华为真机连接：键盘、字体放大、生命周期和不同系统版本待实测；AGP/Lint 升级另需兼容性验证。
5. GitHub 仓库权限再次查询为 `pull=true, push=false`：本轮只能本地提交和生成可移交的 bundle/补丁，未推送、未建 PR、未发 Release。

所有这些未完成项保留为明确验收项，不能用通过的本地测试替代。后续执行顺序见 [部署说明](../../DEPLOYMENT.md)。
