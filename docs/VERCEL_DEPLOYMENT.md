# Vercel 与 Neon 部署

## 当前状态（2026-10-29）

用户要求先使用免费托管，所有 Git 提交暂留本地，不推送 GitHub。

已完成 Vercel 单项目配置：网页静态文件与 `/api` 共用一个域名；API 复用现有 Express 应用；Kotlin 可用同一个 `https://<域名>/api`。AI 对话和 AgentArts 异步规划在返回 202 前调用 `waitUntil`，使生成 Promise 纳入 Vercel 的请求生命周期。该机制受函数时限约束，不是持久任务队列；原有数据库超时恢复、幂等控制仍保留。

Neon 插件已连接，账号为 Free 套餐。专用项目 `keling-ict-preview`（`dry-sun-06019646`），新加坡区域，PostgreSQL 17，分支 `preview`（`br-weathered-waterfall-aoylbhzw`），数据库 `keling`。计算规格固定 0.25 CU，未启用付费套餐。创建时平台拒绝指定休眠间隔，因此保留账户默认设置；不宣称已启用自动休眠。

Prisma 已升级至 6.19.3，PostgreSQL 运行时使用官方 `@prisma/adapter-pg` 和 `pg`，本机实际查询已通过。SQLite 本地模式继续保留。Windows 上 Prisma 原生迁移连接超时，因此由 Vercel Linux 构建执行标准 `prisma migrate deploy`；三条迁移已于 2026-10-29 11:33 UTC 完成，Neon 的 `_prisma_migrations` 记录均有 `finished_at` 且无回滚。未导入本地测试账号或 SQLite 数据。

Vercel CLI 65.7.0 已在用户级全局安装，并登录 `hyhyhyyy` 的 Hobby 团队 `hyhyhyyys-projects`。独立项目 `keling-ict-preview`（`prj_ZXcB8gOam1QhmoQQcPKV6Mm4Exzf`）已构建并绑定稳定域名 `https://keling-ict-preview.vercel.app`。`--skip-domain` 仍会分配受 Vercel 登录保护的团队别名；正式项目域名在受控提升部署后绑定。

最终发布部署为 `dpl_4HzGRj8ivYuhxuKpGxjXUMiQotke`，状态 Ready，唯一地址 `https://keling-ict-preview-56ngqudcq-hyhyhyyys-projects.vercel.app`。11:57 UTC 的云端验证确认稳定域名在不使用 Vercel 自动化凭据时返回 HTTP 200；随后该部署替换了稳定域名。构建检查访问的是当时已发布的前一版，最后的限流修正另有本机测试覆盖，不能把它描述为对新部署逐个接口的重复验收。

注意：这是整个课灵的试用项目；Vercel 对新项目首轮部署按 Production 环境处理，即使 CLI 指定 Preview。当前数据库和 JWT 只配置在此试用项目的 Production 环境，Preview 环境暂不配置，避免意外共用数据。日后真正的业务正式环境仍须独立数据库和密钥。迁移所需 `DIRECT_URL` 已从 Vercel 环境变量删除，后续部署默认不再迁移。

本机 DNS/网络无法正常访问 `*.vercel.app`，已观察到非预期地址和连接重置，未更改系统 DNS、代理或证书校验。构建成功不等于公网接口、浏览器或跨设备同步通过；云端 HTTP 检查结果见下方验证记录。

## 代码与调用链

- 根目录 `vercel.json`：根目录安装工作区依赖，执行 `npm run build:vercel`，静态输出 `apps/web/dist`；API 先于单页应用回退规则处理。
- `api/index.js`：加载编译后的 Express。缺少数据库或 JWT 密钥时返回 503，绝不退回临时 SQLite。
- `apps/server/src/services/background.ts`：Vercel 环境将 Promise 注册给 `waitUntil`，本机常驻进程维持原有执行方式。
- `apps/server/src/config/database.ts`：Vercel 只接受要求 TLS 的 PostgreSQL，默认每实例一个连接；`pg` 配置连接超时与空闲释放，明确验证 TLS 证书。`apps/server/src/database.ts` 向 Vercel 注册连接池生命周期。
- `apps/server/src/config/security.ts`：允许显式配置的 CORS 来源与平台注入的准确部署域名；不反射请求中的任意 Origin，也不允许全部 `vercel.app`。
- `scripts/migrate-cloud.cjs`：读取本机忽略文件 `.env.vercel.local` 或环境变量中的 `DIRECT_URL`，单独执行迁移，输出隐藏连接 URL 和密码。普通构建不迁移数据库；受控发布可明确设置 `KELING_APPLY_MIGRATIONS=1`，使用标准 Prisma 迁移记录。
- `scripts/verify-deployment.cjs`：按需验证已部署网页、健康接口、数据库就绪与匿名访问限制。使用 Vercel 自动化验证凭据时，仅发送到平台项目域名或由操作者核实并明确指定的准确主机。
- `apps/server/src/config/rate-limit.ts`：Vercel 环境使用平台覆盖的准确客户端 IP 作为限流键，避免所有用户共享代理地址额度；非 Vercel 环境忽略此请求头，IPv6 保留子网聚合。限流仍是实例内存级，非分布式配额。

## 完整服务部署步骤

