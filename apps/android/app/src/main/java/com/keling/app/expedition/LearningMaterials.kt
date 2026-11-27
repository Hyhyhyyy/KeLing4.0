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
        return MapDraft("EXTRACTED_HEADINGS", candidates, "原文提取 · 待确认")
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
    suspend fun tutor(courseId: String, ids: List<String>, credentials: AccessCredentials?, model: String?, message: String, providerId: String? = null): MaterialTutorAnswer {
        val selected = guest?.learningMaterials?.draft(courseId, ids)?.candidates?.take(8)
        if (guest != null) require(!selected.isNullOrEmpty()) { "请选择有文字片段的资料" }
        val payload = buildJsonObject {
            credentials?.let { put("credentials", expeditionJson.encodeToJsonElement(it)) }
            model?.takeIf { it.isNotBlank() }?.let { put("model", it) }
            providerId?.takeIf { it.isNotBlank() }?.let { put("providerId", it) }
            put("message", message)
            if (guest == null) put("materialVersionIds", JsonArray(ids.map(::JsonPrimitive)))
            else {
                put("scenario", "CONCEPT_EXPLAIN"); put("history", JsonArray(emptyList())); put("retrievalMode", "selected")
                put("sources", JsonArray(selected.orEmpty().map { candidate -> buildJsonObject { put("id", candidate.source.spanId); put("title", candidate.source.title); put("text", candidate.source.text.take(6000)); put("kind", "material") } }))
            }
        }
        val endpoint = if (guest == null) "/learning/v1/courses/$courseId/tutor" else "/trial/workspace/chat"
        val response = client.post("$origin$endpoint") {
            timeout { requestTimeoutMillis = 95_000 }; expectSuccess = false; contentType(ContentType.Application.Json)
            if (guest == null) bearerAuth(token)
            setBody(payload.toString())
        }
        val answer = awaitAiResult(client, response, MaterialTutorAnswer.serializer(), if (guest == null) token else null, origin)
        guest?.ensureOpen()
        // Recheck current versions after the response, before displaying a now-stale citation.
        guest?.learningMaterials?.draft(courseId, ids)
        return if (guest == null) answer else answer.copy(sources = selected.orEmpty().map {
            expeditionJson.encodeToJsonElement(MaterialSource.serializer(), it.source).jsonObject
        })
    }
    suspend fun saveTutorNote(courseId: String, question: String, answer: MaterialTutorAnswer) {
        require(question.isNotBlank() && answer.answer.isNotBlank()) { "请先完成资料问答" }
        val sources = answer.sources.map { expeditionJson.decodeFromJsonElement(MaterialSource.serializer(), it) }
        require(sources.isNotEmpty()) { "回答缺少可核查的来源，请重新提问" }
        val current = list(courseId).associateBy { it.id }
        val full = mutableMapOf<String, LearningDoc>()
        for (source in sources) {
            val live = current[source.materialVersionId]
            ExpeditionRules.check(live != null && live.contentHash == source.contentHash, "CONTENT_STALE", "引用资料已变化，请重新提问后保存")
            val doc = full[source.materialVersionId] ?: get(source.materialVersionId).also { full[it.id] = it }
            val span = doc.spans.firstOrNull { it.id == source.spanId }
            ExpeditionRules.check(doc.courseId == courseId && doc.deletedAt == null && doc.contentHash == source.contentHash && span != null &&
                span.startUtf16 == source.startUtf16 && span.endUtf16 == source.endUtf16 &&
                source.startUtf16 >= 0 && source.endUtf16 <= doc.content.length && source.endUtf16 >= source.startUtf16 &&
                doc.content.substring(source.startUtf16, source.endUtf16) == source.text,
                "SOURCE_INVALID", "回答的引用片段已变化，请重新提问后保存")
        }
        val content = buildString {
            append("问题：").append(question.trim()).append("\n\nAI 建议（需核查）：\n").append(answer.answer)
            append("\n\n模型：").append(answer.model).append("\n来源：\n")
            sources.forEachIndexed { index, source ->
                append("[S").append(index + 1).append("] ").append(source.title).append(" · v")
                    .append(full.getValue(source.materialVersionId).version).append("\n")
                    .append(source.materialVersionId).append('#').append(source.spanId).append("\n")
                    .append(source.text).append("\n\n")
            }
        }
        require(content.length <= 50000) { "回答与来源超过笔记长度限制，请缩小提问范围" }
        WorkspaceApi(client, origin).saveNote(token, null, WorkspaceNoteInput("资料辅导 · ${question.trim()}".take(180), content,
            sourceType = "AI_GENERATED", tags = listOf("资料辅导", "AI建议")))
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
