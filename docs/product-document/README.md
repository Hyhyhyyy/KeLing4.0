# 产品介绍文档复现与证据

正文唯一来源：`docs/PRODUCT_INTRODUCTION.md`。

离线 HTML：`releases/课灵产品介绍.html`。它与 Markdown 同源，包含 6 个章节、一张未经修改的完整主视觉原画、两张比较表和文字箭头流程图。打印样式以 Letter 纵向编排，每章开始新页；6 个章节不等于已经验证恰好 6 个打印页。

生成器只使用 Python 标准库，没有网络请求、外部字体、脚本或第三方依赖安装。HTML 图片相对引用 `../assets/stellar/scene_arrival.png`，离线阅读需要保留项目目录结构。网页入口与官方参考资料是用户点击的普通链接，不是页面加载依赖。

## 运行方式

本次使用 `load_workspace_dependencies` 返回的捆绑 Python。运行命令如下，工作目录为项目根目录：

```powershell
$env:PYTHONIOENCODING = 'utf-8'
& 'C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' docs/product-document/verify_runtime.py
& 'C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' docs/product-document/build_introduction.py
& 'C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' docs/product-document/verify_introduction.py
```

换一台机器时，应重新用依赖加载工具取得捆绑运行时路径，不假定系统 Python 或用户安装的软件等价。

## 本次 Word 渲染边界

已经完整读取 Documents 技能及创建、写作质量和参考选择说明。此 Windows 运行时没有捆绑 LibreOffice，技能的 `render_docx.py` 实际解析得到 `FileNotFoundError: LibreOffice soffice.exe was not found on PATH`。没有调用用户安装的桌面 LibreOffice，没有安装额外套件。

依据主线授权，交付 Markdown 与同源离线 HTML，未创建 `课灵产品介绍.docx`，也未把 HTML 或源文件检查称作 Word 逐页验收。Word 已渲染并检查页数为 **0**。由于没有 DOCX 创建操作，没有发出只支持 DOCX 的 artifact operation marker，避免把不存在的 Word 产物计为交付。

`renderer_evidence.json` 保留运行时解析结果；`build_evidence.json` 保存正文和 HTML 的 SHA256；`content_verification.json` 检查章节、图片、表格、离线资产、源文件一致性与本地链接。上述结构检查不替代浏览器外观检查。正式介绍正文不包含渲染故障、工具日志或内部检查单。

文档子任务的浏览器库存为空，后由主线于 2026-10-30 使用自己的 CUA 浏览器完成 HTML 检查：六个章节标题与正文、两张比较表及完整插图正常显示，1280px 和 390px 宽度无横向溢出。证据为 `../screenshots/final-2026-10-30/product-introduction-desktop.png`、`product-introduction-mobile.png`，详见 `../FINAL_DELIVERY_2026-10-30.md`。这是 HTML 屏幕阅读布局验收，不是打印或 Word 逐页验收。

## 内容核对范围

正文对照了 `AI_CONTEXT_CONTRACT.md`、`ANDROID_CONTEXT_I1.md`、`TRIAL_WEB.md`、`WEB_CONTEXT_I1.md`、竞赛核验记录，以及现有服务端目录、试用与 Key 接口和 Web Key 面板清理逻辑。服务端 44 项测试、Android 46 项测试和网页交互结果采用主线已确认结果；没有把固定响应当作真实模型验证。

同类产品事实来自 Google 和 Todoist 官方页面，已在正文就近链接。竞赛章节保留规则未完全核验、AgentArts 未实测、Kotlin 不等于原生 HarmonyOS 的边界。文档没有持续迭代或定时任务计划。
