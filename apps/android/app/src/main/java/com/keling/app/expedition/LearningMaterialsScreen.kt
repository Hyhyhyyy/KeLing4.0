package com.keling.app.expedition

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
    val access = remember(token) { guest?.modelAccess ?: ModelAccessSession() }; val accessState by access.state.collectAsState()
    DisposableEffect(access) { onDispose { if (guest == null) access.close() } }
    fun action(block: suspend () -> Unit) {
        if (busy) return
        busy = true; error = null; notice = null
        scope.launch { try { block() } catch (e: CancellationException) { throw e } catch (e: Exception) { error = e.message ?: "操作失败，原输入已保留" } finally { busy = false } }
    }
    suspend fun reload() { if (courseId != null) { documents = api.list(courseId); selected = selected.intersect(documents.map { it.id }.toSet()) } }
    LaunchedEffect(token, courseId) { action { reload() } }
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
        else { val decoded = result.third.toString(Charsets.UTF_8); require(decoded.length <= 100000) { "文字超过10万字元，请按章节拆分；没有截断保存" }; format = if (result.first.endsWith(".md", true)) "MARKDOWN" else "TEXT"; pdf = null; text = decoded }
        notice = "已读取 $sourceName；解析预览后再确认保存。"
    } }
    StellarTheme { Surface(Modifier.fillMaxSize()) { Column {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) { TextButton(onClick = onBack) { Text("返回星图") }; Text("课程资料与版本", style = MaterialTheme.typography.titleLarge) }
        if (busy) LinearProgressIndicator(Modifier.fillMaxWidth())
        LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(bottom = 24.dp)) {
            if (courseId == null) item { Text("请先在星图选择或创建课程。") }
            error?.let { item { Text(it, color = MaterialTheme.colorScheme.error) } }; notice?.let { item { Text(it, color = MaterialTheme.colorScheme.primary) } }
            item { Text(if (guest != null) "资料只保留本次内存；解析是匿名无状态请求。退出后清空。" else "保存不可变版本，更新与删除会保留历史引用；更改资料前会检查原版本。", style = MaterialTheme.typography.bodySmall) }
            item { Card { Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(if (editing == null) "导入课程材料" else "更新《${editing!!.title}》v${editing!!.version}", style = MaterialTheme.typography.titleMedium)
                OutlinedTextField(title, { title = it.take(120); preview = null }, label = { Text("资料标题") }, modifier = Modifier.fillMaxWidth(), enabled = !busy)
                Row { FilterChip(format == "TEXT", { format = "TEXT"; pdf = null; preview = null }, label = { Text("文字") }, enabled = !busy); Spacer(Modifier.width(8.dp)); FilterChip(format == "MARKDOWN", { format = "MARKDOWN"; pdf = null; preview = null }, label = { Text("Markdown") }, enabled = !busy) }
                if (format != "PDF") OutlinedTextField(text, { text = it.take(100000); preview = null }, label = { Text("粘贴原文（最多10万字元）") }, minLines = 5, maxLines = 10, modifier = Modifier.fillMaxWidth(), enabled = !busy)
                else Text("已选择PDF：$sourceName。最多512KiB、50页；扫描件无法提取文字时会明确报错。")
                OutlinedButton(onClick = { pickFile.launch(arrayOf("application/pdf", "text/plain", "text/markdown")) }, enabled = !busy) { Text("选择文字 / Markdown / PDF 文件") }
                Button(onClick = { action { val input = MaterialInput(title.trim(), sourceName, format, if (format == "PDF") null else text, if (format == "PDF") pdf else null); preview = api.parse(input); pendingInput = input; opId = UUID.randomUUID().toString() } }, enabled = !busy && courseId != null && title.isNotBlank() && (text.isNotBlank() || pdf != null), modifier = Modifier.fillMaxWidth()) { Text("解析并预览，不立即保存") }
                if (editing != null) TextButton(onClick = { editing = null; preview = null; title = ""; text = ""; pdf = null; format = "TEXT" }) { Text("停止更新，保留现有版本") }
            } } }
            preview?.let { parsed -> item { Card { Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("预览：${parsed.spans.size} 个文字片段 · ${parsed.content.length} 字元")
                parsed.warnings.forEach { Text(it) }; SelectionContainer { Text(parsed.content.take(2500)) }
                Button(onClick = { action { api.save(requireNotNull(courseId), requireNotNull(pendingInput), parsed, editing, opId); preview = null; editing = null; title = ""; text = ""; pdf = null; format = "TEXT"; notice = if (guest != null) "资料已保留在本次内存" else "新资料版本已保存"; reload() } }, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text(if (guest != null) "确认本次导入" else "确认保存新版本") }
            } } } }
            item { Text("选择要阅读、提取或发送给 AI 的资料", style = MaterialTheme.typography.titleMedium) }
            items(documents, key = { it.id }) { doc -> Card { Column(Modifier.fillMaxWidth().padding(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(doc.id in selected, { checked -> selected = if (checked) selected + doc.id else selected - doc.id; candidates = null; aiAnswer = null }); Text("${doc.title} · v${doc.version}", Modifier.weight(1f)) }
                Text("${doc.format} · ${doc.sourceName}", style = MaterialTheme.typography.bodySmall)
                Row { TextButton(onClick = { action { viewing = api.get(doc.id) } }, enabled = !busy) { Text("阅读与来源") }
                    TextButton(onClick = { action { val loaded = api.get(doc.id); editing = loaded; title = loaded.title; text = loaded.content; format = "TEXT"; sourceName = "${loaded.sourceName}（文字修订）".take(180); pdf = null; preview = null } }, enabled = !busy) { Text("修订版本") }
                    TextButton(onClick = { removing = doc }, enabled = !busy) { Text("移除") }
                }
            } } }
            item { OutlinedButton(onClick = { action { candidates = api.mapDraft(requireNotNull(courseId), selected.toList()); candidateSelection = candidates!!.candidates.indices.toSet(); opId = UUID.randomUUID().toString() } }, enabled = !busy && selected.isNotEmpty(), modifier = Modifier.fillMaxWidth()) { Text("从选定原文提取知识点候选") } }
            candidates?.let { draft -> item { Card { Column(Modifier.fillMaxWidth().padding(12.dp)) {
                Text(draft.note)
                draft.candidates.forEachIndexed { index, candidate -> Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(index in candidateSelection, { checked -> candidateSelection = if (checked) candidateSelection + index else candidateSelection - index }); Column(Modifier.weight(1f)) { Text(candidate.title); Text(candidate.description.take(200), style = MaterialTheme.typography.bodySmall) } } }
                Button(onClick = { action { api.confirm(requireNotNull(courseId), opId, draft.candidates.filterIndexed { index, _ -> index in candidateSelection }); candidates = null; notice = "已确认的知识点可在课程资料与智能编排中使用。" } }, enabled = !busy && candidateSelection.isNotEmpty(), modifier = Modifier.fillMaxWidth()) { Text("人工确认这些候选后加入课程") }
            } } } }
            item { Card { Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("根据选定资料问星芽", style = MaterialTheme.typography.titleMedium)
                Text("发送前请核对勾选的资料。AI只返回建议和引用，不发奖励或修改课程。", style = MaterialTheme.typography.bodySmall)
                OutlinedButton(onClick = { modelPanel = true }, modifier = Modifier.fillMaxWidth()) { Text(if (accessState.apiKey.isBlank()) "输入自己的 API Key / 选择模型" else "${accessState.provider?.name ?: accessState.providerId} · ${accessState.model.ifBlank { "选择模型" }}") }
                OutlinedTextField(question, { question = it.take(4000) }, label = { Text("你的问题") }, modifier = Modifier.fillMaxWidth(), minLines = 2, enabled = !busy)
                Button(onClick = { action { aiAnswer = api.tutor(requireNotNull(courseId), selected.toList(), AccessCredentials(accessState.providerId, accessState.apiKey, accessState.baseUrl.ifBlank { null }), accessState.model, question.trim()) } }, enabled = !busy && selected.isNotEmpty() && question.isNotBlank() && accessState.canDiscover && accessState.model.isNotBlank(), modifier = Modifier.fillMaxWidth()) { Text("确认资料范围并发送问题") }
                aiAnswer?.let { answer -> SelectionContainer { Text(answer.answer) }; Text(answer.note, style = MaterialTheme.typography.bodySmall)
                    answer.sources.forEach { source -> Text("来源：${source["title"]?.jsonPrimitive?.content.orEmpty()} · ${source["text"]?.jsonPrimitive?.content.orEmpty().take(350)}", style = MaterialTheme.typography.bodySmall) }
                }
            } } }
        }
    } } }
    if (modelPanel) ModelAccessPanel(onClose = { modelPanel = false }, sharedSession = access,
        sharedSessionNote = if (guest != null) "Key仅本次游客内存，跨模块可用，退出即清除。" else "Key仅保留在当前资料页面内存，离开资料页面后清除，不写入资料、云端或本机存档。")
    viewing?.let { doc -> AlertDialog(onDismissRequest = { viewing = null }, title = { Text("${doc.title} · v${doc.version}") }, text = {
        LazyColumn(Modifier.heightIn(max = 450.dp)) { item { SelectionContainer { Text(doc.content) } }; item { Text("版本：${doc.id}\n${doc.spans.size}片段 · ${doc.parseStatus}\n内容摘要：${doc.contentHash}", style = MaterialTheme.typography.bodySmall) } }
    }, confirmButton = { TextButton(onClick = { viewing = null }) { Text("关闭") } }) }
    removing?.let { doc -> AlertDialog(onDismissRequest = { removing = null }, title = { Text("移除《${doc.title}》？") }, text = { Text("当前资料不再用于新请求；历史已提交引用仍保留原版本。相关未完成远征可能需要重读资料。") }, confirmButton = { TextButton(onClick = { action { api.delete(doc.id, UUID.randomUUID().toString()); removing = null; reload(); candidates = null; aiAnswer = null } }, enabled = !busy) { Text("确认移除") } }, dismissButton = { TextButton(onClick = { removing = null }) { Text("取消") } }) }
}
