# DeepSeek省赛规划接入验证

日期：2026-10-27。

本轮读取本地.env，仅报告配置是否存在，不输出密钥。对DeepSeek发起一次真实请求，输入专门构造的二叉树知识片段，返回1条任务并通过validatePlan日期、每日预算与来源校验。该请求未读写个人课程/笔记，不代表完整浏览器到任务确认端到端验收。

学习规划现在默认优先使用已配置的DEEPSEEK_API_KEY，后端先通过受限课程资料工具检索真实用户资料，再传给DeepSeek生成JSON，复用来源证据校验、预览与确认事务。AgentArts保留，可用PLANNING_PROVIDER=agentarts显式选择，不会因该平台调用失败而静默切换。

DeepSeek路径是后端检索增强的模型规划流程，不宣称AgentArts部署或多Agent协作。前端显示服务端返回的实际供应商。

验证：npm test 8项通过；server和Web构建通过；lint 0错误、59警告。DeepSeek测试中的HTTP fixture与一次真实调用证据分开记录。无密钥、401与输出截断均失败关闭。

体验：打开http://localhost:5173/agent，登录、创建课程与知识点，选择课程、未来考试日期和每日分钟后运行DeepSeek。检查草案，再确认写入任务。若已有登录过期，请重新登录。旧AI助手独立入口不作为本轮确认执行主路径。
