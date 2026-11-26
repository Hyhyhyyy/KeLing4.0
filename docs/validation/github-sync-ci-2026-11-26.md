# GitHub 同步后的 CI 依赖修复

日期：2026-11-26。基线提交：`bdbadbe8c56c00168ef9f2840c48d8b711155a02`。本轮仅修改根目录 `package.json`、`package-lock.json` 和本记录；应用源码、数据库及华为交接内容未改动。

## 失败原因与修复

[GitHub Actions 45839014103](https://github.com/Hyhyhyyy/KeLing4.0/actions/runs/45839014103) 的 `web-and-server` 在 `npm audit --omit=dev --audit-level=high` 失败。传播链为 `prisma@6.19.3 → @prisma/config@6.19.3 → effect@3.21.0`，审计报告为 3 项 high，实际对应同一漏洞及其上游依赖影响。

[官方安全公告 GHSA-7589-6fvf-x4pw](https://github.com/advisories/GHSA-7589-6fvf-x4pw) 将 `effect <=3.22.0` 列为受影响版本，修复版为 `3.22.1`；[上游修复](https://github.com/Effect-TS/effect/pull/6761) 为全部由字符串跨度组成的模板增加线性匹配路径。[3.22.1 发布记录](https://github.com/Effect-TS/effect/releases/tag/effect%403.22.1) 包含该修复。这不是对本应用已被攻击或已存在可利用入口的判断。

经 npm 官方注册表核对，`@prisma/config@6.19.3` 原本精确依赖 `effect@3.21.0`。本轮在已有 `overrides["@prisma/config"]` 下增加 `"effect": "3.22.1"`，锁文件仅更新 effect 的版本、下载地址与完整性摘要。Prisma、Prisma Client、数据库适配器均保留 `6.19.3`；没有执行会将 Prisma 降至 `6.12.0` 的 `npm audit fix --force`。

## 实际验证

本地环境为 Windows、Node.js `24.18.0`。全新安装使用与失败 CI 相同的 npm `10.9.9`；云端原运行环境为 Ubuntu、Node.js `22.23.5`。

| 验证 | 结果 |
| --- | --- |
| `npm exec --yes --package=npm@10.9.9 -- npm ci --ignore-scripts` | 成功安装 693 个包，锁文件未改变 |
| `npm run prisma:generate --workspace=keling-server -- --schema=prisma/schema.prisma` | Prisma Client `6.19.3` 生成成功 |
| `npm audit --omit=dev --audit-level=high` | 0 漏洞；修复前为 3 high |
| `npm ls effect prisma @prisma/config --all` | Prisma `6.19.3`，effect `3.22.1 overridden`，无无效依赖 |
| `npm run check` | 仓库、63 项共享资源、lint、Web 与服务端构建通过；lint 0 错误、26 警告 |
| `npm test` | 86 / 86 通过，使用独立临时 SQLite；应用数据库未修改 |
| `npm run test:web` | 两组分别 24 / 24、32 / 32 通过 |
| `npm run test:updates --workspace=keling-web` | 8 / 8 通过 |
| Effect 离线单次回归 | 官方示例模板接受 `a:b:cX`；拒绝 5,000 个冒号的非匹配输入，耗时 0.018 ms，满足本次 1,000 ms 上限 |
| `git diff --check` | 通过 |

Effect 回归调用真实安装包的 `Schema.is(Schema.TemplateLiteral(Schema.String, ':', Schema.String, ':', Schema.String, 'X'))`。该单次结果只验证当前输入与补丁行为，不作为通用性能基准或全面安全认证。

## 边界与复现证据

本机 npm `11.18.0` 首次执行 `npm ci` 时报告既有 `@types/node@24.19.2` 与其解析出的 `24.19.4` 不一致；改用 CI 同版 npm `10.9.9` 后，同一最终锁文件全新安装成功。没有为此扩大升级范围。完整安装仍报告 10 项 moderate，均不在本次 `--omit=dev` 生产审计结果中；本轮没有处理这部分开发依赖。

原始失败日志、修复前后审计 JSON、安装与验证日志保存在本机 `.cache/huawei-handoff-20261126/`，文件前缀为 `github-ci-`，其中包括 `github-ci-first-web.log`、`github-ci-audit-before.json`、`github-ci-audit-after.json`、`github-ci-npm10-ci.log`、`github-ci-prisma-generate.log`、`github-ci-check.log`、`github-ci-test-server.log`、`github-ci-test-web.log`、`github-ci-test-updates.log`、`github-ci-effect-regression.json`。缓存不纳入 Git；本记录保留可共享结论及复现命令。

本记录完成时，补丁尚未由本次执行提交、推送或部署；新的 GitHub CI 结果由主线程在推送后另行确认。本轮没有重新调用真实 AI 服务，也没有扩大既有功能演示结论。
