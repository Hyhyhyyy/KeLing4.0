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
    var legacyPreview by remember { mutableStateOf(false) }

    var deleteNote by remember { mutableStateOf<NoteData?>(null) }
    var courseName by rememberSaveable { mutableStateOf("") }
    var newPlanet by rememberSaveable { mutableStateOf(0) }
    var planetPickerOpen by rememberSaveable { mutableStateOf(false) }
    var planetCourseId by rememberSaveable { mutableStateOf<String?>(null) }
    var planetDraft by rememberSaveable { mutableStateOf(0) }
    var focus by remember { mutableStateOf<TaskData?>(null) }
    var complete by remember { mutableStateOf<TaskData?>(null) }; var minutes by rememberSaveable { mutableStateOf("25") }
    val pageScroll = androidx.compose.foundation.lazy.rememberLazyListState()
    LaunchedEffect(focus?.id, complete?.id) { if (focus != null || complete != null) pageScroll.animateScrollToItem(0) }
    var acknowledgedSave by rememberSaveable(accountId, token) { mutableStateOf(state.savedRevision) }
    LaunchedEffect(state.savedRevision) { if (state.savedRevision > acknowledgedSave) edit = false; acknowledgedSave = state.savedRevision }
    fun editNote(note: NoteData?) { editId = note?.id; editVersion = note?.updatedAt; title = note?.title.orEmpty(); text = note?.content.orEmpty(); edit = true }
    StellarTheme { Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(Modifier.fillMaxSize()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                StellarArt("title_logo", "课灵", Modifier.width(124.dp).height(58.dp)); Spacer(Modifier.weight(1f))
                TextButton(onClick = vm::refresh, enabled = !state.busy) { Text(if (state.busy) "同步中" else "刷新") }
            }
            if (initialTab == "notes") ScrollableTabRow(selectedTabIndex = listOf("home", "greenhouse", "tasks", "notes", "profile").indexOf(tab).coerceAtLeast(0), edgePadding = 4.dp) {
                listOf("home" to "总览", "greenhouse" to "课程", "tasks" to "任务", "notes" to "笔记", "profile" to "我的").forEach { (id, label) -> Tab(selected = tab == id, onClick = { tab = id }, text = { Text(label) }) }
            }
            LazyColumn(Modifier.weight(1f).padding(horizontal = 16.dp), state = pageScroll, verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(vertical = 12.dp)) {
                item { StellarHeading(when (tab) { "greenhouse" -> "课程"; "tasks" -> "任务与专注"; "notes" -> "笔记"; "profile" -> "个人资料"; else -> "学习工作台" }, mascot = when (tab) { "greenhouse" -> 3; "tasks" -> 5; "notes" -> 4; "profile" -> 7; else -> 0 }) }
                state.error?.let { message -> item { Text(message, color = MaterialTheme.colorScheme.error) } }
                state.notice?.let { message -> item { Text(message, color = MaterialTheme.colorScheme.primary) } }
                focus?.let { task -> item {
                    FocusPanel(task, onDismiss = { focus = null }, onComplete = { actual -> focus = null; complete = task; minutes = actual.toString() })
                } }
                complete?.let { task -> item {
                    Card { Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("确认完成：${task.title}", style = MaterialTheme.typography.titleLarge)
                        OutlinedTextField(value = minutes, onValueChange = { minutes = it.filter(Char::isDigit).take(4) }, label = { Text("实际学习分钟（0–1440）") }, modifier = Modifier.fillMaxWidth())
                        Button(onClick = { minutes.toIntOrNull()?.takeIf { it in 0..1440 }?.let { vm.complete(task.id, it); complete = null } }, enabled = !state.busy && minutes.toIntOrNull()?.let { it in 0..1440 } == true) { Text("保存记录") }
                        TextButton(onClick = { complete = null }) { Text("取消") }
                    } }
                } }
                if (tab == "home") {
                    item { Card { Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        StellarSectionTitle("学习工具箱", motif = 3)
                        UsageGuideButton(Modifier.fillMaxWidth())
                        listOf("greenhouse" to "课程", "tasks" to "任务与专注", "notes" to "笔记", "ai" to "AI 助手", "cloud_agent" to "智能编排", "report" to "学习报告", "achievements" to "学习成就").forEach { (route, label) ->
                            OutlinedButton(onClick = { onNavigate(route) }, modifier = Modifier.fillMaxWidth()) { Text(label) }
                        }
                    } } }
                    item { StellarSceneCard("station_full", "你好，${state.profile?.name ?: "探索者"}", "") }
                    item { Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) { Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        StellarSectionTitle("今日学习", motif = 0)
                        Text("${state.courses.size} 门课程 · ${state.tasks.count { it.status == "PENDING" || it.status == "IN_PROGRESS" }} 个待办 · ${state.notes.size} 篇笔记")
                        StellarActionButton(text = if (state.checkin?.hasCheckedInToday == true) "今日已签到" else if (guest != null) "记录今日到访" else "签到", onClick = vm::checkin, enabled = !state.busy && state.checkin != null && state.checkin?.hasCheckedInToday != true)
                    } } }
                    item { Card { Column {
                        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            StellarArt("mascot_mentor", "星际导师", Modifier.size(76.dp))
                            Text("星芽 AI 助手", Modifier.weight(1f).padding(start = 12.dp))
                        }
                        Button(onClick = { onNavigate("ai") }, modifier = Modifier.fillMaxWidth().padding(12.dp)) { Text("问星芽") }
                    } } }
                    item { OutlinedButton(onClick = { onNavigate("cloud_agent") }, modifier = Modifier.fillMaxWidth()) { Text("智能编排") } }
                    item { StellarSectionTitle("继续一项学习", motif = 3) }
                    if (state.tasks.none { it.status == "PENDING" || it.status == "IN_PROGRESS" }) item { Card { Column(Modifier.fillMaxWidth().padding(16.dp)) { Text("暂无待办", style = MaterialTheme.typography.titleMedium) } } }
                    items(state.tasks.filter { it.status == "PENDING" || it.status == "IN_PROGRESS" }.take(3), key = { it.id }) { task -> WorkspaceTaskCard(task, state.busy, { focus = task }, { complete = task; minutes = task.estimatedMinutes.toString() }, { onAskAssistant(AssistantContextRef("task", task.id), "请基于这项任务解释目标，拆解可执行步骤，并提醒我需要先掌握的知识。") }) }
                }
                if (tab == "greenhouse") {
                    item { StellarSceneCard("scene_garden", "课程", "") }
                    item { Card { Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(value = courseName, onValueChange = { courseName = it.take(100) }, label = { Text("新课程名称") }, modifier = Modifier.fillMaxWidth(), enabled = !state.busy, singleLine = true)
                        OutlinedButton(onClick = { planetCourseId = null; planetDraft = newPlanet; planetPickerOpen = true }, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) {
                            CoursePlanetArt(newPlanet, Modifier.size(52.dp), description = null)
                            Text("${com.keling.app.data.PlanetStyles.name(newPlanet)} · 选择星球", Modifier.padding(start = 8.dp))
                        }
                        Button(onClick = { vm.createCourse(courseName, newPlanet) { courseName = "" } }, enabled = !state.busy && courseName.isNotBlank(), modifier = Modifier.fillMaxWidth()) { Text("创建知识星球") }
                    } } }
                    items(state.courses, key = { it.id }) { course -> Card { Column(Modifier.fillMaxWidth().padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            CoursePlanetArt(course.planetStyleIndex, Modifier.size(84.dp))
                            Column(Modifier.weight(1f).padding(start = 12.dp)) {
                                Text(course.name, style = MaterialTheme.typography.titleMedium)
                                Text(com.keling.app.data.PlanetStyles.name(course.planetStyleIndex), style = MaterialTheme.typography.labelMedium)
                                Text("已学 ${course.totalStudyMinutes} 分钟", style = MaterialTheme.typography.bodySmall)
                            }
                        }
                        OutlinedButton(onClick = { planetCourseId = course.id; planetDraft = course.planetStyleIndex; planetPickerOpen = true }, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) { Text("更换星球形象") }
                        TextButton(onClick = { onAskAssistant(AssistantContextRef("course", course.id), "请根据这门课程当前可用的资料梳理核心概念，并用一个问题检查我的理解。") }, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) { Text("问 AI") }
                    } } }
                    item { Button(onClick = { onNavigate("cloud_agent") }, modifier = Modifier.fillMaxWidth()) { Text("课程资料与计划") } }
                }
                if (tab == "tasks") {
                    item { StellarSceneCard("scene_focus", "任务与专注", "") }
                    items(state.tasks, key = { it.id }) { task -> WorkspaceTaskCard(task, state.busy, { focus = task }, { complete = task; minutes = task.estimatedMinutes.toString() }, { onAskAssistant(AssistantContextRef("task", task.id), "请基于这项任务解释目标，拆解可执行步骤，并提醒我需要先掌握的知识。") }) }
                    if (state.tasks.isEmpty()) item { Text("暂无任务") }
                }
                if (tab == "notes") {
                    item { StellarSceneCard("scene_archive", "笔记", "") }
                    item { Row(verticalAlignment = Alignment.CenterVertically) { StellarSectionTitle("全部笔记", motif = 2, modifier = Modifier.weight(1f)); Button(onClick = { editNote(null) }) { Text("新建") } } }
                    item { OutlinedTextField(value = search, onValueChange = { search = it }, label = { Text("搜索标题或正文") }, modifier = Modifier.fillMaxWidth()) }
                    items(state.notes.filter { it.title.contains(search, true) || it.content.contains(search, true) }, key = { it.id }) { note -> Card { Column(Modifier.fillMaxWidth().padding(16.dp)) {
                        Text(note.title, style = MaterialTheme.typography.titleMedium); SelectionContainer { Text(note.content.take(600), Modifier.padding(vertical = 8.dp)) }
                        Row { TextButton(onClick = { editNote(note) }, enabled = !state.busy) { Text("查看 / 编辑") }; TextButton(onClick = { deleteNote = note }, enabled = !state.busy) { Text("删除") } }
                        TextButton(onClick = { onAskAssistant(AssistantContextRef("note", note.id), "请基于这篇已保存的笔记解释核心概念，指出值得核实的地方，并用一个问题检查我的理解。") }, enabled = !state.busy && !edit) { Text("问 AI") }
                    } } }
                    if (state.notes.isEmpty()) item { Text("暂无笔记") }
                }
                if (tab == "profile") {
                    item { StellarSceneCard("scene_profile", "个人资料", "") }
                    item { Row(verticalAlignment = Alignment.CenterVertically) { StellarSprite("avatars", state.profile?.avatarUrl?.substringAfterLast('-')?.toIntOrNull() ?: 0, "当前头像", Modifier.size(80.dp)); Column(Modifier.padding(start = 16.dp)) { Text(state.profile?.name.orEmpty(), style = MaterialTheme.typography.titleLarge); Text("Lv.${state.profile?.level ?: 1} · 累计 ${state.profile?.totalStudyMinutes ?: 0} 分钟"); Text("历史能量 ${state.profile?.energy ?: 0} · 结晶 ${state.profile?.crystals ?: 0}") } } }
                    item { StellarSectionTitle("选择头像", motif = 1) }
                    items((0..2).toList()) { row -> Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) { (0..2).forEach { col -> val index = row * 3 + col; TextButton(onClick = { vm.avatar(index) }, enabled = !state.busy) { Column(horizontalAlignment = Alignment.CenterHorizontally) { StellarSprite("avatars", index, avatarNames[index], Modifier.size(70.dp)); Text(avatarNames[index], style = MaterialTheme.typography.labelSmall) } } } } }
                    item { OutlinedButton(onClick = { onNavigate("settings") }, modifier = Modifier.fillMaxWidth()) { Text("设置") } }
                    if (legacyPreview && guest == null) item { com.keling.app.expedition.LegacyPreviewCard(accountId, state.profile) { legacyPreview = false } }
                    if (guest == null) item { OutlinedButton(onClick = { legacyPreview = !legacyPreview }, modifier = Modifier.fillMaxWidth()) { Text("历史资料") } }
                    item { TextButton(onClick = { onNavigate("offline_home") }) { Text("本地空间") } }
                }
            }
        }
        if (planetPickerOpen) PlanetPickerDialog(
            title = if (planetCourseId == null) "选择星球" else "更换星球形象",
            selectedIndex = planetDraft, onSelected = { planetDraft = it }, busy = state.busy,
            error = if (planetCourseId != null) state.error else null,
            description = "",
            onConfirm = {
                val id = planetCourseId
                if (id == null) { newPlanet = planetDraft; planetPickerOpen = false }
                else vm.updatePlanet(id, planetDraft) { planetPickerOpen = false }
            }, onDismiss = { planetPickerOpen = false }
        )
        if (edit) AlertDialog(onDismissRequest = { if (!state.busy) edit = false }, title = { Text(if (editId == null) "新建笔记" else "编辑笔记") }, text = {
            Column { OutlinedTextField(value = title, onValueChange = { title = it.take(180) }, label = { Text("标题") }); OutlinedTextField(value = text, onValueChange = { text = it.take(50000) }, label = { Text("正文") }, modifier = Modifier.heightIn(min = 140.dp, max = 300.dp)); state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) } }
        }, confirmButton = { TextButton(onClick = { vm.saveNote(editId, title, text, editVersion) }, enabled = !state.busy && title.isNotBlank() && text.isNotBlank()) { Text("保存") } }, dismissButton = { TextButton(onClick = { edit = false }, enabled = !state.busy) { Text("关闭") } })
        deleteNote?.let { note -> AlertDialog(onDismissRequest = { deleteNote = null }, title = { Text("删除笔记？") }, text = { Text(if (guest != null) "从本次试用移除《${note.title}》。" else "两端都会移除《${note.title}》。") }, confirmButton = { TextButton(onClick = { deleteNote = null; vm.deleteNote(note.id) }) { Text("删除") } }, dismissButton = { TextButton(onClick = { deleteNote = null }) { Text("取消") } }) }
    } }
}
@Composable private fun WorkspaceTaskCard(task: TaskData, busy: Boolean, focus: () -> Unit, complete: () -> Unit, askAssistant: () -> Unit) {
    Card { Column(Modifier.fillMaxWidth().padding(16.dp)) { Text(task.title, style = MaterialTheme.typography.titleMedium); Text(task.description.take(300), style = MaterialTheme.typography.bodySmall); Text("预计 ${task.estimatedMinutes} 分钟 · ${if (task.status == "COMPLETED") "已完成" else if (task.status == "ABANDONED") "已放弃" else "待完成"}")
        if (task.status == "PENDING" || task.status == "IN_PROGRESS") Row { TextButton(onClick = focus, enabled = !busy) { Text("开始专注") }; TextButton(onClick = complete, enabled = !busy) { Text("确认完成") } }
        TextButton(onClick = askAssistant, enabled = !busy) { Text("问 AI") }
    } }
}
@Composable private fun FocusPanel(task: TaskData, onDismiss: () -> Unit, onComplete: (Int) -> Unit) {
    val total = task.estimatedMinutes.coerceIn(1, 480) * 60000L
    var remaining by rememberSaveable(task.id) { mutableStateOf(total) }; var deadline by rememberSaveable(task.id) { mutableStateOf(android.os.SystemClock.elapsedRealtime() + total) }; var active by rememberSaveable(task.id) { mutableStateOf(true) }
    val view = LocalView.current
    DisposableEffect(view, active) { val previous = view.keepScreenOn; view.keepScreenOn = active; onDispose { view.keepScreenOn = previous } }
    LaunchedEffect(active, deadline) { while (active && remaining > 0) { remaining = (deadline - android.os.SystemClock.elapsedRealtime()).coerceAtLeast(0); delay(500) }; if (remaining == 0L) active = false }
    Card { Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth().padding(16.dp)) {
        Text(task.title, style = MaterialTheme.typography.titleLarge)
        Box(Modifier.size(230.dp), contentAlignment = Alignment.Center) { StellarArt("timer_frame", null, Modifier.fillMaxSize()); Text("%02d:%02d".format(remaining / 60000, remaining / 1000 % 60), modifier = Modifier.padding(top = 18.dp), style = MaterialTheme.typography.displaySmall) }
        TextButton(onClick = { if (active) { remaining = (deadline - android.os.SystemClock.elapsedRealtime()).coerceAtLeast(0); active = false } else { deadline = android.os.SystemClock.elapsedRealtime() + remaining; active = true } }, enabled = remaining > 0) { Text(if (active) "暂停" else "继续") }
        Button(onClick = { onComplete(((total - remaining) / 60000).toInt()) }) { Text("结束并确认时长") }
        TextButton(onClick = onDismiss) { Text("关闭计时") }
    } }
}
