package com.keling.app.planet

import com.keling.app.network.*
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.timeout
import io.ktor.client.request.*
import io.ktor.http.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.withTimeout

@Serializable data class PlanetProvider(val id: String, val name: String, val chatModels: List<String> = emptyList(), val configured: Boolean = false)
@Serializable data class PlanetCatalog(val providers: List<PlanetProvider> = emptyList())
@Serializable data class GeneratePlanetInput(val subject: String, val level: String = "入门", val goal: String = "", val model: String? = null, val providerId: String? = null, val credentials: AccessCredentials? = null, val contextMode: String = "auto", val questionCount: Int = 12, val generateArtwork: Boolean = true) {
    override fun toString() = "GeneratePlanetInput(subject=$subject, credentials=[redacted])"
}
@Serializable data class GeneratedPlanet(val draft: PlanetDraft, val draftToken: String, @kotlinx.serialization.Transient val rawDraft: JsonObject? = null)
@Serializable data class PlanetEnvelope(val planet: PlanetRecord)
@Serializable data class PlanetList(val planets: List<PlanetRecord> = emptyList())
@Serializable private data class ConfirmPlanet(val draft: PlanetDraft, val draftToken: String, val clientRequestId: String)
@Serializable private data class PlanetGenerationResponse(val draft: PlanetDraft? = null, val draftToken: String? = null, val jobId: String? = null, val jobToken: String? = null, val status: String? = null, val code: String? = null, val error: String? = null, val planet: PlanetRecord? = null, @kotlinx.serialization.Transient val rawDraft: JsonObject? = null)
@Serializable private data class RegeneratePlanetInput(val kind: String, val instruction: String, val clientRequestId: String, val questionId: String? = null, val draft: PlanetDraft? = null, val draftToken: String? = null)
data class PlanetRegenerationResult(val generated: GeneratedPlanet? = null, val planet: PlanetRecord? = null)
@OptIn(ExperimentalSerializationApi::class)
private val signedPlanetJson = Json { encodeDefaults = true; explicitNulls = false }
private val planetResponseJson = Json { ignoreUnknownKeys = true }
private fun decodePlanetResponse(raw: JsonObject): PlanetGenerationResponse = planetResponseJson.decodeFromJsonElement(PlanetGenerationResponse.serializer(), raw).copy(rawDraft = raw["draft"] as? JsonObject)
private fun signedPlanetBody(body: JsonElement, rawDraft: JsonObject?): JsonObject = if (rawDraft == null) body.jsonObject else JsonObject(body.jsonObject + ("draft" to rawDraft))

