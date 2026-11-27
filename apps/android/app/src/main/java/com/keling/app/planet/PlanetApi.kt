package com.keling.app.planet

import com.keling.app.network.*
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.timeout
import io.ktor.client.request.*
import io.ktor.http.*
import kotlinx.serialization.Serializable
import kotlinx.coroutines.delay
import kotlinx.coroutines.withTimeout

@Serializable data class PlanetProvider(val id: String, val name: String, val chatModels: List<String> = emptyList(), val configured: Boolean = false)
@Serializable data class PlanetCatalog(val providers: List<PlanetProvider> = emptyList())
@Serializable data class GeneratePlanetInput(val subject: String, val level: String = "入门", val goal: String = "", val model: String? = null, val providerId: String? = null, val credentials: AccessCredentials? = null) {
    override fun toString() = "GeneratePlanetInput(subject=$subject, credentials=[redacted])"
}
@Serializable data class GeneratedPlanet(val draft: PlanetDraft, val draftToken: String)
@Serializable data class PlanetEnvelope(val planet: PlanetRecord)
@Serializable data class PlanetList(val planets: List<PlanetRecord> = emptyList())
@Serializable private data class ConfirmPlanet(val draft: PlanetDraft, val draftToken: String, val clientRequestId: String)
@Serializable private data class SubmitPlanetAnswer(val questionId: String, val selectedIndex: Int, val clientRequestId: String)
@Serializable private data class PlanetGenerationResponse(val draft: PlanetDraft? = null, val draftToken: String? = null, val jobId: String? = null, val jobToken: String? = null, val status: String? = null, val code: String? = null, val error: String? = null)

class PlanetApi(private val token: String, private val client: HttpClient = KelingHttpClient.client, private val baseUrl: String = ApiConfig.actualBaseUrl) {
    private val guest get() = GuestWorkspaces.find(token)
    private fun url(path: String = "") = "$baseUrl/learning/v1/planets$path"
    private fun HttpRequestBuilder.auth() { if (!token.startsWith("guest-memory:")) bearerAuth(token) }
    suspend fun catalog(): PlanetCatalog = client.get(url("/catalog")) { auth() }.body()
    suspend fun generate(input: GeneratePlanetInput): GeneratedPlanet {
        require(input.subject.trim().length in 1..80 && input.level.trim().length in 1..80 && input.goal.length <= 300) { "请缩短学科、基础或学习目标" }
        guest?.ensureOpen()
        return withTimeout(600_000) {
            var result = client.post(url("/generate")) { auth(); contentType(ContentType.Application.Json); timeout { requestTimeoutMillis = 120_000; socketTimeoutMillis = 120_000 }; setBody(input) }.body<PlanetGenerationResponse>()
            val jobId = result.jobId
            val jobToken = result.jobToken
            while (result.draft == null || result.draftToken == null) {
                guest?.ensureOpen()
                if (result.status == "FAILED") throw ApiException(502, result.error ?: "生成失败", result.code)
                require(!jobId.isNullOrBlank() && result.status in listOf("RUNNING", "PENDING")) { "生成服务返回的任务无效，请重试" }
                delay(1500)
                result = client.get(url("/generation-jobs/$jobId")) { auth(); if (!jobToken.isNullOrBlank()) header("X-Planet-Job-Token", jobToken) }.body()
            }
            guest?.ensureOpen()
            GeneratedPlanet(requireNotNull(result.draft), requireNotNull(result.draftToken))
        }
    }
    suspend fun list(): PlanetList = guest?.let { PlanetList(it.learningPlanets.list()) } ?: client.get(url()) { auth() }.body()
    suspend fun get(id: String): PlanetRecord = guest?.learningPlanets?.get(id) ?: client.get(url("/$id")) { auth() }.body<PlanetEnvelope>().planet
    suspend fun confirm(generated: GeneratedPlanet, requestId: String): PlanetRecord {
        guest?.let { workspace -> return workspace.learningPlanets.add(generated.draft) {
            val d = generated.draft
            val course = workspace.createCourse(d.subject, d.planetStyleIndex, code = "AI_PLANET").course!!
            val regionNodes = mutableMapOf<String, String>()
            d.regions.forEach { region -> regionNodes[region.id] = workspace.saveGraphNode(course.id, null, com.keling.app.graph.GraphNodeInput(region.title, region.lesson, region.prerequisiteIds.mapNotNull { regionNodes[it] }, 3, 0f)) }
            d.regions.firstOrNull()?.let { workspace.createTask(WorkspaceTaskInput("探索：${it.title}", it.description, course.id, it.estimatedMinutes)) }
            course.id
        } }
        return client.post(url("/confirm")) { auth(); contentType(ContentType.Application.Json); setBody(ConfirmPlanet(generated.draft, generated.draftToken, requestId)) }.body<PlanetEnvelope>().planet
    }
    suspend fun answer(id: String, questionId: String, selected: Int, requestId: String): PlanetAnswerResult = guest?.learningPlanets?.answer(id, questionId, selected, requestId)
        ?: client.post(url("/$id/answers")) { auth(); contentType(ContentType.Application.Json); setBody(SubmitPlanetAnswer(questionId, selected, requestId)) }.body()
}
