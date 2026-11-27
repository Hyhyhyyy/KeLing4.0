# Web 共享知识图谱验收（2026-11-27）

本轮将知识图谱页面接入本地打包的 AntV X6 3.1.8 与 Dagre 3.1.4。自动布局读取原有知识点及 parentIds，不生成或推断新的知识关系；宿主负责账号鉴权、内容编辑和布局保存。Web 与 Android 共用同一编辑器源码及构建产物。

## 已验证

- `npm run test:web`：游客/API 24 项、学习工作区 53 项通过。工作区测试同时覆盖公共 AI 任务轮询、资料来源校验和显式示例隔离。
- `npm run graph:test`：5 项通过，包括多父节点、循环/断连、已有保存位置、新增节点、500 节点边界和桥接字段白名单。
- `npm run test:updates --workspace=keling-web`：8 项通过，包括真实 Workbox 离线导航。图谱 HTML 使用自己的预缓存文档，不能回退成应用首页。
- `npx tsc -p packages/graph-editor/tsconfig.json` 与 Web build 通过。Web lint 无错误，保留既有 any 类型警告。
- Chrome 完整 1272×716 视口执行 7 项真实交互断言：12 个人工节点和 16 条关系；初始自动布局标为未保存；明确保存；鼠标拖动后保存；导航重开保留坐标；双击进入原有编辑对话框并保存；冲突保存失败后保留画布，明确重新读取后再次保存成功。运行错误为 0。
- 普通英语课程经基地进入示例入口后，课程数仍为 1，不自动生成二叉树内容，也不添加二叉树 AI 上下文。样例资格仅来自 `SAMPLE` 标记或已存在的真实练习历史；新星球始终独立。浏览器回归记录为 `.cache/graph-validation/sample-isolation-ui.json`。

本地证据：`.cache/graph-validation/local-result.json`、`graph-initial.png`、`graph-complete.png`；复现脚本 `.cache/graph-local-smoke.cjs`。本地脚本借助正常游客 API 入口准备人工节点，不替换图谱返回值或绘图实现。

## 更新与保存机制

`npm run graph:build` 生成内容哈希命名的 JS/CSS，并将两端同字节文件写入 manifest.json。只清理两个既定输出目录中已替代的生成脚本/样式。图谱 HTML 及依赖具有独立 SW revision；没有外链脚本。初始自动位置不冒充保存状态。保存请求携带每个节点的 expectedUpdatedAt，成功才更新保存指纹；失败保留未保存布局。保存期间继续拖动的变更仍保持未保存。

宿主新建或编辑知识点后以 preserveLayout 刷新，保留当前画布上的拖动；用户明确重新读取时才丢弃未保存位置。服务端指出课程存在未提交的新节点时，宿主重新读取全量节点并继续提示核对保存，不宣称整图已保存。

## 线上验证与数据来源

已通过正式线上 API 新建独立的「英语基础知识星图」，9 个节点、11 条关系，内容为人工编排的初次见面英语主题，不是模型自动提取结果，不用于证明学习成效。账号中已有历史星球及其进度未改动。

RC2（`4.1.1-graph-rc2`，妙搭发布 `7712689212100906275`）已通过正式入口验证：真实账号课程呈现 9 个节点、11 条关系，明确保存和鼠标拖动后的保存请求均返回成功；硬刷新后服务端节点及坐标与保存结果完全一致，线上图谱 manifest 与本地共用构建产物一致，页面运行异常为 0。

4 张完整 1272×716 截图保存在 `.cache/defense-ppt-20261126/screenshots/web/graph-01-auto-layout.png` 至 `graph-04-reopened.png`。实际 API 状态、检查项和节点坐标记录于同目录 `graph-live-evidence.json`，复现脚本为 `.cache/graph-live-e2e.cjs`。验收脚本第一次附加 GET 缺少妙搭 CSRF 头而收到 403；应用自身请求正常。补齐脚本请求头后完整流程通过，未改应用行为或伪造返回。

跨端读写接续已通过：Android 读取 Web 布局、拖动“初次见面”并保存后，Web 重新打开和硬刷新获得的 9 个节点坐标及更新时间与 Android 保存快照完全一致；iframe 的实际初始化坐标也逐项一致，保存状态保持正确。证据为 `.cache/graph-validation/cross-device-result.json`，完整画面为 `graph-05-android-reopened.png`，复现脚本为 `.cache/graph-cross-device.cjs`。

游客数据仍只存于当前会话；浏览器刷新或退出会清空，不应将游客重开误写为跨会话持久化。
