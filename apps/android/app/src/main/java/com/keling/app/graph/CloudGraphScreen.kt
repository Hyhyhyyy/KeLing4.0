package com.keling.app.graph

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.keling.app.data.KnowledgeNode
import com.keling.app.network.ApiException
import com.keling.app.ui.components.*
import kotlinx.coroutines.launch

@Composable fun CloudGraphScreen(token: String, courseId: String, onBack: () -> Unit) {
    val api = remember(token) { GraphApi(token) }; val scope = rememberCoroutineScope()
    var document by remember(token, courseId) { mutableStateOf<GraphDocument?>(null) }
    var selectedId by remember(courseId) { mutableStateOf<String?>(null) }
    var editing by remember(courseId) { mutableStateOf<KnowledgeNode?>(null) }
    var editorOpen by remember(courseId) { mutableStateOf(false) }
    var deleting by remember(courseId) { mutableStateOf(false) }
    var dirty by remember(courseId) { mutableStateOf(false) }
    var leaving by remember(courseId) { mutableStateOf(false) }
    var busy by remember(courseId) { mutableStateOf(false) }
    var error by remember(courseId) { mutableStateOf<String?>(null) }
    var reload by remember(courseId) { mutableIntStateOf(0) }
    var canvasRevision by remember(courseId) { mutableIntStateOf(0) }
    var discardReload by remember(courseId) { mutableStateOf(false) }
    fun edit(id: String) { document?.nodes?.find { it.id == id }?.let { selectedId = id; editing = it.editable(); editorOpen = true } }
    fun back() { if (dirty) leaving = true else onBack() }
    BackHandler(onBack = ::back)
    LaunchedEffect(token, courseId, reload) {
        busy = true; error = null
        try { document = api.load(courseId); canvasRevision++ } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (_: Exception) { error = "图谱读取失败，请重试" } finally { busy = false }
    }
    StellarTheme { Surface(Modifier.fillMaxSize()) { Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(8.dp)) {
            IconButton(onClick = ::back) { StellarArrow(direction = StellarArrowDirection.Left, description = "返回") }
            StellarHeading("知识图谱", mascot = 3, modifier = Modifier.weight(1f), compact = true)
        }
        Row(Modifier.padding(horizontal = 8.dp)) {
            TextButton(onClick = { editing = null; editorOpen = true }, enabled = !busy && document != null) { Text("新建知识点") }
            TextButton(onClick = { selectedId?.let(::edit) }, enabled = !busy && selectedId != null) { Text("编辑选中") }
            TextButton(onClick = { if (dirty) discardReload = true else reload++ }, enabled = !busy) { Text("刷新") }
        }
        error?.let { Text(it, Modifier.padding(12.dp), color = MaterialTheme.colorScheme.error) }
        if (busy) LinearProgressIndicator(Modifier.fillMaxWidth())
        document?.let { doc -> SharedGraphCanvas(courseId, doc, canvasRevision, Modifier.weight(1f).fillMaxWidth(),
            onSelect = { selectedId = it }, onEdit = ::edit, onDirty = { dirty = it }, onError = { error = it }, onSave = { positions ->
                if (busy) throw IllegalStateException("正在保存")
                val snapshot = document ?: throw IllegalStateException("暂无图谱")
                validateGraphPositions(positions, snapshot.nodes.map { it.id }.toSet())
                busy = true; error = null
                try {
                    val byId = snapshot.nodes.associateBy { it.id }
                    val saved = api.saveLayout(courseId, GraphLayoutInput(positions.map { p -> GraphPositionWrite(p.id, p.positionX, p.positionY, byId.getValue(p.id).updatedAt) }))
                    document = if (saved.layoutSaved) saved else api.load(courseId)
                    if (!saved.layoutSaved) error = "课程新增了知识点，请核对并保存完整布局"
                    saved.nodes.filter { it.id in byId }.map { GraphPosition(it.id, it.positionX, it.positionY) }
                } catch (e: Exception) { error = if (e is ApiException && e.statusCode == 409) "图谱已在其他地方修改；本次布局已保留" else "保存失败，布局已保留，请重试"; throw e }
                finally { busy = false }
            }) }
    } } }
    if (editorOpen) KnowledgeNodeEditDialog(editing, courseId, document?.nodes.orEmpty().filter { it.id != editing?.id }.map { it.editable() }, onDismiss = { if (!busy) editorOpen = false }, onSave = { value ->
        if (!busy) scope.launch {
            busy = true; error = null
            try { api.saveNode(courseId, editing?.id, GraphNodeInput.from(value)); document = api.load(courseId); editorOpen = false }
            catch (_: Exception) { error = "知识点保存失败，内容已保留" } finally { busy = false }
        }
    }, onDelete = editing?.let { { deleting = true } })
    if (deleting) AlertDialog(onDismissRequest = { deleting = false }, title = { Text("删除这个知识点？") }, confirmButton = { TextButton(onClick = {
        val id = editing?.id ?: return@TextButton
        if (!busy) scope.launch { busy = true; try { api.deleteNode(courseId, id); document = api.load(courseId); deleting = false; editorOpen = false; selectedId = null } catch (_: Exception) { error = "删除失败，请重试" } finally { busy = false } }
    }) { Text("删除") } }, dismissButton = { TextButton(onClick = { deleting = false }) { Text("取消") } })
    if (leaving) AlertDialog(onDismissRequest = { leaving = false }, title = { Text("布局尚未保存") }, confirmButton = { TextButton(onClick = onBack) { Text("放弃本次布局") } }, dismissButton = { TextButton(onClick = { leaving = false }) { Text("继续编辑") } })
    if (discardReload) AlertDialog(onDismissRequest = { discardReload = false }, title = { Text("重新载入最新图谱？") }, text = { Text("本次未保存的移动将被放弃。") }, confirmButton = { TextButton(onClick = { discardReload = false; reload++ }) { Text("重新载入") } }, dismissButton = { TextButton(onClick = { discardReload = false }) { Text("保留本次布局") } })
}
