# 游戏美术资源

此目录是 Web 与 Android 共用运行素材的唯一版本控制来源：69 张 WebP，以及供浏览器和 Android 启动图标使用的 `app_icon.png`。`manifest.json` 集中记录当前文件、原始 PNG 来源摘要及既有编码记录；提示词与创作来源保留在本目录。

- `npm run assets:sync`：从本目录复制 Web 的 `apps/web/public/stellar`，该副本不提交；网页开发和构建会自动执行。同步操作不重建清单。
- Android 由 Gradle 从本目录生成打包资源及启动图标，无需维护另一套 `optimizedAssets`，普通构建不依赖 Python。
- `npm run assets:check`：检查当前素材及清单。资源变更需要同步维护清单，不手动修改生成副本。

既有图片沿用有损质量 100 编码，不称为无损。2026-10-31 的文件布局整理未重新绘图，也按当时要求未运行测试、构建或 CI；这是历史整理记录。后续新增标题与箭头的来源、无损编码及验证分别见下方日期条目与当前版本记录。

原始 PNG 保留在 [Git 提交 9583827 的 assets/stellar](https://github.com/Hyhyhyyy/KeLing4.0/tree/9583827/assets/stellar)，旧的逐张 Android 编码记录见[历史清单](https://github.com/Hyhyhyyy/KeLing4.0/blob/9583827/docs/auth/android-art-manifest.json)。需要原图时可单独导出到项目目录之外：

```sh
git archive --format=zip --output=../keling-stellar-originals.zip 9583827 assets/stellar
```

解压到独立目录后，把实际包含 PNG 的目录传给素材再制作脚本（需要 Pillow 12.3.0），例如：

```sh
python scripts/prepare-stellar-art.py ../keling-stellar-originals/assets/stellar --source-commit 9583827
```

此命令仅供重新制作素材时使用，会更新运行素材与统一清单；原图如有新修改，应记录对应的新来源，不能沿用旧提交冒充来源。不要把恢复的整套 PNG 副本纳入当前源码树。旧课程的其他星球素材仍由 Android 的 `assets/legacy-planets` 提供。

## 2026-11-25 标题星芽图集

`title_mascots.webp` 是新绘制的透明 3×3 图集，供 Web 与 Android 的模块标题共用。九格按行对应欢迎、AI 导师、远航、课程、笔记、专注、报告、成就及设置。

采用内置 image_gen，以现有星芽为造型参考；原始生成 PNG 保存在 `sources/title_mascots.png`，完整提示词、参考图摘要、实际尺寸及格位检查见 [创作记录](title-mascots-provenance.json)。图集实际为 1254×1254，每格 418×418。运行 WebP 仅做无损格式编码，像素和透明通道与生成 PNG 逐字节一致；它不属于旧提交 9583827 的原画。

重制全部素材时，需将此 PNG 一并复制到输入原图目录，并按本条目保留独立来源与无损编码；不能仅使用旧提交原图或将新图标记为旧提交来源。常规构建直接同步运行图集，不需要重新生成图像。

## 2026-11-26 主题导航箭头

`navigation_arrow.webp` 是内置 image_gen 新绘的单个向右箭头，供两端通过旋转表示其他方向。薄荷绿主体、深蓝轮廓、奶油白高光和金色星点沿用现有按钮与星芽配色。原稿为 `sources/navigation_arrow.png`，运行 WebP 为逐像素一致的无损编码；完整提示词和摘要见 [绘制记录](navigation-arrow-provenance.json)。图片代替应用的导航、返回、展开、发送及结构化顺序箭头，控件仍保留可访问名称。

## 2026-11-26 使用指南卷轴

`guide_scroll.webp` 为使用指南配图，采用内置 image_gen 绘制；原稿为 `sources/guide_scroll.png`，完整提示词与来源见[绘制记录](guide-scroll-provenance.json)。卷轴内没有说明文字，操作步骤保留为 HTML 文本。PNG 到 WebP 仅做无损编码；旧 RC4 APK 不因网页新增配图而重建。

## 2026-11-27 学科星球

12 学科共用 subject_planets.webp 透明图集（3 列 × 4 行），原稿 sources/subject_planets.png；subject-planets.json 保存学科别名与格位。Web 使用 CSS 图集定位，Android 按相同格位裁切。新图用内置 image_gen 绘制并无损编码，完整提示词见 subject-planets-provenance.json。


## 2026-11-27 个人空间与故事座舱

journey_avatars、journey_frames、journey_titles、journey_furniture 各为 5×2 透明图集，分别包含 10 项。桌面故事直接复用当前演示稿座舱背景，手机使用独立纵向适配。原稿位于 sources，完整提示词与摘要见 [创作记录](journey-art-provenance.json)。全部六幅运行 WebP 与原稿 RGBA 像素逐一一致。共享成就与格位定义在 packages/shared/src/journey-catalog.json，奖励依据实际记录解锁，100h 对应累计记录 6000 分钟。
