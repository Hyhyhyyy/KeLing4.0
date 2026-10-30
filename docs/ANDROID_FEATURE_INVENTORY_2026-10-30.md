# Kotlin Android 当前功能清单

3.2.4 增量：游客已复用正式 `MainAppContent`，主工作区和原本机功能分别使用内存实现，Key 在本次跨模块共享；退出、Activity 重建或进程结束清空。52 项测试和构建记录见 [Android 完整游客说明](ANDROID_FULL_GUEST_2026-10-30.md)。下文保留 3.2.3 逐项审查基线，其简化试用描述不再代表最新版。

核对日期：2026-10-30。交付版本：3.2.3-preview / versionCode 13；本次图标与版本更新由主线完成，功能基线不变。范围为当前 Android 源码、`MainActivity` 实际分支、屏幕回调、状态容器和网络仓库。此次文档子任务为只读审查，没有构建、运行真机或调用真实模型；主线另已完成 3.2.3 构建及 46 项单元测试。“入口已接通”指界面可沿代码路由到达且有处理逻辑，不等于真实网络、设备和模型效果已全面验收。本文件不把 Web 功能直接视为 Android 功能，也不把仅有源码或路由名称的页面计为可用功能。

## 1. 三种数据空间与真实入口

| 空间 | 用户入口 | 数据位置 | 与其他空间的关系 |
| --- | --- | --- | --- |
| 共享账号工作区 | 邮箱登录或注册后进入；底栏为首页、课程、AI、任务、我的 | 共享 API 与服务端账号数据；认证状态保存于本机 `auth_data` | 已保存课程、任务、笔记、头像、会话等通过同一服务供 Web 读取。不是所有设备内状态都同步。 |
| 免登录内存试用 | 未登录时，登录页“免登录试用 · 退出清空” | `TrialSession` 页面内存；不使用学习 DataStore、Room 或文件存储 | 不创建账号、不同步、不自动迁入账号。退出、页面销毁或进程结束即丢弃；旋转等页面重建也不能当作持久保存。 |
| 保留的本机田园数据 | 共享账号“我的”底部“打开原有本机田园数据” | 当前账号专属 DataStore，由 `AppViewModel` 管理 | 本机新增内容不自动上传。登录同步会导入云课程快照并协调云任务快照，因此此列表可能混有服务器拥有的任务；它不是独立的匿名试用。 |

临时用户 Key 面板是上述页面中的一种临时问答方式，不是第四个账号。它可从共享 AI、设置和试用进入；Key、模型列表与回答仅保留在面板内存，关闭清除，不创建共享会话。普通账号面板的回复可主动复制；试用面板另提供明确保存内存笔记与准备临时任务的操作。

本机学习仓库按账号 ID 的摘要生成独立文件，旧 `keling_data` 只在其记录的用户 ID 与当前账号一致时迁移，原文件保留。退出登录清除认证及界面状态，不删除当前账号本机学习文件。云课程采用保留本地已有项的导入方式，云任务按服务器归属协调；这不是离线双向编辑同步。共享空间会在进入、回到前台或用户点击刷新时读取数据，不是全页面实时推送。

源码依据：[`MainActivity.kt`](../apps/android/app/src/main/java/com/keling/app/MainActivity.kt) 中 `onCreate`、`MainAppContent`、`needsLocalData`、路由 `when`；[`AuthRepository.kt`](../apps/android/app/src/main/java/com/keling/app/data/AuthRepository.kt)；[`AccountStores.kt`](../apps/android/app/src/main/java/com/keling/app/data/AccountStores.kt)；[`DataRepository.kt`](../apps/android/app/src/main/java/com/keling/app/data/DataRepository.kt) 中 `importCloudSnapshot`；[`AppViewModel.kt`](../apps/android/app/src/main/java/com/keling/app/viewmodel/AppViewModel.kt) 中 `syncFromServer`、`clearAllData`。

