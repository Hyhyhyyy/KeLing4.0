# 课灵预览包发布

发布目标只使用 `Hyhyhyyy/KeLing4.0`，不推送原上游 `CurryHeng/KeLing_ICT`。历史发布脚本已移出当前源码树，不能从归档复制旧命令直接运行。

4.0.4 使用新的妙搭 HTTPS 入口，保留原 Neon 数据库。网页与连接证据见 [直连修复记录](auth/DIRECT_ACCESS_2026-10-31.md)。

发布顺序：

1. 运行 `npm run check`、`npm test`、`npm run test:web`、`npm run assets:check` 和 `scripts/android-check.ps1 -Lint`，并完成无代理网页与 Android 账号流程。
2. 检查 APK 的 versionCode、versionName、SHA-256 和签名。4.0.4 的 versionCode 为 20；本机 4.0.1 与 4.0.4 调试包证书一致。
3. 仅将相关源代码提交并推送至 `Hyhyhyyy/KeLing4.0`。保留其他未提交改动，不提交 `.env`、密钥或测试账号凭据。
4. 使用 `gh release create` 发布 prerelease，附真实 APK 和 `.sha256` 文件，并以 `--notes-file` 读取发布说明。
5. 正文必须包含实际整数标记 `<!-- keling-version-code: 20 -->`。服务器以有效 APK 和该标记识别更新，不能从版本字符串推算。
6. 公布直连下载入口前，下载完整文件并比对 SHA-256；下载路由只能提供固定、已审核的公开安装包。

`releases/` 只维护说明、索引和校验摘要；APK 放 GitHub Releases。离线产品介绍 HTML 是由 `docs/product-document/build_introduction.py` 生成的本地产物，当前内容入口为[产品介绍](PRODUCT_INTRODUCTION.md)。

4.0.4 的摘要对应已发布的 `v4.0.4-direct-cloud-preview` 发行文件。仓库整理后的 `main` 重建包可能不同，必须重新计算摘要；不要沿用旧校验值、改写旧标签或替换旧版文件。

该包仍是 Android 调试签名预览，不是原生 HarmonyOS NEXT 应用，也不是正式商店发行。不要为解决安装问题直接要求卸载用户的旧包，旧版本可能保有未上传的本机资料。
