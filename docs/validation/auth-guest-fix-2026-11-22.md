# 登录与游客模型配置修复

2026-11-22。本轮修复两项独立问题。

## 根因与改动

1. 妙搭本次返回 feishuapp.com 入口，但生产 CORS_ORIGINS 仍只列出旧 feishu.link 域名和原本地调试源。浏览器在登录和模型发现 POST 中发送新 Origin，后端拒绝后返回 500。已保留原配置并追加当前应用的精确 HTTPS origin，未使用通配符、未关闭 CSRF 或账号鉴权。
2. 模型发现代码沿用旧的“华为仅香港支持目录”规则，错误拦截了国内默认 v2 地址。根据中国站当前文档，贵阳一支持 https://api.modelarts-maas.com/v2/models；香港使用独立的 api-ap-southeast-1 地址。已允许两种官方 v2 地址，v1 继续提示手填模型 ID，并同步前端文案。密钥只发送至用户选定的官方域名，不向其他区域试探。

中国站依据：https://support.huaweicloud.com/model-call-maas/model-call-029.html （2026-11-17）。
国际站依据：https://support.huaweicloud.com/intl/zh-cn/model-call-maas/model-call-029.html （2026-11-18）。两个站点地域不同，不能将国际站的“仅香港”套用到中国站。

此前无 Origin 的 HTTP 成功未覆盖浏览器实际行为，这是上一轮验收遗漏。本轮新增 scripts/test-hosted-origin.cjs，显式携带平台 Cookie、CSRF 头和目标 origin，分别验证登录、注册、游客模型发现能到达参数校验。此脚本不创建账号或请求模型厂商。

## 验证证据

修复前，相同空 POST 请求：新域名 Origin 的登录和模型发现均为 500，旧域名 Origin 均为 400（正确到达参数校验）。修复 CORS 后，带新域名 Origin 的演示账号实测：注册 201、登录 200、认证用户查询 200；错误密码 401 后正确密码重试成功。游客目录 200，返回 17 家服务商；未授权外部 origin 仍被拒绝。

服务端 79/79 测试通过，新增测试覆盖国内默认 v2 和香港 v2 的精确请求目标，以及 v1 不发送网络请求。Web lint 为 0 错误、34 条既有警告。Web TypeScript 与 Vite 构建通过，模板 Nest 构建通过。浏览器检查工具仍超时，本轮不能声称已完成可视化操作验收。

主仓修复提交：318da0e。模板部署提交：dc9c6724256858defe0539627df903fcc712c582。
前端从源文件重新构建；为沿用线上 PNG 素材，构建副本恢复 da1200b 前的素材路径文件，不修改主仓 WebP 主线。副本来源与实际文件 SHA-256 记录于发布模板 vendor/source-manifest.json 的 webAssetCompatibility 和 files 字段。

没有提取截图中的密钥。测试用的模拟 Key 不是有效凭证；实际 MaaS Key 的权限、额度和模型调用效果仍需由账号持有人在界面验证。游客配置使用 MaaS 模型密钥，不是 AgentArts 工作流入站密钥。此前 AgentArts Runtime 的 GetAppCredential 超时属于另一条服务链，本轮没有证据说明它已恢复。

## 用户操作

先保存本次游客笔记等内存资料，再刷新页面加载新版。游客数据与密钥只存内存，刷新会清空；重新填写正确区域的 MaaS Key，选择对应地址，再点击验证并获取模型。贵阳一选默认国内 v2，香港选香港 v2；不要为绕过报错把密钥随意切换区域。

最终发布状态与上线后回归结果见同目录 JSON。

## 最终发布与复验

最终 release 7711002961031433506 返回 finished，提交 dc9c6724256858defe0539627df903fcc712c582。线上已提供含“贵阳一与香港区域”的新页面模块。带精确 Origin 的登录仍为 200、认证用户查询 200、游客服务商目录 200（17 家）。故意使用模拟无效 Key 查询国内 v2，现返回 PROVIDER_AUTH（HTTP 502，为本应用对上游认证失败的映射），不再返回本地 DISCOVERY_UNSUPPORTED；这是认证失败路径验证，不是有效模型 Key 成功验证。注册在同一 CORS 配置下已实测 201。