class PlanetApi(private val token: String, private val client: HttpClient = KelingHttpClient.client, private val baseUrl: String = ApiConfig.actualBaseUrl) {
    private val guest get() = GuestWorkspaces.find(token)
    private fun url(path: String = "") = "$baseUrl/learning/v1/planets$path"
    private fun HttpRequestBuilder.auth() { if (!token.startsWith("guest-memory:")) bearerAuth(token) }
    suspend fun catalog(): PlanetCatalog = client.get(url("/catalog")) { auth() }.body()
    suspend fun generate(input: GeneratePlanetInput): GeneratedPlanet {
        require(input.subject.trim().length in 1..80 && input.level.trim().length in 1..80 && input.goal.length <= 300) { "请缩短学科、基础或学习目标" }
        require(input.contextMode in listOf("auto", "general", "internet_culture") && input.questionCount in listOf(6, 12, 18)) { "请选择有效语境和题量" }
        guest?.ensureOpen()
        return withTimeout(600_000) {
            val result = awaitJob(decodePlanetResponse(client.post(url("/generate")) { auth(); contentType(ContentType.Application.Json); timeout { requestTimeoutMillis = 120_000; socketTimeoutMillis = 120_000 }; setBody(input) }.body()))
            guest?.ensureOpen()
            GeneratedPlanet(requireNotNull(result.draft), requireNotNull(result.draftToken), result.rawDraft)
        }
    }
    private suspend fun awaitJob(initial: PlanetGenerationResponse): PlanetGenerationResponse {
        var result = initial
        while (result.planet == null && (result.draft == null || result.draftToken == null)) {
            guest?.ensureOpen()
            if (result.status == "FAILED") throw ApiException(502, result.error ?: "生成失败", result.code)
            require(!initial.jobId.isNullOrBlank() && result.status in listOf("RUNNING", "PENDING")) { "生成服务返回的任务无效，请重试" }
            delay(1500)
            result = decodePlanetResponse(client.get(url("/generation-jobs/${initial.jobId}")) { auth(); initial.jobToken?.takeIf { it.isNotBlank() }?.let { header("X-Planet-Job-Token", it) } }.body())
        }
        guest?.ensureOpen()
        return result
    }
    suspend fun regenerate(current: PlanetRecord?, generated: GeneratedPlanet?, kind: String, questionId: String?, instruction: String, requestId: String): PlanetRegenerationResult = withTimeout(600_000) {
        require(kind in listOf("question", "artwork") && instruction.trim().isNotEmpty() && instruction.length <= 800) { "请填写修改要求（不超过800字）" }
        require(current != null || generated != null) { "请先生成星球" }
        guest?.ensureOpen()
        val signed = generated ?: if (guest != null && current != null) guest!!.learningPlanets.signedPreview(current.id) else null
        val result = awaitJob(decodePlanetResponse(client.post(url(if (current != null && guest == null) "/${current.id}/regenerate" else "/regenerate-preview")) {
            auth(); contentType(ContentType.Application.Json); timeout { requestTimeoutMillis = 120_000; socketTimeoutMillis = 120_000 }
            setBody(signedPlanetBody(signedPlanetJson.encodeToJsonElement(RegeneratePlanetInput.serializer(), RegeneratePlanetInput(kind, instruction.trim(), requestId, questionId, signed?.draft, signed?.draftToken)), signed?.rawDraft))
        }.body()))
        val preview = result.draft?.let { GeneratedPlanet(it, requireNotNull(result.draftToken), result.rawDraft) }
        if (guest != null && current != null) PlanetRegenerationResult(planet = guest!!.learningPlanets.replaceDraft(current.id, requireNotNull(preview)))
        else PlanetRegenerationResult(preview, result.planet)
    }
    suspend fun list(): PlanetList = guest?.let { PlanetList(it.learningPlanets.list()) } ?: client.get(url()) { auth() }.body()
    suspend fun get(id: String): PlanetRecord = guest?.learningPlanets?.get(id) ?: client.get(url("/$id")) { auth() }.body<PlanetEnvelope>().planet
    suspend fun confirm(generated: GeneratedPlanet, requestId: String): PlanetRecord {
        guest?.let { workspace -> return workspace.learningPlanets.add(generated.draft, generated.draftToken, generated.rawDraft) {
            val d = generated.draft
            val graph = planetPreviewGraph(d)
            val course = workspace.createCourse(d.subject, d.planetStyleIndex, code = "AI_PLANET").course!!
            val regionNodes = mutableMapOf<String, String>()
            if (graph != null) {
                graph.nodes.forEach { node -> regionNodes[node.id] = workspace.saveGraphNode(course.id, null, com.keling.app.graph.GraphNodeInput(node.name, node.description, emptyList(), 3, 0f)) }
                graph.nodes.forEach { node -> workspace.saveGraphNode(course.id, regionNodes.getValue(node.id), com.keling.app.graph.GraphNodeInput(node.name, node.description, node.parentIds.map { regionNodes.getValue(it) }, 3, 0f)) }
            } else d.regions.forEach { region -> regionNodes[region.id] = workspace.saveGraphNode(course.id, null, com.keling.app.graph.GraphNodeInput(region.title, region.lesson, region.prerequisiteIds.mapNotNull { regionNodes[it] }, 3, 0f)) }
            d.regions.firstOrNull()?.let { workspace.createTask(WorkspaceTaskInput("探索：${it.title}", it.description, course.id, it.estimatedMinutes)) }
            course.id
        } }
        return client.post(url("/confirm")) { auth(); contentType(ContentType.Application.Json); setBody(signedPlanetBody(signedPlanetJson.encodeToJsonElement(ConfirmPlanet.serializer(), ConfirmPlanet(generated.draft, generated.draftToken, requestId)), generated.rawDraft)) }.body<PlanetEnvelope>().planet
    }
    suspend fun answer(id: String, questionId: String, selected: Int, requestId: String): PlanetAnswerResult = answer(id, questionId, PlanetResponse(selectedIndex = selected), requestId)
    suspend fun answer(id: String, questionId: String, response: PlanetResponse, requestId: String): PlanetAnswerResult = guest?.learningPlanets?.answer(id, questionId, response, requestId)
        ?: client.post(url("/$id/answers")) { auth(); contentType(ContentType.Application.Json); setBody(buildJsonObject {
            put("questionId", questionId); put("clientRequestId", requestId)
            response.selectedIndex?.let { put("selectedIndex", it) }
            response.selectedIndices?.let { indices -> putJsonArray("selectedIndices") { indices.forEach { add(it) } } }
            response.orderedIndices?.let { indices -> putJsonArray("orderedIndices") { indices.forEach { add(it) } } }
            response.text?.let { put("text", it) }
            response.selfReview?.let { put("selfReview", it) }
        }) }.body()
}
