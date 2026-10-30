package com.keling.app.ui.screens.ai

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.*
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.keling.app.network.*
import com.keling.app.ui.components.*
import kotlinx.coroutines.delay

@Composable
fun StellarAssistantScreen(accountId: String, token: String, onBack: () -> Unit, onPlanning: () -> Unit, onNotebook: () -> Unit,
    contextLaunch: AssistantContextLaunch? = null, onLaunchConsumed: () -> Unit = {}) {
    val guest = com.keling.app.network.GuestWorkspaces.find(token)
    val vm: AssistantViewModel = viewModel(key = "assistant-$accountId-${token.hashCode()}", factory = object : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST") override fun <T : ViewModel> create(modelClass: Class<T>): T = AssistantViewModel(token) as T
    })
    val state by vm.state.collectAsStateWithLifecycle()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(vm, lifecycle) { lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
        while (true) { vm.poll(); delay(if (vm.state.value.conversation?.session?.activeRequestId?.isNotBlank() == true) 3000 else 30000) }
    } }
    val input = state.draft
    var providerId by rememberSaveable(accountId, token) { mutableStateOf("") }; var modelId by rememberSaveable(accountId, token) { mutableStateOf("") }
    var scenario by rememberSaveable { mutableStateOf("CONCEPT_EXPLAIN") }
    var includeContext by rememberSaveable { mutableStateOf(false) }; var vector by rememberSaveable { mutableStateOf(false) }
    var embeddingProvider by rememberSaveable { mutableStateOf("") }; var embeddingModel by rememberSaveable { mutableStateOf("") }
    var advanced by rememberSaveable { mutableStateOf(false) }; var history by rememberSaveable { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var showKeyPanel by remember { mutableStateOf(false) }
    val provider = state.providers.find { it.id == providerId }
    val selected = state.conversation?.session
    val running = selected?.activeRequestId?.isNotBlank() == true
    val activity = LocalContext.current as? android.app.Activity
    DisposableEffect(vm, activity) { onDispose { if (activity?.isChangingConfigurations != true) vm.leaveScreen() } }
    LaunchedEffect(contextLaunch?.requestId) {
        contextLaunch?.let {
            includeContext = false; vector = false
            scenario = if (it.ref.kind == "task") "QUICK_PLAN" else "CONCEPT_EXPLAIN"
            vm.beginContext(it.ref, it.prompt)
            onLaunchConsumed()
        }
    }
    LaunchedEffect(state.providers) { if (providerId.isBlank()) state.providers.firstOrNull { it.configured && it.chatModels.isNotEmpty() }?.let { providerId = it.id; modelId = it.chatModels.first() } }
    val activeProviderId = selected?.providerId ?: providerId
    val activeModelId = selected?.modelId ?: modelId
    val modelReady = state.providers.any { it.id == activeProviderId && it.configured && activeModelId in it.chatModels }
    val sourceReady = state.contextReady && (state.contextRef != null || selected != null || !includeContext || !vector || embeddingModel.isNotBlank())
    StellarTheme { Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(Modifier.fillMaxSize().imePadding()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                TextButton(onClick = onBack) { Text("返回") }
                TextButton(onClick = { history = true }, enabled = !state.busy) { Text(if (guest != null) "本次会话" else "共享会话") }
                TextButton(onClick = vm::refresh, enabled = !state.busy) { Text("刷新") }
            }
            LazyColumn(Modifier.weight(1f).padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(bottom = 12.dp)) {
                item { Row(verticalAlignment = Alignment.CenterVertically) {
                    StellarArt("mascot_mentor", "星际导师", Modifier.size(80.dp))
                    Column(Modifier.weight(1f)) { Text("星际 AI 助手", style = MaterialTheme.typography.headlineSmall); Text("与网页共用会话和模型目录", style = MaterialTheme.typography.bodySmall) }
                } }
                state.error?.let { message -> item { Text(message, color = MaterialTheme.colorScheme.error) } }
                state.notice?.let { message -> item { Text(message, color = MaterialTheme.colorScheme.primary) } }
                item { OutlinedButton(onClick = { showKeyPanel = true }, modifier = Modifier.fillMaxWidth()) { Text("配置自己的 API Key / 实时模型") } }
                if (state.contextRef != null) item { AssistantContextCard(state, vm::refreshPreview, vm::removeContext) }
                if (selected == null) item {
                    Card { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        StellarSelect("模型服务", providerId, state.providers.map { it.id to "${it.name} · ${if (it.configured) "已配置" else "未配置"}" }, !state.busy) { id -> providerId = id; modelId = state.providers.find { it.id == id }?.chatModels?.firstOrNull().orEmpty() }
                        StellarSelect("聊天模型", modelId, provider?.chatModels.orEmpty().map { it to it }, !state.busy) { modelId = it }
                        if (provider?.configured != true) Text("服务尚未启用。管理员配置模型后，手机与网页自动获得相同选项。", style = MaterialTheme.typography.bodySmall)
                        StellarSelect("学习方式", scenario, listOf("CONCEPT_EXPLAIN" to "概念讲解", "QUICK_PLAN" to "学习规划", "WEAKNESS_DIAGNOSE" to "薄弱诊断", "PRACTICE_SESSION" to "逐题练习", "REVIEW_SESSION" to "复习回顾", "CASUAL_CHAT" to "自由问答")) { scenario = it }
                        TextButton(onClick = { advanced = !advanced }) { Text(if (advanced) "收起资料设置" else "资料与向量模型设置") }
                        if (advanced && state.contextRef != null) Text("本次仅附带上方预览资料，不执行全局检索。已有对话的历史仍可能参与回答。", style = MaterialTheme.typography.bodySmall)
                        if (advanced && state.contextRef == null) {
                            Row(verticalAlignment = Alignment.CenterVertically) { Switch(checked = includeContext, onCheckedChange = { includeContext = it }); Text("允许发送课程与笔记摘录", Modifier.padding(start = 8.dp)) }
                            if (includeContext) {
                                Text("从最近 24 个知识点和 12 篇笔记中检索最多 6 条；不是全库搜索。", style = MaterialTheme.typography.bodySmall)
                                Row(verticalAlignment = Alignment.CenterVertically) { Switch(checked = vector, onCheckedChange = { vector = it }); Text("语义向量检索（额外用量）", Modifier.padding(start = 8.dp)) }
                                if (vector) {
                                    StellarSelect("独立向量服务", embeddingProvider, state.providers.filter { it.configured && it.embeddingModels.isNotEmpty() }.map { it.id to it.name }) { embeddingProvider = it; embeddingModel = state.providers.find { p -> p.id == it }?.embeddingModels?.firstOrNull().orEmpty() }
                                    StellarSelect("向量模型", embeddingModel, state.providers.find { it.id == embeddingProvider }?.embeddingModels.orEmpty().map { it to it }) { embeddingModel = it }
                                }
                            }
                        }
                    } }
                } else item { Card { Column(Modifier.padding(16.dp)) {
                    Text(selected.title, style = MaterialTheme.typography.titleMedium)
                    Text("${selected.modelId} · ${if (state.contextRef != null) "附带所选资料" else if (selected.includeContext) "允许检索资料" else "聊天与会话历史"}", style = MaterialTheme.typography.bodySmall)
                    Row { TextButton(onClick = vm::newConversation, enabled = !state.busy) { Text("新对话") }; TextButton(onClick = { confirmDelete = true }, enabled = !state.busy) { Text("删除会话") } }
                } } }
                if (state.conversation?.turns.isNullOrEmpty()) item {
                    StellarSceneCard("scene_lab", "今天想理解什么？", "从一个问题出发，把知识连成星图。")
                    if (state.contextRef == null) OutlinedButton(onClick = { vm.editPrompt("用例子解释二叉树的三种遍历") }, modifier = Modifier.fillMaxWidth()) { Text("用例子解释二叉树遍历") }
                    if (state.contextRef == null) Text("当前未附带指定资料。从课程、任务或已保存笔记进入，可先查看资料再发送。临时选择不会在进程重建后恢复。", style = MaterialTheme.typography.bodySmall)
                }
                items(state.conversation?.turns.orEmpty(), key = { it.id }) { turn ->
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) { Column(Modifier.fillMaxWidth().padding(16.dp)) { Text("我", style = MaterialTheme.typography.labelSmall); SelectionContainer { Text(turn.userText) } } }
                        Card { Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("课灵 · ${turn.modelId}", style = MaterialTheme.typography.labelSmall)
                            SelectionContainer { Text(turn.assistantText.ifBlank { if (turn.status == "RUNNING") "正在思考，可稍后回来查看…" else turn.error }) }
                            var sources by remember(turn.id) { mutableStateOf(false) }
                            TextButton(onClick = { sources = !sources }) { Text(if (sources) "收起来源与用量" else "查看本轮来源与用量") }
                            if (sources) {
                                if (turn.sources.isEmpty()) Text("本轮没有资料快照，请核实回答。", style = MaterialTheme.typography.bodySmall)
                                turn.sources.forEachIndexed { index, source -> AssistantSourceDetail(source, index) }
                                Text("输入 ${turn.usage.inputTokens ?: "未报告"} / 输出 ${turn.usage.outputTokens ?: "未报告"} tokens", style = MaterialTheme.typography.bodySmall)
                            }
                            if (turn.status == "SUCCEEDED") OutlinedButton(onClick = { vm.saveNote(turn.id) }, enabled = !state.busy) { Text(if (guest != null) "保存到本次笔记" else "保存到共享笔记") }
                            if (turn.status == "FAILED") TextButton(onClick = { vm.editPrompt(turn.userText) }) { Text("重新编辑问题") }
                        } }
                    }
                }
                item { Row { TextButton(onClick = onPlanning) { Text("打开智能编排") }; TextButton(onClick = onNotebook) { Text(if (guest != null) "本次笔记与资料" else "共享笔记与资料") } } }
            }
            Surface(shadowElevation = 4.dp) { Column(Modifier.padding(12.dp)) {
                if (!modelReady) Text("当前聊天模型未配置或不可用；可继续预览资料、编辑问题。", style = MaterialTheme.typography.labelSmall)
                else if (!state.contextReady) Text("资料尚未确认：请刷新预览或移除资料后再发送。", style = MaterialTheme.typography.labelSmall)
                OutlinedTextField(value = input, onValueChange = vm::editPrompt, label = { Text("你的问题") }, modifier = Modifier.fillMaxWidth(), maxLines = 4)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text("${input.length}/6000 · 请核实 AI 回答", modifier = Modifier.weight(1f).padding(end = 8.dp), style = MaterialTheme.typography.labelSmall)
                    if (running) TextButton(onClick = vm::cancel, enabled = !state.busy) { Text("停止") }
                    else StellarActionButton(text = if (state.busy) "提交中" else "发送", modifier = Modifier.width(110.dp), onClick = { vm.send(input, NewAssistantSession(providerId, modelId, scenario = scenario, includeContext = includeContext && state.contextRef == null, retrievalMode = if (vector) "vector" else "keyword", embeddingProviderId = embeddingProvider, embeddingModelId = embeddingModel)) }, enabled = !state.busy && input.isNotBlank() && modelReady && sourceReady)
                }
            } }
        }
        if (history) AlertDialog(onDismissRequest = { history = false }, title = { Text(if (guest != null) "本次会话" else "共享会话") }, text = {
            LazyColumn(Modifier.heightIn(max = 420.dp)) { item { TextButton(onClick = { vm.newConversation(); history = false }) { Text("＋ 新建对话") } }; items(state.sessions, key = { it.id }) { s -> TextButton(onClick = { vm.open(s.id); history = false }) { Text("${s.title}\n${s.modelId}") } } }
        }, confirmButton = { TextButton(onClick = { history = false }) { Text("关闭") } })
        if (confirmDelete) AlertDialog(onDismissRequest = { confirmDelete = false }, title = { Text(if (guest != null) "删除本次会话？" else "删除共享会话？") }, text = { Text(if (guest != null) "移除本次内存会话，已保存的本次笔记保留。" else "网页和手机都会移除这个会话，已保存的笔记保留。") }, confirmButton = { TextButton(onClick = { confirmDelete = false; vm.remove() }) { Text("删除") } }, dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("取消") } })
        if (showKeyPanel) ModelAccessPanel(initialMessage = input, initialContext = state.preview?.sources.orEmpty().take(3).map { TrialContext(it.title, it.text) }, onClose = { showKeyPanel = false; vm.refresh() }, sharedSession = guest?.modelAccess)
    } }
}

