package com.keling.app.ui.screens.agent

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.*
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.compose.ui.platform.LocalLifecycleOwner
import com.keling.app.network.AgentRequest
import com.keling.app.network.TaskData
import com.keling.app.ui.components.StellarSceneCard
import kotlinx.coroutines.delay
import java.time.LocalDate
import java.time.ZoneId

private fun statusLabel(status: String) = when (status) {
    "RUNNING" -> "正在规划"
    "SUCCEEDED" -> "等待你确认"
    "CONFIRMED" -> "已加入云端任务"
    "FAILED" -> "未生成计划"
    "COMPLETED" -> "已完成"
    "IN_PROGRESS" -> "进行中"
    "SKIPPED" -> "已跳过"
    else -> "待完成"
}

@Composable
fun CloudAgentScreen(accountId: String, token: String, onBack: () -> Unit) {
    val guest = com.keling.app.network.GuestWorkspaces.find(token)
    var showKeyPanel by remember { mutableStateOf(false) }
    val model: AgentViewModel = viewModel(key = "cloud-agent-$accountId-${token.hashCode()}", factory = remember(token) {
        object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T = AgentViewModel(token) as T
        }
    })
    if (showKeyPanel) com.keling.app.ui.screens.ai.ModelAccessPanel(onClose = { showKeyPanel = false; model.refresh() }, sharedSession = guest?.modelAccess)
    val state by model.state.collectAsStateWithLifecycle()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(model, lifecycle) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            while (true) { model.poll(); delay(3000) }
        }
    }
    var goal by rememberSaveable { mutableStateOf("") }
    var date by rememberSaveable { mutableStateOf(LocalDate.now(ZoneId.of("Asia/Shanghai")).plusDays(7).toString()) }
    var minutes by rememberSaveable { mutableStateOf("60") }
    var review by rememberSaveable { mutableStateOf(false) }
    var courseMenu by remember { mutableStateOf(false) }
    var showMaterials by rememberSaveable { mutableStateOf(false) }
    var courseName by rememberSaveable { mutableStateOf("") }
    var sourceName by rememberSaveable { mutableStateOf("") }
    var sourceText by rememberSaveable { mutableStateOf("") }
    var completion by remember { mutableStateOf<TaskData?>(null) }
    var actualMinutes by rememberSaveable { mutableStateOf("") }

    Column(Modifier.fillMaxSize().imePadding()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            TextButton(onClick = onBack) { Text("返回") }
            TextButton(onClick = model::refresh, enabled = !state.busy) { Text(if (guest != null) "刷新本次数据" else "刷新云端") }
        }
        if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            item {
                StellarSceneCard("scene_planning", "智学工作台", "资料 → 规划 → 确认 → 执行 → 复盘")
                Text(state.status?.let { if (it.configured) "${it.provider} 已配置" else "规划服务尚未配置，可先整理课程资料" } ?: "正在连接服务…", style = MaterialTheme.typography.labelLarge)
                Text(if (guest != null) "本次课程、资料与计划只保留在内存；模型请求需要联网。" else "这里与网页使用同一份云端资料和任务，需要联网。", style = MaterialTheme.typography.bodySmall)
            }
            if (guest != null) item { OutlinedButton(onClick = { showKeyPanel = true }, modifier = Modifier.fillMaxWidth()) { Text("配置本次 API Key 与模型") } }
            state.error?.let { message -> item { Text(message, color = MaterialTheme.colorScheme.error) } }
            state.notice?.let { message -> item { Text(message, color = MaterialTheme.colorScheme.primary) } }
            item {
                Box {
                    OutlinedButton(onClick = { courseMenu = true }, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) {
                        Text(state.courses.find { it.id == state.courseId }?.name ?: if (guest != null) "选择本次课程" else "选择云端课程")
                    }
                    DropdownMenu(expanded = courseMenu, onDismissRequest = { courseMenu = false }) {
                        state.courses.forEach { course ->
                            DropdownMenuItem(text = { Text("${course.name} · ${course.knowledgeNodeCount} 个知识点") }, onClick = { courseMenu = false; model.selectCourse(course.id) })
                        }
                        if (state.courses.isEmpty()) DropdownMenuItem(text = { Text("请在下方创建课程") }, onClick = { courseMenu = false; showMaterials = true })
                    }
                }
            }
            item {
                OutlinedTextField(goal, { goal = it.take(1200) }, label = { Text("希望掌握什么") }, placeholder = { Text("例如：一周内掌握二叉树遍历") }, modifier = Modifier.fillMaxWidth(), minLines = 2)
            }
            item {
                OutlinedTextField(date, { date = it.take(10) }, label = { Text("目标日期：YYYY-MM-DD") }, supportingText = { Text("今天起 90 天内，按北京时间安排") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            }
            item {
                OutlinedTextField(minutes, { minutes = it.filter(Char::isDigit).take(3) }, label = { Text("每天可用分钟（10–480）") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true, modifier = Modifier.fillMaxWidth())
                Row { Checkbox(review, { review = it }); Text(if (guest != null) "结合本次完成记录复盘" else "结合云端完成记录复盘", Modifier.padding(top = 12.dp)) }
                Button(onClick = { model.start(AgentRequest(state.courseId, goal, date, minutes.toIntOrNull() ?: 0, if (review) "review" else "plan")) }, enabled = !state.busy && state.status?.configured == true && state.selected?.status != "RUNNING", modifier = Modifier.fillMaxWidth()) { Text("开始规划") }
                Text("计划会引用实际检索的资料。确认后才创建任务，可从历史恢复查看。", style = MaterialTheme.typography.bodySmall)
                TextButton(onClick = { showMaterials = !showMaterials }) { Text(if (showMaterials) "收起课程资料" else "添加课程与学习资料") }
            }
            if (showMaterials) {
                item {
                    OutlinedTextField(courseName, { courseName = it.take(120) }, label = { Text("新课程名称") }, modifier = Modifier.fillMaxWidth())
                    OutlinedButton(onClick = { model.createCourse(courseName) }, enabled = !state.busy && courseName.isNotBlank()) { Text("创建课程") }
                    OutlinedTextField(sourceName, { sourceName = it.take(180) }, label = { Text("知识点名称") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(sourceText, { sourceText = it.take(1800) }, label = { Text("学习资料内容") }, minLines = 3, modifier = Modifier.fillMaxWidth())
                    OutlinedButton(onClick = { model.addSource(sourceName, sourceText) }, enabled = !state.busy && state.courseId.isNotBlank() && sourceName.isNotBlank() && sourceText.isNotBlank()) { Text("保存到当前课程") }
                }
                items(state.sources, key = { "source-${it.id}" }) { node ->
                    Text("${node.name}\n${node.description}", style = MaterialTheme.typography.bodyMedium)
                }
            }
            state.selected?.let { run ->
                item {
                    HorizontalDivider()
                    Text(if (guest != null && run.status == "CONFIRMED") "已加入本次任务" else statusLabel(run.status), style = MaterialTheme.typography.titleLarge)
                    Text(run.goal)
                    if (run.error.isNotBlank()) Text(run.error, color = MaterialTheme.colorScheme.error)
                    if (run.status == "RUNNING") Text("正在检索与规划，轨迹自动刷新。")
                    run.result?.let { Text(it.summary) }
                }
                items(run.result?.tasks.orEmpty()) { task ->
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text("${task.date} · ${task.minutes} 分钟", style = MaterialTheme.typography.labelLarge)
                            Text(task.title, style = MaterialTheme.typography.titleMedium)
                            Text(task.description)
                            Text("依据：" + task.sourceIds.joinToString("、") { id -> run.sources.find { it.id == id }?.title ?: id }, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
                if (run.status == "SUCCEEDED") item { Button(onClick = model::confirm, enabled = !state.busy) { Text(if (guest != null) "确认计划并加入本次任务" else "确认计划并加入云端任务") } }
                item {
                    Text("实际执行轨迹", style = MaterialTheme.typography.titleMedium)
                    run.events.forEach { event -> Text("• ${event.name} · ${event.status}", style = MaterialTheme.typography.bodySmall) }
                }
            }
            item { HorizontalDivider(); Text(if (guest != null) "本次学习任务" else "云端学习任务", style = MaterialTheme.typography.titleLarge); Text(if (guest != null) "完成记录供本次试用中的复盘使用，退出后清空。" else "完成记录会供网页和下一次复盘使用。", style = MaterialTheme.typography.bodySmall) }
            val visibleTasks = state.tasks.filter { state.courseId.isBlank() || it.courseId == state.courseId }
            if (visibleTasks.isEmpty()) item { Text("还没有任务。确认计划后会在这里显示。") }
            items(visibleTasks, key = { "task-${it.id}" }) { task ->
                OutlinedCard(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp)) {
                        Text(task.title, style = MaterialTheme.typography.titleMedium)
                        Text("${statusLabel(task.status)} · 预计 ${task.estimatedMinutes} 分钟")
                        if (task.description.isNotBlank()) Text(task.description, style = MaterialTheme.typography.bodySmall)
                        if (task.status in listOf("PENDING", "IN_PROGRESS")) TextButton(onClick = { completion = task; actualMinutes = task.estimatedMinutes.toString() }, enabled = !state.busy) { Text("记录完成") }
                        else if (task.status == "COMPLETED") Text("实际学习 ${task.actualMinutes ?: 0} 分钟")
                    }
                }
            }
            item { HorizontalDivider(); Text("运行历史", style = MaterialTheme.typography.titleLarge) }
            items(state.history, key = { "run-${it.id}" }) { run ->
                OutlinedButton(onClick = { model.open(run.id) }, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) { Text("${run.goal}\n${if (guest != null && run.status == "CONFIRMED") "已加入本次任务" else statusLabel(run.status)} · ${run.createdAt.take(10)}") }
            }
            item { Spacer(Modifier.height(32.dp)) }
        }
    }
    completion?.let { task ->
        AlertDialog(onDismissRequest = { completion = null }, title = { Text("完成「${task.title}」") }, text = {
            OutlinedTextField(actualMinutes, { actualMinutes = it.filter(Char::isDigit).take(4) }, label = { Text("实际学习分钟（0–1440）") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
        }, confirmButton = { TextButton(onClick = { model.complete(task.id, actualMinutes.toIntOrNull() ?: -1); completion = null }, enabled = (actualMinutes.toIntOrNull() ?: -1) in 0..1440 && !state.busy) { Text("保存完成记录") } }, dismissButton = { TextButton(onClick = { completion = null }) { Text("取消") } })
    }
}
