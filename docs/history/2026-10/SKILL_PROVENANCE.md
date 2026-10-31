# 本轮权威技能与使用边界

> 历史记录（2026 年 10 月）。保留当时版本、操作和验证结论；当前入口与运行方式见[文档索引](../../README.md)。

记录日期：2026-10-29。

|技能|来源与安装目录|用途与边界|
|---|---|---|
|imagegen|预装 OpenAI 系统技能，`C:/Users/lenovo/.codex/skills/.system/imagegen`|本轮使用内置 image_gen 绘制五幅环境场景；提示词及源生成文件见 `assets/stellar/prompts-filled-scenes.json`|
|computer-use|OpenAI bundled computer-use 插件|通过 cua_repl 检查本地网页桌面/手机断点与真实交互；不等同 Android 真机测试|
|skill-installer|预装 OpenAI 系统技能|本轮实际使用其安装脚本，从下列官方仓库安装两个具体技能|
|jetpack-compose-performance|[Google Android 官方仓库](https://github.com/android/skills/tree/main/jetpack-compose/jetpack-compose-performance)，安装到 `C:/Users/lenovo/.codex/skills/jetpack-compose-performance`|安装成功；下一轮可用。执行前读取完整技能及对应 references，按本项目 Compose 版本适配；debug 编译成功不代表性能基准达标|
|web-design-guidelines|[Vercel 官方仓库](https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines)，安装到 `C:/Users/lenovo/.codex/skills/web-design-guidelines`|安装成功；下一轮可用。用于界面、键盘、动效、表单和可访问性审查；本轮未将安装行为称为技能审查已完成|
|vercel-deploy|已安装 OpenAI 部署技能，`C:/Users/lenovo/.codex/skills/vercel-deploy`|沿用用户已授权的现有 Vercel 预览项目；不因部署技能改变 GitHub 推送限制|

Google 官方入口：[Android skills](https://developer.android.com/tools/agents/android-skills/browse)。未安装 React Native 技能替代 Kotlin，也未为迎合最新 adaptive 技能升级 Navigation/实验布局库。技能只是可追溯的方法资源，功能和性能仍须实际验证。

安装命令分别为 `install-skill-from-github.py --repo android/skills --path jetpack-compose/jetpack-compose-performance --method download` 与 `--repo vercel-labs/agent-skills --path skills/web-design-guidelines --method download`，两次退出码均为 0。未修改任何权限策略，未提供密钥给安装器。
