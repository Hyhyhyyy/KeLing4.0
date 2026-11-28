package com.keling.app.planet

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.keling.app.graph.*
import com.keling.app.ui.components.StellarSectionTitle
import kotlinx.coroutines.delay

fun planetPreviewGraph(draft: PlanetDraft): GraphDocument? {
    val graph = draft.knowledgeGraph ?: return null
    require(graph.nodes.size in 1..48 && graph.edges.size <= 96) { "知识星图内容数量异常" }
    val ids = graph.nodes.map { it.id }.toSet()
    require(ids.size == graph.nodes.size && graph.edges.all { it.source in ids && it.target in ids && it.source != it.target && it.kind in setOf("hierarchy", "related") }) { "知识星图关系无效" }
    val parents = graph.edges.filter { it.kind == "hierarchy" }.groupBy { it.target }
    val visiting = mutableSetOf<String>(); val visited = mutableSetOf<String>()
    fun visit(id: String) {
        if (id in visited) return
        require(visiting.add(id)) { "知识星图层级不能循环" }
        parents[id].orEmpty().forEach { visit(it.source) }
        visiting.remove(id); visited.add(id)
    }
    ids.forEach(::visit)
    val nodes = graph.nodes.map { n -> GraphNode(n.id, "preview:${draft.id}", n.title, n.summary,
        graph.edges.filter { it.target == n.id && it.kind == "hierarchy" }.map { it.source },
        graph.edges.filter { it.source == n.id && it.kind == "hierarchy" }.map { it.target }) }
    return GraphDocument(nodes = nodes, edges = graph.edges.map { GraphEdge(it.source, it.target, it.label, it.kind) })
}

@Composable internal fun PlanetGraphPreview(draft: PlanetDraft) {
    val graphResult = remember(draft.id, draft.knowledgeGraph) { runCatching { planetPreviewGraph(draft) } }
    val graph = graphResult.getOrNull()
    if (draft.knowledgeGraph == null) return
    var error by remember(draft.id, draft.knowledgeGraph) { mutableStateOf(graphResult.exceptionOrNull()?.message) }
    var loaded by remember(draft.id, draft.knowledgeGraph) { mutableStateOf(false) }
    var refresh by remember(draft.id) { mutableIntStateOf(0) }
    var selected by remember(draft.id, draft.knowledgeGraph) { mutableStateOf<String?>(null) }
    LaunchedEffect(draft.id, draft.knowledgeGraph, refresh) { delay(15_000); if (!loaded && error == null) error = "知识星图加载较慢，请重试" }
    Card { Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        StellarSectionTitle("初始知识星图", motif = 3)
        if (graph != null) {
            Text("${graph.nodes.size} 个知识点 · ${graph.edges.orEmpty().size} 条关系", style = MaterialTheme.typography.bodySmall)
            if (!loaded && error == null) LinearProgressIndicator(Modifier.fillMaxWidth())
            key(draft.id, refresh) {
                SharedGraphCanvas("preview:${draft.id}", graph, refresh, Modifier.fillMaxWidth().height(380.dp),
                    onSelect = { selected = it }, onDirty = {}, onError = { error = it }, onSave = { throw IllegalStateException("生成预览不可保存布局") },
                    readOnly = true, onReady = { loaded = true; error = null })
            }
            draft.knowledgeGraph.nodes.find { it.id == selected }?.let { node ->
                Text(node.title, style = MaterialTheme.typography.titleMedium)
                Text(node.summary)
                PlanetSources(draft.research, node.sourceIds)
            }
        }
        error?.let { message ->
            Text(message, color = MaterialTheme.colorScheme.error)
            if (graph != null) OutlinedButton(onClick = { error = null; loaded = false; refresh++ }) { Text("重新载入星图") }
        }
    } }
}
