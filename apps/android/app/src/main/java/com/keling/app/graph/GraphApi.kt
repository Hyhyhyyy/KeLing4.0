package com.keling.app.graph

import com.keling.app.network.*
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.*
import io.ktor.http.*

class GraphApi(private val token: String, private val client: HttpClient = KelingHttpClient.client) {
    private val guest get() = GuestWorkspaces.find(token)
    private fun url(path: String) = "${ApiConfig.actualBaseUrl}/knowledge$path"
    suspend fun load(courseId: String): GraphDocument = guest?.graphDocument(courseId) ?: client.get(url("/$courseId/nodes")) { bearerAuth(token) }.body()
    suspend fun saveLayout(courseId: String, input: GraphLayoutInput): GraphDocument = guest?.saveGraphLayout(courseId, input) ?: client.put(url("/$courseId/layout")) { bearerAuth(token); contentType(ContentType.Application.Json); setBody(input) }.body()
    suspend fun saveNode(courseId: String, nodeId: String?, input: GraphNodeInput) {
        guest?.let { it.saveGraphNode(courseId, nodeId, input); return }
        if (nodeId == null) client.post(url("/$courseId/nodes")) { bearerAuth(token); contentType(ContentType.Application.Json); setBody(input) }
        else client.put(url("/node/$nodeId")) { bearerAuth(token); contentType(ContentType.Application.Json); setBody(input) }
    }
    suspend fun deleteNode(courseId: String, nodeId: String) {
        guest?.let { it.deleteGraphNode(courseId, nodeId); return }
        client.delete(url("/node/$nodeId")) { bearerAuth(token) }
    }
}
