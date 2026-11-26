# 华文中宋共享字体

本项目使用 `STZHONGS.TTF`（华文中宋 / STZhongsong）。项目持有人于 2026-11-26 在本次会话确认具有网页与 Android 应用嵌入授权，随后从其本机已安装字体复制作为该应用的资源。该确认不是开源字体许可；本仓库其他代码的许可不覆盖此字体，不授予独立再分发或其他项目使用权。

`STZHONGS.woff2` 是同一 TTF 的 WOFF2 格式编码，未做字符子集裁剪。字形顺序、完整字符映射和嵌入标记保持一致。来源、授权确认、字形数、文件大小及 SHA-256 保存在 [manifest.json](manifest.json)。字体版权属于原权利人，参见 [Microsoft 的 STZhongsong 资料](https://learn.microsoft.com/en-us/typography/font-list/stzhongsong)。

网页构建将 WOFF2 复制至生成目录 `apps/web/public/fonts`；Android Gradle 将 TTF 复制至 `app/build/generated/font-resources/font/stzhongs.ttf`。两份生成副本都不提交。`npm run assets:check` 同时校验图片和字体；常规构建不需要 Python 或本机安装该字体。

线上字体作为当前应用的字体资源提供；无需访问者的系统预先安装。标题、正文、表单及应用内绘图使用统一字体，缺失字形的最终回退仍由平台处理。不要把字体名称出现在 CSS 中视为已实际加载，应检查浏览器字体请求和加载结果。
