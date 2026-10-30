package com.keling.app.network

import com.keling.app.ui.screens.ai.ModelAccessSession
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.timeout
import io.ktor.client.request.*
import io.ktor.http.*
import kotlinx.coroutines.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID

/** Local capability only. Guest identifiers are never network bearer credentials. */
object GuestWorkspaces {
    private val workspaces = mutableMapOf<String, GuestWorkspace>()
    fun create(client: HttpClient? = null): GuestWorkspace = GuestWorkspace(client).also { workspaces[it.token] = it }
    fun find(token: String): GuestWorkspace? {
        if (!token.startsWith("guest-memory:")) return null
        return workspaces[token]?.also { it.ensureOpen() } ?: throw ApiException(410, "本次试用已结束，请重新进入")
    }
    fun close(token: String) { workspaces.remove(token)?.close() }
}

@Serializable private data class GuestChatResult(val answer: String, val model: String, val sources: List<AssistantSource> = emptyList(), val usage: AssistantUsage = AssistantUsage())
@Serializable private data class GuestPlanResult(val result: AgentPlan, val model: String)
@Serializable private data class GuestHistory(val role: String, val content: String)

class GuestWorkspace internal constructor(private val suppliedClient: HttpClient? = null) {
    val token = "guest-memory:${UUID.randomUUID()}"
    val accountId = token
    val modelAccess = ModelAccessSession()
    @OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; explicitNulls = false }
    private val client get() = suppliedClient ?: KelingHttpClient.client
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var closed = false
    private var clock = 0L
    private fun now(): String { clock = maxOf(clock + 1, System.currentTimeMillis()); return Instant.ofEpochMilli(clock).toString() }
    private fun id() = UUID.randomUUID().toString()
    fun ensureOpen() { if (closed) throw ApiException(410, "本次试用已结束") }
    var profile = WorkspaceProfile(accountId, "游客探索者")
        private set
    private val courses = mutableListOf<CourseData>()
    private val notes = mutableListOf<NoteData>()
    private val tasks = mutableListOf<TaskData>()
    private val sources = mutableMapOf<String, MutableList<AssistantSource>>()
    private var checkedDate = ""
    private var experience = 0
    val learningMaterials = com.keling.app.expedition.GuestLearningStore(::ensureOpen)
    val expeditionJournal = com.keling.app.expedition.ExpeditionJournal.memory()
    private var expeditionGame: com.keling.app.expedition.GuestExpedition? = null
    fun expedition(catalog: com.keling.app.expedition.CatalogResponse): com.keling.app.expedition.GuestExpedition {
        ensureOpen()
        return expeditionGame ?: com.keling.app.expedition.GuestExpedition(catalog, ::ensureOpen,
            { id -> courses.any { it.id == id && !it.isArchived } },
            com.keling.app.expedition.LegacySnapshot(profile.level, experience, profile.crystals, profile.energy, now()),
            { account -> ensureOpen(); profile = profile.copy(level = account.level, crystals = account.crystals); experience = account.exp },
            { record -> ensureOpen(); profile = profile.copy(totalStudyMinutes = profile.totalStudyMinutes + record.durationMinutes)
                courses.replaceAll { if (it.id == record.courseId) it.copy(totalStudyMinutes = it.totalStudyMinutes + record.durationMinutes, studySessionCount = it.studySessionCount + 1) else it } }
        ).also { expeditionGame = it }
    }
    private val conversations = mutableMapOf<String, AssistantConversation>()
    private val settings = mutableMapOf<String, NewAssistantSession>()
    private val requests = mutableMapOf<String, AssistantReceipt>()
    private val requestSignatures = mutableMapOf<String, String>()
    private val running = mutableMapOf<String, Job>()
    private val noteForTurn = mutableMapOf<String, String>()
    private val runs = mutableMapOf<String, AgentRun>()
    private val runCourses = mutableMapOf<String, String>()
    private val runFingerprints = mutableMapOf<String, String>()
    init {
        val course = createCourse("算法与思考（示例）").course!!
        addSource(course.id, "递归与终止条件", "递归把问题缩小为同类子问题，需要终止条件，以及每一步接近终止条件的变化。例：0! = 1，n! = n × (n−1)!。")
    }
    fun courseList(): CourseResponse { ensureOpen(); return CourseResponse(courses = courses.toList()) }
    fun cloudCourses() = CloudCourses(courses.map { CloudCourse(it.id, it.name, sources[it.id]?.size ?: 0, it.planetStyleIndex) })
    fun createCourse(name: String, planetStyleIndex: Int = 0): CloudCourses {
        ensureOpen(); require(name.trim().length in 1..100); com.keling.app.data.PlanetStyles.requireIndex(planetStyleIndex)
        val course = CourseData(id(), name.trim(), planetStyleIndex = planetStyleIndex); courses.add(course)
        return CloudCourses(course = CloudCourse(course.id, course.name, planetStyleIndex = planetStyleIndex))
    }
    fun updatePlanet(courseId: String, planetStyleIndex: Int): CourseResponse {
        ensureOpen(); com.keling.app.data.PlanetStyles.requireIndex(planetStyleIndex)
        val index = courses.indexOfFirst { it.id == courseId }
        if (index < 0) throw ApiException(404, "课程不存在")
        val updated = courses[index].copy(planetStyleIndex = planetStyleIndex)
        courses[index] = updated
        return CourseResponse(course = updated)
    }
    fun sourceList(courseId: String): CloudNodes { ensureOpen(); require(courses.any { it.id == courseId }); return CloudNodes(sources[courseId].orEmpty().map { CloudNode(it.id, it.title, it.text) }) }
    fun addSource(courseId: String, name: String, text: String) {
        ensureOpen(); require(courses.any { it.id == courseId } && name.isNotBlank() && text.isNotBlank())
        sources.getOrPut(courseId) { mutableListOf() }.add(AssistantSource(id(), name.take(180), text.take(50000), "knowledge", now()))
    }
    fun noteList(): NoteResponse { ensureOpen(); return NoteResponse(notes = notes.toList()) }
    fun saveNote(noteId: String?, input: WorkspaceNoteInput): NoteData {
        ensureOpen(); require(input.title.trim().length in 1..180 && input.content.isNotBlank() && input.content.length <= 50000)
        val old = noteId?.let { findNote(it) }
        if (old != null && input.expectedUpdatedAt != old.updatedAt) throw ApiException(409, "笔记已变化，请重新打开最新内容")
        val stamp = now(); val note = NoteData(noteId ?: id(), input.title.trim(), input.content, createdAt = old?.createdAt ?: stamp, updatedAt = stamp)
        notes.removeAll { it.id == note.id }; notes.add(0, note); return note
    }
    private fun findNote(id: String) = notes.find { it.id == id } ?: throw ApiException(404, "笔记不存在")
    fun deleteNote(id: String) { ensureOpen(); findNote(id); notes.removeAll { it.id == id } }
    fun avatar(index: Int) { ensureOpen(); require(index in 0..8); profile = profile.copy(avatarUrl = "stellar:avatar-$index") }
    fun checkinStatus(): CheckInResponse { ensureOpen(); return CheckInResponse(hasCheckedInToday = checkedDate == LocalDate.now(ZoneId.of("Asia/Shanghai")).toString(), streakDays = profile.streakDays) }
    fun checkin() {
        ensureOpen(); if (checkinStatus().hasCheckedInToday) return
        val date = LocalDate.now(ZoneId.of("Asia/Shanghai"))
        val streak = if (checkedDate == date.minusDays(1).toString()) profile.streakDays + 1 else 1
        checkedDate = date.toString(); profile = profile.copy(streakDays = streak)
    }
    private val scheduleConfirmations = mutableMapOf<String, com.keling.app.expedition.ScheduleConfirmation>()
    fun scheduleFingerprint(): String {
        ensureOpen()
        val value = json.encodeToString(CourseResponse.serializer(), courseList()) + json.encodeToString(TaskResponse.serializer(), taskList())
        return java.security.MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString("") { "%02x".format(it) }
    }
    fun confirmSchedule(courseId: String, preview: com.keling.app.expedition.SchedulePreview, fingerprint: String): com.keling.app.expedition.ScheduleConfirmation {
        ensureOpen(); val previewId = requireNotNull(preview.previewId)
        scheduleConfirmations[previewId]?.let { return it.copy(replayed = true) }
        if (fingerprint != scheduleFingerprint()) throw ApiException(409, "课程或任务已变化，请保留预览并重新计算", "PLAN_STALE")
        if (preview.expiresAt == null || Instant.parse(preview.expiresAt) <= Instant.now() || preview.tasks.any { Instant.parse(it.scheduledAt) <= Instant.now() }) throw ApiException(409, "预览已过期或包含过去时段，请重新排程", "PLAN_EXPIRED")
        require(courses.any { it.id == courseId && !it.isArchived }) { "课程不存在" }
        val created = preview.tasks.map { item -> TaskData(id(), item.title, "已确认的约束排程；目标 ${item.objectiveKey.orEmpty()}", type = "DEEP_EXPLORATION", courseId = courseId,
            estimatedMinutes = item.minutes, scheduledAt = item.scheduledAt, rewardsEnergy = 0, rewardsCrystals = 0, rewardsExp = 0, createdAt = now()) }
        tasks.addAll(created)
        return com.keling.app.expedition.ScheduleConfirmation(created.map { it.id }, created.size, false).also { scheduleConfirmations[previewId] = it }
    }
    fun taskList(): TaskResponse { ensureOpen(); return TaskResponse(tasks = tasks.toList()) }
    fun complete(id: String, minutes: Int): TaskResponse {
        ensureOpen(); require(minutes in 0..1440)
        val index = tasks.indexOfFirst { it.id == id }; if (index < 0) throw ApiException(404, "任务不存在")
        val old = tasks[index]; if (old.status == "COMPLETED") return TaskResponse(task = old, rewards = RewardsData())
        val task = old.copy(status = "COMPLETED", actualMinutes = minutes, completedAt = now()); tasks[index] = task
        profile = profile.copy(totalStudyMinutes = profile.totalStudyMinutes + minutes)
        courses.replaceAll { if (it.id == task.courseId) it.copy(totalStudyMinutes = it.totalStudyMinutes + minutes, studySessionCount = it.studySessionCount + 1) else it }
        return TaskResponse(task = task, rewards = RewardsData())
    }
    fun preview(ref: AssistantContextRef): AssistantContextPreview {
        ensureOpen()
        val selected: List<AssistantSource>; val title: String
        when (ref.kind) {
            "course" -> {
                title = courses.find { it.id == ref.id && !it.isArchived }?.name ?: throw ApiException(404, "课程不存在")
                val courseSources = mutableListOf(AssistantSource(ref.id, title, "当前仅选择《$title》的知识点、资料首片段和学习过程；过程不证明已掌握。", "course"))
                courseSources += sources[ref.id].orEmpty().take(6).map { it.copy(text = it.text.take(1000), truncated = it.truncated || it.text.length > 1000) }
                learningMaterials.list(ref.id).takeLast(3).forEach { material -> material.spans.firstOrNull()?.let { span ->
                    val original = material.content.substring(span.startUtf16, span.endUtf16); val excerpt = original.take(1200)
                    courseSources += AssistantSource(span.id, "${material.title} v${material.version}", "资料版本 ${material.id}\n内容摘要 SHA256 ${material.contentHash}\n第${span.paragraphIndex + 1}段，原文字元 ${span.startUtf16}–${span.startUtf16 + excerpt.length}\n\n$excerpt", "material", material.createdAt, truncated = original.length > 1200 || span.endUtf16 < material.content.length)
                } }
                expeditionGame?.contextSnapshot(ref.id)?.let { (progress, recent) ->
                    progress?.let { p ->
                        val summary = p.state.objectives.take(3).joinToString("\n") { "${it.objectiveKey}：${it.state}（学习过程状态）${it.review?.let { r -> "；回访 ${r.dueAt}" }.orEmpty()}" }
                        val memories = p.state.companionMemories.filter { it.deletedAt == null }.takeLast(2).joinToString("\n") { "用户自述解释，非已审核事实：${it.text.take(600)}" }
                        courseSources += AssistantSource(p.id, "本课程目标与伙伴档案", "$summary\n$memories\n不能据经验、结晶或单次练习预测成绩。", "evidence", "revision:${p.revision}")
                    }
                    recent.forEach { run -> courseSources += AssistantSource(run.id, "最近远征 · ${run.objectiveKey}", "状态 ${run.status} · 模式 ${run.mode} · 已用提示 ${run.hintsUsed}\n最近反馈：${run.feedback?.message ?: "尚未作答"}\n下一步自述：${run.nextStep?.take(600) ?: "尚未确认"}\n这是过程记录，不是 AI 可更改的评价。", "evidence", "revision:${run.revision}") }
                }
                selected = courseSources
            }
            "note" -> { val note = findNote(ref.id); title = note.title; selected = listOf(AssistantSource(note.id, note.title, note.content, "note", note.updatedAt)) }
            "task" -> { val task = tasks.find { it.id == ref.id } ?: throw ApiException(404, "任务不存在"); title = task.title; selected = listOf(AssistantSource(task.id, task.title, "${task.description}\n${task.status} · ${task.estimatedMinutes} 分钟", "task", task.completedAt ?: task.createdAt)) }
            else -> throw ApiException(400, "未知资料类型")
        }
        val bounded = selected.map { it.copy(text = it.text.take(6000), truncated = it.truncated || it.text.length > 6000) }
        val fingerprint = java.security.MessageDigest.getInstance("SHA-256").digest(json.encodeToString(AssistantSource.serializer().let { kotlinx.serialization.builtins.ListSerializer(it) }, selected).toByteArray()).joinToString("") { "%02x".format(it) }
        return AssistantContextPreview(ref, title, fingerprint, bounded, if (selected.size > bounded.size || bounded.any { it.truncated }) listOf("仅附带预览所示片段；课程最多6知识点、3材料首段、3目标与最近3次远征，不代表完整材料") else emptyList())
    }
    suspend fun catalog(): ModelCatalog {
        ensureOpen(); val key = modelAccess.state.value
        val own = if (key.apiKey.isNotBlank() && key.providerId.isNotBlank()) listOf(ModelProvider(key.providerId, key.provider?.name ?: key.providerId, "user-key", true,
            (key.models.filter { it.capabilities.isEmpty() || "chat" in it.capabilities }.map { it.id } + listOf(key.model).filter { it.isNotBlank() }).distinct(), key.models.filter { "embedding" in it.capabilities }.map { it.id })) else emptyList()
        val public = try { client.get("${ApiConfig.actualBaseUrl}/trial/workspace/catalog").body<ModelCatalog>().providers } catch (e: CancellationException) { throw e } catch (_: Exception) { emptyList() }
        ensureOpen(); return ModelCatalog(own + public)
    }
    fun sessions(): AssistantSessions { ensureOpen(); return AssistantSessions(conversations.values.map { it.session }.reversed()) }
    fun conversation(id: String): AssistantConversation { ensureOpen(); return conversations[id] ?: throw ApiException(404, "会话不存在") }
    fun create(input: NewAssistantSession): AssistantConversation {
        ensureOpen(); val session = AssistantSession(id(), input.title, input.providerId, input.modelId, input.scenario, input.includeContext, input.retrievalMode)
        val result = AssistantConversation(session); conversations[session.id] = result; settings[session.id] = input; return result
    }
    private fun credentials(provider: String): JsonElement? {
        if (provider == "public") return null
        val key = modelAccess.state.value
        if (key.providerId != provider || key.apiKey.isBlank()) throw ApiException(400, "请先配置这个会话所选厂商的 API Key")
        return json.encodeToJsonElement(AccessCredentials(provider, key.apiKey, key.baseUrl.ifBlank { null }))
    }
    suspend fun send(sessionId: String, text: String, requestId: String, context: AssistantContextInput?): AssistantReceipt {
        ensureOpen(); val before = conversation(sessionId); require(text.trim().length in 1..6000)
        val requestKey = "$sessionId:$requestId"
        val signature = text + "\u0000" + (context?.let { json.encodeToString(AssistantContextInput.serializer(), it) } ?: "")
        requests[requestKey]?.let {
            if (requestSignatures[requestKey] != signature) throw ApiException(409, "请求编号已用于其他内容，请重新发送")
            return it
        }
        check(before.session.activeRequestId.isBlank()) { "本次会话仍在生成，请先取消或等待" }
        val attachment = context?.let { preview(AssistantContextRef(it.kind, it.id)).also { current -> if (current.fingerprint != it.fingerprint) throw ApiException(409, "资料已变化，请刷新预览") } }
        val config = settings.getValue(sessionId)
        if (config.includeContext && config.retrievalMode == "vector" && attachment == null) require(config.embeddingProviderId == config.providerId) { "游客语义检索请使用聊天所选厂商的向量模型与同一 Key" }
        val excerpts = attachment?.sources ?: if (config.includeContext) (sources.values.flatten().take(24).map { it.copy(text = it.text.take(1200), truncated = it.text.length > 1200) } + notes.take(12).map { AssistantSource(it.id, it.title, it.content.take(1200), "note", it.updatedAt, it.content.length > 1200) }) else emptyList()
        val history = before.turns.filter { it.status == "SUCCEEDED" }.takeLast(10).flatMap { listOf(GuestHistory("user", it.userText.take(1000)), GuestHistory("assistant", it.assistantText.take(1000))) }
        val payload = buildJsonObject {
            credentials(config.providerId)?.let { put("credentials", it) }; put("model", config.modelId); put("message", text); put("scenario", config.scenario)
            put("history", json.encodeToJsonElement(history)); put("sources", json.encodeToJsonElement(excerpts))
            put("retrievalMode", if (attachment != null) "selected" else config.retrievalMode); if (config.embeddingModelId.isNotBlank()) put("embeddingModel", config.embeddingModelId)
        }
        val turn = AssistantTurn(id(), "RUNNING", text, modelId = config.modelId, sources = excerpts)
        conversations[sessionId] = before.copy(session = before.session.copy(activeRequestId = requestId), turns = before.turns + turn)
        val receipt = AssistantReceipt(turn.id, "RUNNING"); requests[requestKey] = receipt; requestSignatures[requestKey] = signature
        running[sessionId] = scope.launch {
            try {
                val answer = client.post("${ApiConfig.actualBaseUrl}/trial/workspace/chat") { timeout { requestTimeoutMillis = 95_000 }; contentType(ContentType.Application.Json); setBody(payload) }.body<GuestChatResult>()
                if (!closed && conversations[sessionId]?.session?.activeRequestId == requestId) finish(sessionId, turn.copy(status = "SUCCEEDED", assistantText = answer.answer, modelId = answer.model, sources = answer.sources, usage = answer.usage))
            } catch (e: CancellationException) { throw e }
            catch (_: Exception) { if (!closed && conversations[sessionId]?.session?.activeRequestId == requestId) finish(sessionId, turn.copy(status = "FAILED", error = "模型请求失败，请检查 Key、模型权限与网络后重试。")) }
        }
        return receipt
    }
    private fun finish(sessionId: String, turn: AssistantTurn) { val current = conversations[sessionId] ?: return; conversations[sessionId] = current.copy(session = current.session.copy(activeRequestId = ""), turns = current.turns.map { if (it.id == turn.id) turn else it }) }
    fun cancel(sessionId: String) { ensureOpen(); running.remove(sessionId)?.cancel(); conversation(sessionId).turns.lastOrNull()?.takeIf { it.status == "RUNNING" }?.let { finish(sessionId, it.copy(status = "CANCELLED", error = "已取消本次等待")) } }
    fun remove(sessionId: String) {
        cancel(sessionId); conversations.remove(sessionId); settings.remove(sessionId)
        requests.keys.removeAll { it.startsWith("$sessionId:") }; requestSignatures.keys.removeAll { it.startsWith("$sessionId:") }
    }
    fun saveTurn(turnId: String) {
        ensureOpen(); if (noteForTurn[turnId]?.let { id -> notes.any { it.id == id } } == true) return
        val turn = conversations.values.flatMap { it.turns }.find { it.id == turnId && it.status == "SUCCEEDED" } ?: throw ApiException(404, "没有可保存的回答")
        noteForTurn[turnId] = saveNote(null, WorkspaceNoteInput(turn.userText.take(180), turn.assistantText.take(50000))).id
    }
    suspend fun status(): AgentStatus { val provider = catalog().providers.firstOrNull { it.configured && it.chatModels.isNotEmpty() }; return AgentStatus(provider != null, provider?.name) }
    fun history(): AgentRuns { ensureOpen(); return AgentRuns(runs.values.toList().reversed()) }
    fun run(id: String): AgentRun { ensureOpen(); return runs[id] ?: throw ApiException(404, "计划不存在") }
    suspend fun start(request: AgentRequest): AgentRun {
        ensureOpen(); val course = courses.find { it.id == request.courseId } ?: throw ApiException(404, "课程不存在")
        val materials = sources[course.id].orEmpty().take(8).map { it.copy(text = it.text.take(1800), truncated = it.text.length > 1800) }; require(materials.isNotEmpty()) { "请先添加课程资料" }
        val sourceFingerprint = preview(AssistantContextRef("course", course.id)).fingerprint
        val provider = catalog().providers.firstOrNull { it.configured && it.chatModels.isNotEmpty() } ?: throw ApiException(400, "请先配置 API Key 与模型")
        val model = modelAccess.state.value.model.takeIf { it in provider.chatModels } ?: provider.chatModels.first()
        val payload = buildJsonObject {
            credentials(provider.id)?.let { put("credentials", it) }; put("model", model); put("request", json.encodeToJsonElement(request)); put("courseName", course.name)
            put("sources", json.encodeToJsonElement(materials)); put("tasks", JsonArray(tasks.filter { it.courseId == course.id }.take(100).map { task -> buildJsonObject { put("title", task.title); put("status", task.status); put("estimatedMinutes", task.estimatedMinutes); put("actualMinutes", task.actualMinutes?.let { JsonPrimitive(it) } ?: JsonNull) } }))
        }
        val started = AgentRun(id(), request.goal, "RUNNING", now(), sources = materials.map { AgentSource(it.id, it.title) })
        runs[started.id] = started; runCourses[started.id] = course.id
        runFingerprints[started.id] = sourceFingerprint
        running[started.id] = scope.launch {
            try {
                val answer = client.post("${ApiConfig.actualBaseUrl}/trial/workspace/plan") { timeout { requestTimeoutMillis = 95_000 }; contentType(ContentType.Application.Json); setBody(payload) }.body<GuestPlanResult>()
                if (!closed) runs[started.id] = started.copy(status = "SUCCEEDED", result = answer.result)
            } catch (e: CancellationException) { throw e }
            catch (_: Exception) { if (!closed) runs[started.id] = started.copy(status = "FAILED", error = "规划失败，请检查模型配置和资料后重试。") }
        }
        return started
    }
    fun confirm(runId: String) {
        ensureOpen(); val selected = run(runId); if (selected.status == "CONFIRMED") return
        check(selected.status == "SUCCEEDED") { "请先等待计划生成成功" }
        val plan = requireNotNull(selected.result)
        val today = LocalDate.now(ZoneId.of("Asia/Shanghai")).toString()
        if (plan.tasks.any { it.date < today }) throw ApiException(409, "计划日期已过期，请重新生成")
        if (preview(AssistantContextRef("course", runCourses.getValue(runId))).fingerprint != runFingerprints[runId]) throw ApiException(409, "课程资料已变化，请重新生成并核对计划")
        tasks.addAll(plan.tasks.map { TaskData(id(), it.title, it.description, courseId = runCourses[runId], estimatedMinutes = it.minutes, scheduledAt = it.date, createdAt = now()) })
        runs[runId] = selected.copy(status = "CONFIRMED")
    }
    fun close() {
        expeditionGame?.close(); expeditionJournal.close(); learningMaterials.close(); scheduleConfirmations.clear()
        closed = true; scope.cancel(); modelAccess.close(); courses.clear(); sources.clear(); tasks.clear(); notes.clear(); conversations.clear(); settings.clear(); requests.clear(); requestSignatures.clear(); running.clear(); noteForTurn.clear(); runs.clear(); runCourses.clear(); runFingerprints.clear(); profile = WorkspaceProfile(accountId, ""); checkedDate = ""; experience = 0
    }
}