## 2. 登录、注册与主导航

- 登录表单接受邮箱和密码，可切换密码可见状态，显示请求中和失败信息。成功且响应含有效 token、用户 ID 时才保存认证并进入工作区。
- 注册表单填写昵称、邮箱、密码与确认密码，做邮箱格式、密码 10–128 位及两次一致等校验；成功后进入登录状态。
- 登录页可切换注册、直接进入内存试用。已登录用户需要先退出登录才能进入这个免登录入口。
- 当前没有可用的忘记密码、邮件验证码、修改密码或删除账号入口；登录文件中的忘记密码按钮被注释。
- 主导航：首页、课程、任务、我的均由 `CloudWorkspaceScreen` 按 tab 呈现，AI 使用独立 `StellarAssistantScreen`。共享笔记可从首页页签、AI 的“共享笔记与资料”进入；智能编排可从首页、课程或 AI 进入。系统返回键有历史栈和首页退出确认。

源码依据：[`LoginScreen.kt`](../apps/android/app/src/main/java/com/keling/app/ui/screens/auth/LoginScreen.kt)、[`RegisterScreen.kt`](../apps/android/app/src/main/java/com/keling/app/ui/screens/auth/RegisterScreen.kt)、[`AuthViewModel.kt`](../apps/android/app/src/main/java/com/keling/app/ui/screens/auth/AuthViewModel.kt)、`MainActivity.kt`。

## 3. 共享账号工作区：逐模块可做什么

### 首页

- 查看账号昵称、课程数、待完成任务数和笔记数。
- 读取今日签到状态，明确点击后调用共享签到接口，并刷新状态；页面说明学习日采用北京时间。重复签到按钮在已签到状态禁用。
- 查看最多 3 项待完成任务，可开始专注、确认完成，或准备该任务的 AI 问题与资料预览。
- 进入 AI 助手、智能编排，以及课程、任务、笔记、我的页签；点击“刷新共享数据”重新读取工作区。
- 这里没有 Android 专用的云端学习报告图表、自评知识点雷达或每日 AI 自动建议，不能从网页相关页面推定手机具备这些功能。

### 课程与课程资料

- 课程页可以输入名称创建云课程，查看课程名称和累计学习分钟；可围绕指定课程准备 AI 问题。
- 在智能编排中选择已有课程，读取知识点名称、描述和数量；可创建课程，新增知识点名称及纯文本资料，保存到选中课程。
- 当前 Android 云课程没有重命名、编辑课程元信息、删除或归档课程按钮；云知识点没有编辑、删除、父子关系编辑或图谱画布入口。
- 当前新增资料是表单文本，不是手机 PDF、图片、网页或文件导入。不能将服务端或 Web 的其他导入能力计入 Android。

### 任务与专注

- 读取全部云任务，显示标题、说明、预计分钟和状态。任务详情卡片上的说明截取前 300 字。
- 待完成或进行中的任务可以开始专注、暂停、继续、结束并确认时长，也可直接打开完成对话框填写实际学习分钟。
- 完成提交接受 0–1440 分钟，调用共享完成接口后刷新任务、账号学习记录及奖励；由用户确认，不在倒计时归零时自动完成。
- 可以从任务卡片准备该项任务的 AI 问题并先预览资料。
- 创建云任务的 Android 路径为“智能编排生成计划 → 用户确认计划”；主任务页没有手动新建、编辑、删除、重新打开或放弃云任务的按钮。页面明确可在网页创建任务。
- 云端专注倒计时以任务预计分钟为起点，限制在 1–480 分钟；使用设备单调时钟计算剩余时间，运行中保持屏幕唤醒。计时属于当前对话框，关闭不提交记录；不是后台常驻计时器，也不跨设备同步。
- “结束并确认时长”先按整分钟计算本次时长，再打开可编辑的完成确认框。这里的“预计时间”“设备计时”“用户提交的实际分钟”是三个不同量。

