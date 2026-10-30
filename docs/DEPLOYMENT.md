# 同一后端部署 Web 与 Kotlin

用户当前选择免费托管方案，最新 Vercel + Neon 适配及实际连接状态见 [免费部署说明](VERCEL_DEPLOYMENT.md)。本文保留本机与容器部署方式。

本地已验证 Node/SQLite 运行与生产前端预览。Docker Compose 文件通过解析，当前电脑的 Docker Linux 引擎无法连接，容器构建、PostgreSQL 迁移实跑与公网 TLS 尚未验证。没有服务器或 DNS 凭据时，不能把以下配置称为已上线。

## 本机复现

需要 Node.js 22.13+（推荐 24 LTS）、JDK 17、Android SDK 34。

```sh
npm ci --ignore-scripts
npm run setup:local
npm run dev
```

开发页面 `http://localhost:5173`，后端 `http://localhost:3001/api`。生产前端预览：先 `npm run build`，保留后端进程，再执行 `npm run preview --workspace=keling-web -- --host 127.0.0.1 --port 4173`，打开 `http://127.0.0.1:4173`。已有 `.env` 的 `CORS_ORIGINS` 需包含 `http://localhost:4173`；开发配置会同时允许对应回环 IP。

本地初始化保留现有 `.env`、课程、任务与旧聊天表；仅增补 `AiSession`、`AiTurn`。正式升级前先备份数据库。不要使用 `prisma migrate reset` 或把 SQLite 初始化 SQL 直接用于 PostgreSQL。

## 容器部署（可放在华为云 ECS 的 Linux 主机）

```sh
node scripts/init-deploy.cjs
docker compose --env-file .env.deploy config --quiet
docker compose --env-file .env.deploy up -d --build
docker compose --env-file .env.deploy ps
```

初始化仅创建被 Git 忽略的 `.env.deploy`，生成不打印的独立数据库密码与 JWT 密钥，默认绑定回环地址 `http://localhost:8080`。它不会覆盖现有文件，不启用任何付费模型服务。Docker 安装与 Linux 引擎需由运行环境提供。

调用链：Caddy 提供构建后的网页并代理 `/api/*` → Node API → PostgreSQL。数据库端口和 API 端口不映射到宿主公网，只有 Caddy 入口开放。`migrate` 服务先运行 PostgreSQL 的增量迁移，成功后启动 API；API 就绪检查还会查询数据库。Caddy 的路由依据[官方 SPA 与反向代理示例](https://caddyserver.com/docs/caddyfile/patterns)，启动顺序依据 [Compose 官方说明](https://docs.docker.com/compose/how-tos/startup-order/)。

使用真实域名时，在 `.env.deploy` 设置：

```dotenv
SITE_ADDRESS=study.your-domain.example
CORS_ORIGINS=https://study.your-domain.example
BIND_ADDRESS=0.0.0.0
HTTP_PORT=80
HTTPS_PORT=443
```

域名解析应指向目标服务器，安全组允许 80/443，Caddy 才能申请证书。这里的域名是占位符，不能直接作为生产地址。`TRUST_PROXY_HOPS=1` 仅适用于本配置的私有 API 加一层 Caddy，改用其他网关时重新核对信任范围。生产禁止把后端 3001 端口另行暴露。

模型配置只放 `.env.deploy`；参考 `apps/server/.env.ai.example`。AgentArts 回调必须能访问公网 HTTPS `/api/agent/tools/search`，并按既有文档设置工具密钥和运行作用域。密钥不要写入 Dockerfile、APK、`VITE_*`、截图或提交记录。

## Android 指向相同账号服务

```sh
cd apps/android
./gradlew testDebugUnitTest assembleDebug lintDebug -PKELING_API_BASE_URL=https://study.your-domain.example/api
```

同一用户在 Web 与手机登录后，课程、任务、笔记、头像、签到和 AI 会话使用同一数据库。默认 debug APK 的地址是 Android 模拟器专用 `http://10.0.2.2:3001/api`。USB 真机本地验证可先执行 `adb reverse tcp:3001 tcp:3001`，再用 `-PKELING_API_BASE_URL=http://127.0.0.1:3001/api` 构建 debug；也可指定电脑局域网地址。该参数随构建固定，换服务器需要重新构建。

3.2.0-preview 安装包是 debug 签名预览，不是应用市场发布包。历史签名身份存在已记录风险，正式签名需按 `SECURITY.md` / `RELEASE_GUIDE.md` 轮换和配置；未自动发布 GitHub Release。当前没有 ArkTS 客户端，不能称为原生鸿蒙 NEXT 应用。

## 备份、升级和回滚

部署前执行数据库逻辑备份（以下在 Linux 主机执行，避免旧版 Windows PowerShell 的二进制重定向改变文件）：

```sh
docker compose --env-file .env.deploy exec -T db pg_dump -U keling -d keling > keling-before-upgrade.sql
```

同时保存 `.env.deploy` 和原镜像版本，备份文件应限制读取权限。确认备份可在独立数据库恢复后再升级。新增会话表是增量迁移；旧应用回滚可能看不到新会话，不能删除新表冒充回滚。不要执行 `docker compose down -v`，它会删除持久数据卷。镜像目前使用主版本标签，正式发布时应锁定经验证的镜像 digest。

## 上线验收尚待实跑

1. 生产 PostgreSQL 全迁移与两个客户端同时提交的冲突/重复奖励测试。
2. 真实 HTTPS 域名、证书、重启恢复和备份恢复；退出账号后不能读取其他账号资料。
3. 每个实际启用的聊天/向量服务：权限、额度、超时、取消、截断与引用用量。没有调用成功记录的模型不能标记已联调。
4. 华为真机与 Android 常用分辨率、字体放大、软键盘和生命周期；正式签名升级链。

当前 GitHub 连接对 `CurryHeng/KeLing_ICT` 的权限为 `pull=true, push=false`。需要写权限或用户指定的可写仓库才能推送分支与创建 PR。本地 Git 提交、bundle 与补丁可先交付；这不等于远程提交。
