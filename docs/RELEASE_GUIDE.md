# 课灵预览包发布

当前公开仓库为 `Hyhyhyyy/KeLing4.0`。不得运行仍指向旧仓库的历史自动发布脚本；不推送 `CurryHeng/KeLing_ICT`。

4.0.3 使用新的妙搭 HTTPS 入口，保留原 Neon 数据库。网页与连接证据见 [直连修复记录](auth/DIRECT_ACCESS_2026-10-31.md)。

发布顺序：

1. 运行 `npm test`、网页 lint/build、`scripts/android-check.ps1 -Lint`，并完成无代理网页与 Android 账号流程。
2. 检查 APK 的 versionCode、versionName、SHA-256 和签名。4.0.3 的 versionCode 为 19；本机 4.0.1 与 4.0.3 调试包证书一致。
3. 仅将相关源代码提交并推送至 `Hyhyhyyy/KeLing4.0`。保留其他未提交改动，不提交 `.env`、密钥或测试账号凭据。
4. 使用 `gh release create` 发布 prerelease，附真实 APK 和 `.sha256` 文件，并以 `--notes-file` 读取发布说明。
5. 正文必须包含实际整数标记 `<!-- keling-version-code: 19 -->`。服务器以有效 APK 和该标记识别更新，不能从版本字符串推算。
6. 公布直连下载入口前，下载完整文件并比对 SHA-256；下载路由只能提供固定、已审核的公开安装包。

该包仍是 Android 调试签名预览，不是原生 HarmonyOS NEXT 应用，也不是正式商店发行。不要为解决安装问题直接要求卸载用户的旧包，旧版本可能保有未上传的本机资料。
