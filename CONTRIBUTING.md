# 贡献指南

本仓库以一个 npm workspace 管理 Web、服务端和共享 TypeScript 包；Android 使用独立 Gradle 工程。仅在根目录维护 npm 锁文件，避免分别进入子包重新安装出另一套依赖。

## 开发环境

- Node.js 22.13+，使用根目录 `package-lock.json`。
- Android：JDK 17、SDK 34；使用项目 Gradle Wrapper。
- 初次运行：`npm ci` → `npm run setup:local` → `npm run dev`。

在独立分支提交范围明确的变更。修改 API 或学习规则时，同时检查 `packages/shared`、Web 和 Android 的调用方；不要只通过单端编译判断兼容性。

## 必要检查

```sh
npm run check
npm test
npm run test:web
npm run assets:check
```

Android 变更运行：

```sh
cd apps/android
./gradlew testDebugUnitTest assembleDebug lintDebug
```

Windows 可在根目录运行 `./scripts/android-check.ps1 -Lint`。报告实际执行的检查和仍存在的警告，不以模拟模型响应或模拟器结果替代真实模型、实体手机验证。

## 资源与生成文件

视觉原图、清单和生成来源集中在 `assets/stellar`。修改资源后运行 `npm run assets:sync`、`npm run assets:check`；Android WebP 生成与复核方式见[文档索引](docs/README.md#资源与验证)。生成的网页副本、构建目录和安装包不提交到源码树，发布产物放 GitHub Releases。

不要提交 `.env`、数据库、私有用户资料、密钥、令牌、签名文件或本机路径配置。使用仓库提供的示例配置和合成测试数据。不要删除无法确认用途的原始竞赛资料、唯一原图或必要验证证据。

## 数据与发布

涉及认证、同步、删除、备份或迁移的变更，应说明入口、失败处理、兼容性与恢复方式。新增数据库变更必须提供可审查的迁移，不能用重建生产库解决兼容问题。

发布仅面向本仓库 `Hyhyhyyy/KeLing4.0`，按[发布指南](docs/RELEASE_GUIDE.md)完成版本、签名和下载验证。不得运行指向原上游仓库的旧发布脚本，也不改写已有发布标签。

历史文档归档到 `docs/history`，当前文档通过 [docs/README.md](docs/README.md) 索引；移动文件时同步检查引用。参与项目须遵守[行为准则](CODE_OF_CONDUCT.md)。
