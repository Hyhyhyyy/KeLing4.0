# Vercel 账号与 Codex 设置记录

> 历史记录（2026 年 10 月）。保留当时版本、操作和验证结论；当前入口与运行方式见[文档索引](../../README.md)。

按用户指定的 [Vercel 官方入门说明](https://vercel.com/get-started.md) 操作，2026-10-29 核验。

- 全局 CLI：65.7.0，入口 `C:\Users\lenovo\AppData\Roaming\npm\vercel.ps1`；账号 `hyhyhyyy`，团队 `hyhyhyyys-projects`，Hobby 套餐。
- Codex 共享 MCP：`https://mcp.vercel.com`；通过 `codex mcp add vercel --url https://mcp.vercel.com` 添加，OAuth 已成功。`codex mcp list --json` 返回 enabled=true、auth_status=o_auth。
- 配置文件：`C:\Users\lenovo\.codex\config.toml`。只添加 Vercel 项，未覆盖其他 MCP 配置；未更改审批或权限策略。
- 当前运行中的会话尚未载入 Vercel MCP 工具。官方要求的 `search_vercel_documentation` 和 `list_teams` 工具检查未执行；需在重新加载工具或恢复会话后验证。CLI 的团队查询成功不能替代 MCP 工具检查。
- Vercel 插件曾显示已安装，但稍后插件目录和连接器状态均显示未安装。按官方 `npx plugins add vercel/vercel-plugin --target codex --scope user --yes` 重装失败，实际 GitHub HTTPS 连接超时。官方技能安装器的 GitHub 查询同样超时，因此没有将此项记为成功。原有 OpenAI `vercel-deploy` 技能仍保留。

CLI 登录和 MCP OAuth 是独立授权；两者均已完成。项目链接与部署在全局设置后进行，具体状态见 [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md)。用户要求暂不推送 GitHub，所有代码提交仅保留本地。

复核命令：`vercel --version`、`vercel whoami`、`codex mcp get vercel`。不要将完整账号响应、OAuth 存储、环境变量或自动化绕过凭据复制到公开日志。