### 共享笔记

- 读取笔记列表；按标题或正文搜索；列表正文显示前 600 字，可选择文本。
- 新建笔记，查看和编辑完整笔记；标题最多 180 字符、正文最多 50000 字符，标题和正文均须非空。
- 更新发送 `expectedUpdatedAt` 版本值；服务端拒绝冲突时显示错误，编辑框没有因请求失败自动关闭。显式关闭编辑框仍会放弃当前未保存编辑，不能称作完整草稿恢复。
- 删除前确认，并提示两端都会移除该笔记。
- 仅从已保存笔记卡片进入资料问答；未保存编辑不会自动发送给 AI。
- Android 当前没有共享笔记导出 Markdown / PDF / Word、文件导入、分享文件或批量操作按钮；选择复制文本不等于文件导出。

### 我的

- 查看昵称、等级、累计学习分钟、能量和结晶。
- 从 9 个星际头像选择一个，通过共享资料接口保存，供两端读取。
- 进入设置与本机田园数据。
- 当前主个人页没有修改昵称、简介、邮箱或密码的表单。设置中“个人资料”的副标题虽写“修改昵称和头像”，实际返回的是此主个人页，因此不能据文案把昵称修改计为可用。

共同源码依据：[`CloudWorkspaceScreen.kt`](../apps/android/app/src/main/java/com/keling/app/ui/screens/agent/CloudWorkspaceScreen.kt) 中各 tab、`WorkspaceTaskCard`、`FocusDialog`；[`WorkspaceViewModel.kt`](../apps/android/app/src/main/java/com/keling/app/ui/screens/agent/WorkspaceViewModel.kt)；[`WorkspaceApi.kt`](../apps/android/app/src/main/java/com/keling/app/network/WorkspaceApi.kt)；[`AgentApi.kt`](../apps/android/app/src/main/java/com/keling/app/network/AgentApi.kt)。

## 4. 共享 AI 助手与智能编排

### 共享 AI 助手

- 获取服务端账号模型目录，区分提供商已配置/未配置及聊天、嵌入模型。新对话可选择服务、聊天模型及六种学习方式：概念讲解、学习规划、薄弱诊断、逐题练习、复习回顾、自由问答。这些是会话模式选项，不代表各模式教学效果已测。
- 资料设置可以显式允许课程与笔记摘录检索；说明限定最近 24 个知识点和 12 篇笔记中的最多 6 条，并非全库搜索。可选关键词或语义向量检索，向量服务与聊天服务独立选择，标明额外用量。
- 从指定课程、任务或已保存笔记进入时，准备新会话草稿，预览实际摘录、版本、截断提示，可编辑问题、刷新和移除资料。指定上下文路径关闭全局检索，不会因进入页面而自动创建会话或发送。
- 单次问题最多 6000 字符；指定笔记最多取 6000 字符，课程最多 6 个知识点且每个 1000 字符，任务描述最多 4000 字符。已有对话的历史可能参与回答。
- 可以新建共享对话、打开历史会话、发送追问、查看生成状态、停止当前请求、查看每轮来源快照及服务报告的 token 用量。失败轮次可把原问题带回编辑。
- 资料 404 / 409 等变化错误会保留问题，要求刷新预览；不会静默替换资料后自动重发。账号、会话切换和离开屏幕会清理指定资料的临时状态，并阻止过期异步响应写入当前选择。
- 成功回答可由用户明确“保存到共享笔记”；删除共享会话须确认，已另存笔记保留。回答没有自动创建共享任务按钮；计划任务走独立智能编排。
- 当前没有会话重命名、置顶、会话文件导出、多模态附件上传或回答朗读入口。回答是异步状态读取，不能描述为已实现逐 token 流式输出。
- 模型未配置时禁用真实发送并说明原因，但指定资料预览和问题编辑仍可进行。真实聊天、向量检索效果和所有模型的可用性均未在本次使用有效 Key 实测。

