# RC6 全端更新与旧入口处置

日期：2026-11-26。用户反馈看不到新增指南，字体和箭头也像回到了旧版，并要求更新全部入口，随后要求旧 Vercel 下线。本轮统一 Web、API、Android 为 **4.0.5-defense-rc6**，Android **versionCode 26**。程序候选仍待用户确认，未制作答辩稿和 PPT。

[打开最新版](https://ucn5aajxnx7f.feishuapp.com/app/app_17h4dw5jwdg?release=20261126-rc6) · [使用指南](https://ucn5aajxnx7f.feishuapp.com/app/app_17h4dw5jwdg/guide) · [下载 Android](https://ucn5aajxnx7f.feishuapp.com/app/app_17h4dw5jwdg/download/android) · [GitHub 发行](https://github.com/Hyhyhyyy/KeLing4.0/releases/tag/v4.0.5-defense-rc6)

## 已确认的事实与诊断边界

检查时，`feishuapp.com` 与历史 `feishu.link` 入口均返回 RC5 HTML 与 `index-C4kYi5Ux.js`，health 为 RC5，平台最新发布未被其他版本覆盖。字体与箭头的服务器资源仍正常。最终部署的 Worker 注册地址和 scope 均包含正确应用子路径；构建中间目录里的根路径注册脚本不能作为线上路径错误的证据。

另确认两处确实遗漏更新：旧 `keling-ict-preview.vercel.app` 返回早期 `index-CcqOsn9i.js`；公开 Android 下载仍为 **4.0.4 / code 20**，此前本机 RC4 构建没有替换公开发行包。这两处足以让不同入口展示不同版本，但用户具体访问的是哪一处仍未知。用户要求 Vercel 下线后，已停止对其升级准备。

代码中确认存在更新机制缺口：旧注册器只执行注册，没有新版本通知；Worker 的导航回退直接使用预缓存 HTML，当前已打开页面也不会自动替换正在运行的旧 JS。托管网关又把 `index.html`、`sw.js`、`registerSW.js` 等稳定地址按一小时静态资源缓存。修复这些缺陷有明确依据，但不能仅凭响应头推断用户这次一定命中了哪一层缓存；浏览器检查连接超时，本轮尚未读取用户实际页面的控制 Worker 与运行脚本。

上一轮的本机布局检查和线上文件摘要核对仍是有效的限定证据，不能替代用户当前入口的真实升级验证。本次据此增加更新生命周期、导航策略及 HTTP 缓存头验证。RC5 两域 HTTP 诊断见[原始记录](../validation/miaoda-cache-refresh-rc5-diagnosis.json)。

## 修复原则

联网导航直接获取服务器 HTML；只有网络失败才回退专用离线页面。普通入口 HTML 不再作为预缓存路由匹配目标。Worker 是浏览器用于离线资源和更新的后台脚本；本次显式注册并绕过 HTTP 更新缓存，检测新版后提供用户可操作的更新入口，不自动刷新或清理学习数据。用户点击更新前提示先保存，游客需要明确确认刷新带来的数据清空。

网关对稳定入口与更新文件返回禁止缓存的响应头，带内容摘要的 JS/CSS 保持正常静态缓存。保留兼容旧 HTML 的 `registerSW.js`。字体、标题图集、箭头、指南卷轴及其来源文件不重制、不删改。

本页首个“打开最新版”链接使用不带末尾斜杠的应用根地址，避开原 `/app/app_17h4dw5jwdg/` Worker 控制范围。其作用是提供新的导航入口，不保证已经打开的旧标签页或已安装网页窗口立即替换运行内容。没有清除浏览器数据，也没有自动卸载或重装客户端。

Android 登录、注册、四个主页面、概览与设置补齐指南按钮，点击后在系统浏览器打开同一公开指南。公开下载改用 code 26；新包与 code 20、RC4 包名及签名证书相同，支持覆盖升级的必要条件已核对。

## 实现与复现

- Web：`apps/web/src/services/appUpdates.ts` 检测、确认并激活更新，`AppUpdateNotice` 提供操作入口；`apps/web/config/pwa.ts` 定义联网导航和离线回退。首次安装不提示升级，取消确认不刷新，激活失败保留当前页面。执行 `npm run test:updates --workspace=keling-web` 可复现 8 项测试。
- 托管：`deploy/miaoda/server/modules/gateway/gateway.service.ts` 设置 HTML、Worker 和清单的缓存头，`download.controller.ts` 提供固定的已核对 APK；下载来源和摘要见 `deploy/miaoda/android-download.json`。
- Android：`PublicWebLinks.kt` 统一指南网址，`UsageGuideButton.kt` 复用绘制箭头；版本在 `apps/android/app/build.gradle.kts` 中，使用 `scripts/android-check.ps1 -Lint` 构建和检查。
- 更新 API：`/api/app/version` 从 GitHub 已发布发行中读取 APK 和 `keling-version-code` 标记，旧客户端查询更新可获得 code 26；`/api/app/download` 跳转同一 GitHub 包。稳定的妙搭下载入口另外提供已逐字节核对的镜像。

## 验证与发布

代码冻结提交：`8aafa659ed44a1d0e0fdebf5b3a1b32fc405b2ca`，已推送至 `Hyhyhyyy/KeLing4.0` 的 `codex/defense-ready-20261125` 分支。GitHub 标签 `v4.0.5-defense-rc6` 对应此提交，发行 ID `459204963`，已从草稿发布为预览发行。GitHub 返回的 APK 大小及平台计算摘要与本地相符。

APK：**75,027,748 字节**；SHA-256：`4284472d6fa5bba6a5aa6cf0ae6d5b52470e309dd8a6ee317d0f28785e6c748d`。字体、箭头、标题吉祥物和指南卷轴均保留，Android 内 64 个共享文件（含清单）与来源逐项一致。

| 检验对象 | 本轮结果 | 可支持的结论 |
| --- | --- | --- |
| Web 业务回归与更新 | 49 + 8 项通过 | 覆盖原有业务与更新生命周期、真实生成 Worker 的导航行为 |
| 服务端 | 81 项通过 | 独立临时 SQLite 中的接口、隔离和状态行为；未修改应用数据库 |
| Android | 91 项单测通过，APK 构建通过 | 当前代码可构建；包名、版本、签名与资源已核对 |
| 静态检查 | Web 0 错误 / 34 条既有警告；Android 0 错误 / 40 条警告 | 检查通过但仍有警告，不称为零问题 |
| 共享资源 | 63 张图片、2 个字体文件校验通过 | 两端来源完整，未回退字体和绘制箭头 |

妙搭模板提交 `dd8a4bc17371a659ee97f49d0ffe7b5d4517f93b`，发布 ID `7712415886057737509`，状态 **finished**。170 个构建输入重新核对，线上 73 个生成文本文件与部署包摘要一致；两域合计 18 个稳定/恢复入口均符合禁止缓存策略。两个域名都返回 RC6 健康状态，四个字体/绘制资源逐个摘要一致；从两域分别完整下载的 APK 均为上述大小与摘要，更新查询得到 code 26，旧 `/api/app/download` 已跳转新 GitHub 包。所查 09:53:12–09:57:42 UTC 窗口错误日志为 0 条，不据此推断长期无错误。

详见[本轮汇总](../validation/release-rc6-2026-11-26.json)、[Web 验证](../validation/web-update-rc6-2026-11-26.json)、[Android 验证](../validation/android-rc6-2026-11-26.json)、[GitHub 发行证据](../validation/github-release-rc6-2026-11-26.json)、[妙搭发布证据](../validation/miaoda-cache-refresh-rc6-deployment.json)及[线上文件核对](../validation/miaoda-cache-refresh-rc6-online.json)。这证明服务器提供了新版本，不等于已替用户刷新所有旧页面或安装所有设备。

## 需要人工完成的事项

1. **旧 Vercel 暂停：尚未完成。** 本机没有当前 Vercel 登录，CLI 65.7.0 明确要求用户在终端亲自输入项目名确认，不接受自动确认。交付目录的 `pause-old-vercel.cmd` 已固定 `keling-ict-preview` 与团队，按官方登录流程执行，再输入项目名即可；仍需核验旧网址返回 `503 DEPLOYMENT_PAUSED`。本轮最新检查仍为 HTTP 200，不能称已下线。项目、部署历史、源码和共享 Neon 数据库保留。
2. **手机覆盖安装与现场演示。** 下载 RC6 后安装，检查登录/试用、华文中宋、绘制箭头与指南；本轮未连接真机，不能宣称已经替用户手机升级。APK 仍为调试签名预览。
3. **当前浏览器升级画面。** CUA 浏览器工具反复超时，本轮未完成旧版本到新版的真实界面升级验收；已运行的旧标签页是否更新不能仅凭服务器摘要认定。先保存正在编辑的内容，再使用本页最新版入口。若桌面快捷方式安装自旧 Vercel 域名，需要改用妙搭入口；不同域名不能自动接管彼此的已安装网页和离线缓存。
4. **比赛相关原有缺口。** 真实华为 Runtime、真实模型闭环及现场设备仍按[原版本核对](defense-readiness-2026-11-25.md)完成。用户确认程序后才开始答辩稿与 PPT；本次没有代为提交比赛材料。

Vercel 暂停门槛来自本机 CLI `dist/commands/project/index.js`：`This cannot be confirmed non-interactively: the user must run this command in a terminal and type the project name to confirm.` 这是工具的人为确认要求，不是再次征求是否下线，也不是已成功暂停的证据。
