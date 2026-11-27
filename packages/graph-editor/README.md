# 课灵共享知识图谱编辑器

X6 3.1.8 负责 SVG 图形和交互，Dagre 3.1.4 根据每个知识点的 `parentIds` 排列有向关系。依赖版本固定在 package-lock.json；所有脚本在构建时打入本地 editor.js，没有外部 iframe、CDN 脚本或图谱上传服务。

官方参考：[X6 About](https://x6.antv.antgroup.com/en/tutorial/about)、[X6 Graph 配置](https://github.com/antvis/X6/blob/master/site/docs/api/graph/graph.en.md)、[Dagre 布局文档](https://github.com/dagrejs/dagre/wiki)。本轮使用 npm 包内对应版本的 TypeScript 声明核对 API；官网 About 读取超时，未以第三方教程替代版本核验。

## 构建

`npm run graph:build` 从本目录源码生成 Web `apps/web/public/graph-editor` 和 Android `apps/android/app/src/main/assets/graph-editor`，并写入同字节校验清单及第三方许可证。Web 预构建会自动调用。Android 的打包任务依赖由 Android 工程配置。

字体默认从相邻 `../fonts/STZHONGS.woff2` 读取，Android 可在 init 中给出本地同源 `fontUrl`。编辑器 CSP 禁止网络请求和外链脚本。构建副本不进入 Git。

## 协议 1

Web 父页面发送同源 `postMessage`，校验 iframe 的 `event.source` 与 `event.origin`。Android 调用 `window.KelingGraphEditor.receive(objectOrJson)`，编辑器回传至 `window.KelingGraph.postMessage(JSON.stringify(event))`。只传课程节点和布局，不传账户令牌、密钥或其他课程资料。

init：`{protocol:1,type:'keling-graph:init',sessionId,courseId,nodes,layoutSaved,savedNodeIds,fontUrl?}`。nodes 含 id/name/description/parentIds/masteryLevel/difficulty/positionX/positionY；未知字段被丢弃。坐标是卡片中心在 4096×4096 逻辑画布内的 0..1 归一化值。

初始化前回传 ready；初始化后所有消息回传 sessionId/courseId。readyState 包含 positions/dirty/saved，selected 包含 nodeId，editRequested 请求打开宿主编辑对话框。layoutChanged 包含 positions/reason/dirty；saveRequested 包含全部 positions。命令：`{type:'keling-graph:command',protocol:1,sessionId,courseId,command:'fit'|'zoomIn'|'zoomOut'|'autoLayout'|'save'}`。

宿主以各节点最新 `updatedAt` 为 expectedUpdatedAt，调用 `PUT /knowledge/:courseId/layout`，全组成功后发送 saved 和本次提交的 positions；失败发送 saveError 和可展示信息。保存回执后发 saveState/dirty；保存期间的新拖动不会误标已保存。首次自动布局仅为未保存草稿；服务端 savedNodeIds 明确识别已有保存位置。

初始布局自动保持多父节点的每条关系。新增节点保留已保存节点位置；点击自动布局可重排全图。图形本身不修改知识节点关系，增删改仍由宿主原有对话框执行。
