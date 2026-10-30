package com.keling.app.ui.screens.trial

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.keling.app.network.TrialContext
import com.keling.app.ui.components.*
import com.keling.app.ui.screens.ai.ModelAccessPanel
import kotlinx.coroutines.delay

@Composable fun TrialScreen(onExit: () -> Unit) {
    // Deliberately neither rememberSaveable nor an account ViewModel.
    val session = remember { TrialSession() }
    val state by session.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var exit by remember { mutableStateOf(false) }
    var newTask by remember { mutableStateOf(false) }
    var taskTitle by remember { mutableStateOf("") }
    var taskText by remember { mutableStateOf("") }
    var editNote by remember { mutableStateOf(false) }
    var noteId by remember { mutableStateOf<String?>(null) }
    var noteTitle by remember { mutableStateOf("") }
    var noteText by remember { mutableStateOf("") }
    var focus by remember { mutableStateOf<TrialTask?>(null) }
    var keyPanel by remember { mutableStateOf(false) }
    DisposableEffect(session) { onDispose { session.close() } }
    LaunchedEffect(session) { session.loadConfig(scope) }
    BackHandler { exit = true }
    fun openNote(note: TrialNote?) { noteId = note?.id; noteTitle = note?.title.orEmpty(); noteText = note?.text.orEmpty(); editNote = true }
    StellarTheme { Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(Modifier.fillMaxSize().imePadding()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) { Text("免登录试用", style = MaterialTheme.typography.titleLarge); Text("仅本次内存 · 不与账号同步", style = MaterialTheme.typography.labelSmall) }
                TextButton(onClick = { exit = true }) { Text("退出并清空") }
            }
            Text("示例内容可修改。退出或进程关闭后清空，请勿用作资料备份。", Modifier.padding(horizontal = 16.dp, vertical = 8.dp), style = MaterialTheme.typography.bodySmall)
            val tabs = listOf("home" to "总览", "courses" to "课程", "tasks" to "任务", "notes" to "笔记", "ai" to "AI")
            ScrollableTabRow(tabs.indexOfFirst { it.first == state.tab }, edgePadding = 4.dp) {
                tabs.forEach { (id, title) -> Tab(state.tab == id, onClick = { session.navigate(id) }, text = { Text(title) }) }
            }
            LazyColumn(Modifier.weight(1f).padding(horizontal = 16.dp), contentPadding = PaddingValues(vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (state.tab == "home") {
                    item { StellarSceneCard("station_full", "开始一段临时学习航程", "这里提供内置课程、任务和笔记示例。所有修改都只在当前试用内存里。") }
                    item { Card { Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("当前试用内容", style = MaterialTheme.typography.titleMedium)
                        Text("${state.courses.size} 门示例课程 · ${state.tasks.count { !it.completed }} 个待办 · ${state.notes.size} 篇内存笔记")
                        Text("没有登录、云端会话或账户记录。固定示例回答不代表实际 AI 能力。", style = MaterialTheme.typography.bodySmall)
                        Button(onClick = { session.navigate("courses") }, modifier = Modifier.fillMaxWidth()) { Text("从示例知识点开始") }
                        OutlinedButton(onClick = { session.navigate("ai"); keyPanel = true }, modifier = Modifier.fillMaxWidth()) { Text("配置 API Key，体验真实模型") }
                    } } }
                }
                if (state.tab == "courses") {
                    item { StellarSceneCard("scene_garden", "示例知识星球", "阅读概念、选择资料、预览后提问。下方为内置教学示例。") }
                    items(state.courses, key = { it.id }) { course -> Card { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(course.title, style = MaterialTheme.typography.titleLarge)
                        course.concepts.forEach { concept ->
                            Text(concept.title, style = MaterialTheme.typography.titleSmall)
                            SelectionContainer { Text(concept.text) }
                            TextButton(onClick = { session.selectContext(listOf(TrialContext(concept.title, concept.text)), "请解释这个知识点，并给我一个检查理解的小问题。") }) { Text("选择这个知识点问 AI") }
                        }
                        OutlinedButton(onClick = { session.selectContext(course.concepts.map { TrialContext(it.title, it.text) }, "请梳理这些知识点之间的联系，并给出学习顺序。") }) { Text("预览本课程资料") }
                    } } }
                }
                if (state.tab == "tasks") {
                    item { StellarSceneCard("scene_focus", "试用任务与专注", "创建、完成和删除只改变本次内存。专注计时不写入任何账户。") }
                    item { Button(onClick = { taskTitle = ""; taskText = ""; newTask = true }, modifier = Modifier.fillMaxWidth()) { Text("添加临时任务") } }
                    items(state.tasks, key = { it.id }) { task -> Card { Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(task.title, style = MaterialTheme.typography.titleMedium)
                        Text(task.description)
                        Text("预计 ${task.minutes} 分钟 · ${if (task.completed) "已完成" else "待完成"}" + if (task.focusMinutes > 0) " · 本次计时 ${task.focusMinutes} 分钟" else "", style = MaterialTheme.typography.bodySmall)
                        Row { TextButton(onClick = { focus = task }, enabled = !task.completed) { Text("专注") }; TextButton(onClick = { session.completeTask(task.id) }, enabled = !task.completed) { Text("完成") }; TextButton(onClick = { session.deleteTask(task.id) }) { Text("删除") } }
                        TextButton(onClick = { session.selectContext(listOf(TrialContext(task.title, "${task.description}\n预计时间：${task.minutes} 分钟；状态：${if (task.completed) "已完成" else "待完成"}")), "请帮我理解这项任务并拆解步骤。") }) { Text("预览任务并问 AI") }
                    } } }
                    if (state.tasks.isEmpty()) item { Text("当前没有临时任务。添加一项即可体验专注与完成。") }
                }
                if (state.tab == "notes") {
                    item { StellarSceneCard("scene_archive", "临时笔记档案", "可编辑内置示例或新建笔记。关闭试用会清空这些内容。") }
                    item { Button(onClick = { openNote(null) }, modifier = Modifier.fillMaxWidth()) { Text("新建内存笔记") } }
                    items(state.notes, key = { it.id }) { note -> Card { Column(Modifier.fillMaxWidth().padding(16.dp)) {
                        Text(note.title, style = MaterialTheme.typography.titleMedium)
                        SelectionContainer { Text(note.text.take(500), Modifier.padding(vertical = 8.dp)) }
                        Row { TextButton(onClick = { openNote(note) }) { Text("编辑") }; TextButton(onClick = { session.deleteNote(note.id) }) { Text("删除") } }
                        TextButton(onClick = { session.selectContext(listOf(TrialContext(note.title, note.text)), "请基于这篇内存笔记解释核心概念，并提醒需要核实的地方。") }) { Text("预览笔记并问 AI") }
                    } } }
                    if (state.notes.isEmpty()) item { Text("还没有内存笔记，可先新建一篇。") }
                }
                if (state.tab == "ai") {
                    item { StellarSceneCard("scene_lab", "试用 AI 工作台", "先核对资料，再选择自己的模型。固定示例不会调用 AI。") }
                    item { Button(onClick = { keyPanel = true }, modifier = Modifier.fillMaxWidth()) { Text("配置 API Key / 选择实时模型") } }
                    item { Card { Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("本次资料预览 · ${state.context.size}/3", style = MaterialTheme.typography.titleMedium)
                        Text("每条最多 2000 字；以下为选取时的内存快照。修改笔记后请重新选择。", style = MaterialTheme.typography.bodySmall)
                        if (state.context.isEmpty()) Text("尚未选择资料，也可直接编辑问题。")
                        state.context.forEachIndexed { index, source ->
                            var expanded by remember(source) { mutableStateOf(false) }
                            Text(source.title, style = MaterialTheme.typography.titleSmall)
                            if (source.truncated) Text("此条已按长度限制截断。", style = MaterialTheme.typography.labelSmall)
                            SelectionContainer { Text(if (expanded) source.text else source.text.take(180), style = MaterialTheme.typography.bodySmall) }
                            Row { TextButton(onClick = { expanded = !expanded }) { Text(if (expanded) "收起" else "查看发送全文") }; TextButton(onClick = { session.removeContext(index) }, enabled = !state.sending) { Text("移除") } }
                        }
                    } } }
                    item { OutlinedTextField(state.prompt, session::editPrompt, Modifier.fillMaxWidth(), label = { Text("你的问题 · ${state.prompt.length}/4000") }, minLines = 3, maxLines = 8) }
                    item { Text("真实发送会把问题及所选资料交给配置的模型商。课灵不保存试用内容；模型商的数据保留策略由其决定，请勿提交敏感信息。", style = MaterialTheme.typography.bodySmall) }
                    item { OutlinedButton(onClick = session::showExample, modifier = Modifier.fillMaxWidth()) { Text("查看固定示例（不调用模型）") } }
                    item { Card { Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("备用：公共试用模型", style = MaterialTheme.typography.titleMedium)
                        Text(if (state.configuring) "正在读取可用状态…" else state.config?.ai?.let { if (it.available) "可用模型：${it.model ?: "服务端配置模型"}" else it.reason.ifBlank { "当前没有配置公共模型" } } ?: "尚未取得模型状态")
                        TextButton(onClick = { session.loadConfig(scope) }, enabled = !state.configuring) { Text("刷新可用状态") }
                        if (state.sending) { LinearProgressIndicator(Modifier.fillMaxWidth()); TextButton(onClick = session::cancel) { Text("取消等待") } }
                        else Button(onClick = { session.send(scope) }, enabled = state.config?.ai?.available == true && state.prompt.isNotBlank(), modifier = Modifier.fillMaxWidth()) { Text("明确发送给公共模型") }
                        Text("取消等待不保证模型商停止已收到的请求。", style = MaterialTheme.typography.labelSmall)
                    } } }
                    state.error?.let { error -> item { Text(error, color = MaterialTheme.colorScheme.error) } }
                    if (state.answer.isNotEmpty()) item { Card { Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(if (state.example) "内置固定示例 · 非实际 AI" else "实际模型回复 · ${state.answerModel}", style = MaterialTheme.typography.titleMedium)
                        Text(state.answeredQuestion, style = MaterialTheme.typography.bodySmall)
                        SelectionContainer { Text(state.answer) }
                        if (!state.example) Text("输入 ${state.usage.inputTokens ?: "未报告"} / 输出 ${state.usage.outputTokens ?: "未报告"} tokens · 请核实回答", style = MaterialTheme.typography.labelSmall)
                        OutlinedButton(onClick = { session.saveNote(null, if (state.example) "固定示例演示" else "试用 AI 回答", "${state.answeredQuestion}\n\n${state.answer}"); session.navigate("notes") }) { Text("留在本次内存笔记") }
                        OutlinedButton(onClick = { taskTitle = state.answeredQuestion.take(120); taskText = state.answer.take(2000); newTask = true }) { Text("编辑并创建临时任务") }
                    } } }
                }
            }
        }
        if (newTask) TrialTaskDialog(initialTitle = taskTitle, initialText = taskText, onClose = { newTask = false }, onAdd = { title, text, minutes -> session.addTask(title, text, minutes); newTask = false; session.navigate("tasks") })
        if (editNote) AlertDialog(onDismissRequest = { editNote = false }, title = { Text("编辑内存笔记") }, text = {
            Column { OutlinedTextField(noteTitle, { noteTitle = it.take(120) }, label = { Text("标题") }); OutlinedTextField(noteText, { noteText = it.take(12000) }, label = { Text("正文 · ${noteText.length}/12000") }, modifier = Modifier.heightIn(min = 140.dp, max = 280.dp)); Text("完成编辑后再从笔记卡片进入 AI；草稿不会自动发送。", style = MaterialTheme.typography.bodySmall) }
        }, confirmButton = { TextButton(onClick = { session.saveNote(noteId, noteTitle, noteText); editNote = false }, enabled = noteTitle.isNotBlank()) { Text("留在内存") } }, dismissButton = { TextButton(onClick = { editNote = false }) { Text("取消编辑") } })
        focus?.let { task -> TrialFocusDialog(task, onClose = { focus = null }, onComplete = { minutes -> session.completeTask(task.id, minutes); focus = null }) }
        if (keyPanel) ModelAccessPanel(initialMessage = state.prompt, initialContext = state.context.map { TrialContext(it.title, it.text) },
            onSaveToTrialNote = { question, answer -> session.saveNote(null, "试用模型回答", "$question\n\n$answer"); session.navigate("notes") },
            onCreateTrialTask = { question, answer -> taskTitle = question.take(120); taskText = answer.take(2000); newTask = true }, onClose = { keyPanel = false })
        if (exit) AlertDialog(onDismissRequest = { exit = false }, title = { Text("清空本次试用并退出？") }, text = { Text("临时任务、笔记、问题和回答都将清除，不会写入账户。") }, confirmButton = { TextButton(onClick = { session.close(); onExit() }) { Text("清空并退出") } }, dismissButton = { TextButton(onClick = { exit = false }) { Text("继续试用") } })
    } }
}