源码依据：[`StellarAssistantScreen.kt`](../apps/android/app/src/main/java/com/keling/app/ui/screens/ai/StellarAssistantScreen.kt)、[`AssistantViewModel.kt`](../apps/android/app/src/main/java/com/keling/app/ui/screens/ai/AssistantViewModel.kt)、[`AssistantApi.kt`](../apps/android/app/src/main/java/com/keling/app/network/AssistantApi.kt)、[共享上下文契约](AI_CONTEXT_CONTRACT.md)。

### 智能编排

- 读取规划服务配置状态、课程、知识点、云任务及历史运行；服务未配置时仍能整理课程资料。
- 输入学习目标、目标日期、每日可用时间（10–480 分钟），可勾选依据云端完成记录复盘。日期说明为北京时间、今天起 90 天内，实际请求由服务端校验。
- 发起规划后，查看运行状态、错误、摘要、任务建议、日期、分钟和来源；运行中在前台定期刷新。历史运行可重新打开；轮询失败显示错误并允许刷新恢复。
- 只有成功计划出现确认按钮，用户确认后才创建共享任务。任务可在本页按课程筛选，并提交 0–1440 分钟的完成记录。
- 当前 Android 页面不支持逐条编辑计划建议、删除运行历史、取消编排运行或手工重排计划。勾选复盘不是自动后台周期复盘。
- 页面及适配接口存在不等于真实华为 AgentArts 已验收。本次没有有效 Key 和真实华为云运行证据。

源码依据：[`CloudAgentScreen.kt`](../apps/android/app/src/main/java/com/keling/app/ui/screens/agent/CloudAgentScreen.kt)、[`AgentViewModel.kt`](../apps/android/app/src/main/java/com/keling/app/ui/screens/agent/AgentViewModel.kt)、`AgentApi.kt`。

## 5. 临时用户 Key 与实时模型

- 入口为共享 AI 的“配置自己的 API Key”、设置中的模型配置、试用首页和 AI 页的配置按钮。
- Key 默认掩码，可显式显示；关闭并清除面板会清掉 Key、模型列表和回答。面板不写入账号会话、学习仓库或持久偏好；认证 token 也不附加到公共模型接口。
- 读取服务端当前厂商目录（本次配置为 17 家），显示官方文档及允许的官方地域/地址选项。Key 前缀只能提示候选，用户仍选择厂商；普通 `sk-` 或 JWT 等无法可靠判断。
- 只有点击“验证并获取模型”才把当前 Key 交给选定服务验证，显示本次取得的模型列表、获取时间和说明，不自动逐家试 Key。
- 下拉显示聊天/向量能力，纯向量模型不可作为聊天选择；厂商未报告能力时明确标为未知。可以手填模型 ID，但可用性仍取决于实际请求。
- 可以核对或移除附带资料，编辑临时问题，再明确发送；问题最多 4000 字符、资料最多 3 条，每条标题 120、正文 2000 字符。
- 展示返回模型名、答案及已报告的用量；没有服务商用量时显示未报告。可取消等待，但不保证服务商撤回或停止已接收请求。界面说明第三方内容处理及计费边界。
- 从共享 AI 或设置打开时只能主动复制回复，不会自动写共享笔记。试用打开时提供保存为本次内存笔记、编辑并创建临时任务；执行后关闭并清除 Key。
- 这里是临时单次问答：不能当作跨端共享历史、Key 永久管理器或已测通 17 家服务。用户没有提供 Key，本次真实验证与生成未实测。

源码依据：[`ModelAccessPanel.kt`](../apps/android/app/src/main/java/com/keling/app/ui/screens/ai/ModelAccessPanel.kt)、[`ModelAccessSession.kt`](../apps/android/app/src/main/java/com/keling/app/ui/screens/ai/ModelAccessSession.kt)、[`ModelAccessApi.kt`](../apps/android/app/src/main/java/com/keling/app/network/ModelAccessApi.kt)。

