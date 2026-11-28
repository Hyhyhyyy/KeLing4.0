package com.keling.app.planet

import com.keling.app.network.AccessCredentials
import com.keling.app.network.ApiException
import com.keling.app.ui.screens.ai.ModelAccessSession
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.serialization.json.*
import java.util.UUID

data class PlanetTutorTurn(val question: String, val answer: String, val model: String)
data class PlanetTutorConversation(val input: String = "", val turns: List<PlanetTutorTurn> = emptyList(), val busy: Boolean = false, val error: String? = null)
data class PlanetTutorState(val providers: List<PlanetProvider> = emptyList(), val catalogLoading: Boolean = false, val catalogError: String? = null, val conversations: Map<String, PlanetTutorConversation> = emptyMap())

fun planetTutorPayload(draft: PlanetDraft, region: PlanetRegion, question: PlanetQuestion, message: String, history: List<PlanetTutorTurn>, providerId: String, model: String, credentials: AccessCredentials? = null): JsonObject {
    require(message.trim().length in 1..1200) { "请填写问题（不超过1200字）" }
    require(providerId.isNotBlank() && model.isNotBlank()) { "请选择可用模型" }
    val context = buildString {
        append("你是星芽，请围绕这道练习给予循序渐进的提示，先帮助理解概念和思路，不直接揭示答案。区分事实和推测，资料不足时说明，不编造来源。\n")
        append("主题：").append(draft.subject.take(80)).append("\n学习区域：").append(region.title.take(120))
        append("\n题型：").append(planetQuestionLabel(question.kind)).append("\n题干：").append(question.prompt.take(1800))
        if (question.options.isNotEmpty()) append("\n选项：\n").append(question.options.take(8).mapIndexed { index, option -> "${index + 1}. ${option.take(300)}" }.joinToString("\n"))
        append("\n我的问题：").append(message.trim())
    }
    require(context.length <= 6000) { "题目与提问过长，请缩短问题后重试" }
    return buildJsonObject {
        put("providerId", providerId); put("model", model); put("scenario", "CASUAL_CHAT"); put("retrievalMode", "selected"); put("message", context)
        credentials?.let { value -> putJsonObject("credentials") { put("providerId", value.providerId); put("apiKey", value.apiKey); value.baseUrl?.let { put("baseUrl", it) } } }
        putJsonArray("history") {
            history.takeLast(5).forEach { turn ->
                add(buildJsonObject { put("role", "user"); put("content", turn.question.take(2000)) })
                add(buildJsonObject { put("role", "assistant"); put("content", turn.answer.take(2000)) })
            }
        }
        putJsonArray("sources") {
            if (region.lesson.isNotBlank()) add(buildJsonObject { put("id", region.id.take(160)); put("title", region.title.take(180)); put("text", region.lesson.take(6000)); put("kind", "lesson") })
        }
    }
}

/** In-memory, per-question conversations; asking never changes a submitted answer. */
class PlanetTutorController(private val api: PlanetApi, private val access: ModelAccessSession, private val draft: () -> PlanetDraft?, private val scope: CoroutineScope) {
    private val mutable = MutableStateFlow(PlanetTutorState())
    val state = mutable.asStateFlow()
    private val jobs = mutableMapOf<String, Job>()
    private val requests = mutableMapOf<String, String>()
    private var catalogJob: Job? = null
    private var closed = false
    private fun update(block: (PlanetTutorState) -> PlanetTutorState) { if (!closed) mutable.update(block) }
    private fun conversation(id: String) = mutable.value.conversations[id] ?: PlanetTutorConversation()
    private fun updateConversation(id: String, block: (PlanetTutorConversation) -> PlanetTutorConversation) = update { it.copy(conversations = it.conversations + (id to block(it.conversations[id] ?: PlanetTutorConversation()))) }
    fun edit(id: String, text: String) { updateConversation(id) { it.copy(input = text.take(1200), error = null) } }
    fun loadCatalog(force: Boolean = false) {
        if (closed || mutable.value.catalogLoading || (!force && mutable.value.providers.isNotEmpty())) return
        update { it.copy(catalogLoading = true, catalogError = null) }
        catalogJob = scope.launch {
            try { val result = api.tutorCatalog(); update { it.copy(providers = result.providers.filter { p -> p.chatModels.isNotEmpty() }, catalogError = if (result.providers.isEmpty()) "公共模型暂不可用，可配置自己的模型" else null) } }
            catch (e: CancellationException) { throw e }
            catch (_: Exception) { update { it.copy(catalogError = "模型目录暂未读取，可重试或配置自己的模型") } }
            finally { update { it.copy(catalogLoading = false) } }
        }
    }
    fun send(id: String, ownModel: Boolean, providerId: String, model: String) {
        if (closed || conversation(id).busy || conversation(id).input.isBlank()) return
        val pending = conversation(id)
        val requestId = UUID.randomUUID().toString()
        requests[id] = requestId
        updateConversation(id) { it.copy(busy = true, error = null) }
        jobs[id] = scope.launch {
            try {
                val current = requireNotNull(draft()) { "请先打开星球" }
                val region = current.regions.singleOrNull { r -> r.questions.any { it.id == id } } ?: throw IllegalArgumentException("题目已变化，请重新打开问星芽")
                val question = region.questions.single { it.id == id }
                val config = access.state.value
                val credentials = if (ownModel) {
                    require(config.apiKey.isNotBlank() && config.model.isNotBlank()) { "请先配置自己的模型" }
                    AccessCredentials(config.providerId, config.apiKey, config.baseUrl.ifBlank { null })
                } else null
                if (!ownModel) require(mutable.value.providers.any { it.id == providerId && model in it.chatModels }) { "请选择可用的公共模型" }
                val result = api.tutor(current, region, question, pending.input, pending.turns, if (ownModel) config.providerId else providerId, if (ownModel) config.model else model, credentials)
                require(draft()?.regions?.any { r -> r.questions.any { it.id == id } } == true) { "题目已变化，请重新打开问星芽" }
                if (requests[id] == requestId) updateConversation(id) { it.copy(input = if (it.input == pending.input) "" else it.input, turns = it.turns + PlanetTutorTurn(pending.input, result.answer, result.model)) }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { if (requests[id] == requestId) updateConversation(id) { it.copy(error = when {
                e is IllegalArgumentException -> e.message ?: "请检查问题和模型设置"
                e is ApiException && e.statusCode == 429 -> "请求频繁，请稍后再试"
                e is ApiException && e.statusCode in listOf(401, 403) -> "登录或模型权限未通过，请检查配置"
                else -> "星芽暂未回应，问题已保留，请重试"
            }) } }
            finally { if (requests[id] == requestId) { updateConversation(id) { it.copy(busy = false) }; jobs.remove(id); requests.remove(id) } }
        }
    }
    fun cancel(id: String) { requests.remove(id); jobs.remove(id)?.cancel(); updateConversation(id) { it.copy(busy = false) } }
    fun close() { closed = true; catalogJob?.cancel(); jobs.values.forEach { it.cancel() }; jobs.clear(); requests.clear(); mutable.value = PlanetTutorState() }
}
