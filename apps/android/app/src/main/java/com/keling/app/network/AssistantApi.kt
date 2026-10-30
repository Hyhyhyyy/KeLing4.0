package com.keling.app.network

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.*
import io.ktor.http.*
import kotlinx.serialization.Serializable

@Serializable data class ModelProvider(val id: String, val name: String, val protocol: String, val configured: Boolean, val chatModels: List<String> = emptyList(), val embeddingModels: List<String> = emptyList())
@Serializable data class ModelCatalog(val providers: List<ModelProvider> = emptyList())
@Serializable data class AssistantSession(val id: String, val title: String, val providerId: String, val modelId: String, val scenario: String = "CONCEPT_EXPLAIN", val includeContext: Boolean = false, val retrievalMode: String = "keyword", val activeRequestId: String = "")
@Serializable data class AssistantSessions(val sessions: List<AssistantSession> = emptyList())
@Serializable data class NewAssistantSession(val providerId: String, val modelId: String, val title: String = "新的学习对话", val scenario: String = "CONCEPT_EXPLAIN", val includeContext: Boolean = false, val retrievalMode: String = "keyword", val embeddingProviderId: String = "", val embeddingModelId: String = "")
@Serializable data class AssistantUsage(val inputTokens: Int? = null, val outputTokens: Int? = null)
@Serializable data class AssistantSource(val id: String, val title: String, val text: String, val kind: String, val updatedAt: String? = null, val truncated: Boolean = false)
@Serializable data class AssistantContextRef(val kind: String, val id: String)
@Serializable data class AssistantContextInput(val kind: String, val id: String, val fingerprint: String)
@Serializable data class AssistantContextPreview(val ref: AssistantContextRef, val title: String, val fingerprint: String, val sources: List<AssistantSource> = emptyList(), val warnings: List<String> = emptyList()) {
    fun input() = AssistantContextInput(ref.kind, ref.id, fingerprint)
}
@Serializable data class AssistantTurn(val id: String, val status: String, val userText: String, val assistantText: String = "", val error: String = "", val modelId: String, val sources: List<AssistantSource> = emptyList(), val usage: AssistantUsage = AssistantUsage())
@Serializable data class AssistantConversation(val session: AssistantSession, val turns: List<AssistantTurn> = emptyList())
@Serializable private data class AssistantMessage(val message: String, val clientRequestId: String, val context: AssistantContextInput? = null)
@Serializable data class AssistantReceipt(val id: String, val status: String)

class AssistantApi(private val client: HttpClient = KelingHttpClient.client) {
    private fun url(path: String) = "${ApiConfig.actualBaseUrl}/ai$path"
    suspend fun catalog(token: String): ModelCatalog = GuestWorkspaces.find(token)?.let { it.catalog() } ?: client.get(url("/catalog")) { bearerAuth(token) }.body()
    suspend fun sessions(token: String): AssistantSessions = GuestWorkspaces.find(token)?.let { it.sessions() } ?: client.get(url("/sessions")) { bearerAuth(token) }.body()
    suspend fun create(token: String, request: NewAssistantSession): AssistantConversation = GuestWorkspaces.find(token)?.let { it.create(request) } ?: client.post(url("/sessions")) { bearerAuth(token); contentType(ContentType.Application.Json); setBody(request) }.body()
    suspend fun get(token: String, id: String): AssistantConversation = GuestWorkspaces.find(token)?.let { it.conversation(id) } ?: client.get(url("/sessions/$id")) { bearerAuth(token) }.body()
    suspend fun preview(token: String, ref: AssistantContextRef): AssistantContextPreview = GuestWorkspaces.find(token)?.let { it.preview(ref) } ?: client.post(url("/context-preview")) { bearerAuth(token); contentType(ContentType.Application.Json); setBody(ref) }.body()
    suspend fun send(token: String, id: String, message: String, requestId: String, context: AssistantContextInput? = null): AssistantReceipt = GuestWorkspaces.find(token)?.let { it.send(id, message, requestId, context) } ?: client.post(url("/sessions/$id/turns")) { bearerAuth(token); contentType(ContentType.Application.Json); setBody(AssistantMessage(message, requestId, context)) }.body()
    suspend fun cancel(token: String, id: String) { GuestWorkspaces.find(token)?.let { it.cancel(id); return }; client.post(url("/sessions/$id/cancel")) { bearerAuth(token) } }
    suspend fun remove(token: String, id: String) { GuestWorkspaces.find(token)?.let { it.remove(id); return }; client.delete(url("/sessions/$id")) { bearerAuth(token) } }
    suspend fun saveNote(token: String, turnId: String) { GuestWorkspaces.find(token)?.let { it.saveTurn(turnId); return }; client.post(url("/turns/$turnId/note")) { bearerAuth(token) } }
}
