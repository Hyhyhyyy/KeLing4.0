package com.keling.app.planet

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.keling.app.network.*
import com.keling.app.ui.screens.ai.ModelAccessSession
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import java.util.UUID

data class PlanetUiState(val planets: List<PlanetRecord> = emptyList(), val providers: List<PlanetProvider> = emptyList(), val current: PlanetRecord? = null, val generated: GeneratedPlanet? = null, val busy: Boolean = false, val loading: Boolean = true, val error: String? = null, val notice: String? = null, val feedback: Map<String, PlanetFeedback> = emptyMap(), val catalogError: String? = null)
class PlanetViewModel(val token: String, private val api: PlanetApi = PlanetApi(token)) : ViewModel() {
    var prologueSeen = false
    private val mutable = MutableStateFlow(PlanetUiState()); val state = mutable.asStateFlow()
    private val guestWorkspace = GuestWorkspaces.find(token)
    val access = guestWorkspace?.modelAccess ?: ModelAccessSession()
    private var closed = false
    private var job: Job? = null
    private var draftRequestId = UUID.randomUUID().toString()
    private val answerReceipts = mutableMapOf<String, String>()
    private val regenerationReceipts = mutableMapOf<String, String>()
    init { refresh() }
    private fun update(block: (PlanetUiState) -> PlanetUiState) { if (!closed) mutable.update(block) }
    private fun action(block: suspend () -> Unit) {
        if (closed || mutable.value.busy) return
        update { it.copy(busy = true, error = null, notice = null) }
        job = viewModelScope.launch {
            try { block() } catch (_: TimeoutCancellationException) { update { it.copy(error = "生成等待超时，输入已保留，请稍后重试") } }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { update { it.copy(error = safeError(e)) } }
            finally { update { it.copy(busy = false, loading = false) } }
        }
    }
    private fun safeError(e: Exception): String = when {
        e is ApiException && e.code in setOf("INSUFFICIENT_RESEARCH", "RESEARCH_INSUFFICIENT", "RESEARCH_UNAVAILABLE", "TOPIC_AMBIGUOUS", "INSUFFICIENT_SOURCES", "TOPIC_RESEARCH_REQUIRED", "ARTWORK_FAILED", "INVALID_PLANET", "DRAFT_EXPIRED", "REGENERATION_LIMIT") -> e.message ?: "资料不足，请补充语境或缩小主题"
        e is ApiException && e.statusCode == 503 -> "生成服务暂不可用，请稍后重试或检查模型配置"
        e is ApiException && e.statusCode in listOf(401, 403) -> "账号或模型权限未通过，请检查登录与模型配置"
        e is ApiException && e.statusCode == 422 -> "模型返回的星球不完整，请重新生成"
        e is ApiException && e.statusCode == 409 -> "资料或请求已变化，请刷新后重试"
        e is ApiException && e.statusCode == 429 -> "模型请求受限，请稍后重试"
        e is IllegalArgumentException -> e.message ?: "请检查输入"
        else -> "请求未完成，输入仍保留，请检查网络后重试"
    }
    fun refresh() = action {
        val planets = api.list(); update { before -> before.copy(planets = planets.planets, current = before.current?.let { p -> planets.planets.find { it.id == p.id } }) }
        try { val catalog = api.catalog(); update { it.copy(providers = catalog.providers, catalogError = null) } }
        catch (e: CancellationException) { throw e } catch (_: Exception) { update { it.copy(catalogError = "暂时无法读取模型目录，可配置自己的模型") } }
    }
    fun generate(subject: String, level: String, goal: String, ownModel: Boolean, providerId: String, model: String, contextMode: String = "auto", questionCount: Int = 12, generateArtwork: Boolean = true) = action {
        val accessState = access.state.value
        if (ownModel) require(accessState.apiKey.isNotBlank() && accessState.model.isNotBlank()) { "请先配置模型" }
        val result = api.generate(GeneratePlanetInput(subject.trim(), level.trim().ifBlank { "入门" }, goal.trim(),
            if (ownModel) accessState.model else model.ifBlank { null },
            if (ownModel) accessState.providerId else providerId.ifBlank { null },
            if (ownModel) AccessCredentials(accessState.providerId, accessState.apiKey, accessState.baseUrl.ifBlank { null }) else null, contextMode, questionCount, generateArtwork))
        draftRequestId = UUID.randomUUID().toString(); update { it.copy(generated = result, current = null) }
    }
    fun confirm() { val generated = mutable.value.generated ?: return; action {
        val record = api.confirm(generated, draftRequestId); update { it.copy(generated = null, current = record, planets = it.planets.filterNot { old -> old.id == record.id } + record) }
    } }
    fun open(id: String) = action { val record = api.get(id); update { it.copy(current = record, generated = null, feedback = emptyMap()) } }
    fun overview() { if (!mutable.value.busy) update { it.copy(current = null, generated = null, feedback = emptyMap(), error = null, notice = null) } }
    fun discardPreview() { if (!mutable.value.busy) update { it.copy(generated = null) } }
    fun regenerate(kind: String, questionId: String?, instruction: String) = action {
        val before = mutable.value
        val draft = before.current?.draft ?: before.generated?.draft ?: throw IllegalArgumentException("请先生成星球")
        val key = "${draft.id}/$kind/$questionId/${instruction.trim()}"
        val requestId = regenerationReceipts.getOrPut(key) { UUID.randomUUID().toString() }
        val result = api.regenerate(before.current, before.generated, kind, questionId, instruction, requestId)
        require(result.generated != null || result.planet != null) { "重新生成结果不完整，原内容已保留" }
        update { old ->
            if (result.planet != null) old.copy(current = result.planet, planets = old.planets.map { if (it.id == result.planet.id) result.planet else it }, feedback = old.feedback - questionId.orEmpty(), notice = if (kind == "artwork") "星球形象已更新" else "探索题已更新")
            else old.copy(generated = result.generated, notice = if (kind == "artwork") "星球形象已更新" else "探索题已更新")
        }
        regenerationReceipts.remove(key)
        if (result.generated != null) draftRequestId = UUID.randomUUID().toString()
    }
    fun answer(questionId: String, selected: Int) = answer(questionId, PlanetResponse(selectedIndex = selected))
    fun answer(questionId: String, response: PlanetResponse) { val current = mutable.value.current ?: return; action {
        val key = "${current.id}/$questionId/$response"
        val requestId = answerReceipts.getOrPut(key) { UUID.randomUUID().toString() }
        val result = api.answer(current.id, questionId, response, requestId)
        update { it.copy(current = result.planet, planets = it.planets.map { p -> if (p.id == current.id) result.planet else p }, feedback = it.feedback + (questionId to result.feedback)) }
        answerReceipts.remove(key)
    } }
    fun saveJournal(region: PlanetRegion, reflection: String) { val current = mutable.value.current ?: return; action {
        require(reflection.isNotBlank()) { "写下这次的发现" }
        WorkspaceApi().saveNote(token, null, WorkspaceNoteInput("${current.draft.subject} · ${region.title}", "本次发现\n${reflection.trim()}\n\n学习目标\n${region.objectives.joinToString("\n")}\n\nAI 生成内容待核对"))
        update { it.copy(notice = "已写入航行日志") }
    } }
    fun schedule(region: PlanetRegion) { val current = mutable.value.current ?: return; action {
        WorkspaceApi().createTask(token, WorkspaceTaskInput("探索：${region.title}", region.description, current.courseId, region.estimatedMinutes))
        update { it.copy(notice = "已加入学习任务") }
    } }
    fun cancelGeneration() { job?.cancel(); update { it.copy(busy = false, loading = false) } }
    fun shutdown() { closed = true; job?.cancel(); viewModelScope.cancel(); if (guestWorkspace == null) access.close() }
    override fun onCleared() { shutdown() }
}