1. 在 Vercel 连接账号，使用个人非商业项目的 Hobby 免费方案。工作目录选择仓库根目录，不能只上传 `apps/web`。
2. 在可直连的环境运行 `npm run cloud:migrate`，或一次性在受控 Vercel 构建中设置 `DIRECT_URL` 与 `KELING_APPLY_MIGRATIONS=1`。先核对数据库身份和迁移记录，不要导入本机测试账号或 SQLite 数据。应用迁移后移除构建开关和 Vercel 的 `DIRECT_URL`。
3. 在实际目标环境设置 `DATABASE_URL`（Neon pooler URL）与独立的 `JWT_SECRET`。密钥保存在环境变量，不提交 Git、不放入 `VITE_*`。新项目首轮目标可能被平台设为 Production，应以部署详情为准。
4. 保持 Fluid Compute 开启；配置的函数时限为 300 秒。需要自定义域名时设置准确的 `CORS_ORIGINS`，平台默认域名自动加入。
5. 从本地执行 `vercel deploy`，不需要 GitHub 推送权限。先核对构建结果，再核对 `/api/health`、`/api/ready`、注册/登录、两个客户端会话的笔记冲突与数据隔离。
6. 模型密钥未配置时应显示服务未配置。AI 正式开放前需真实验证选定模型与嵌入服务；内存限流只约束单实例，公共大规模使用前应增加共享配额与滥用防护。
7. Kotlin 使用 `-PKELING_API_BASE_URL=https://keling-ict-preview.vercel.app/api` 重新构建。已生成 `releases/KeLing-ICT-3.2.0-cloud-debug.apk`，73,493,103 字节，SHA256 为 `d3da109ac58759d7970912668669d0006bfc8e35489110b24678580478a88050`。原本机地址 APK 保留，云端包未上传 GitHub；需要能访问 Vercel 的网络，真机同步尚未验收。

正式环境须使用独立数据库/分支和 JWT 密钥；不能复用预览数据。免费额度并不等于无限使用，按平台实际规则执行。

## 无账户的本地视觉预览

`node scripts/build-public-preview.cjs` 在 `.cache/public-preview` 生成独立静态包。它仅提供项目介绍与完整视觉图鉴，禁用账户入口，清楚标注不能保存学习数据、不调用模型。普通应用构建不受影响。

```powershell
node scripts/build-public-preview.cjs
node node_modules/vite/bin/vite.js preview --outDir .cache/public-preview --host 127.0.0.1 --port 4174
```

它可在完成 Vercel 登录后单独作为视觉预览发布，不能替代完整后端部署。完整应用新增公共路由 `/explore` 与 `/explore/art`，便于展示设计和跨端功能说明。

## 验证与限制

服务端新增测试覆盖：TLS PostgreSQL 配置、准确来源限制、真实 Vercel 请求上下文的 Promise 注册、缺少配置返回 503。原有 AI/规划测试同时检查后台 Promise 注册及完成后持久化。浏览器已检查 1440×1000 与 390×844 的静态预览，未发现水平溢出，图鉴入口可用。

本次验证：`npm test` 29/29；服务端 TypeScript 编译通过；ESLint 48 条既有警告、0 错误；本机 PostgreSQL 构建与云端完整构建通过。Kotlin 25 项单测和云端地址 debug 构建通过。测试脚本现在主动生成 SQLite Client，数据库使用独立临时文件；本机应用数据保留。Prisma CLI 路径改为工作区模块解析，兼容 npm 将依赖提升至根目录。

云端 HTTP 验证于 2026-10-29 11:52 UTC 通过：介绍页 HTML、健康和数据库就绪接口、未登录访问 401、注册 201、登录 200、两个会话共享头像与笔记、跨用户写入 404、旧版本写入 409、14 家提供商目录。仅创建两个带随机标识的 `test.invalid` 测试账号，测试笔记已通过用户级 API 删除，未调用付费模型。日志 `.cache/vercel-verified.log` 保留核验记录；这个验证针对同一 API 的两个会话，不等同于 Android 真机联调。

云端首轮曾出现 UUID 库 ESM 与 Vercel 加载器不兼容，现改为 `node:crypto.randomUUID`。日志还发现代理 IP 限流配置问题，已由平台专用客户端 IP 处理并补测试。真实大模型、异步任务完整生命周期与 Android 真机同步仍未验收。生产依赖审计为 0 项漏洞；完整依赖审计有 4 项低危提示。除原有 Zod 覆盖外，针对 `@prisma/config` 将 `deepmerge-ts` 锁为 8.0.2，修复递归对象合并的栈耗尽公告；实际 Prisma 生成、迁移及测试均通过。

## 官方依据

- [Vercel Vite 支持](https://vercel.com/docs/frameworks/frontend/vite)：静态网页与根目录 API Functions 共存。
- [waitUntil API](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package)：延长请求内异步任务生命周期，仍受函数超时限制。
- [Vercel 请求头](https://vercel.com/docs/headers/request-headers)：平台覆盖客户端 IP 头的语义，用于准确的限流分桶。
- [deepmerge-ts 8.0.0](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0)：递归对象合并修复及兼容性变更说明。
- [Hobby 方案](https://vercel.com/docs/plans/hobby)：个人非商业使用和函数时限。
- [Neon 价格](https://neon.com/pricing)：免费方案的额度与适用条件。
- [OpenAI 官方部署技能](https://github.com/openai/skills/tree/main/skills/.curated/vercel-deploy)：已安装，但其中免登录服务的实际响应已改为要求 CLI 登录，不能照旧文宣称免登录部署成功。

## 2026-10-29 场景迭代更新

新部署 `dpl_Dj9qmj4tAhgjATvvyekfQzGCt432` 为 READY，稳定别名仍为 https://keling-ict-preview.vercel.app 。增加五幅完整像素场景与多端布局，修正报告规则摘要及统计范围；没有数据库迁移。本轮使用 CLI 核验部署和别名，界面通过本地浏览器检查，未重跑上文的公网 API 全链路测试。新 APK 为 `releases/KeLing-ICT-3.2.1-cloud-debug.apk`；详情见 [本轮记录](VISUAL_ITERATION_2026-10-29.md)。
