package com.keling.app.ui.screens.knowledge

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.keling.app.data.KnowledgeNode
import com.keling.app.graph.*
import com.keling.app.ui.components.*
import com.keling.app.viewmodel.AppViewModel
import kotlinx.coroutines.launch

val LevelColors = listOf(Color(0xFF285950), Color(0xFF356778), Color(0xFF805333), Color(0xFF59734A), Color(0xFF6B5B95))
fun getLevelColor(level: Int): Color = LevelColors.getOrElse(level) { LevelColors.last() }
fun getLevelColorLight(level: Int): Color = getLevelColor(level).copy(alpha = .15f)
fun calculateNodeLevel(node: KnowledgeNode, allNodes: List<KnowledgeNode>): Int {
    val byId = allNodes.associateBy { it.id }; val visited = mutableSetOf<String>()
    fun depth(id: String): Int { if (!visited.add(id)) return 0; val item = byId[id] ?: return 0; return if (item.parentIds.isEmpty()) 0 else 1 + (item.parentIds.map(::depth).maxOrNull() ?: 0) }
    return depth(node.id)
}

@Composable fun MindMapKnowledgeGraphScreen(viewModel: AppViewModel, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    val selected = viewModel.selectedCourseId.value
    val course = viewModel.courses.value.find { it.id == selected || it.name == selected }
    val courseId = course?.id ?: selected
    val nodes = viewModel.knowledgeNodes.value.filter { it.courseId == courseId }
    var selectedId by remember(courseId) { mutableStateOf<String?>(null) }
    var editing by remember(courseId) { mutableStateOf<KnowledgeNode?>(null) }
    var editorOpen by remember(courseId) { mutableStateOf(false) }
    var dirty by remember(courseId) { mutableStateOf(false) }
    var leaving by remember(courseId) { mutableStateOf(false) }
    var error by remember(courseId) { mutableStateOf<String?>(null) }
    fun back() { if (dirty) leaving = true else onBack() }
    fun edit(id: String) { nodes.find { it.id == id }?.let { selectedId = id; editing = it; editorOpen = true } }
    BackHandler(onBack = ::back)
    val document = GraphDocument(nodes.map { GraphNode(it.id, it.courseId, it.name, it.description, it.parentIds, it.childIds, it.difficulty, it.masteryLevel, it.positionX.toDouble(), it.positionY.toDouble()) }, nodes.isNotEmpty() && nodes.all { it.layoutSaved }, nodes.filter { it.layoutSaved }.map { it.id })
    StellarTheme { Surface(Modifier.fillMaxSize()) { Column(Modifier.fillMaxSize()) {
        Row(Modifier.padding(8.dp)) {
            IconButton(onClick = ::back) { StellarArrow(direction = StellarArrowDirection.Left, description = "返回") }
            StellarHeading(course?.name ?: "知识图谱", mascot = 3, modifier = Modifier.weight(1f), compact = true)
        }
        Row(Modifier.padding(horizontal = 8.dp)) {
            TextButton(onClick = { editing = null; editorOpen = true }, enabled = courseId != null) { Text("新建知识点") }
            TextButton(onClick = { selectedId?.let(::edit) }, enabled = selectedId != null) { Text("编辑选中") }
        }
        error?.let { Text(it, Modifier.padding(12.dp), color = MaterialTheme.colorScheme.error) }
        if (courseId != null) SharedGraphCanvas(courseId, document, 0, Modifier.weight(1f).fillMaxWidth(), onSelect = { selectedId = it }, onEdit = ::edit,
            onDirty = { dirty = it }, onError = { error = it }, onSave = { positions ->
                try { viewModel.saveKnowledgeLayout(courseId, positions); error = null; positions } catch (e: Exception) { error = "布局保存失败，请重试"; throw e }
            })
    } } }
    if (editorOpen && courseId != null) KnowledgeNodeEditDialog(editing, courseId, nodes.filter { it.id != editing?.id }, onDismiss = { editorOpen = false },
        onSave = { node -> scope.launch { try { viewModel.replaceGraphNode(node); editorOpen = false } catch (_: Exception) { error = "知识点保存失败，请检查前置关系" } } },
        onDelete = editing?.let { node -> { scope.launch { try { viewModel.deleteGraphNode(node); editorOpen = false; selectedId = null } catch (_: Exception) { error = "删除失败，请重试" } }; Unit } })
    if (leaving) AlertDialog(onDismissRequest = { leaving = false }, title = { Text("布局尚未保存") }, confirmButton = { TextButton(onClick = onBack) { Text("放弃本次布局") } }, dismissButton = { TextButton(onClick = { leaving = false }) { Text("继续编辑") } })
}
