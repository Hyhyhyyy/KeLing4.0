package com.keling.app.ui.screens.agent

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.lifecycle.*
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.keling.app.network.NoteData
import com.keling.app.network.TaskData
import com.keling.app.network.AssistantContextRef
import com.keling.app.ui.components.*
import kotlinx.coroutines.delay

private val avatarNames = listOf("星芽导师", "赤狐探索者", "星猫领航员", "月兔园丁", "星光伙伴", "音乐机器人", "薄荷宇航员", "珊瑚宇航员", "行星芽芽")
@Composable
fun CloudWorkspaceScreen(accountId: String, token: String, initialTab: String = "home", onNavigate: (String) -> Unit,
    onAskAssistant: (AssistantContextRef, String) -> Unit) {
    val guest = com.keling.app.network.GuestWorkspaces.find(token)
    val vm: WorkspaceViewModel = viewModel(key = "workspace-$accountId-${token.hashCode()}", factory = object : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST") override fun <T : ViewModel> create(modelClass: Class<T>): T = WorkspaceViewModel(token) as T
    })
    val state by vm.state.collectAsStateWithLifecycle()
    var tab by rememberSaveable { mutableStateOf(initialTab) }
    LaunchedEffect(initialTab) { tab = initialTab; vm.refresh() }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(vm, lifecycle) { lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) { vm.refresh() } }
    var search by rememberSaveable { mutableStateOf("") }
    var editId by rememberSaveable { mutableStateOf<String?>(null) }; var editVersion by rememberSaveable { mutableStateOf<String?>(null) }
    var edit by rememberSaveable { mutableStateOf(false) }; var title by rememberSaveable { mutableStateOf("") }; var text by rememberSaveable { mutableStateOf("") }
    var deleteNote by remember { mutableStateOf<NoteData?>(null) }
    var courseName by rememberSaveable { mutableStateOf("") }
    var focus by remember { mutableStateOf<TaskData?>(null) }
    var complete by remember { mutableStateOf<TaskData?>(null) }; var minutes by rememberSaveable { mutableStateOf("25") }
    var acknowledgedSave by rememberSaveable(accountId, token) { mutableStateOf(state.savedRevision) }
    LaunchedEffect(state.savedRevision) { if (state.savedRevision > acknowledgedSave) edit = false; acknowledgedSave = state.savedRevision }
    fun editNote(note: NoteData?) { editId = note?.id; editVersion = note?.updatedAt; title = note?.title.orEmpty(); text = note?.content.orEmpty(); edit = true }
    StellarTheme { Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(Modifier.fillMaxSize()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                StellarArt("title_logo", "课灵", Modifier.width(124.dp).height(58.dp)); Spacer(Modifier.weight(1f))
                TextButton(onClick = vm::refresh, enabled = !state.busy) { Text(if (state.busy) "同步中" else if (guest != null) "刷新本次数据" else "刷新共享数据") }
            }
            if (initialTab == "home" || initialTab == "notes") ScrollableTabRow(selectedTabIndex = listOf("home", "greenhouse", "tasks", "notes", "profile").indexOf(tab).coerceAtLeast(0), edgePadding = 4.dp) {
                listOf("home" to "总览", "greenhouse" to "课程", "tasks" to "任务", "notes" to "笔记", "profile" to "我的").forEach { (id, label) -> Tab(selected = tab == id, onClick = { tab = id }, text = { Text(label) }) }
            }
            LazyColumn(Modifier.weight(1f).padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(vertical = 12.dp)) {
                state.error?.let { message -> item { Text(message, color = MaterialTheme.colorScheme.error) } }
                state.notice?.let { message -> item { Text(message, color = MaterialTheme.colorScheme.primary) } }
                if (tab == "home") {
                    item { StellarSceneCard("station_full", "你好，${state.profile?.name ?: "探索者"}", "把每一天的学习，连成自己的星图。手机随身学习，网页整理资料。") }
                    item { Box { StellarArt("checkin_frame", null, Modifier.matchParentSize(), androidx.compose.ui.layout.ContentScale.FillBounds); Column(Modifier.fillMaxWidth().padding(horizontal = 30.dp, vertical = 38.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("今日星际补给", style = MaterialTheme.typography.titleMedium)
                        Text("${state.courses.size} 门课程 · ${state.tasks.count { it.status == "PENDING" || it.status == "IN_PROGRESS" }} 个待办 · ${state.notes.size} 篇笔记")
                        StellarActionButton(text = if (state.checkin?.hasCheckedInToday == true) "今日已签到" else if (guest != null) "签到领取补给" else "签到 · 与网页同步", onClick = vm::checkin, enabled = !state.busy && state.checkin != null && state.checkin?.hasCheckedInToday != true)
                        Text("学习日统一采用北京时间", style = MaterialTheme.typography.labelSmall)
                    } } }
                    item { Card { Column {
                        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            StellarArt("mascot_mentor", "星际导师", Modifier.size(76.dp))
                            Text("带着课程、任务或笔记提问，先核对资料，再开始讨论。", Modifier.weight(1f).padding(start = 12.dp))
                        }
                        Button(onClick = { onNavigate("ai") }, modifier = Modifier.fillMaxWidth().padding(12.dp)) { Text("进入星际 AI 助手 →") }
                    } } }
                    item { OutlinedButton(onClick = { onNavigate("cloud_agent") }, modifier = Modifier.fillMaxWidth()) { Text(if (guest != null) "智能编排 · 本次学习计划" else "华为云 AgentArts · 智能编排") } }
                    item { Text("继续一项学习", style = MaterialTheme.typography.titleMedium) }
                    if (state.tasks.none { it.status == "PENDING" || it.status == "IN_PROGRESS" }) item { Card { Column(Modifier.fillMaxWidth().padding(16.dp)) { Text("下一段航程，由你开启", style = MaterialTheme.typography.titleMedium); Text("选一个想理解的问题，给它一段专注时间。可在智能编排中准备下一份计划。") } } }
                    items(state.tasks.filter { it.status == "PENDING" || it.status == "IN_PROGRESS" }.take(3), key = { it.id }) { task -> WorkspaceTaskCard(task, state.busy, { focus = task }, { complete = task; minutes = task.estimatedMinutes.toString() }, { onAskAssistant(AssistantContextRef("task", task.id), "请基于这项任务解释目标，拆解可执行步骤，并提醒我需要先掌握的知识。") }) }
                }
                if (tab == "greenhouse") {
                    item { StellarSceneCard("scene_garden", if (guest != null) "本次知识星球" else "共享知识星球", "创建课程后，前往智能编排添加知识点与学习资料。") }
                    item { Row(verticalAlignment = Alignment.CenterVertically) { OutlinedTextField(value = courseName, onValueChange = { courseName = it.take(100) }, label = { Text("新课程名称") }, modifier = Modifier.weight(1f)); TextButton(onClick = { vm.createCourse(courseName) }, enabled = !state.busy && courseName.isNotBlank()) { Text("添加") } } }
                    items(state.courses, key = { it.id }) { course -> Card { Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        StellarSprite("subjects", subjectIndex(course.name), "学科", Modifier.size(60.dp)); Column(Modifier.weight(1f).padding(start = 12.dp)) { Text(course.name, style = MaterialTheme.typography.titleMedium); Text("已学 ${course.totalStudyMinutes} 分钟", style = MaterialTheme.typography.bodySmall)
                            TextButton(onClick = { onAskAssistant(AssistantContextRef("course", course.id), "请根据这门课程当前可用的资料梳理核心概念，并用一个问题检查我的理解。") }, enabled = !state.busy) { Text("围绕课程问 AI") }
                        }
                    } } }
                    item { Button(onClick = { onNavigate("cloud_agent") }, modifier = Modifier.fillMaxWidth()) { Text("管理课程资料与生成计划") } }
                }
                if (tab == "tasks") {
                    item { StellarSceneCard("scene_focus", if (guest != null) "本次任务 · 随身专注" else "共享任务 · 随身专注", if (guest != null) "计时、学习时长与奖励只保留在本次试用中。" else "专注计时保留在当前设备；确认完成后，学习时长与奖励同步到账号。") }
                    items(state.tasks, key = { it.id }) { task -> WorkspaceTaskCard(task, state.busy, { focus = task }, { complete = task; minutes = task.estimatedMinutes.toString() }, { onAskAssistant(AssistantContextRef("task", task.id), "请基于这项任务解释目标，拆解可执行步骤，并提醒我需要先掌握的知识。") }) }
                    if (state.tasks.isEmpty()) item { Text(if (guest != null) "还没有本次任务，可在智能编排确认计划，或到临时田园空间创建任务。" else "还没有云端任务，可在智能编排确认计划，或在网页创建任务。") }
                }
                if (tab == "notes") {
                    item { StellarSceneCard("scene_archive", if (guest != null) "本次知识档案室" else "共享知识档案室", "整理资料、保存理解。已保存笔记可先预览，再交给 AI 一起讨论。") }
                    item { Row(verticalAlignment = Alignment.CenterVertically) { Text(if (guest != null) "本次笔记" else "共享笔记", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.weight(1f)); Button(onClick = { editNote(null) }) { Text("新建") } } }
                    item { OutlinedTextField(value = search, onValueChange = { search = it }, label = { Text("搜索标题或正文") }, modifier = Modifier.fillMaxWidth()) }
                    items(state.notes.filter { it.title.contains(search, true) || it.content.contains(search, true) }, key = { it.id }) { note -> Card { Column(Modifier.fillMaxWidth().padding(16.dp)) {
                        Text(note.title, style = MaterialTheme.typography.titleMedium); SelectionContainer { Text(note.content.take(600), Modifier.padding(vertical = 8.dp)) }
                        Row { TextButton(onClick = { editNote(note) }, enabled = !state.busy) { Text("查看 / 编辑") }; TextButton(onClick = { deleteNote = note }, enabled = !state.busy) { Text("删除") } }
                        TextButton(onClick = { onAskAssistant(AssistantContextRef("note", note.id), "请基于这篇已保存的笔记解释核心概念，指出值得核实的地方，并用一个问题检查我的理解。") }, enabled = !state.busy && !edit) { Text("基于已保存笔记问 AI") }
                    } } }
                    if (state.notes.isEmpty()) item { Text(if (guest != null) "新建笔记或保存 AI 回答，内容在本次试用各模块可用。" else "给每一次理解留一个坐标：网页笔记与保存的 AI 回答会显示在这里。") }
                }
                if (tab == "profile") {
                    item { StellarSceneCard("scene_profile", "我的星际身份舱", "选择陪伴你的探索形象，查看账户中真实累积的学习记录。") }
                    item { Row(verticalAlignment = Alignment.CenterVertically) { StellarSprite("avatars", state.profile?.avatarUrl?.substringAfterLast('-')?.toIntOrNull() ?: 0, "当前头像", Modifier.size(80.dp)); Column(Modifier.padding(start = 16.dp)) { Text(state.profile?.name.orEmpty(), style = MaterialTheme.typography.titleLarge); Text("Lv.${state.profile?.level ?: 1} · 累计 ${state.profile?.totalStudyMinutes ?: 0} 分钟"); Text("能量 ${state.profile?.energy ?: 0} · 结晶 ${state.profile?.crystals ?: 0}") } } }
                    item { Text(if (guest != null) "选择星际头像 · 本次有效" else "选择星际头像 · 两端同步", style = MaterialTheme.typography.titleMedium) }
                    items((0..2).toList()) { row -> Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) { (0..2).forEach { col -> val index = row * 3 + col; TextButton(onClick = { vm.avatar(index) }, enabled = !state.busy) { Column(horizontalAlignment = Alignment.CenterHorizontally) { StellarSprite("avatars", index, avatarNames[index], Modifier.size(70.dp)); Text(avatarNames[index], style = MaterialTheme.typography.labelSmall) } } } } }
                    item { OutlinedButton(onClick = { onNavigate("settings") }, modifier = Modifier.fillMaxWidth()) { Text(if (guest != null) "应用设置与退出试用" else "应用设置与退出登录") } }
                    item { TextButton(onClick = { onNavigate("offline_home") }) { Text(if (guest != null) "打开临时田园空间" else "打开原有本机田园数据") }; Text(if (guest != null) "临时田园空间提供原有课程、知识图谱、任务、笔记、课表、签到、成就与报告功能，独立保留本次内存，不读取已有账号资料。" else "旧版离线资料保留在本机，云端空间使用共享账号数据。", style = MaterialTheme.typography.bodySmall) }
                }
            }
        }
        if (edit) AlertDialog(onDismissRequest = { if (!state.busy) edit = false }, title = { Text(if (editId == null) if (guest != null) "新建本次笔记" else "新建共享笔记" else if (guest != null) "编辑本次笔记" else "编辑共享笔记") }, text = {
            Column { OutlinedTextField(value = title, onValueChange = { title = it.take(180) }, label = { Text("标题") }); OutlinedTextField(value = text, onValueChange = { text = it.take(50000) }, label = { Text("正文") }, modifier = Modifier.heightIn(min = 140.dp, max = 300.dp)); Text("先保存并关闭，再从笔记卡片问 AI。未保存草稿不会发送给模型。", style = MaterialTheme.typography.bodySmall); state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) } }
        }, confirmButton = { TextButton(onClick = { vm.saveNote(editId, title, text, editVersion) }, enabled = !state.busy && title.isNotBlank() && text.isNotBlank()) { Text("保存") } }, dismissButton = { TextButton(onClick = { edit = false }, enabled = !state.busy) { Text("关闭") } })
        deleteNote?.let { note -> AlertDialog(onDismissRequest = { deleteNote = null }, title = { Text(if (guest != null) "删除本次笔记？" else "删除共享笔记？") }, text = { Text(if (guest != null) "从本次试用移除《${note.title}》。" else "两端都会移除《${note.title}》。") }, confirmButton = { TextButton(onClick = { deleteNote = null; vm.deleteNote(note.id) }) { Text("删除") } }, dismissButton = { TextButton(onClick = { deleteNote = null }) { Text("取消") } }) }
        complete?.let { task -> AlertDialog(onDismissRequest = { complete = null }, title = { Text("确认完成：${task.title}") }, text = { OutlinedTextField(value = minutes, onValueChange = { minutes = it.filter(Char::isDigit).take(4) }, label = { Text("实际学习分钟（0–1440）") }) }, confirmButton = { TextButton(onClick = { minutes.toIntOrNull()?.takeIf { it in 0..1440 }?.let { vm.complete(task.id, it); complete = null } }, enabled = !state.busy && minutes.toIntOrNull()?.let { it in 0..1440 } == true) { Text(if (guest != null) "保存本次完成记录" else "同步完成记录") } }, dismissButton = { TextButton(onClick = { complete = null }) { Text("取消") } }) }
        focus?.let { task -> FocusDialog(task, onDismiss = { focus = null }, onComplete = { actual -> focus = null; complete = task; minutes = actual.toString() }) }
    } }
}
@Composable private fun WorkspaceTaskCard(task: TaskData, busy: Boolean, focus: () -> Unit, complete: () -> Unit, askAssistant: () -> Unit) {
    Card { Column(Modifier.fillMaxWidth().padding(16.dp)) { Text(task.title, style = MaterialTheme.typography.titleMedium); Text(task.description.take(300), style = MaterialTheme.typography.bodySmall); Text("预计 ${task.estimatedMinutes} 分钟 · ${if (task.status == "COMPLETED") "已完成" else if (task.status == "ABANDONED") "已放弃" else "待完成"}")
        if (task.status == "PENDING" || task.status == "IN_PROGRESS") Row { TextButton(onClick = focus, enabled = !busy) { Text("开始专注") }; TextButton(onClick = complete, enabled = !busy) { Text("确认完成") } }
        TextButton(onClick = askAssistant, enabled = !busy) { Text("请 AI 帮我理解任务") }
    } }
}
@Composable private fun FocusDialog(task: TaskData, onDismiss: () -> Unit, onComplete: (Int) -> Unit) {
    val total = task.estimatedMinutes.coerceIn(1, 480) * 60000L
    var remaining by rememberSaveable(task.id) { mutableStateOf(total) }; var deadline by rememberSaveable(task.id) { mutableStateOf(android.os.SystemClock.elapsedRealtime() + total) }; var active by rememberSaveable(task.id) { mutableStateOf(true) }
    val view = LocalView.current
    DisposableEffect(view, active) { val previous = view.keepScreenOn; view.keepScreenOn = active; onDispose { view.keepScreenOn = previous } }
    LaunchedEffect(active, deadline) { while (active && remaining > 0) { remaining = (deadline - android.os.SystemClock.elapsedRealtime()).coerceAtLeast(0); delay(500) }; if (remaining == 0L) active = false }
    AlertDialog(onDismissRequest = onDismiss, title = { Text(task.title) }, text = { Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
        Box(Modifier.size(230.dp), contentAlignment = Alignment.Center) { StellarArt("timer_frame", null, Modifier.fillMaxSize()); Text("%02d:%02d".format(remaining / 60000, remaining / 1000 % 60), modifier = Modifier.padding(top = 18.dp), style = MaterialTheme.typography.displaySmall) }
        Text("专注期间保持屏幕唤醒；完成后由你确认同步。", style = MaterialTheme.typography.bodySmall)
        TextButton(onClick = { if (active) { remaining = (deadline - android.os.SystemClock.elapsedRealtime()).coerceAtLeast(0); active = false } else { deadline = android.os.SystemClock.elapsedRealtime() + remaining; active = true } }, enabled = remaining > 0) { Text(if (active) "暂停" else "继续") }
    } }, confirmButton = { TextButton(onClick = { onComplete(((total - remaining) / 60000).toInt()) }) { Text("结束并确认时长") } }, dismissButton = { TextButton(onClick = onDismiss) { Text("关闭计时") } })
}
private fun subjectIndex(name: String): Int = when {
    name.contains("数学") || name.contains("高数") || name.contains("线性") -> 0; name.contains("物理") -> 1; name.contains("化学") -> 2; name.contains("生物") -> 3
    name.contains("计算") || name.contains("程序") || name.contains("算法") || name.contains("数据结构") -> 4; name.contains("语") -> 5
    name.contains("历史") -> 6; name.contains("地理") -> 7; else -> 8
}
