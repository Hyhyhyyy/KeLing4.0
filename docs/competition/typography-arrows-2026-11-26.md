# RC4 标题、箭头与字体记录

日期：2026-11-26。候选版本 **4.0.5-defense-rc4 / Android versionCode 24**，基于 RC3 提交 `f8167ea7725b748eb7007271c0b583789141550b`。

## 改动与对应位置

“今日星际补给”“开启知识远航”由原先桌面 24px、窄屏 22px 放大为 32–42px，桌面实际 1280px 视口下为 38.4px，390px 窄屏为 32px。其他主标题、模块与卡片标题同步提高层级，标题片段不再被卡片的普通 span 样式缩小。姓名按短语换行；课程标题、操作入口分行，手机日期与时长字段改为单列。Web 入口为 `apps/web/src/styles/typography.css`、`pages/Home/StellarHome.*` 与 `components/ModuleTitle.css`。Android 两套主题及星际主题统一调整，模块标题使用 `StellarHeading.kt`。

新绘一个右向主题箭头，在两端通过旋转表示返回、展开、上下、发送等方向。薄荷绿主体、深蓝轮廓、奶油高光与金色星点沿用按钮和星芽配色。常规箭头容器 40px/dp、主要入口 48px/dp，顺序与小控件 32px/dp；实际图形位于透明方图内，方向明确。Web `NavigationArrow.tsx` 覆盖导航、返回、发送、17 个下拉框、3 个数字字段及 details 标记；Android `StellarArrow.kt` 覆盖返回、翻月、发送、入口、顺序与图谱。装饰图片不重复读出，数字增减按钮及顺序仍保留可访问名称。应用静态 UI 不再使用 Unicode 或通用箭头图标；用户内容和模型提示不做盲目文本替换。

箭头使用内置 image_gen 绘制；原稿为 `assets/stellar/sources/navigation_arrow.png`，运行图 `assets/stellar/navigation_arrow.webp` 为无损编码，RGBA 像素不变。完整提示词、参考图及摘要见[绘制记录](../../assets/stellar/navigation-arrow-provenance.json)。

## 华文中宋

用户已在本次会话确认具有网页和 APP 嵌入授权。统一源字体为 `assets/fonts/STZHONGS.TTF`，网页使用同源 WOFF2，Android Gradle 从同一源生成 `res/font/stzhongs.ttf`；均随应用资源加载，不要求访问者安装字体。网页标题、正文、表单、代码文本以及 Android 各主题和富文本的字体均统一，旧 Noto 字库及两张旧箭头已确认无调用后移出运行资源，原文件保留在 Git 历史。

WOFF2 未作字符子集裁剪，与 TTF 的 25,185 个字形顺序和 24,367 个字符映射一致。网页文件 6,054,636 字节，设备未安装字体且未缓存时需要下载；之后使用浏览器缓存，PWA 字体缓存保持同源且不将字体纳入预缓存。构建中同时修复原缓存回调序列化后引用未定义 `publicBase` 的问题；API 仍为 NetworkOnly。字体源与编码校验见[字体清单](../../assets/fonts/manifest.json)及[使用与构建说明](../../assets/fonts/README.md)。

## 验证

Web 49 项业务回归通过，最终布局修正后构建和 Lint 通过（0 错误、34 条既有警告）。Android 包含最后修改的完整构建、91 项单测及签名验证通过，Lint 0 错误、40 条警告。APK 中 63 个共享图片/清单文件逐字节匹配，唯一运行字体与根 TTF 完全一致；未连接真机或模拟器，Android 画面尚待检查。

本机浏览器实际检查桌面首页、390×844 手机首页与编排表单。两处重点标题、课程卡片、欢迎语、图片箭头及日期字段显示正常。数字按钮实际完成 60 → 61 → 60；两种视口的文档宽分别为 1272 和 382px，没有横向溢出；检查时没有损坏图片。读到的标题/表单字体族与可见宋体字形一致，浏览器控制接口不提供 FontFaceSet 枚举，不能将这次观察表述成逐字形平台字体追踪。

本次浏览器使用独立演示库，没有填写模型密钥或调用真实模型；复验后恢复视口、关闭临时标签并停止演示服务。详细数值见[验证记录](../validation/typography-arrows-2026-11-26.json)。

公开 Android 下载仍为 4.0.4，请使用本轮单独交付的 RC4 APK。Gitee 写权限、真实华为 Runtime、实体手机跨端和题目人工审核仍见[原版本核对](defense-readiness-2026-11-25.md)。答辩稿与 PPT 待用户确认程序版本后制作。

## 网页发布

[线上网页](https://ucn5aajxnx7f.feishuapp.com/app/app_17h4dw5jwdg)已发布 RC4，发布号 `7712285431664594098` 为 finished，无错误日志；模板提交 `80fdc1c50813f7e98b95b132e02f38872978077e`。线上 health 为 RC4，ready 正常；70 个生成文件与三项公共资源的完整 SHA-256 均与本地源一致。字体以同源 `font/woff2` 返回，CORS、缓存、ETag、条件请求 304 和 HEAD 200 已核实。

模板 4 项网关测试和 7 项公共资源 HTTP 测试通过；146 份主线输入文件在发布后复核没有变化，11 份部署适配源码与来源记录已同步到 `deploy/miaoda`。不把临时签名 URL 写进前端，也不把新增资源二进制提交到托管模板 Git。详见[部署记录](../validation/miaoda-typography-rc4-deployment.json)与[线上文件校验](../validation/miaoda-typography-rc4-online.json)。
