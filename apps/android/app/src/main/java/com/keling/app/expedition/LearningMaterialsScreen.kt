package com.keling.app.expedition

import com.keling.app.ui.components.StellarHeading
import com.keling.app.ui.components.StellarSectionTitle
import com.keling.app.ui.components.StellarTitleMark
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.keling.app.network.*
import com.keling.app.ui.components.StellarTheme
import com.keling.app.ui.screens.ai.ModelAccessPanel
import com.keling.app.ui.screens.ai.ModelAccessSession
import kotlinx.coroutines.*
import java.io.ByteArrayOutputStream
import java.util.Base64
import java.util.UUID
import kotlinx.serialization.json.*

@Composable fun LearningMaterialsScreen(token: String, courseId: String?, onBack: () -> Unit) {
    val guest = GuestWorkspaces.find(token); val api = remember(token) { LearningApi(token) }
    val context = LocalContext.current; val scope = rememberCoroutineScope()
    var documents by remember { mutableStateOf<List<LearningDoc>>(emptyList()) }; var selected by remember { mutableStateOf<Set<String>>(emptySet()) }
    var busy by remember { mutableStateOf(false) }; var error by remember { mutableStateOf<String?>(null) }; var notice by remember { mutableStateOf<String?>(null) }
    var title by rememberSaveable { mutableStateOf("") }; var text by rememberSaveable { mutableStateOf("") }; var format by rememberSaveable { mutableStateOf("TEXT") }
    var sourceName by remember { mutableStateOf("手动输入") }; var pdf by remember { mutableStateOf<String?>(null) }
    var preview by remember { mutableStateOf<ParsedMaterial?>(null) }; var pendingInput by remember { mutableStateOf<MaterialInput?>(null) }
    var editing by remember { mutableStateOf<LearningDoc?>(null) }; var viewing by remember { mutableStateOf<LearningDoc?>(null) }
    var removing by remember { mutableStateOf<LearningDoc?>(null) }; var candidates by remember { mutableStateOf<MapDraft?>(null) }
    var candidateSelection by remember { mutableStateOf<Set<Int>>(emptySet()) }; var opId by remember { mutableStateOf(UUID.randomUUID().toString()) }
    var modelPanel by remember { mutableStateOf(false) }; var question by rememberSaveable { mutableStateOf("") }
    var aiAnswer by remember { mutableStateOf<MaterialTutorAnswer?>(null) }
    var useOwnModel by remember { mutableStateOf(false) }
    var publicProvider by remember { mutableStateOf<ModelProvider?>(null) }
    var modelLoading by remember { mutableStateOf(true) }
    var modelReload by remember { mutableIntStateOf(0) }
    var asking by remember { mutableStateOf(false) }
    var operation by remember { mutableStateOf<Job?>(null) }
    val access = remember(token) { guest?.modelAccess ?: ModelAccessSession() }; val accessState by access.state.collectAsState()
    DisposableEffect(access) { onDispose { if (guest == null) access.close() } }
    fun action(block: suspend () -> Unit) {
        if (busy) return
        busy = true; error = null; notice = null
        operation = scope.launch { try { block() } catch (e: CancellationException) { throw e } catch (e: Exception) { error = e.message ?: "操作失败，原输入已保留" } finally { busy = false; asking = false } }
    }
    suspend fun reload() { if (courseId != null) { documents = api.list(courseId); selected = selected.intersect(documents.map { it.id }.toSet()) } }
    LaunchedEffect(token, courseId) { action { reload() } }
    LaunchedEffect(token, modelReload) {
        modelLoading = true
        try { publicProvider = AssistantApi().catalog(token).providers.firstOrNull { it.id in setOf("public", "miaoda") && it.configured && it.chatModels.isNotEmpty() } }
        catch (e: CancellationException) { throw e }
        catch (_: Exception) { publicProvider = null }
        finally { modelLoading = false }
    }
    val pickFile = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> if (uri != null) action {
        val result = withContext(Dispatchers.IO) {
            val name = context.contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor -> if (cursor.moveToFirst()) cursor.getString(0) else "课程资料" } ?: "课程资料"
            val bytes = context.contentResolver.openInputStream(uri)?.use { stream ->
                val output = ByteArrayOutputStream(); val buffer = ByteArray(8192)
                while (true) { val read = stream.read(buffer); if (read < 0) break; require(output.size() + read <= 512 * 1024) { "文件超过512KiB，请按章节拆分" }; output.write(buffer, 0, read) }
                output.toByteArray()
            } ?: error("无法读取文件")
            Triple(name.take(180), context.contentResolver.getType(uri), bytes)
        }
        sourceName = result.first; title = result.first.substringBeforeLast('.').take(120); preview = null
        if (result.second == "application/pdf" || result.first.endsWith(".pdf", true)) { format = "PDF"; pdf = Base64.getEncoder().encodeToString(result.third); text = "" }
        else { val decoded = result.third.toString(Charsets.UTF_8); require(decoded.length <= 100000) { "文字超过10万字，请按章节拆分" }; format = if (result.first.endsWith(".md", true)) "MARKDOWN" else "TEXT"; pdf = null; text = decoded }
        notice = "已读取 $sourceName"
    } }
    StellarTheme { Surface(Modifier.fillMaxSize()) { Column {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) { TextButton(onClick = onBack) { Text("返回星图") }; StellarHeading("课程资料", mascot = 4, compact = true) }
        if (busy) LinearProgressIndicator(Modifier.fillMaxWidth())
        LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(bottom = 24.dp)) {
            if (courseId == null) item { Text("请先选择课程") }
            error?.let { item { Text(it, color = MaterialTheme.colorScheme.error) } }; notice?.let { item { Text(it, color = MaterialTheme.colorScheme.primary) } }
            if (guest != null) item { Text("游客资料退出即清空", style = MaterialTheme.typography.bodySmall) }
            item { Card { Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                StellarSectionTitle(if (editing == null) "导入课程材料" else "更新《${editing!!.title}》v${editing!!.version}", motif = 2)
                OutlinedTextField(title, { title = it.take(120); preview = null }, label = { Text("资料标题") }, modifier = Modifier.fillMaxWidth(), enabled = !busy)
                Row { FilterChip(format == "TEXT", { format = "TEXT"; pdf = null; preview = null }, label = { Text("文字") }, enabled = !busy); Spacer(Modifier.width(8.dp)); FilterChip(format == "MARKDOWN", { format = "MARKDOWN"; pdf = null; preview = null }, label = { Text("Markdown") }, enabled = !busy) }
                if (format != "PDF") OutlinedTextField(text, { text = it.take(100000); preview = null }, label = { Text("粘贴原文（最多10万字）") }, minLines = 5, maxLines = 10, modifier = Modifier.fillMaxWidth(), enabled = !busy)
                else Text("$sourceName · PDF ≤512KiB、50页")
                OutlinedButton(onClick = { pickFile.launch(arrayOf("application/pdf", "text/plain", "text/markdown")) }, enabled = !busy) { Text("选择文件（TXT / MD / PDF）") }
                Button(onClick = { action { val input = MaterialInput(title.trim(), sourceName, format, if (format == "PDF") null else text, if (format == "PDF") pdf else null); preview = api.parse(input); pendingInput = input; opId = UUID.randomUUID().toString() } }, enabled = !busy && courseId != null && title.isNotBlank() && (text.isNotBlank() || pdf != null), modifier = Modifier.fillMaxWidth()) { Text("预览") }
                if (editing != null) TextButton(onClick = { editing = null; preview = null; title = ""; text = ""; pdf = null; format = "TEXT" }) { Text("取消更新") }
            } } }
            preview?.let { parsed -> item { Card { Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("预览：${parsed.spans.size} 个片段 · ${parsed.content.length} 字")
                parsed.warnings.forEach { Text(it) }; SelectionContainer { Text(parsed.content.take(2500)) }
                Button(onClick = { action { api.save(requireNotNull(courseId), requireNotNull(pendingInput), parsed, editing, opId); preview = null; editing = null; title = ""; text = ""; pdf = null; format = "TEXT"; notice = if (guest != null) "已导入" else "已保存"; reload() } }, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text(if (guest != null) "确认导入" else "保存新版本") }
            } } } }
            item { StellarSectionTitle("我的资料", motif = 2) }
            items(documents, key = { it.id }) { doc -> Card { Column(Modifier.fillMaxWidth().padding(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(doc.id in selected, { checked -> selected = if (checked) selected + doc.id else selected - doc.id; candidates = null; aiAnswer = null }, enabled = !busy); Text("${doc.title} · v${doc.version}", Modifier.weight(1f)) }
                Text("${doc.format} · ${doc.sourceName}", style = MaterialTheme.typography.bodySmall)
                Row { TextButton(onClick = { action { viewing = api.get(doc.id) } }, enabled = !busy) { Text("阅读") }
                    TextButton(onClick = { action { val loaded = api.get(doc.id); editing = loaded; title = loaded.title; text = loaded.content; format = "TEXT"; sourceName = "${loaded.sourceName}（文字修订）".take(180); pdf = null; preview = null } }, enabled = !busy) { Text("修订版本") }
                    TextButton(onClick = { removing = doc }, enabled = !busy) { Text("移除") }
                }
            } } }
            item { OutlinedButton(onClick = { action { candidates = api.mapDraft(requireNotNull(courseId), selected.toList()); candidateSelection = candidates!!.candidates.indices.toSet(); opId = UUID.randomUUID().toString() } }, enabled = !busy && selected.isNotEmpty(), modifier = Modifier.fillMaxWidth()) { Text("提取知识点") } }
            candidates?.let { draft -> item { Card { Column(Modifier.fillMaxWidth().padding(12.dp)) {
                Text("知识点候选 · 待确认")
                draft.candidates.forEachIndexed { index, candidate -> Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(index in candidateSelection, { checked -> candidateSelection = if (checked) candidateSelection + index else candidateSelection - index }); Column(Modifier.weight(1f)) { Text(candidate.title); Text(candidate.description.take(200), style = MaterialTheme.typography.bodySmall) } } }
                Button(onClick = { action { api.confirm(requireNotNull(courseId), opId, draft.candidates.filterIndexed { index, _ -> index in candidateSelection }); candidates = null; notice = "知识点已添加" } }, enabled = !busy && candidateSelection.isNotEmpty(), modifier = Modifier.fillMaxWidth()) { Text("确认添加") }
            } } } }
            item { Card { Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                StellarSectionTitle("资料问答", motif = 0)
                Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(useOwnModel, { useOwnModel = it }, enabled = !busy); Text("使用自己的模型") }
                if (useOwnModel) OutlinedButton(onClick = { modelPanel = true }, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text(if (accessState.apiKey.isBlank()) "配置模型" else "${accessState.provider?.name ?: accessState.providerId} · ${accessState.model.ifBlank { "选择模型" }}") }
                else if (modelLoading) LinearProgressIndicator(Modifier.fillMaxWidth())
                else if (publicProvider != null) Text(publicProvider!!.name, style = MaterialTheme.typography.bodySmall)
                else TextButton(onClick = { modelReload++ }, enabled = !busy) { Text("公共模型暂不可用 · 重试") }
                OutlinedTextField(question, { question = it.take(4000) }, label = { Text("你的问题") }, modifier = Modifier.fillMaxWidth(), minLines = 2, enabled = !busy)
                Button(onClick = { asking = true; action { aiAnswer = null; aiAnswer = api.tutor(requireNotNull(courseId), selected.toList(),
                    if (useOwnModel) AccessCredentials(accessState.providerId, accessState.apiKey, accessState.baseUrl.ifBlank { null }) else null,
                    if (useOwnModel) accessState.model else publicProvider?.chatModels?.firstOrNull(), question.trim(), if (useOwnModel) null else publicProvider?.id) } },
                    enabled = !busy && courseId != null && selected.isNotEmpty() && question.isNotBlank() && (if (useOwnModel) accessState.canDiscover && accessState.model.isNotBlank() else publicProvider != null), modifier = Modifier.fillMaxWidth()) { Text(if (asking) "正在生成" else "发送问题") }
                if (asking) TextButton(onClick = { operation?.cancel(); notice = "已取消等待，问题已保留" }) { Text("取消等待") }
                aiAnswer?.let { answer -> SelectionContainer { Text(answer.answer) }
                    answer.sources.forEach { source -> Text("来源：${source["title"]?.jsonPrimitive?.content.orEmpty()} · ${source["text"]?.jsonPrimitive?.content.orEmpty().take(350)}", style = MaterialTheme.typography.bodySmall) }
                }
            } } }
        }
    } } }
    if (modelPanel) ModelAccessPanel(onClose = { modelPanel = false }, sharedSession = access,
        sharedSessionNote = if (guest != null) "Key 退出试用即清除" else "Key 离开本页即清除")
    viewing?.let { doc -> AlertDialog(onDismissRequest = { viewing = null }, title = { Text("${doc.title} · v${doc.version}") }, text = {
        LazyColumn(Modifier.heightIn(max = 450.dp)) { item { SelectionContainer { Text(doc.content) } }; item { Text("${doc.spans.size} 个片段", style = MaterialTheme.typography.bodySmall) } }
    }, confirmButton = { TextButton(onClick = { viewing = null }) { Text("关闭") } }) }
    removing?.let { doc -> AlertDialog(onDismissRequest = { removing = null }, title = { Text("移除《${doc.title}》？") }, text = { Text("移除后停止使用此资料，历史引用保留。") }, confirmButton = { TextButton(onClick = { action { api.delete(doc.id, UUID.randomUUID().toString()); removing = null; reload(); candidates = null; aiAnswer = null } }, enabled = !busy) { Text("确认移除") } }, dismissButton = { TextButton(onClick = { removing = null }) { Text("取消") } }) }
}
