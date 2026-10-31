# 游戏美术资源

此目录是 Web 与 Android 共用运行素材的唯一版本控制来源：59 张 WebP，以及供浏览器和 Android 启动图标使用的 `app_icon.png`。`manifest.json` 集中记录当前文件、原始 PNG 来源摘要及既有编码记录；提示词与创作来源保留在本目录。

- `npm run assets:sync`：从本目录复制 Web 的 `apps/web/public/stellar`，该副本不提交；网页开发和构建会自动执行。同步操作不重建清单。
- Android 由 Gradle 从本目录生成打包资源及启动图标，无需维护另一套 `optimizedAssets`，普通构建不依赖 Python。
- `npm run assets:check`：检查当前素材及清单。资源变更需要同步维护清单，不手动修改生成副本。

WebP 沿用既有有损质量 100 编码，不称为无损；这次合并来源没有重新绘制图片。当前文件布局的调整按用户要求未运行测试、构建或 CI，历史编码记录不代表本次构建已经通过。

原始 PNG 保留在 [Git 提交 9583827 的 assets/stellar](https://github.com/Hyhyhyyy/KeLing4.0/tree/9583827/assets/stellar)，旧的逐张 Android 编码记录见[历史清单](https://github.com/Hyhyhyyy/KeLing4.0/blob/9583827/docs/auth/android-art-manifest.json)。需要原图时可单独导出到项目目录之外：

```sh
git archive --format=zip --output=../keling-stellar-originals.zip 9583827 assets/stellar
```

解压到独立目录后，把实际包含 PNG 的目录传给素材再制作脚本（需要 Pillow 12.3.0），例如：

```sh
python scripts/prepare-stellar-art.py ../keling-stellar-originals/assets/stellar --source-commit 9583827
```

此命令仅供重新制作素材时使用，会更新运行素材与统一清单；原图如有新修改，应记录对应的新来源，不能沿用旧提交冒充来源。不要把恢复的整套 PNG 副本纳入当前源码树。旧课程的其他星球素材仍由 Android 的 `assets/legacy-planets` 提供。
