package com.keling.app.expedition

import com.keling.app.network.*
import io.ktor.client.HttpClient
import io.ktor.client.plugins.expectSuccess
import io.ktor.client.plugins.timeout
import io.ktor.client.request.*
import io.ktor.client.statement.bodyAsText
import io.ktor.http.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import java.time.Instant
import java.util.UUID

@Serializable data class MaterialInput(val title: String, val sourceName: String = "手动输入", val format: String = "TEXT", val text: String? = null, val pdfBase64: String? = null)
@Serializable data class MaterialSpan(val id: String = "", val ordinal: Int, val startUtf16: Int, val endUtf16: Int, val page: Int? = null, val paragraphIndex: Int = 0, val heading: String = "", val textHash: String)
@Serializable data class ParsedMaterial(val title: String, val sourceName: String, val format: String, val content: String, val contentHash: String,
    val parserVersion: String, val parseStatus: String, val spans: List<MaterialSpan>, val warnings: List<String> = emptyList())
@Serializable data class LearningDoc(val id: String, val courseId: String, val materialId: String, val version: Int, val title: String, val sourceName: String,
    val format: String, val content: String = "", val contentHash: String, val parserVersion: String = "", val parseStatus: String = "READY",
    val spans: List<MaterialSpan> = emptyList(), val deletedAt: String? = null, val createdAt: String = "", val supersedesId: String? = null)
@Serializable data class MaterialSource(val materialVersionId: String, val spanId: String, val contentHash: String, val startUtf16: Int, val endUtf16: Int,
    val page: Int? = null, val paragraphIndex: Int? = null, val title: String = "", val text: String = "", val heading: String = "")
@Serializable data class MapCandidate(val title: String, val description: String, val source: MaterialSource)
@Serializable data class MapDraft(val method: String, val candidates: List<MapCandidate>, val note: String)
@Serializable data class MaterialTutorAnswer(val answer: String, val model: String, val kind: String = "AI_SUGGESTION", val sources: List<JsonObject> = emptyList(), val note: String = "AI建议需要核查，不改变奖励和知识状态。")
@Serializable private data class MaterialsResponse(val materials: List<LearningDoc>)
@Serializable private data class MaterialResponse(val material: LearningDoc)

/** Immutable versions in guest RAM; no disk, JWT, or automatic migration to an account. */
class GuestLearningStore(private val ensureGuest: () -> Unit) {
    private val versions = mutableMapOf<String, LearningDoc>(); private val confirms = mutableMapOf<String, String>(); private val saves = mutableMapOf<String, Pair<String, LearningDoc>>(); private var closed = false
    private fun ensure() { ensureGuest(); check(!closed) { "本次资料空间已结束" } }
    fun list(courseId: String): List<LearningDoc> { ensure(); return versions.values.filter { it.courseId == courseId }.groupBy { it.materialId }.values.map { it.maxBy { doc -> doc.version } }.filter { it.deletedAt == null } }
    fun get(id: String): LearningDoc { ensure(); return versions[id] ?: error("资料不存在") }
    fun save(courseId: String, parsed: ParsedMaterial, old: LearningDoc?, opId: String): LearningDoc {
        ensure(); val signature = courseId + "\n" + (old?.id ?: "") + "\n" + expeditionJson.encodeToString(parsed)
        saves[opId]?.let { ExpeditionRules.check(it.first == signature, "OP_CONFLICT", "操作编号已用于其他资料"); return it.second }
        if (old != null) { ExpeditionRules.check(list(courseId).any { it.id == old.id }, "CONTENT_STALE", "资料已变化，请保留原文后重新读取") }
        val id = UUID.randomUUID().toString()
        val doc = LearningDoc(id, courseId, old?.materialId ?: UUID.randomUUID().toString(), (old?.version ?: 0) + 1, parsed.title, parsed.sourceName,
            parsed.format, parsed.content, parsed.contentHash, parsed.parserVersion, parsed.parseStatus, parsed.spans.map { it.copy(id = "$id:${it.ordinal}") }, createdAt = Instant.now().toString(), supersedesId = old?.id)
        versions[id] = doc; saves[opId] = signature to doc; return doc
    }
    fun delete(id: String) { ensure(); val doc = get(id); versions[id] = doc.copy(deletedAt = Instant.now().toString()) }
    fun draft(courseId: String, ids: List<String>): MapDraft {
        ensure(); val docs = list(courseId).filter { it.id in ids }; ExpeditionRules.check(docs.size == ids.distinct().size, "CONTENT_STALE", "选定资料已变化")
        val candidates = docs.flatMap { doc -> doc.spans.map { span ->
            val text = doc.content.substring(span.startUtf16, span.endUtf16)
            MapCandidate((span.heading.ifBlank { text.lineSequence().first().take(80) }).take(80), text.take(600), MaterialSource(doc.id, span.id, doc.contentHash, span.startUtf16, span.endUtf16, span.page, span.paragraphIndex, doc.title, text, span.heading))
        } }.take(12)
        return MapDraft("EXTRACTED_HEADINGS", candidates, "这是原文提取的候选知识点，请检查后确认；不会生成已审核关卡。")
    }
    fun confirm(courseId: String, opId: String, candidates: List<MapCandidate>, add: (String, String) -> Unit) {
        ensure(); val signature = courseId + "\n" + expeditionJson.encodeToString(candidates)
        confirms[opId]?.let { ExpeditionRules.check(it == signature, "OP_CONFLICT", "操作编号内容已变化"); return }
        ExpeditionRules.check(candidates.isNotEmpty() && candidates.size <= 12 && candidates.all { it.title.trim().isNotEmpty() && it.title.length <= 180 && it.description.length <= 6000 }, "VALIDATION", "请检查候选标题和内容后再确认", 400)
        val docs = list(courseId)
        candidates.forEach { candidate -> val doc = docs.firstOrNull { it.id == candidate.source.materialVersionId }
            ExpeditionRules.check(doc != null && doc.contentHash == candidate.source.contentHash && doc.spans.any { it.id == candidate.source.spanId }, "SOURCE_INVALID", "候选引用已变化") }
        candidates.forEach { candidate -> add(candidate.title, candidate.description + "\n来源：${candidate.source.title} · 本次资料 ${candidate.source.materialVersionId} 第${(candidate.source.paragraphIndex ?: 0) + 1}段") }
        confirms[opId] = signature
    }
    fun close() { closed = true; versions.clear(); confirms.clear(); saves.clear() }
}

