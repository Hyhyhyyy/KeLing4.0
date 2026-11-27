package com.keling.app.graph

import com.keling.app.data.KnowledgeNode
import kotlinx.serialization.Serializable

@Serializable data class GraphNode(val id: String, val courseId: String, val name: String, val description: String = "", val parentIds: List<String> = emptyList(), val childIds: List<String> = emptyList(), val difficulty: Int = 3, val masteryLevel: Float = 0f, val positionX: Double = .5, val positionY: Double = .5, val updatedAt: String = "") {
    fun editable() = KnowledgeNode(id, courseId, name, description, parentIds, childIds, difficulty, masteryLevel, positionX.toFloat(), positionY.toFloat())
}
@Serializable data class GraphDocument(val nodes: List<GraphNode> = emptyList(), val layoutSaved: Boolean = false, val savedNodeIds: List<String> = emptyList(), val layoutUpdatedAt: String? = null)
@Serializable data class GraphPosition(val id: String, val positionX: Double, val positionY: Double)
@Serializable data class GraphPositionWrite(val id: String, val positionX: Double, val positionY: Double, val expectedUpdatedAt: String)
@Serializable data class GraphLayoutInput(val positions: List<GraphPositionWrite>)
@Serializable data class GraphNodeInput(val name: String, val description: String, val parentIds: List<String>, val difficulty: Int, val masteryLevel: Float) {
    companion object { fun from(node: KnowledgeNode) = GraphNodeInput(node.name, node.description, node.parentIds, node.difficulty, node.masteryLevel) }
}
fun validateGraphPositions(positions: List<GraphPosition>, allowed: Set<String>) {
    require(positions.size in 1..500 && positions.map { it.id }.distinct().size == positions.size) { "布局节点数量无效" }
    require(positions.all { it.id in allowed && it.positionX.isFinite() && it.positionY.isFinite() && it.positionX in 0.0..1.0 && it.positionY in 0.0..1.0 }) { "布局包含无效节点或坐标" }
}

fun validateGraphParents(nodeId: String, parentIds: List<String>, nodes: List<GraphNode>) {
    val byId = nodes.associateBy { it.id }
    require(parentIds.distinct().size == parentIds.size && parentIds.all { it in byId && it != nodeId }) { "前置知识点无效" }
    val visited = mutableSetOf<String>()
    fun reachesSelf(id: String): Boolean = id == nodeId || (visited.add(id) && byId[id]?.parentIds.orEmpty().any(::reachesSelf))
    require(parentIds.none(::reachesSelf)) { "前置关系不能形成循环" }
}
