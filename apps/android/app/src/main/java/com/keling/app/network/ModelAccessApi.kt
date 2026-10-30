package com.keling.app.network

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.timeout
import io.ktor.client.request.*
import io.ktor.http.*
import kotlinx.serialization.Serializable

@Serializable data class AccessProvider(val id: String, val name: String, val documentation: String, val endpointRequired: Boolean = false, val endpointHint: String = "", val chat: Boolean = true, val embedding: Boolean = false, val endpoints: List<String> = emptyList())
@Serializable data class AccessCatalog(val providers: List<AccessProvider> = emptyList())
@Serializable data class AccessModel(val id: String, val capabilities: List<String> = emptyList())
@Serializable data class AccessDiscovery(val providerId: String, val models: List<AccessModel> = emptyList(), val fetchedAt: String, val note: String = "")
@Serializable data class AccessCredentials(val providerId: String, val apiKey: String, val baseUrl: String? = null) {
    override fun toString() = "AccessCredentials(providerId=$providerId, apiKey=[redacted])"
}
@Serializable data class AccessQuestion(val providerId: String, val apiKey: String, val model: String, val message: String, val baseUrl: String? = null, val context: List<TrialContext> = emptyList()) {
    override fun toString() = "AccessQuestion(providerId=$providerId, apiKey=[redacted], model=$model)"
}

/** No bearer token, persistence or cloud session. Explicit requests only. */
class ModelAccessApi(private val client: HttpClient = KelingHttpClient.client) {
    private fun url(path: String) = "${ApiConfig.actualBaseUrl}/model-access$path"
    suspend fun catalog(): AccessCatalog = client.get(url("/catalog")).body()
    suspend fun discover(credentials: AccessCredentials): AccessDiscovery = client.post(url("/discover")) {
        timeout { requestTimeoutMillis = 95_000 }; contentType(ContentType.Application.Json); setBody(credentials)
    }.body()
    suspend fun complete(question: AccessQuestion): TrialAnswer = client.post(url("/complete")) {
        require(question.message.trim().length in 1..4000 && question.context.size <= 3 && question.context.all { it.title.length <= 120 && it.text.length <= 2000 })
        timeout { requestTimeoutMillis = 95_000 }; contentType(ContentType.Application.Json); setBody(question)
    }.body()
}
