package com.keling.app.network

import io.ktor.client.HttpClient
import io.ktor.client.plugins.expectSuccess
import io.ktor.client.plugins.timeout
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.json.*

private val aiJobJson = Json { ignoreUnknownKeys = true }

/** Accepts legacy synchronous BYOK responses and hosted asynchronous model jobs. */
suspend fun <T> awaitAiResult(
    client: HttpClient,
    response: HttpResponse,
    resultType: DeserializationStrategy<T>,
    accountToken: String? = null,
    origin: String = ApiConfig.actualBaseUrl,
): T {
    suspend fun read(value: HttpResponse): JsonObject {
        val text = value.bodyAsText()
        val body = runCatching { aiJobJson.parseToJsonElement(text).jsonObject }
            .getOrElse { throw ApiException(502, "模型响应格式错误，请重试") }
        if (!value.status.isSuccess()) throw ApiException(value.status.value,
            body["error"]?.jsonPrimitive?.contentOrNull ?: "模型暂不可用，请重试")
        return body
    }
    val first = read(response)
    if (response.status != HttpStatusCode.Accepted) return aiJobJson.decodeFromJsonElement(resultType, first)
    val id = first["jobId"]?.jsonPrimitive?.contentOrNull.orEmpty()
    require(id.matches(Regex("[A-Za-z0-9_-]{1,200}"))) { "模型任务编号无效" }
    val jobToken = first["jobToken"]?.jsonPrimitive?.contentOrNull
    require(!accountToken.isNullOrBlank() || !jobToken.isNullOrBlank()) { "模型任务访问凭据缺失" }
    val result = withTimeoutOrNull(600_000) {
        var completed: JsonElement? = null
        while (completed == null) {
            delay(1500)
            val job = read(client.get("$origin/ai-jobs/$id") {
                expectSuccess = false
                timeout { requestTimeoutMillis = 95_000 }
                if (!accountToken.isNullOrBlank()) bearerAuth(accountToken)
                else header("X-AI-Job-Token", jobToken)
            })
            when (job["status"]?.jsonPrimitive?.contentOrNull) {
                "RUNNING" -> Unit
                "SUCCEEDED" -> completed = job["result"]?.takeUnless { it is JsonNull }
                    ?: throw ApiException(502, "模型任务没有返回结果，请重试")
                "FAILED" -> throw ApiException(502, job["error"]?.jsonPrimitive?.contentOrNull ?: "模型生成失败，请重试")
                else -> throw ApiException(502, "模型任务状态异常，请重试")
            }
        }
        completed
    } ?: throw ApiException(408, "模型等待超时，输入已保留，请重试")
    return aiJobJson.decodeFromJsonElement(resultType, result)
}
