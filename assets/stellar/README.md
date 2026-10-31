# 游戏美术资源

此目录是 Web 和 Android 共用 PNG 原图的唯一版本控制来源。`manifest.json` 记录 60 张原图的尺寸、字节数和 SHA-256；提示词、创作来源及使用边界保留在本目录的其他说明中。

- `npm run assets:sync`：校验原图后生成 Web 的 `apps/web/public/stellar`，该镜像不提交。网页开发和构建会自动执行。
- `npm run assets:check`：验证原图与 Android WebP 派生文件的摘要、数量和对应关系，无需先生成 Web 镜像。
- 修改原图后，显式运行 `node scripts/sync-stellar-assets.cjs --refresh-manifest`，检查摘要差异，再用 `python scripts/prepare-android-art.py` 重新编码 Android 素材（Pillow 12.3.0）；`--verify` 可进一步验证图像尺寸、透明度和像素差异。

Android 直接打包 `apps/android/app/src/main/optimizedAssets/stellar` 中的 WebP，保留其已审核的生成文件便于普通 Gradle 构建，无需 Python。启动图与原图清单由 Gradle 从本目录生成到 build 目录；不再提交第二套 Android PNG。

60 张 WebP 使用有损质量 100 编码，不称为无损。来源与派生摘要记录在 `docs/auth/android-art-manifest.json`；原 PNG 保留供再生成。旧课程的 26 张历史星球资源另在 Android 的 `assets/legacy-planets` 中保存，索引没有改变。