@Composable private fun TrialTaskDialog(initialTitle: String = "", initialText: String = "", onClose: () -> Unit, onAdd: (String, String, Int) -> Unit) {
    var title by remember { mutableStateOf(initialTitle) }; var text by remember { mutableStateOf(initialText) }; var minutes by remember { mutableStateOf("25") }
    AlertDialog(onDismissRequest = onClose, title = { Text("添加临时任务") }, text = { Column {
        OutlinedTextField(title, { title = it.take(120) }, label = { Text("任务标题") })
        OutlinedTextField(text, { text = it.take(2000) }, label = { Text("任务说明") }, maxLines = 4)
        OutlinedTextField(minutes, { minutes = it.filter(Char::isDigit).take(3) }, label = { Text("预计分钟 · 1–480") })
    } }, confirmButton = { TextButton(onClick = { onAdd(title, text, minutes.toInt()) }, enabled = title.isNotBlank() && minutes.toIntOrNull()?.let { it in 1..480 } == true) { Text("添加到内存") } }, dismissButton = { TextButton(onClick = onClose) { Text("取消") } })
}

@Composable private fun TrialFocusDialog(task: TrialTask, onClose: () -> Unit, onComplete: (Int) -> Unit) {
    val total = task.minutes * 60_000L
    var remaining by remember(task.id) { mutableStateOf(total) }
    var deadline by remember(task.id) { mutableStateOf(android.os.SystemClock.elapsedRealtime() + total) }
    var active by remember(task.id) { mutableStateOf(true) }
    LaunchedEffect(active, deadline) { while (active && remaining > 0) { remaining = (deadline - android.os.SystemClock.elapsedRealtime()).coerceAtLeast(0); delay(250) }; if (remaining == 0L) active = false }
    AlertDialog(onDismissRequest = onClose, title = { Text("试用专注 · ${task.title}") }, text = { Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
        Box(Modifier.size(220.dp), contentAlignment = Alignment.Center) { StellarArt("timer_frame", null, Modifier.fillMaxSize()); Text("%02d:%02d".format(remaining / 60000, remaining / 1000 % 60), Modifier.padding(top = 16.dp), style = MaterialTheme.typography.displaySmall) }
        Text("本次计时只在内存。关闭此窗口会结束计时。", style = MaterialTheme.typography.bodySmall)
        TextButton(onClick = { if (active) { remaining = (deadline - android.os.SystemClock.elapsedRealtime()).coerceAtLeast(0); active = false } else { deadline = android.os.SystemClock.elapsedRealtime() + remaining; active = true } }, enabled = remaining > 0) { Text(if (active) "暂停" else "继续") }
    } }, confirmButton = { TextButton(onClick = { val finalRemaining = if (active) (deadline - android.os.SystemClock.elapsedRealtime()).coerceAtLeast(0) else remaining; onComplete(((total - finalRemaining) / 60000).toInt().coerceIn(0, 480)) }) { Text("完成任务") } }, dismissButton = { TextButton(onClick = onClose) { Text("结束不标完成") } })
}