## 6. 免登录试用：与网页不能混列的功能边界

试用提供总览、课程、任务、笔记、AI 五个页签，所有本地操作只改变当前内存。

| 模块 | Android 当前操作 | 明确边界 |
| --- | --- | --- |
| 总览 | 查看示例课程数、未完成任务数、笔记数；进入课程或 Key 配置 | 没有 Web 试用的自评知识点统计与专注汇总图表。 |
| 课程 | 阅读两门内置示例课程及知识点，选择单个知识点或课程资料进入 AI 预览 | 示例课程只读；没有添加、修改、删除课程或知识点、掌握度自评按钮。 |
| 任务 | 新建标题、说明与 1–480 分钟预计时长；删除；手动完成；打开专注计时；选择任务资料问 AI | 已建任务没有编辑或重新打开按钮。直接完成不凭空记录预计时长，默认本次专注为 0。 |
| 专注 | 按预计时长倒计时，暂停/继续，完成任务或结束不标完成 | 当前弹窗内存计时；关闭结束计时，不写账号。手动完成把已计整分钟留到该任务，最多 480 分钟；不是累计多次专注统计。 |
| 笔记 | 新建、查看、编辑、删除，选择已保留的内存笔记问 AI | 标题 120、正文 12000 字符；无文件导出、分享、搜索或迁入账号按钮。 |
| AI 资料 | 最多 3 条资料快照，查看全文/收起、移除、截断提示、问题编辑 | 修改原笔记后需重新选择，快照不会悄悄更新；不调用账号资料接口。 |
| 固定示例 | 查看明确标注“非实际 AI”的二叉树遍历示例，可留为内存笔记或编辑后创建临时任务 | 内容固定，不回答用户当前输入，不能当作模型调用成功。 |
| 真实模型 | 主要通过临时 Key 面板；备用公共模型可刷新配置状态、明确发送、取消等待 | 公共服务未配置时禁用发送并显示原因；没有真实 Key 时其他试用操作仍可用。 |
| 退出 | 返回键或“退出并清空”先确认，之后清除本次内容并回登录 | 不保存，不同步，不作为资料备份；不会自动把试用内容迁到新账号。 |

Android 试用的初始数据为两门示例课程、一项示例任务、一篇示例笔记，不应照搬 Web 初始任务数量。资料、真实回答与固定示例均由用户明确选择保存或建任务。

源码依据：[`TrialScreen.kt`](../apps/android/app/src/main/java/com/keling/app/ui/screens/trial/TrialScreen.kt)、[`TrialSession.kt`](../apps/android/app/src/main/java/com/keling/app/ui/screens/trial/TrialSession.kt)、[`TrialApi.kt`](../apps/android/app/src/main/java/com/keling/app/network/TrialApi.kt)。

## 7. 保留的本机旧版：可达与不可达分别说明

### 可达的保留入口

