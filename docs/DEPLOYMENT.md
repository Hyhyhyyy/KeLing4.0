# 部署与运行

## 当前公开预览

网页与共享 API 运行于妙搭，继续使用原 Neon PostgreSQL 数据库：

- 网页：<https://ucn5aajxnx7f.feishu.link/app/app_17h4dw5jwdg>
- API：上述地址加 `/api`。
- Android 安装包：上述地址加 `/download/android`，每次请求生成新的文件存储下载地址。

Android 4.0.4 默认连接同一服务；原账号沿用原数据库。注册登录及完整安装包下载的实测记录见[直连交付](auth/DIRECT_ACCESS_2026-10-31.md)。本次没有购买域名或服务器，不将当前网络验证扩大为所有地区长期可用的保证。

本仓库提供 Web、Express API、共享规则、Android、[妙搭适配源与接入说明](../deploy/miaoda/README.md)。`scripts/prepare-miaoda.cjs` 将构建结果及源码摘要写入指定的官方模板项目，不复制环境文件或运行迁移。按适配说明对接模板、配置自己的环境变量并验证后再发布；生成副本命令本身不完成云端部署。

## 本地开发与前端预览

需要 Node.js 22.13+；Android 另需 JDK 17 与 SDK 34。

```sh
npm ci
npm run setup:local
npm run dev
```

网页在 `http://localhost:5173`，API 在 `http://localhost:3001/api`。初始化使用 SQLite，保留已有环境配置和数据库；已有数据升级前按[迁移与恢复说明](design/DATA_MIGRATION_AND_RECOVERY.md)备份。

检查生产前端构建时，先运行 `npm run build`，保留后端进程，再运行：

```sh
npm run preview --workspace=keling-web -- --host 127.0.0.1 --port 4173
```

打开 `http://127.0.0.1:4173`，并将该来源加入本地服务端 `CORS_ORIGINS`。模型配置模板见 `apps/server/.env.ai.example`；不要在客户端 `VITE_*` 变量中保存密钥。

## Android 的服务地址

默认预览包连接上面的 HTTPS 服务。开发时可以显式覆盖：

```sh
cd apps/android
./gradlew testDebugUnitTest assembleDebug lintDebug -PKELING_API_BASE_URL=http://10.0.2.2:3001/api
```

`10.0.2.2` 用于 Android 模拟器访问宿主电脑。USB 设备可先运行 `adb reverse tcp:3001 tcp:3001`，再使用 `http://127.0.0.1:3001/api` 构建开发包。HTTP 地址只用于相应开发环境；公开服务使用 HTTPS。

客户端还提供“连接检测与服务地址”入口。切换到不同账号服务时，不应复用其他服务的登录令牌。正式签名与版本升级见[发布指南](RELEASE_GUIDE.md)和[安全说明](../SECURITY.md)。Kotlin APK 不等于原生 HarmonyOS NEXT 应用。

## 自托管容器方案

仓库保留 Caddy、Node API、PostgreSQL 的 Compose 配置。此方案需要自行准备 Docker Linux 环境；它与当前妙搭预览部署分开。

```sh
node scripts/init-deploy.cjs
docker compose --env-file .env.deploy config --quiet
docker compose --env-file .env.deploy up -d --build
docker compose --env-file .env.deploy ps
```

初始化生成被 Git 忽略的 `.env.deploy`，不会覆盖已有文件。默认绑定回环地址 `http://localhost:8080`。Caddy 提供网页并转发 `/api/*`；数据库和 API 不单独映射到宿主公网。迁移服务执行 PostgreSQL 增量迁移后再启动 API。

启用公网 HTTPS 时，在自己的环境配置中设置：

```dotenv
SITE_ADDRESS=study.your-domain.example
CORS_ORIGINS=https://study.your-domain.example
BIND_ADDRESS=0.0.0.0
HTTP_PORT=80
HTTPS_PORT=443
```

示例域名不能直接使用。域名解析、80/443 端口与证书需在实际部署环境核验；`TRUST_PROXY_HOPS=1` 只适用于本配置的一层 Caddy，改变代理层数时重新核对。路由与启动顺序可参照 [Caddy 官方示例](https://caddyserver.com/docs/caddyfile/patterns)和 [Compose 官方说明](https://docs.docker.com/compose/how-tos/startup-order/)。

历史验证只确认过 Compose 配置解析，未完成该容器方案的公网、证书和恢复验收。当前妙搭登录验证不能代替自托管环境的验证。

## Render 备选配置

根目录 `render.yaml` 保留 `plan: free` 模板。构建步骤只安装依赖、生成 Prisma 客户端并编译服务端，不执行数据库迁移。

迁移是独立的发布步骤。部署操作者核对目标 `DATABASE_URL` 并完成备份后，在合适的发布环境单独执行：

```sh
npm run prisma:migrate:prod --workspace=keling-server
```

迁移成功后再启动对应应用版本。[Render 官方文档](https://render.com/docs/deploys#pre-deploy-command)说明 `preDeployCommand` 仅适用于付费 Web 服务、私有服务和后台 worker，因此当前免费模板不配置该钩子，不能依赖每次构建自动迁移。

本次整理仅审查配置和构建输入，没有实际部署 Render。本机 Docker 守护进程未运行，也没有为核验而启动或修改它；静态配置审查不等于容器、云服务或数据库迁移实跑通过。

## 数据升级和恢复

上线前保存数据库备份、应用版本与环境配置，并在独立数据库验证恢复。PostgreSQL 示例在 Linux 主机执行：

```sh
docker compose --env-file .env.deploy exec -T db pg_dump -U keling -d keling > keling-before-upgrade.sql
```

不要将 SQLite 初始化 SQL 用于 PostgreSQL，也不要用 `prisma migrate reset` 或删除持久卷解决升级失败。回退应用版本不等于回退数据结构；按[迁移与恢复契约](design/DATA_MIGRATION_AND_RECOVERY.md)处理兼容性。

原 Vercel 配置仍作为可选适配保留；其旧部署方式和当时的验证边界见[历史部署记录](history/2026-10/VERCEL_DEPLOYMENT.md)。新用户使用当前妙搭入口。
