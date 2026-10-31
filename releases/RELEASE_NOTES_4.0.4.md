# 4.0.4：注册、登录和安装包直连交付

<!-- keling-version-code: 20 -->

手机和网页默认使用新的课灵服务，继续使用原账号及学习数据库，无需自行准备域名或服务器。

- [打开课灵](https://ucn5aajxnx7f.feishu.link/app/app_17h4dw5jwdg)
- [直连下载 Android 安装包（约 93 MB）](https://ucn5aajxnx7f.feishu.link/app/app_17h4dw5jwdg/download/android)
- 注册、登录最多等待 25 秒，可以取消和重试；晚到的旧请求不会覆盖新结果。
- 修复网页刷新恢复、跨端连接及共享托管入口的请求计数。
- 游戏图片采用高质量 WebP，原图保留；安装包由约 175 MB 降至约 93 MB。

已在关闭代理的 Chrome 与 Android 14 模拟器验证真实注册、登录、跨端互通、刷新和重启恢复。Android 89 项测试、后端 77 项隔离数据库测试通过；完整直连下载的摘要一致。没有把模拟器测试称为实体手机验收。

Android 8.0 及以上；versionCode 20；调试签名预览包，签名证书与本机 4.0.1、4.0.3 包一致。建议覆盖安装，保留本机资料。

APK：92,677,090 字节。

SHA-256：`06cd24349c38899b3e11bf35911c4034a397b999b4c84a6dcde459ac14c9963b`。
