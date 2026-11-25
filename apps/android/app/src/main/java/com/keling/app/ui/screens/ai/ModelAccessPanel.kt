package com.keling.app.ui.screens.ai

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.SecureFlagPolicy
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.keling.app.network.TrialContext
import com.keling.app.ui.components.*

@Composable fun ModelAccessPanel(initialMessage: String = "", initialContext: List<TrialContext> = emptyList(),
    onSaveToTrialNote: ((String, String) -> Unit)? = null, onCreateTrialTask: ((String, String) -> Unit)? = null, onClose: () -> Unit, sharedSession: ModelAccessSession? = null, sharedSessionNote: String? = null, embedded: Boolean = false) {
    val session = sharedSession ?: remember { ModelAccessSession(initialMessage, initialContext) }
    val state by session.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val uri = LocalUriHandler.current
    val clipboard = LocalClipboardManager.current
    var copied by remember { mutableStateOf(false) }
    var visibleKey by remember { mutableStateOf(false) }
    var modelMenu by remember { mutableStateOf(false) }
    DisposableEffect(session) { onDispose { if (sharedSession == null) session.close() else session.cancel() } }
    LaunchedEffect(session) { session.loadCatalog(scope) }
    fun close() { if (sharedSession == null) session.close() else session.cancel(); onClose() }
    val context = androidx.compose.ui.platform.LocalContext.current
    DisposableEffect(context, embedded) {
        val activity = generateSequence(context) { (it as? android.content.ContextWrapper)?.baseContext }.filterIsInstance<android.app.Activity>().firstOrNull()
        val window = activity?.window
        val secure = android.view.WindowManager.LayoutParams.FLAG_SECURE
        val wasSecure = window?.attributes?.flags?.and(secure) != 0
        if (embedded) window?.addFlags(secure)
        onDispose { if (embedded && !wasSecure) window?.clearFlags(secure) }
    }
    val panel: @Composable () -> Unit = {
        StellarTheme { Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) { Column(Modifier.fillMaxSize().imePadding()) {
            Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("模型配置", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                TextButton(onClick = ::close) { Text(if (sharedSession == null) "关闭并清除" else "完成配置") }
            }
            LazyColumn(Modifier.weight(1f).padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(bottom = 24.dp)) {
                item { Text(sharedSessionNote ?: if (sharedSession != null) "Key 退出试用即清除" else "关闭后清除 Key 与临时问答", style = MaterialTheme.typography.bodySmall) }
                item { OutlinedTextField(state.apiKey, session::editKey, Modifier.fillMaxWidth(), label = { Text("API Key") }, visualTransformation = if (visibleKey) VisualTransformation.None else PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, autoCorrect = false), trailingIcon = { TextButton(onClick = { visibleKey = !visibleKey }) { Text(if (visibleKey) "隐藏" else "显示") } }, singleLine = true, enabled = !state.busy) }
                item {
                    val candidate = identifyKeyCandidate(state.apiKey)
                    Text(candidate.explanation, style = MaterialTheme.typography.bodySmall)
                    state.providers.find { it.id == candidate.providerId }?.let { provider -> TextButton(onClick = { session.selectProvider(provider.id) }, enabled = !state.busy) { Text("选择：${provider.name}") } }
                }
                item {
                    if (state.catalogLoading) LinearProgressIndicator(Modifier.fillMaxWidth())
                    StellarSelect("仅向你选定的厂商发送 Key", state.providerId, state.providers.map { it.id to it.name }, !state.busy, session::selectProvider)
                    if (state.providers.isEmpty()) TextButton(onClick = { session.loadCatalog(scope) }, enabled = !state.catalogLoading) { Text("重试") }
                    state.provider?.let { provider ->
                        if (provider.documentation.startsWith("https://")) TextButton(onClick = { uri.openUri(provider.documentation) }) { Text("${provider.name} 文档") }
                        if (provider.endpoints.isNotEmpty()) StellarSelect(if (provider.endpointRequired) "选择官方地域 / 服务地址" else "官方服务地址（不选则使用默认）", state.baseUrl, provider.endpoints.map { it to it }, !state.busy, session::editEndpoint)
                        if (provider.endpointRequired || provider.endpointHint.isNotBlank()) {
                            OutlinedTextField(state.baseUrl, session::editEndpoint, Modifier.fillMaxWidth(), label = { Text(if (provider.endpointRequired) "官方服务地址（必填）" else "官方服务地址（可选）") }, placeholder = { Text(provider.endpointHint) }, singleLine = true, enabled = !state.busy)
                        }
                    }
                }
                item { Button(onClick = { session.discover(scope) }, enabled = state.canDiscover, modifier = Modifier.fillMaxWidth()) { Text("验证并获取模型") } }
                if (state.fetchedAt.isNotBlank()) item { Text("更新于 ${state.fetchedAt}", style = MaterialTheme.typography.bodySmall) }
                item {
                    Box {
                        OutlinedButton(onClick = { modelMenu = true }, enabled = !state.busy && state.models.isNotEmpty(), modifier = Modifier.fillMaxWidth()) { Text(state.models.find { it.id == state.model }?.id ?: "选择模型") }
                        DropdownMenu(modelMenu, onDismissRequest = { modelMenu = false }, modifier = Modifier.heightIn(max = 320.dp)) {
                            state.models.forEach { model ->
                                val chat = model.capabilities.isEmpty() || "chat" in model.capabilities
                                val label = if (model.capabilities.isEmpty()) "能力未报告，需实际验证" else model.capabilities.joinToString(" / ") { if (it == "chat") "聊天" else if (it == "embedding") "向量" else it }
                                DropdownMenuItem(text = { Text("${model.id}\n$label") }, enabled = chat, onClick = { session.editModel(model.id); modelMenu = false })
                            }
                        }
                    }
                    OutlinedTextField(state.model, session::editModel, Modifier.fillMaxWidth(), label = { Text("模型 ID") }, enabled = !state.busy, singleLine = true)
                }
                item { Card { Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("附带资料 · ${state.context.size}/3", style = MaterialTheme.typography.titleMedium)
                    Text("每条最多 2000 字", style = MaterialTheme.typography.bodySmall)
                    if (state.context.isEmpty()) Text("未附带资料。")
                    state.context.forEachIndexed { index, source ->
                        var expanded by remember(source) { mutableStateOf(false) }
                        Text(source.title, style = MaterialTheme.typography.titleSmall)
                        SelectionContainer { Text(if (expanded) source.text else source.text.take(180) + if (source.text.length > 180) "…" else "", style = MaterialTheme.typography.bodySmall) }
                        Row { TextButton(onClick = { expanded = !expanded }) { Text(if (expanded) "收起" else "展开") }; TextButton(onClick = { session.removeContext(index) }, enabled = !state.busy) { Text("移除") } }
                    }
                } } }
                item { OutlinedTextField(state.message, session::editMessage, Modifier.fillMaxWidth(), label = { Text("问题 · ${state.message.length}/4000") }, minLines = 3, maxLines = 8) }
                item { Text("将经课灵转发 Key、问题与资料给所选厂商，可能产生费用。", style = MaterialTheme.typography.bodySmall) }
                state.error?.let { error -> item { Text(error, color = MaterialTheme.colorScheme.error) } }
                item {
                    if (state.busy) { LinearProgressIndicator(Modifier.fillMaxWidth()); Text(state.operation); TextButton(onClick = session::cancel) { Text("取消等待") }; Text("取消后厂商仍可能计费。", style = MaterialTheme.typography.labelSmall) }
                    else Button(onClick = { session.send(scope) }, enabled = state.canSend, modifier = Modifier.fillMaxWidth()) { Text("发送") }
                }
                state.answer?.let { answer -> item { Card { Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("模型回复 · ${answer.model}", style = MaterialTheme.typography.titleMedium)
                    Text(state.answeredQuestion, style = MaterialTheme.typography.bodySmall)
                    SelectionContainer { Text(answer.answer) }
                    Text("输入 ${answer.usage.inputTokens ?: "未报告"} / 输出 ${answer.usage.outputTokens ?: "未报告"} tokens", style = MaterialTheme.typography.labelSmall)
                    onSaveToTrialNote?.let { save -> OutlinedButton(onClick = { save(state.answeredQuestion, "模型：${answer.model}\n\n${answer.answer}"); close() }, modifier = Modifier.fillMaxWidth()) { Text("保存笔记") } }
                    onCreateTrialTask?.let { create -> OutlinedButton(onClick = { create(state.answeredQuestion, answer.answer); close() }, modifier = Modifier.fillMaxWidth()) { Text("创建任务") } }
                    if (onSaveToTrialNote == null && onCreateTrialTask == null) {
                        OutlinedButton(onClick = { clipboard.setText(AnnotatedString(answer.answer)); copied = true }) { Text("复制回复") }
                        if (copied) Text("已复制", style = MaterialTheme.typography.labelSmall)
                    }
                } } } }
            }
        } } }
    }
    if (embedded) panel() else Dialog(onDismissRequest = ::close, properties = DialogProperties(usePlatformDefaultWidth = false, securePolicy = SecureFlagPolicy.SecureOn)) { panel() }
}