@Composable private fun AssistantContextCard(state: AssistantUiState, refresh: () -> Unit, remove: () -> Unit) {
    var showSources by remember(state.preview?.fingerprint) { mutableStateOf(false) }
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) {
        Column(Modifier.fillMaxWidth().padding(16.dp).semantics { liveRegion = LiveRegionMode.Polite }, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(state.preview?.title ?: "所选学习资料", style = MaterialTheme.typography.titleMedium)
            Text("只有点击发送，才会将下方范围交给模型。", style = MaterialTheme.typography.bodySmall)
            if (state.previewLoading) { LinearProgressIndicator(Modifier.fillMaxWidth()); Text("正在读取资料预览…") }
            state.previewError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            state.preview?.let { preview ->
                Text("本次范围：${preview.sources.size} 条资料；不进行全局检索。", style = MaterialTheme.typography.bodySmall)
                preview.warnings.forEach { Text(it, style = MaterialTheme.typography.bodySmall) }
                preview.sources.firstOrNull()?.let { source ->
                    Text(source.title, style = MaterialTheme.typography.labelLarge)
                    SelectionContainer { Text(source.text.take(180) + if (source.text.length > 180) "…（展开查看发送内容）" else "", style = MaterialTheme.typography.bodySmall) }
                }
                TextButton(onClick = { showSources = true }) { Text("核对全部发送摘录与版本") }
            }
            Row { TextButton(onClick = refresh, enabled = !state.busy) { Text(if (state.previewLoading) "重新加载" else "刷新预览") }; TextButton(onClick = remove, enabled = !state.busy) { Text("移除资料") } }
        }
    }
    if (showSources && state.preview != null) AlertDialog(onDismissRequest = { showSources = false }, title = { Text("将发送的资料摘录") }, text = {
        LazyColumn(Modifier.heightIn(max = 420.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            items(state.preview.sources.size) { index -> AssistantSourceDetail(state.preview.sources[index], index) }
        }
    }, confirmButton = { TextButton(onClick = { showSources = false }) { Text("返回编辑问题") } })
}

@Composable private fun AssistantSourceDetail(source: AssistantSource, index: Int) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text("[资料${index + 1}] ${source.title}", style = MaterialTheme.typography.titleSmall)
        val version = source.updatedAt?.takeIf { it.isNotBlank() }?.let { timestamp ->
            runCatching { java.time.Instant.parse(timestamp).atZone(java.time.ZoneId.systemDefault()).format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")) }.getOrDefault(timestamp)
        }
        Text(if (version == null) "旧会话未记录版本" else "来源版本：$version（本机时区）", style = MaterialTheme.typography.labelSmall)
        if (source.truncated) Text("此资料已按长度限制截断，模型仅收到下方内容。", style = MaterialTheme.typography.labelSmall)
        SelectionContainer { Text(source.text, style = MaterialTheme.typography.bodySmall) }
    }
}
