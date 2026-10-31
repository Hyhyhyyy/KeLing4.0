# 妙搭部署适配器

这里保存课灵运行在妙搭上的自有适配代码，供审核和重建使用。它是覆盖到官方全栈模板的文件集合，不是独立 npm 项目；没有模板运行时、完整依赖锁文件、环境配置或部署凭据，不能在本目录直接 `npm install && npm start`。

本次收录对应已发布适配工程的提交 `2227303c9bd148fd3b77434f7a8e4332cb853e03`。八个文件来自该提交，统一使用 LF 换行并去除尾部空行；未改变执行逻辑。原始 Git 内容与规范化后的文件分别记录 SHA-256。文件摘要、模板和依赖版本见 [provenance.json](provenance.json)。没有复制 SDK 库、`vendor/`、`node_modules/`、`.git/`、`.spark/` 或任何 `.env` 文件。

## 文件作用

| 文件 | 用途 |
| --- | --- |
| `server/app.module.ts` | 在官方 `PlatformModule` 后、兜底 `ViewModule` 前注册课灵模块 |
| `server/modules/gateway/gateway.controller.ts` | 接收应用入口请求 |
| `server/modules/gateway/gateway.service.ts` | 校验路径，提供课灵网页，把 `/api/*` 交给课灵 Express 后端 |
| `server/modules/gateway/download.controller.ts` | 仅为固定已发布 APK 签发短期下载链接，再重定向至文件存储 |
| `server/modules/gateway/gateway.module.ts` | 注册上述服务与控制器 |
| `server/modules/gateway/gateway.spec.cjs` | 检查前缀处理与路径穿越拒绝行为 |
| `scripts/build-keling.cjs` | 生成 PostgreSQL Prisma 客户端，并把课灵部署产物复制到 `dist/vendor/` |
| `scripts/copy-prisma.cjs` | 在平台依赖裁剪后保留生成的 Prisma 运行时客户端 |

网页和 API 继续使用课灵的账号令牌。平台 Cookie 的请求校验标记不能替代课灵身份认证。适配器不代理原 Vercel 服务，也不迁移数据库。

## 模板与依赖基线

来源工程的 `package.json` 标识为 `fullstack-nestjs-template@2.3.0`；锁文件实际解析到以下版本。这是本次已核实基线，不是对未来官方模板的兼容性承诺。

| 组件 | 来源锁定版本 |
| --- | --- |
| `@lark-apaas/fullstack-nestjs-core` | 1.1.70 |
| `@lark-apaas/client-toolkit` | 1.2.76 |
| `@lark-apaas/fullstack-presets` | 1.1.25 |
| `@lark-apaas/coding-preset-vite-react` | 1.0.26 |
| Nest common / core / platform-express | 10.4.22 |
| Nest 内部使用的 Express | 4.22.1 |
| 课灵后端使用的 Express | 5.2.1 |
| Prisma CLI / client / adapter-pg | 6.19.3 |
| PostgreSQL 驱动 `pg` | 8.23.1 |
| TypeScript / Vite | 5.9.3 / 8.2.2 |

使用主仓库要求的 Node.js 版本。来源模板声明 Node `>=22.0.0`、npm `>=10.0.0`，但声明下限不能替代依赖自身的运行要求。保留官方模板提供的 SDK、Nest、SWC、TypeScript 配置、`server/main.ts`、`GlobalExceptionFilter`、`ViewModule` 和客户端壳。不要用统一版本覆盖规则把 Nest 内部的 Express 4 强制替换成课灵的 Express 5。

## 放入官方模板

1. 先用官方 `lark-cli apps +init` 拉取有权限管理的 `full_stack` 应用，得到独立模板工程。新应用需要先按官方流程创建，取得自己的应用 ID；本目录不负责创建应用。
2. 将本目录的 `server/`、`scripts/` 文件按相同相对路径合入模板。若模板版本或既有模块不同，人工合并 `app.module.ts`，保留已有模块，保证课灵模块排在兜底视图模块之前。
3. 在模板工程中安装课灵部署产物所需的外部依赖，保留官方模板原有依赖，并提交该模板工程自己的锁文件。以下版本来自本次来源锁文件：

```bash
npm install --save-exact @prisma/client@6.19.3 @prisma/adapter-pg@6.19.3 pg@8.23.1 bcryptjs@3.0.3 cors@2.8.6 dotenv@17.4.2 express@5.2.1 express-rate-limit@8.6.2 helmet@8.3.0 jsonwebtoken@9.0.3 unpdf@1.4.0 zod@4.6.7 @vercel/functions@3.10.4 uuid@11.0.5
npm install --save-dev --save-exact prisma@6.19.3
```

`uuid` 在来源模板中属于开发依赖；课灵打包脚本将它列为外部模块，因此重建时明确放入运行依赖。`@vercel/functions` 仍被课灵后端代码引用，这不表示妙搭入口依赖 Vercel 可达。以后如果课灵后端依赖变化，应同步核对 `apps/server/package.json` 和生成的 bundle，不能永久依赖本表。

## 生成课灵部署产物

先在主仓库按 [开发说明](../../CONTRIBUTING.md) 安装依赖。以下 Bash 命令在**课灵主仓库根目录**执行；将应用 ID 与模板工程绝对路径改为实际值。PowerShell 下使用 `$env:变量名` 设置对应环境变量。