class LearningApi(private val token: String, private val client: HttpClient = KelingHttpClient.client, private val origin: String = ApiConfig.actualBaseUrl) {
    private val guest = GuestWorkspaces.find(token)
    private suspend inline fun <reified T> request(path: String, method: HttpMethod = HttpMethod.Get, body: JsonObject? = null, anonymous: Boolean = false): T {
        guest?.ensureOpen(); require(guest == null || anonymous) { "游客不能访问账号资料接口" }
        val response = client.request("$origin/learning/v1$path") {
            this.method = method; expectSuccess = false; timeout { requestTimeoutMillis = 95_000 }
            if (!anonymous) bearerAuth(token)
            if (body != null) { contentType(ContentType.Application.Json); setBody(body.toString()) }
        }
        guest?.ensureOpen()
        val text = response.bodyAsText()
        if (!response.status.isSuccess()) throw ExpeditionException(response.status.value, runCatching { expeditionJson.decodeFromString<ExpeditionErrorBody>(text) }.getOrElse { ExpeditionErrorBody("资料服务暂不可用，请保留输入后重试", "HTTP_${response.status.value}") })
        return expeditionJson.decodeFromString(text)
    }
    suspend fun parse(input: MaterialInput): ParsedMaterial = request("/materials/parse", HttpMethod.Post, expeditionJson.encodeToJsonElement(input).jsonObject, anonymous = true)
    suspend fun list(courseId: String): List<LearningDoc> = guest?.learningMaterials?.list(courseId) ?: request<MaterialsResponse>("/courses/$courseId/materials").materials
    suspend fun get(id: String): LearningDoc = guest?.learningMaterials?.get(id) ?: request<MaterialResponse>("/materials/$id").material
    suspend fun save(courseId: String, input: MaterialInput, parsed: ParsedMaterial, old: LearningDoc?, opId: String): LearningDoc {
        guest?.let { return it.learningMaterials.save(courseId, parsed, old, opId) }
        val fields = expeditionJson.encodeToJsonElement(input).jsonObject.toMutableMap(); fields["opId"] = JsonPrimitive(opId)
        old?.let { fields["materialId"] = JsonPrimitive(it.materialId); fields["expectedVersionId"] = JsonPrimitive(it.id) }
        return request<MaterialResponse>("/courses/$courseId/materials", HttpMethod.Post, JsonObject(fields)).material
    }
    suspend fun delete(id: String, opId: String) { guest?.let { it.learningMaterials.delete(id); return }; request<JsonObject>("/materials/$id", HttpMethod.Delete, buildJsonObject { put("opId", opId) }) }
    suspend fun mapDraft(courseId: String, ids: List<String>): MapDraft = guest?.learningMaterials?.draft(courseId, ids)
        ?: request("/courses/$courseId/map-draft", HttpMethod.Post, buildJsonObject { put("materialVersionIds", JsonArray(ids.map(::JsonPrimitive))) })
    suspend fun confirm(courseId: String, opId: String, candidates: List<MapCandidate>) {
        guest?.let { it.learningMaterials.confirm(courseId, opId, candidates) { title, text -> it.addSource(courseId, title, text) }; return }
        request<JsonObject>("/courses/$courseId/map-confirm", HttpMethod.Post, buildJsonObject { put("opId", opId); put("candidates", JsonArray(candidates.map { candidate -> buildJsonObject {
            put("title", candidate.title); put("description", candidate.description); put("materialVersionId", candidate.source.materialVersionId); put("spanId", candidate.source.spanId); put("contentHash", candidate.source.contentHash)
        } })) })
    }
    suspend fun tutor(courseId: String, ids: List<String>, credentials: AccessCredentials, model: String, message: String): MaterialTutorAnswer {
        if (guest == null) return request("/courses/$courseId/tutor", HttpMethod.Post, buildJsonObject {
            put("materialVersionIds", JsonArray(ids.map(::JsonPrimitive))); put("credentials", expeditionJson.encodeToJsonElement(credentials)); put("model", model); put("message", message)
        })
        val selected = guest.learningMaterials.draft(courseId, ids).candidates.take(8)
        require(selected.isNotEmpty()) { "请选择有文字片段的资料" }
        val response = client.post("$origin/trial/workspace/chat") {
            timeout { requestTimeoutMillis = 95_000 }; expectSuccess = false; contentType(ContentType.Application.Json)
            setBody(buildJsonObject { put("credentials", expeditionJson.encodeToJsonElement(credentials)); put("model", model); put("message", message); put("scenario", "CONCEPT_EXPLAIN"); put("history", JsonArray(emptyList())); put("retrievalMode", "selected")
                put("sources", JsonArray(selected.map { candidate -> buildJsonObject { put("id", candidate.source.spanId); put("title", candidate.source.title); put("text", candidate.source.text.take(6000)); put("kind", "material") } })) }.toString())
        }
        guest.ensureOpen()
        if (!response.status.isSuccess()) throw ExpeditionException(response.status.value, ExpeditionErrorBody("模型请求失败，请检查Key与模型，原资料仍保留", "AI_REQUEST_FAILED"))
        // Recheck current versions after the response, before displaying a now-stale citation.
        guest.learningMaterials.draft(courseId, ids)
        return expeditionJson.decodeFromString(response.bodyAsText())
    }
    private val guestPreviews = mutableMapOf<String, String>()
    suspend fun schedule(courseId: String, input: ScheduleRequest): SchedulePreview {
        if (guest == null) return request("/courses/$courseId/schedule", HttpMethod.Post, expeditionJson.encodeToJsonElement(input).jsonObject)
        val fingerprint = guest.scheduleFingerprint()
        val body = buildJsonObject {
            put("request", expeditionJson.encodeToJsonElement(input))
            put("tasks", JsonArray(guest.taskList().tasks.orEmpty().map { task -> buildJsonObject {
                put("id", task.id); put("title", task.title); put("estimatedMinutes", task.estimatedMinutes); put("status", task.status)
                put("scheduledAt", task.scheduledAt?.let { date -> runCatching { Instant.parse(date).toString() }.getOrNull() }?.let(::JsonPrimitive) ?: JsonNull)
            } }))
            put("courses", JsonArray(guest.courseList().courses.orEmpty().filter { !it.isArchived }.map { course -> buildJsonObject {
                put("id", course.id); put("name", course.name); put("schedule", expeditionJson.parseToJsonElement(course.schedule))
            } }))
        }
        val preview = request<SchedulePreview>("/schedule/preview", HttpMethod.Post, body, anonymous = true)
        val id = UUID.randomUUID().toString(); guestPreviews[id] = fingerprint
        return preview.copy(previewId = id, expiresAt = Instant.now().plusSeconds(1800).toString())
    }
    suspend fun confirmSchedule(courseId: String, preview: SchedulePreview): ScheduleConfirmation {
        val id = requireNotNull(preview.previewId)
        if (guest != null) return guest.confirmSchedule(courseId, preview, requireNotNull(guestPreviews[id]) { "本次预览已结束，请重新排程" })
        return request("/schedule/$id/confirm", HttpMethod.Post, JsonObject(emptyMap()))
    }

}