- **本机首页：** 从共享“我的”进入 `offline_home`。显示本机用户状态、签到日历（可切月份）、课程卡片及前三项任务；可以进入本机课程列表、课程详情、任务列表、任务详情和旧版规则助手。旧版首页当前没有底部主导航。日历是记录展示，不代表当前存在本机签到按钮。
- **本机课程：** `offline_greenhouse` 可用四步向导创建课程，填写名称、代码、教师、地点、课表、主题色、星球样式、学期和学分等；本机详情显示课程与关联任务。没有已接入的本机课程删除/归档按钮。虽然课程卡有“编辑”，回调把同 ID 课程传给只追加的 `addCourse`，并未替换原记录；因此不能把旧版编辑列为可靠完成能力。
- **本机任务：** 本机首页已有任务时，“全部”可进入 `offline_tasks`；页内可按状态和关键词筛选、查看任务、使用模板或手工表单创建任务，填写课程、类型、优先级、描述及 5–120 分钟预计时长。本机首页任务为空时只显示旧助手入口，没有直接打开此列表的新建按钮，因此空数据首用路径有缺口。当前列表和详情没有任务编辑/删除按钮，不能因 ViewModel 有对应函数就算可用。
- **本机任务计时：** `task_detail` 使用前台每秒累加的正计时，可开始、暂停、结束确认。本机任务完成至少记 1 分钟，更新本机奖励与学习记录；列表快捷完成使用预计分钟。该口径与共享倒计时、内存试用不同，不是精确后台计时。云端拥有的任务在完成时转到云端编排，不在本机重复发奖。
- **成就：** 共享“我的 → 设置 → 成就管理”可进入 `achievements`，查看预定义成就、解锁数量、进度、类别筛选及已有解锁记录。数据来自当前账号本机仓库，不是共享成就 API；不能保证网页或云任务的最新完成会自动更新旧成就。
- **已有本机知识图谱：** 本机课程已有知识节点时，课程详情可进入 `knowledge_graph`。可查看层级关系、缩放/平移/拖动、添加与编辑节点、删除节点、选父节点、设置描述/难度/掌握度并保存布局，均写本机仓库。没有图像或文件导出按钮。空课程的“生成图谱”只启用展示标记并跳转当前云 AI；不会自动携带本机资料，也没有保证生成节点的闭环。
- **旧版规则助手：** `local_ai` 从本机首页进入，按本机资料提供规则匹配的计划建议、薄弱课程提示、复习/任务/课表查询、问候等，并能打开云端编排。它的 `DeepSeekClient` 当前直接抛出“未启用”，所以不是真实大模型入口。旧规则的“添加任务”“查看课表”等会先命中更早的任务/课表查询分支，不能据后方工具代码宣称自然语言创建任务或进入课表编辑可靠可用。

### 已有源码或路由，但没有当前正常 UI 入口的部分

| 页面 / 组件 | 核查结论 | 因此不计入的能力 |
| --- | --- | --- |
| `offline_profile` / `PastoralProfileScreen` | MainActivity 有路由；旧首页的个人快捷区只有定义，当前 `PastoralHomeScreen` 未调用它；主“我的”进入云个人页 | 本机昵称编辑、旧个人统计入口不能计为当前可达。 |
| `offline_notes` / `PastoralNotesScreen` | 同样只有路由和未使用的旧首页快捷区；主笔记进入共享笔记 | 不把其本机笔记界面算作可达编辑入口；`addNote` 只追加也不能证明旧编辑正确。 |
| `report` / `PastoralStudyReportScreen` | 唯一报告回调来自上述不可达的 `offline_profile`；设置不提供报告入口 | 不计为 Android 已可用学习报告。其源码读取本机记录，洞察是 ViewModel 规则生成，旧标签“AI洞察”不代表真实 AI。 |
| `schedule_edit` | 有路由和课时增删代码；当前主首页不调用旧 `HomeScreen` 课表按钮，旧规则快捷入口又被前置查询分支遮挡 | 不把独立课表编辑页计为可正常进入。课程创建向导内手工课表选择是另一项已接通功能。 |
| `temple`、`nebula` | 有路由/历史组件，当前有效首页没有对应按钮；旧助手导航白名单不是普通用户可用入口 | 不计为已实现自习室、社交协作或多人空间。 |
| `PomodoroTimer`、`ScheduleImportDialog` 等 | 搜索未发现当前已挂载的调用；图片课表识别标明预留/模拟 | 不计为可用独立番茄钟设置、拍照 OCR 导入或课表文件导入。 |

没有发现可用于直接进入上述页面的 Android 深链：Manifest 仅声明主启动 Activity。仅凭字符串分支、API、ViewModel 方法或未调用组件，不能提升为用户可见完整能力。