```bash
APP_ID=app_xxx
MIAODA_PROJECT=/absolute/path/to/official-template
npm run build:shared
VITE_PUBLIC_BASE="/app/${APP_ID}/" \
VITE_API_BASE_URL="/app/${APP_ID}/api" \
VITE_HOSTING_PLATFORM=miaoda npm run build:web
node scripts/prepare-miaoda.cjs "$MIAODA_PROJECT/vendor"
```

`prepare-miaoda.cjs` 打包课灵后端与共享规则，复制已构建网页和 PostgreSQL schema，并记录源文件摘要。它不复制账号配置、不读取生产数据、不执行数据库迁移。生成的 `vendor/` 属于独立妙搭发布工程；不要把整份生成结果再提交到本主仓库。

## 模板中还需人工接入的配置

仅复制这八个文件不够，以下修改存在于来源发布工程，须核对后合入自己的模板：

- `package.json` 的 `build:server` 先运行 `node scripts/build-keling.cjs`，再执行原 Nest 构建。来源值为 `node scripts/build-keling.cjs && NODE_ENV=production nest build`，适用于平台的 Bash 构建环境。
- 核对来源模板的功能标记，尤其是 `supportBusinessUser: true`；完整标记记录在 `provenance.json`。不要因为只复制业务模块而丢失平台初始化配置。
- 在官方 `scripts/build.sh` 调用 `scripts/prune-smart.js` **之后**添加 `node "$ROOT_DIR/scripts/copy-prisma.cjs"`。只运行 `build:prod` 不能证明平台最终裁剪产物完整；应验证实际平台构建路径。
- `nest-cli.json` 保持 `deleteOutDir: false`，保留 `dist/server/` 布局。GatewayService 编译后相对访问 `dist/vendor/`，更改输出目录会破坏此路径。
- 模板 ESLint 的忽略范围增加 `vendor/**`。生成代码在主仓库检查源文件，不能让它混入模板自有源码的检查。
- 来源项目的 `gen:openapi` 为 `echo 'UNSUPPORTED, SKIP'`。本适配器保持既有课灵 HTTP 契约，网页使用课灵客户端，不使用模板生成的 API 客户端。若恢复生成器，需要单独验证这些通配路由的兼容性。
- 来源工程对 Windows 的 `scripts/lint.js` 和提交钩子做过 npm 启动适配。这两份模板文件未收录；在 Windows 验证模板时仍须处理 `.cmd` 启动兼容性，不能跳过检查代替修复。平台 Bash 构建与本地 Windows 工具链需分别验证。

## 应用与环境配置

复制的源码保留当前线上部署标识，用于可追溯性：默认前缀 `/app/app_17h4dw5jwdg`，APK 文件桶、路径及摘要也固定指向该应用已发布文件。它们不是登录凭据，但**新应用不能直接复用另一应用的文件存储标识**。

更换应用时，需要配置正确的 `CLIENT_BASE_PATH`，重新用同一前缀构建网页；下载控制器的固定文件桶、路径、SHA-256 应改为在目标应用上传并验证的 APK。Android 默认 API 地址及平台请求校验的匹配规则也要一同核对，不能只改一个网页 URL。`gateway.spec.cjs` 中的固定前缀是路径测试样例，不能当作新部署已经配置完成。

在平台的**在线环境变量管理**中配置以下项目，不把值写进 Git、客户端包或本文：

| 名称 | 含义 |
| --- | --- |
| `DATABASE_URL` | 正确数据库的 PostgreSQL 连接信息，要求 TLS |
| `JWT_SECRET` | 课灵账号令牌签名配置；沿用既有账号服务时保留原配置 |
| `CORS_ORIGINS` | 允许使用服务的网页来源 |
| `CLIENT_BASE_PATH` | 核对平台提供的应用路径前缀，与网页构建保持一致；平台未提供时按其配置规则设置，不覆盖保留变量 |

平台 SDK 自己的运行配置由官方初始化、平台环境与凭据管理流程提供，不从别人的 `.env`、`.spark` 或 `.git` 复制。若启用真实模型功能，再按主服务的环境示例配置相应密钥。数据库准备和迁移是独立运维操作；不能在不了解目标数据库时顺带运行迁移命令。

页面可见范围与“是否要求平台登录”也是应用配置，复制源码不会自动复制这些设置。需要公开注册入口时，在有权限的应用设置中核对匿名页面访问；私有学习数据仍由课灵令牌校验。

## 发布与验证

在完整模板工程中先运行 `npm run lint`、`node --test server/modules/gateway/gateway.spec.cjs`，核对平台构建的 `dist/vendor/`、`dist/node_modules/.prisma/client/` 与 `dist/node_modules/@prisma/client/`。这些路径测试不替代账号流程测试。

审核本轮变更并提交到目标妙搭工程的 `sprint/default` 后，使用官方发布流程：

```bash
git push origin sprint/default
lark-cli apps +release-create --as user --app-id app_xxx --branch sprint/default
lark-cli apps +release-get --as user --app-id app_xxx --release-id <returned_release_id>
```

以该次发布返回 `finished`、对应代码提交正确、实际入口验证通过为完成依据。发布后检查无代理注册、登录、错误密码后的重试、网页刷新、Android 跨端账号与重启恢复；下载完整 APK，比对摘要。平台请求校验需要 Cookie 与对应请求头一致，裸 HTTP 健康探测收到 403 不能直接等同于课灵服务离线。

历史实测范围见[注册登录交付记录](../../docs/auth/DIRECT_ACCESS_2026-10-31.md)。本次仓库整理只收录源码和重建所需说明，没有新建、修改或重新发布线上应用；官方模板、依赖安装、环境配置、文件上传和最终云端构建仍需要在目标应用中完成。
