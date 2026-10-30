package com.keling.app.network

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.timeout
import io.ktor.client.request.*
import io.ktor.http.*
import kotlinx.serialization.Serializable

@Serializable data class TrialAiAvailability(val available: Boolean, val model: String? = null, val reason: String = "")
@Serializable data class TrialConfig(val ai: TrialAiAvailability)
@Serializable data class TrialContext(val title: String, val text: String)
@Serializable data class TrialQuestion(val message: String, val context: List<TrialContext> = emptyList())
@Serializable data class TrialUsage(val inputTokens: Int? = null, val outputTokens: Int? = null)
@Serializable data class TrialAnswer(val answer: String, val model: String, val usage: TrialUsage = TrialUsage())

/** Public, stateless endpoints. No account token or cloud conversation is involved. */
class TrialApi(private val client: HttpClient = KelingHttpClient.client) {
    private fun url(path: String) = "${ApiConfig.actualBaseUrl}/trial$path"
    suspend fun config(): TrialConfig = client.get(url("/config")).body()
    suspend fun ask(question: TrialQuestion): TrialAnswer {
        require(question.message.trim().length in 1..4000)
        require(question.context.size <= 3 && question.context.all { it.title.length <= 120 && it.text.length <= 2000 })
        return client.post(url("/ai")) { timeout { requestTimeoutMillis = 95_000 }; contentType(ContentType.Application.Json); setBody(question) }.body()
    }
}
