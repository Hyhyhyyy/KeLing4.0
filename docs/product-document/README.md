# 产品介绍生成与检查

正文唯一来源是 [docs/PRODUCT_INTRODUCTION.md](../PRODUCT_INTRODUCTION.md)。生成器使用 Python 3.10+ 标准库，无需特定编辑器、Codex 私有路径或第三方库。

从仓库根目录运行：

```sh
python docs/product-document/build_introduction.py
python docs/product-document/verify_introduction.py
```

输出为 `releases/课灵产品介绍.html`，构建与结构检查报告位于 `.cache/product-document/`。这些都是可再生的本地产物，不提交到源码树。离线 HTML 相对引用仓库中的视觉资源和文档，分发时需保留相关目录结构。

图片地址直接取自 Markdown，当前主视觉为 `assets/stellar/expedition_voyage.webp`；生成器不依赖旧 PNG 或 Android 素材副本。本次只更新源码引用，未重新生成或检查 HTML。

检查覆盖源文件与 HTML 的摘要、六个章节、图片、表格、本地链接及外部资源依赖。它不验证浏览器排版、打印页数或 Word 渲染；需要对外分享的最终版须另行查看实际渲染效果。

[历史运行与渲染证据](../history/2026-10/product-document/README.md)保留当时的工具路径、源文件摘要和验证结果，不作为当前构建报告。
