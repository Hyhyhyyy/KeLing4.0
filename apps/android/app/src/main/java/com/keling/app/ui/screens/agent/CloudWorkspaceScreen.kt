package com.keling.app.ui.screens.agent

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import com.keling.app.planet.GeneratedPlanetArt
import com.keling.app.ui.components.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.Dispatchers

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
    var createTask by rememberSaveable { mutableStateOf(false) }
    var taskTitle by rememberSaveable { mutableStateOf("") }
    var taskDescription by rememberSaveable { mutableStateOf("") }
    var taskMinutes by rememberSaveable { mutableStateOf("25") }
    var taskCourseId by rememberSaveable { mutableStateOf<String?>(null) }
    var taskCourseMenu by remember { mutableStateOf(false) }
    var deletingTask by remember { mutableStateOf<TaskData?>(null) }
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
    val context = androidx.compose.ui.platform.LocalContext.current
    val fileScope = rememberCoroutineScope()
    var fileBusy by remember { mutableStateOf(false) }
    var fileMessage by remember { mutableStateOf<String?>(null) }
    var exportingNote by remember { mutableStateOf<NoteData?>(null) }
    val exportNote = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/plain")) { uri ->
        val note = exportingNote; exportingNote = null
        if (uri != null && note != null) fileScope.launch {
            fileBusy = true
            try {
                withContext(Dispatchers.IO) { context.contentResolver.openOutputStream(uri, "wt")?.use { it.write(note.content.toByteArray(Charsets.UTF_8)) } ?: error("无法写入文件") }
                fileMessage = "笔记已导出"
            } catch (e: kotlinx.coroutines.CancellationException) { throw e }
            catch (e: Exception) { fileMessage = e.message ?: "导出失败，请重试" }
            finally { fileBusy = false }
        }
    }
    val importNote = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> if (uri != null) fileScope.launch {
        fileBusy = true
        try {
            val imported = withContext(Dispatchers.IO) {
                val name = context.contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) c.getString(0) else "导入笔记" } ?: "导入笔记"
                val body = context.contentResolver.openInputStream(uri)?.use { input ->
                    val output = java.io.ByteArrayOutputStream(); val buffer = ByteArray(8192)
                    while (true) { val count = input.read(buffer); if (count < 0) break; require(output.size() + count <= 200000) { "文件过大，请拆分后导入" }; output.write(buffer, 0, count) }
                    val decoder = Charsets.UTF_8.newDecoder().onMalformedInput(java.nio.charset.CodingErrorAction.REPORT)
                    decoder.decode(java.nio.ByteBuffer.wrap(output.toByteArray())).toString().removePrefix("\uFEFF")
                } ?: error("无法读取文件")
                require(body.isNotBlank() && body.length <= 50000) { "笔记正文需为 1–50000 字符" }
                name.substringBeforeLast('.').take(180) to body
            }
            editNote(null); title = imported.first; text = imported.second
            fileMessage = null
        } catch (e: kotlinx.coroutines.CancellationException) { throw e }
        catch (e: Exception) { fileMessage = if (e is java.nio.charset.CharacterCodingException) "请使用 UTF-8 编码的 TXT / MD 文件" else e.message ?: "导入失败，请重试" }
        finally { fileBusy = false }
    } }
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
                item { StellarHeading(when (tab) { "greenhouse" -> "课程"; "tasks" -> "任务与专注"; "notes" -> "笔记"; "profile" -> "个人资料"; "report" -> "学习报告"; "achievements" -> "学习成就"; else -> "学习工作台" }, mascot = when (tab) { "greenhouse" -> 3; "tasks" -> 5; "notes" -> 4; "profile" -> 7; else -> 0 }) }
                state.error?.let { message -> item { Text(message, color = MaterialTheme.colorScheme.error) } }
                state.notice?.let { message -> item { Text(message, color = MaterialTheme.colorScheme.primary) } }
                if (tab == "notes") fileMessage?.let { message -> item { Text(message) } }
                focus?.let { task -> item {
                    FocusPanel(task, onDismiss = { focus = null }, onComplete = { actual -> focus = null; complete = task; minutes = actual.toString() })
                } }
                complete?.let { task -> item {
                    Card { Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("确认完成：${task.title}", style = MaterialTheme.typography.titleLarge)
                        OutlinedTextField(value = minutes, onValueChange = { minutes = it.filter(Char::isDigit).take(4) }, label = { Text("实际学习分钟（0–1440）") }, modifier = Modifier.fillMaxWidth())
                        Button(onClick = { minutes.toIntOrNull()?.takeIf { it in 0..1440 }?.let { vm.complete(task.id, it) { complete = null } } }, enabled = !state.busy && minutes.toIntOrNull()?.let { it in 0..1440 } == true) { Text("保存记录") }
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
                    items(state.tasks.filter { it.status == "PENDING" || it.status == "IN_PROGRESS" }.take(3), key = { it.id }) { task -> WorkspaceTaskCard(task, state.busy, { focus = task }, { complete = task; minutes = "0" }, { onAskAssistant(AssistantContextRef("task", task.id), "请基于这项任务解释目标，拆解可执行步骤，并提醒我需要先掌握的知识。") }) }
                }
                if (tab == "greenhouse") {
                    item { StellarSceneCard("scene_garden", "课程", "") }
                    state.artworkError?.let { message -> item { Text(message, color = MaterialTheme.colorScheme.error) } }
                    item { Card { Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(value = courseName, onValueChange = { courseName = it.take(100) }, label = { Text("新课程名称") }, modifier = Modifier.fillMaxWidth(), enabled = !state.busy, singleLine = true)
                        OutlinedButton(onClick = { planetCourseId = null; planetDraft = newPlanet; planetPickerOpen = true }, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) {
                            CoursePlanetArt(newPlanet, Modifier.size(52.dp), description = null)
                            Text("${com.keling.app.data.PlanetStyles.name(newPlanet)} · 选择星球", Modifier.padding(start = 8.dp))
                        }
                        Button(onClick = { vm.createCourse(courseName, newPlanet) { courseName = "" } }, enabled = !state.busy && courseName.isNotBlank(), modifier = Modifier.fillMaxWidth()) { Text("创建知识星球") }
                    } } }
                    items(state.courses, key = { it.id }) { course -> Card { Column(Modifier.fillMaxWidth().padding(16.dp)) {
                        val learningPlanet = state.coursePlanets[course.id]
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            if (learningPlanet != null) GeneratedPlanetArt(learningPlanet.draft, Modifier.size(84.dp))
                            else if (course.code == "AI_PLANET") Box(Modifier.size(84.dp), contentAlignment = Alignment.Center) { Text("形象待同步", style = MaterialTheme.typography.labelSmall) }
                            else CoursePlanetArt(course.planetStyleIndex, Modifier.size(84.dp))
                            Column(Modifier.weight(1f).padding(start = 12.dp)) {
                                Text(course.name, style = MaterialTheme.typography.titleMedium)
                                if (learningPlanet == null && course.code != "AI_PLANET") Text(com.keling.app.data.PlanetStyles.name(course.planetStyleIndex), style = MaterialTheme.typography.labelMedium)
                                Text("已学 ${course.totalStudyMinutes} 分钟", style = MaterialTheme.typography.bodySmall)
                            }
                        }
                        if (learningPlanet != null) OutlinedButton(onClick = { onNavigate("planet:${learningPlanet.id}") }, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) { Text("查看学习星球") }
                        else if (course.code != "AI_PLANET") OutlinedButton(onClick = { planetCourseId = course.id; planetDraft = course.planetStyleIndex; planetPickerOpen = true }, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) { Text("更换星球形象") }
                        OutlinedButton(onClick = { onNavigate("cloud_graph:${course.id}") }, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) { Text("知识图谱") }
                        OutlinedButton(onClick = { onNavigate("course_materials:${course.id}") }, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) { Text("资料问答") }
                        TextButton(onClick = { onAskAssistant(AssistantContextRef("course", course.id), "请根据这门课程当前可用的资料梳理核心概念，并用一个问题检查我的理解。") }, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) { Text("问 AI") }
                    } } }
                    item { Button(onClick = { onNavigate("cloud_agent") }, modifier = Modifier.fillMaxWidth()) { Text("课程资料与计划") } }
                }
                if (tab == "tasks") {
                    item { StellarSceneCard("scene_focus", "任务与专注", "") }
                    item { Button(onClick = { createTask = true }, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) { Text("新建任务") } }
                    items(state.tasks, key = { it.id }) { task -> WorkspaceTaskCard(task, state.busy, { focus = task }, { complete = task; minutes = "0" }, { onAskAssistant(AssistantContextRef("task", task.id), "请基于这项任务解释目标，拆解可执行步骤，并提醒我需要先掌握的知识。") }, { deletingTask = task }) }
                    if (state.tasks.isEmpty()) item { Text("暂无任务") }
                }
                if (tab == "report") {
                    val completedTasks = state.tasks.filter { it.status == "COMPLETED" }
                    item { StellarSceneCard("scene_report", "学习足迹", "") }
                    item { Card { Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("当前任务已完成 ${completedTasks.size} / ${state.tasks.size}", style = MaterialTheme.typography.titleLarge)
                        Text("当前任务学习 ${completedTasks.sumOf { it.actualMinutes ?: 0 }} 分钟")
                        Text("累计学习 ${state.profile?.totalStudyMinutes ?: 0} 分钟")
                        Text("${state.courses.size} 门课程 · ${state.notes.size} 篇笔记")
                    } } }
                    item { StellarSectionTitle("完成记录", motif = 3) }
                    if (completedTasks.isEmpty()) item { Text("完成一项任务后，在这里回顾。") }
                    items(completedTasks.sortedByDescending { it.completedAt }, key = { it.id }) { task -> Card { Column(Modifier.fillMaxWidth().padding(16.dp)) {
                        Text(task.title, style = MaterialTheme.typography.titleMedium)
                        Text("${task.actualMinutes ?: 0} 分钟 · ${task.completedAt?.take(10).orEmpty()}")
                    } } }
                    item { OutlinedButton(onClick = { onNavigate("tasks") }, modifier = Modifier.fillMaxWidth()) { Text("继续学习") } }
                }
                if (tab == "achievements") {
                    val completedCount = state.tasks.count { it.status == "COMPLETED" }
                    val milestones = listOf(
                        Triple("初学者 · 完成任务", completedCount, 1),
                        Triple("任务达人 · 完成任务", completedCount, 10),
                        Triple("任务大师 · 完成任务", completedCount, 50),
                        Triple("星际探索者 · 课程", state.courses.size, 1),
                        Triple("笔记达人 · 笔记", state.notes.size, 5)
                    )
                    item { StellarSceneCard("scene_report", "当前学习成果", "") }
                    items(milestones, key = { it.first }) { (name, current, target) -> Card { Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        StellarSectionTitle(name, motif = if (current >= target) 0 else 2)
                        Text("${current.coerceAtMost(target)} / $target · ${if (current >= target) "已达成" else "继续积累"}")
                        LinearProgressIndicator(progress = (current.toFloat() / target).coerceIn(0f, 1f), modifier = Modifier.fillMaxWidth())
                    } } }
                    item { OutlinedButton(onClick = { onNavigate("report") }, modifier = Modifier.fillMaxWidth()) { Text("查看学习报告") } }
                }
                if (tab == "notes") {
                    item { StellarSceneCard("scene_archive", "笔记", "") }
                    item { Row(verticalAlignment = Alignment.CenterVertically) { StellarSectionTitle("全部笔记", motif = 2, modifier = Modifier.weight(1f)); Button(onClick = { editNote(null) }) { Text("新建") } } }
                    item { OutlinedButton(onClick = { importNote.launch(arrayOf("text/plain", "text/markdown")) }, enabled = !state.busy && !fileBusy) { Text("导入 TXT / MD") } }
                    item { OutlinedTextField(value = search, onValueChange = { search = it }, label = { Text("搜索标题或正文") }, modifier = Modifier.fillMaxWidth()) }
                    items(state.notes.filter { it.title.contains(search, true) || it.content.contains(search, true) }, key = { it.id }) { note -> Card { Column(Modifier.fillMaxWidth().padding(16.dp)) {
                        Text(note.title, style = MaterialTheme.typography.titleMedium); SelectionContainer { Text(note.content.take(600), Modifier.padding(vertical = 8.dp)) }
                        Row { TextButton(onClick = { editNote(note) }, enabled = !state.busy) { Text("查看 / 编辑") }; TextButton(onClick = { deleteNote = note }, enabled = !state.busy) { Text("删除") }; TextButton(onClick = { exportingNote = note; exportNote.launch(note.title.replace(Regex("[^\\p{L}\\p{N}_-]"), "_").take(80) + ".txt") }, enabled = !state.busy && !fileBusy) { Text("导出") } }
                        TextButton(onClick = { onAskAssistant(AssistantContextRef("note", note.id), "请基于这篇已保存的笔记解释核心概念，指出值得核实的地方，并用一个问题检查我的理解。") }, enabled = !state.busy && !edit) { Text("问 AI") }
                    } } }
                    if (state.notes.isEmpty()) item { Text("暂无笔记") }
                }
                if (tab == "profile") {
                    item { StellarSceneCard("scene_profile", "个人资料", "") }
                    item { Row(verticalAlignment = Alignment.CenterVertically) { if(state.profile?.avatarUrl?.startsWith("journey:avatar-")==true) com.keling.app.journey.JourneyArt("journey_avatars",state.profile?.avatarUrl?.substringAfterLast('-')?.toIntOrNull()?:0,"当前头像",Modifier.size(80.dp)) else StellarSprite("avatars", state.profile?.avatarUrl?.substringAfterLast('-')?.toIntOrNull() ?: 0, "当前头像", Modifier.size(80.dp)); Column(Modifier.padding(start = 16.dp)) { Text(state.profile?.name.orEmpty(), style = MaterialTheme.typography.titleLarge); Text("Lv.${state.profile?.level ?: 1} · 累计 ${state.profile?.totalStudyMinutes ?: 0} 分钟"); Text("历史能量 ${state.profile?.energy ?: 0} · 结晶 ${state.profile?.crystals ?: 0}") } } }
                    item { OutlinedButton(onClick = { onNavigate("profile") }, modifier = Modifier.fillMaxWidth()) { Text("更换形象与装扮") } }
                    item { OutlinedButton(onClick = { onNavigate("settings") }, modifier = Modifier.fillMaxWidth()) { Text("设置") } }
                    if (legacyPreview && guest == null) item { com.keling.app.expedition.LegacyPreviewCard(accountId, state.profile) { legacyPreview = false } }
                    if (guest == null) item { OutlinedButton(onClick = { legacyPreview = !legacyPreview }, modifier = Modifier.fillMaxWidth()) { Text("历史资料") } }
                    item { TextButton(onClick = { onNavigate("offline_home") }) { Text("本地空间") } }
                }
            }
        }
        if (createTask) AlertDialog(onDismissRequest = { if (!state.busy) createTask = false }, title = { Text("新建任务") }, text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(taskTitle, { taskTitle = it.take(180) }, label = { Text("任务标题") }, singleLine = true, enabled = !state.busy)
                OutlinedTextField(taskDescription, { taskDescription = it.take(4000) }, label = { Text("任务内容") }, minLines = 2, maxLines = 4, enabled = !state.busy)
                OutlinedTextField(taskMinutes, { taskMinutes = it.filter(Char::isDigit).take(4) }, label = { Text("预计分钟（1–1440）") }, singleLine = true, enabled = !state.busy)
                Box {
                    OutlinedButton(onClick = { taskCourseMenu = true }, enabled = !state.busy) { Text(state.courses.find { it.id == taskCourseId }?.name ?: "不关联课程") }
                    DropdownMenu(taskCourseMenu, { taskCourseMenu = false }) {
                        DropdownMenuItem(text = { Text("不关联课程") }, onClick = { taskCourseId = null; taskCourseMenu = false })
                        state.courses.forEach { course -> DropdownMenuItem(text = { Text(course.name) }, onClick = { taskCourseId = course.id; taskCourseMenu = false }) }
                    }
                }
                state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        }, confirmButton = { TextButton(onClick = {
            vm.createTask(com.keling.app.network.WorkspaceTaskInput(taskTitle.trim(), taskDescription, taskCourseId, taskMinutes.toInt())) {
                createTask = false; taskTitle = ""; taskDescription = ""; taskMinutes = "25"; taskCourseId = null
            }
        }, enabled = !state.busy && taskTitle.isNotBlank() && taskMinutes.toIntOrNull()?.let { it in 1..1440 } == true) { Text("创建") } }, dismissButton = { TextButton(onClick = { createTask = false }, enabled = !state.busy) { Text("取消") } })
        deletingTask?.let { task -> AlertDialog(onDismissRequest = { if (!state.busy) deletingTask = null }, title = { Text("删除任务？") }, text = {
            Column { Text(task.title); state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) } }
        }, confirmButton = { TextButton(onClick = { vm.deleteTask(task.id) { deletingTask = null } }, enabled = !state.busy) { Text("删除") } }, dismissButton = { TextButton(onClick = { deletingTask = null }, enabled = !state.busy) { Text("取消") } }) }
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
@Composable private fun WorkspaceTaskCard(task: TaskData, busy: Boolean, focus: () -> Unit, complete: () -> Unit, askAssistant: () -> Unit, delete: (() -> Unit)? = null) {
    Card { Column(Modifier.fillMaxWidth().padding(16.dp)) { Text(task.title, style = MaterialTheme.typography.titleMedium); Text(task.description.take(300), style = MaterialTheme.typography.bodySmall); Text("预计 ${task.estimatedMinutes} 分钟 · ${if (task.status == "COMPLETED") "已完成" else if (task.status == "ABANDONED") "已放弃" else "待完成"}")
        if (task.status == "PENDING" || task.status == "IN_PROGRESS") Row { TextButton(onClick = focus, enabled = !busy) { Text("开始专注") }; TextButton(onClick = complete, enabled = !busy) { Text("确认完成") } }
        Row { TextButton(onClick = askAssistant, enabled = !busy) { Text("问 AI") }; delete?.let { TextButton(onClick = it, enabled = !busy) { Text("删除") } } }
    } }
}
@Composable private fun FocusPanel(task: TaskData, onDismiss: () -> Unit, onComplete: (Int) -> Unit) {
    val total = task.estimatedMinutes.coerceIn(1, 480) * 60000L
    var remaining by rememberSaveable(task.id) { mutableStateOf(total) }; var deadline by rememberSaveable(task.id) { mutableStateOf(android.os.SystemClock.elapsedRealtime() + total) }; var active by rememberSaveable(task.id) { mutableStateOf(true) }
    val view = LocalView.current
    DisposableEffect(view, active) { val previous = view.keepScreenOn; view.keepScreenOn = active; onDispose { view.keepScreenOn = previous } }
    LaunchedEffect(active, deadline) { while (active && remaining > 0) { remaining = (deadline - android.os.SystemClock.elapsedRealtime()).coerceAtLeast(0); delay(500) }; if (remaining == 0L) active = false }
    Card { Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth().padding(16.dp)) {
        StellarSectionTitle("轨道计时器",motif=5)
        Text(task.title, style = MaterialTheme.typography.titleLarge)
        Box(Modifier.size(230.dp), contentAlignment = Alignment.Center) { StellarArt("timer_frame", null, Modifier.fillMaxSize()); Text("%02d:%02d".format(remaining / 60000, remaining / 1000 % 60), modifier = Modifier.padding(top = 18.dp), style = MaterialTheme.typography.displaySmall) }
        TextButton(onClick = { if (active) { remaining = (deadline - android.os.SystemClock.elapsedRealtime()).coerceAtLeast(0); active = false } else { deadline = android.os.SystemClock.elapsedRealtime() + remaining; active = true } }, enabled = remaining > 0) { Text(if (active) "暂停" else "继续") }
        Button(onClick = { onComplete(((total - remaining) / 60000).toInt()) }) { Text("结束并确认时长") }
        TextButton(onClick = onDismiss) { Text("关闭计时") }
    } }
}
