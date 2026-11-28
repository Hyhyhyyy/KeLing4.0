package com.keling.app.planet

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.keling.app.ui.components.*
import com.keling.app.ui.screens.ai.ModelAccessSession

@Composable internal fun PlanetTutorDialog(question: PlanetQuestion, controller: PlanetTutorController, access: ModelAccessSession, onConfigure: () -> Unit, onClose: () -> Unit) {
    val state by controller.state.collectAsStateWithLifecycle()
    val accessState by access.state.collectAsStateWithLifecycle()
    val conversation = state.conversations[question.id] ?: PlanetTutorConversation()
    var ownModel by remember(question.id) { mutableStateOf(false) }
    var providerId by remember(question.id) { mutableStateOf("") }
    var model by remember(question.id) { mutableStateOf("") }
    LaunchedEffect(controller) { controller.loadCatalog() }
    DisposableEffect(question.id) { onDispose { controller.cancel(question.id) } }
    LaunchedEffect(state.providers) {
        if (state.providers.none { it.id == providerId }) { providerId = state.providers.firstOrNull()?.id.orEmpty(); model = state.providers.firstOrNull()?.chatModels?.firstOrNull().orEmpty() }
    }
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        StellarTheme { Surface(Modifier.fillMaxWidth().fillMaxHeight(.9f).imePadding(), shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.background) {
            Column(Modifier.fillMaxSize().padding(16.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    StellarHeading("问星芽", mascot = 0, compact = true, modifier = Modifier.weight(1f))
                    TextButton(onClick = onClose) { Text("返回作答") }
                }
                LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(10.dp), contentPadding = PaddingValues(vertical = 8.dp)) {
                    item { Text(question.prompt, style = MaterialTheme.typography.bodyMedium) }
                    item { Row(verticalAlignment = Alignment.CenterVertically) { Switch(ownModel, { ownModel = it }, enabled = !conversation.busy); Text("使用自己的模型", Modifier.padding(start = 8.dp)) } }
                    if (ownModel) item {
                        Text(accessState.model.ifBlank { "尚未配置模型" }, style = MaterialTheme.typography.bodySmall)
                        OutlinedButton(onClick = onConfigure, enabled = !conversation.busy) { Text("配置模型") }
                    } else {
                        if (state.catalogLoading) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
                        state.catalogError?.let { error -> item { Text(error, color = MaterialTheme.colorScheme.error); TextButton(onClick = { controller.loadCatalog(true) }) { Text("重新读取模型") } } }
                        if (state.providers.isNotEmpty()) item {
                            StellarSelect("模型服务", providerId, state.providers.map { it.id to it.name }, !conversation.busy) { providerId = it; model = state.providers.find { p -> p.id == it }?.chatModels?.firstOrNull().orEmpty() }
                            val models = state.providers.find { it.id == providerId }?.chatModels.orEmpty()
                            if (models.isNotEmpty()) StellarSelect("模型", model, models.map { it to it }, !conversation.busy) { model = it }
                        }
                    }
                    itemsIndexed(conversation.turns) { _, turn ->
                        Card { Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("我：${turn.question}", color = MaterialTheme.colorScheme.secondary)
                            SelectionContainer { Text(turn.answer) }
                            Text(turn.model, style = MaterialTheme.typography.labelSmall)
                        } }
                    }
                    conversation.error?.let { error -> item { Text(error, color = MaterialTheme.colorScheme.error) } }
                    if (conversation.busy) item { LinearProgressIndicator(Modifier.fillMaxWidth()); TextButton(onClick = { controller.cancel(question.id) }) { Text("停止等待") } }
                }
                OutlinedTextField(conversation.input, { controller.edit(question.id, it) }, label = { Text("哪里还没想明白？") }, modifier = Modifier.fillMaxWidth(), minLines = 2, maxLines = 4, enabled = !conversation.busy)
                Button(onClick = { controller.send(question.id, ownModel, providerId, model) }, enabled = !conversation.busy && conversation.input.isNotBlank() && (if (ownModel) accessState.apiKey.isNotBlank() && accessState.model.isNotBlank() else model.isNotBlank()), modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) { Text(if (conversation.busy) "请稍候…" else "请星芽提示") }
            }
        } }
    }
}
