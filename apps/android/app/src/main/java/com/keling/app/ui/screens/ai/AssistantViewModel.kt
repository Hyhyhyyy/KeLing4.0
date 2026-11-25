package com.keling.app.ui.screens.ai

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.keling.app.network.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.UUID

// Held only by the authenticated UI, never in URLs or saved documents.
data class AssistantContextLaunch(val ref: AssistantContextRef, val prompt: String, val requestId: String = UUID.randomUUID().toString())

data class AssistantUiState(
    val busy: Boolean = false, val error: String? = null, val notice: String? = null,
    val providers: List<ModelProvider> = emptyList(), val sessions: List<AssistantSession> = emptyList(),
    val conversation: AssistantConversation? = null, val polling: Boolean = true,
    val draft: String = "", val contextRef: AssistantContextRef? = null,
    val preview: AssistantContextPreview? = null, val previewLoading: Boolean = false,
    val previewError: String? = null
) {
    val contextReady: Boolean get() = contextRef == null ||
        (!previewLoading && previewError == null && preview?.ref == contextRef && !preview.fingerprint.isBlank())
}

class AssistantViewModel(private val token: String, private val api: AssistantApi = AssistantApi()) : ViewModel() {
    private val mutable = MutableStateFlow(AssistantUiState())
    val state = mutable.asStateFlow()
    private var epoch = 0L
    private var previewRevision = 0L
    private var actionJob: Job? = null
    private var previewJob: Job? = null
    private var pendingText = ""
    private var pendingSession = ""
    private var pendingContext: AssistantContextInput? = null
    private var pendingId = ""

    init { refresh() }

