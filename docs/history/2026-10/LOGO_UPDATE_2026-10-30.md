# 书本星球图标更新

> 历史记录（2026 年 10 月）。保留当时版本、操作和验证结论；当前入口与运行方式见[文档索引](../../README.md)。

日期：2026-10-30。版本：3.2.3-preview / Android versionCode 13。

用户指定采用网页左上角字标里的星球图案。以 `assets/stellar/title_logo.png` 为参考，通过内置 imagegen 编辑，去掉中英文字，保留书本星球、轨道、星点和既有像素配色，得到透明正方形图标。完整文字字标仍用于网页导航和应用内品牌标题；浏览器标题图标、网页安装图标和 Android 启动图标使用独立星球图案。

## 资源与消费位置

- 规范图标：`assets/stellar/app_icon.png`，1254 × 1254 PNG，四角透明；SHA256 为 `4f9b678a8823b982da67cddc3bdaa587df9838c44374cc756d86d3d9f5ae8409`。
- Web：`apps/web/index.html` 的 favicon、Apple Touch、启动图和分享图；`apps/web/vite.config.ts` 的 PWA 主图标与快捷方式图标。图标 URL 增加 `?v=planet-20261030`，防止旧图标缓存继续命中同一地址。
- Android：两组 `mipmap-anydpi` / `mipmap-anydpi-v26` 的普通和圆形图标均指向 `stellar_launcher`。前景为规范 PNG，18% 内缩为宽轨道保留自适应图标安全区，背景沿用海军蓝。
- `scripts/sync-stellar-assets.cjs` 现在同时同步 Android launcher drawable，避免下次只更新 assets 而遗留桌面图标。资源总数仍为 44 张，没有将图标替换计作新增场景。
- 完整生成提示词与选择来源保存在 `assets/stellar/prompts-app-icon.json`，使用内置工具，没有调用需用户 Key 的图像 API。原字标未修改，旧应用图标可由 Git 历史追溯。

## 实际验证

1. `npm run build:web` 通过，PWA manifest 与两个快捷方式均指向新版图标且声明尺寸与 PNG 相同。
2. Android 构建通过，46 项单元测试为 0 失败 / 0 错误。此次仅改图像、图标 XML、版本与同步脚本，没有重跑上一版的完整 lint 或服务端功能测试。
3. 44 张规范 PNG 与两端、APK 内资源一致，launcher drawable 与规范图标字节相同；APK v2 签名验证通过。
4. 本机浏览器实际打开新版图片并观察透明底下的独立书本星球；试用页 DOM 的 favicon 与 Apple Touch href 均为新地址。没有 Android 真机，系统桌面裁切与安装后的图标缓存更新未以真机验证。
5. Vercel CLI 返回 Ready：`dpl_59XzzL7paXoHK8GwATVoBsQsJ4F3`，固定入口 `https://keling-ict-preview.vercel.app`。本次不以 Ready 代替公网 HTTP 全链路回归。

新安装包：`releases/KeLing-ICT-3.2.3-cloud-debug.apk`，152,328,292 字节，约 145.3 MiB。包名 `com.keling.app`，最低 Android API 26，目标 API 34，共享 API 地址不变。SHA256：

```text
47a63b94657beb02efa475ab470014b380ee997f5eeed1b8d68102831f071fdd
```

当前功能审查见 `WEB_FEATURE_INVENTORY_2026-10-30.md`、`ANDROID_FEATURE_INVENTORY_2026-10-30.md`。功能清单以真实导航与调用链为依据，未实测的模型服务及已发现的界面缺口单独说明。图标更新没有修补或新增业务功能，也未重新开启定时迭代。