源码依据：`MainActivity.kt`、`AppViewModel.kt`、[`PastoralHomeScreen.kt`](../apps/android/app/src/main/java/com/keling/app/ui/screens/home/PastoralHomeScreen.kt)、[`GameGreenhouseScreen.kt`](../apps/android/app/src/main/java/com/keling/app/ui/screens/greenhouse/GameGreenhouseScreen.kt)、[`PastoralTasksScreen.kt`](../apps/android/app/src/main/java/com/keling/app/ui/screens/tasks/PastoralTasksScreen.kt)、[`MindMapKnowledgeGraphScreen.kt`](../apps/android/app/src/main/java/com/keling/app/ui/screens/knowledge/MindMapKnowledgeGraphScreen.kt)、[`PastoralAchievementsScreen.kt`](../apps/android/app/src/main/java/com/keling/app/ui/screens/achievements/PastoralAchievementsScreen.kt)、[`PastoralStudyReportScreen.kt`](../apps/android/app/src/main/java/com/keling/app/ui/screens/report/PastoralStudyReportScreen.kt)、[`PastoralAIScreen.kt`](../apps/android/app/src/main/java/com/keling/app/ui/screens/ai/PastoralAIScreen.kt)、[`LocalRuleEngine.kt`](../apps/android/app/src/main/java/com/keling/app/ai/LocalRuleEngine.kt)、[`DeepSeekClient.kt`](../apps/android/app/src/main/java/com/keling/app/ai/DeepSeekClient.kt)。

## 8. 设置、更新和操作边界

- 设置提供临时 Key 配置、返回主个人资料、查看本机成就、退出登录确认、检查版本、打开 GitHub 使用指南/反馈地址以及关于版本信息。
- 推送通知、学习提醒、签到提醒、音效、震动反馈五个开关均为禁用状态，并说明尚未接入；不是已经生效的本地偏好，也不是系统通知权限控制。
- 检查更新实际请求 `/app/version`，显示检查中、当前版本、错误或更新提示；主界面启动也会检查。更新服务代码存在不代表本次已验证远端 APK 下载、安装或自动更新。
- 没有可用的全局文件导出/备份恢复、主题/深色模式设置、批量清空云数据或账号注销入口。底层仓库出现偏好键，不代表设置界面接通。
- 本机计时、试用、未提交编辑、临时 Key 不跨端同步；账号资料与任务必须通过成功的共享接口读写才算同步。当前没有完整离线写入队列与自动冲突合并。
- 本清单是 Android 当前代码与入口的事实清单，不是华为原生 HarmonyOS 适配证明。真实模型、AgentArts、Android 真机、后台续时、大字体和读屏等未取得本次实测证据。

源码依据：[`PastoralSettingsScreen.kt`](../apps/android/app/src/main/java/com/keling/app/ui/screens/settings/PastoralSettingsScreen.kt)、[`UpdateService.kt`](../apps/android/app/src/main/java/com/keling/app/update/UpdateService.kt)、[`AndroidManifest.xml`](../apps/android/app/src/main/AndroidManifest.xml)。既有构建与测试结果单独见 [Android 交付记录](ANDROID_CONTEXT_I1.md)；本次没有把既有通过结果当作新功能真机验收。

## 9. 对外列举时的准确措辞

可描述为“已实现 Web 共用服务的 Kotlin Android 工作区、课程与资料新增、共享笔记增删改查、云任务专注与确认完成、上下文 AI 预览和共享会话入口、智能编排确认入口、9 个共享头像、明确隔离的免登录试用和临时 Key 配置”。涉及模型生成和华为编排，应补充“接口与交互已接通，当前无 Key，真实调用未实测”。

不应描述为“手机已具备与网页完全相同的全量课程/任务管理、完整可达报告、任意资料导入导出、全自动本地图谱生成、17 家模型全部可用、全端离线同步或已完成真机验收”。旧版功能只按上述明确可达范围列举，缺口保留在清单中，不通过名称或源码数量掩盖。