    private fun ensureCurrent(generation: Long) {
        if (epoch != generation) throw CancellationException("Assistant selection changed")
    }
    private fun update(generation: Long, transform: (AssistantUiState) -> AssistantUiState) {
        ensureCurrent(generation)
        mutable.update(transform)
    }
    private fun action(block: suspend (Long) -> Unit) {
        if (mutable.value.busy) return
        val generation = epoch
        mutable.update { it.copy(busy = true, error = null, notice = null) }
        actionJob = viewModelScope.launch {
            try { block(generation) }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) {
                if (epoch == generation) mutable.update { it.copy(error = e.message ?: "连接失败，请刷新共享会话") }
            } finally {
                if (epoch == generation) mutable.update { it.copy(busy = false) }
            }
        }
    }
    private suspend fun list(generation: Long) {
        val catalog = api.catalog(token)
        update(generation) { it.copy(providers = catalog.providers) }
        val sessions = api.sessions(token)
        update(generation) { it.copy(sessions = sessions.sessions) }
    }
    fun refresh() = action { generation ->
        list(generation)
        mutable.value.conversation?.session?.id?.let { openInternal(it, generation) }
        update(generation) { it.copy(polling = true) }
    }
    private suspend fun openInternal(id: String, generation: Long) {
        val data = api.get(token, id)
        update(generation) { it.copy(conversation = data, polling = true) }
    }
    private fun resetSelection() {
        epoch++
        actionJob?.cancel()
        previewJob?.cancel()
        previewRevision++
        pendingId = ""
        mutable.update { it.copy(busy = false, conversation = null, error = null, notice = null,
            draft = "", contextRef = null, preview = null, previewLoading = false, previewError = null) }
    }
    fun open(id: String) {
        resetSelection()
        action { generation -> openInternal(id, generation) }
    }
    fun newConversation() = resetSelection()
    fun editPrompt(text: String) { mutable.update { it.copy(draft = text.take(6000)) } }
    fun beginContext(ref: AssistantContextRef, prompt: String) {
        resetSelection()
        mutable.update { it.copy(contextRef = ref, draft = prompt.take(6000)) }
        refreshPreview()
        if (mutable.value.providers.isEmpty()) refresh()
    }
    fun refreshPreview() {
        if (mutable.value.busy && mutable.value.conversation != null) return
        val ref = mutable.value.contextRef ?: return
        val generation = epoch
        val revision = ++previewRevision
        previewJob?.cancel()
        pendingId = ""
        mutable.update { it.copy(preview = null, previewLoading = true, previewError = null, error = null) }
        previewJob = viewModelScope.launch {
            try {
                val preview = api.preview(token, ref)
                check(preview.ref == ref && preview.fingerprint.isNotBlank()) { "资料预览不完整，请刷新后重试" }
                if (epoch == generation && previewRevision == revision) mutable.update { it.copy(preview = preview, previewLoading = false) }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) {
                if (epoch == generation && previewRevision == revision) mutable.update {
                    it.copy(preview = null, previewLoading = false, previewError = if (e is ApiException && e.statusCode == 404)
                        "资料不可访问，请移除或重新选择。" else e.message ?: "资料加载失败，请重试")
                }
            }
        }
    }
    fun removeContext() {
        if (mutable.value.busy) return
        previewJob?.cancel()
        previewRevision++
        pendingId = ""
        mutable.update { it.copy(contextRef = null, preview = null, previewLoading = false, previewError = null,
            notice = "已移除资料") }
    }
    fun leaveScreen() {
        epoch++
        actionJob?.cancel()
        previewJob?.cancel()
        previewRevision++
        pendingId = ""
        val hadContext = mutable.value.contextRef != null
        mutable.update { it.copy(busy = false, contextRef = null, preview = null, previewLoading = false,
            previewError = null, draft = if (hadContext) "" else it.draft,
            notice = if (hadContext) "请重新选择资料" else it.notice) }
    }
    fun send(text: String, settings: NewAssistantSession) = action { generation ->
        val message = text.trim()
        require(message.length in 1..6000) { "问题需为 1 至 6000 字符" }
        val before = mutable.value
        check(before.contextReady) { "请刷新或移除资料" }
        val context = before.preview?.takeIf { before.contextRef != null }?.input()
        val providerId = before.conversation?.session?.providerId ?: settings.providerId
        val modelId = before.conversation?.session?.modelId ?: settings.modelId
        check(before.providers.any { it.id == providerId && it.configured && modelId in it.chatModels }) { "请先配置可用模型" }
        var conversation = before.conversation
        if (conversation == null) {
            conversation = api.create(token, settings.copy(title = message.take(80), includeContext = if (context != null) false else settings.includeContext))
            update(generation) { it.copy(conversation = conversation) }
        }
        val id = conversation.session.id
        if (pendingText != message || pendingSession != id || pendingContext != context || pendingId.isBlank()) {
            pendingId = UUID.randomUUID().toString()
            pendingText = message
            pendingSession = id
            pendingContext = context
        }
        try { api.send(token, id, message, pendingId, context) }
        catch (e: ApiException) {
            if (context != null && e.statusCode in listOf(404, 409)) {
                update(generation) { it.copy(preview = null, previewError = if (e.statusCode == 409)
                    "资料已变化，请刷新预览后发送。"
                    else "资料不可访问，请移除或重新选择。") }
                pendingId = ""
            }
            throw e
        }
        ensureCurrent(generation)
        pendingId = ""
        update(generation) { it.copy(draft = if (it.draft.trim() == message) "" else it.draft) }
        openInternal(id, generation)
        list(generation)
    }
    suspend fun poll() {
        val before = mutable.value
        val id = before.conversation?.session?.id ?: return
        val generation = epoch
        if (before.busy || !before.polling) return
        try {
            val data = api.get(token, id)
            if (generation == epoch) mutable.update {
                if (it.conversation?.session?.id == id && !it.busy) it.copy(conversation = data) else it
            }
        } catch (e: CancellationException) { throw e }
        catch (e: Exception) {
            if (generation == epoch) mutable.update { it.copy(polling = false, error = "连接中断，请刷新重试。") }
        }
    }
    fun cancel() = action { generation ->
        mutable.value.conversation?.session?.id?.let { api.cancel(token, it); openInternal(it, generation) }
    }
    fun remove() = action { generation ->
        mutable.value.conversation?.session?.id?.let { api.remove(token, it) }
        update(generation) { it.copy(conversation = null, contextRef = null, preview = null, previewLoading = false, previewError = null, draft = "") }
        previewJob?.cancel()
        previewRevision++
        pendingId = ""
        list(generation)
    }
    fun saveNote(id: String) = action { generation ->
        api.saveNote(token, id)
        update(generation) { it.copy(notice = if (token.startsWith("guest-memory:")) "笔记已保存" else "笔记已保存") }
    }
}
