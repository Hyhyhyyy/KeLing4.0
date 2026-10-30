package com.keling.app.ui.screens.ai

import com.keling.app.network.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

data class KeyCandidate(val providerId: String?, val explanation: String)
fun identifyKeyCandidate(key: String): KeyCandidate = when {
    key.startsWith("sk-ant-") -> KeyCandidate("anthropic", "前缀类似 Anthropic；只是本地候选，需要你选择并验证。")
    key.startsWith("sk-proj-") || key.startsWith("sk-svcacct-") -> KeyCandidate("openai", "前缀类似 OpenAI；只是本地候选，需要你选择并验证。")
    key.startsWith("AIza") -> KeyCandidate("gemini", "前缀类似 Google Gemini；只是本地候选，需要你选择并验证。")
    key.startsWith("sk-") -> KeyCandidate(null, "多家厂商都使用 sk- 前缀，无法仅凭格式确认。请自行选择厂商。")
    key.count { it == '.' } == 2 -> KeyCandidate(null, "此格式可能是 JWT 类令牌，多家服务均会使用。请按密钥来源选择厂商。")
    key.isBlank() -> KeyCandidate(null, "输入 Key 后只在本机判断可能的厂商，不会自动验证。")
    else -> KeyCandidate(null, "无法可靠判断厂商。请按密钥来源手动选择。")
}

data class ModelAccessState(
    val providers: List<AccessProvider> = emptyList(), val providerId: String = "", val apiKey: String = "", val baseUrl: String = "",
    val models: List<AccessModel> = emptyList(), val model: String = "", val discoveryNote: String = "", val fetchedAt: String = "",
    val message: String = "", val context: List<TrialContext> = emptyList(), val answer: TrialAnswer? = null, val answeredQuestion: String = "",
    val catalogLoading: Boolean = false, val busy: Boolean = false, val operation: String = "", val error: String? = null
) {
    val provider: AccessProvider? get() = providers.find { it.id == providerId }
    val canDiscover: Boolean get() = !busy && provider != null && apiKey.isNotBlank() && (provider?.endpointRequired != true || baseUrl.isNotBlank())
    val canSend: Boolean get() = canDiscover && provider?.chat == true && model.isNotBlank() && message.isNotBlank() &&
        models.find { it.id == model }?.let { it.capabilities.isEmpty() || "chat" in it.capabilities } != false
    override fun toString() = "ModelAccessState(providerId=$providerId, apiKey=[redacted], busy=$busy)"
}

/** The panel owns this object. Closing it drops credentials, requests and answers. */
class ModelAccessSession(initialMessage: String = "", initialContext: List<TrialContext> = emptyList(), private val api: ModelAccessApi = ModelAccessApi()) {
    private val mutable = MutableStateFlow(ModelAccessState(message = initialMessage.take(4000), context = initialContext.take(3).map { TrialContext(it.title.take(120), it.text.take(2000)) }))
    val state = mutable.asStateFlow()
    private var closed = false
    private var generation = 0L
    private var request: Job? = null
    private var catalogJob: Job? = null
    private fun change(transform: (ModelAccessState) -> ModelAccessState) { if (!closed) mutable.update(transform) }
    private fun invalidate() {
        cancel()
        change { it.copy(models = emptyList(), model = "", discoveryNote = "", fetchedAt = "", error = null, answer = null, answeredQuestion = "") }
    }
    fun editKey(key: String) { invalidate(); change { it.copy(apiKey = key.trim().take(4096)) } }
    fun selectProvider(id: String) { invalidate(); change { it.copy(providerId = id, baseUrl = "") } }
    fun editEndpoint(url: String) { invalidate(); change { it.copy(baseUrl = url.trim().take(500)) } }
    fun editModel(model: String) { if (!mutable.value.busy) change { it.copy(model = model.trim().take(160)) } }
    fun editMessage(message: String) { change { it.copy(message = message.take(4000)) } }
    fun removeContext(index: Int) { if (!mutable.value.busy) change { it.copy(context = it.context.filterIndexed { i, _ -> i != index }) } }
    fun loadCatalog(scope: CoroutineScope) {
        if (closed || mutable.value.catalogLoading) return
        change { it.copy(catalogLoading = true, error = null) }
        catalogJob = scope.launch {
            try { val catalog = api.catalog(); change { it.copy(providers = catalog.providers) } }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { change { it.copy(error = "无法读取厂商目录，请检查网络后重试。") } }
            finally { change { it.copy(catalogLoading = false) } }
        }
    }
    private fun safeError(e: Exception): String = when ((e as? ApiException)?.code) {
        "DISCOVERY_UNSUPPORTED" -> "此服务地址暂不提供可读取的模型目录。请核对官方地域，或在下方手填已开通的模型 ID，再明确发送验证。"
        "BASE_URL_NOT_ALLOWED" -> "地址不属于所选厂商允许的官方地址，请从列表选择并核对账户地域。"
        else -> when ((e as? ApiException)?.statusCode) {
        401, 403 -> "密钥或权限未通过验证，请核对所选厂商与账户授权。"
        400, 404, 422 -> "请求未被接受，请核对厂商、官方地址、模型名称及输入限制。"
        429 -> "请求受限或额度不足，请稍后重试并检查模型商账户。"
        else -> "连接或模型请求失败。Key 不会在错误中显示，请核对配置后重试。"
        }
    }
    fun discover(scope: CoroutineScope) {
        val before = mutable.value
        if (closed || !before.canDiscover) return
        val expected = ++generation
        change { it.copy(busy = true, operation = "验证并获取模型", error = null, models = emptyList(), fetchedAt = "", discoveryNote = "") }
        request = scope.launch {
            try {
                val result = api.discover(AccessCredentials(before.providerId, before.apiKey, before.baseUrl.ifBlank { null }))
                check(result.providerId == before.providerId) { "Unexpected provider response" }
                if (generation == expected) change { it.copy(models = result.models,
                    model = result.models.firstOrNull { model -> "chat" in model.capabilities || model.capabilities.isEmpty() }?.id.orEmpty(), fetchedAt = result.fetchedAt, discoveryNote = result.note) }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { if (generation == expected) change { it.copy(error = safeError(e)) } }
            finally { if (generation == expected) change { it.copy(busy = false) } }
        }
    }
    fun send(scope: CoroutineScope) {
        val before = mutable.value
        if (closed || !before.canSend) return
        val expected = ++generation
        change { it.copy(busy = true, operation = "发送临时问答", error = null) }
        request = scope.launch {
            try {
                val result = api.complete(AccessQuestion(before.providerId, before.apiKey, before.model, before.message.trim(), before.baseUrl.ifBlank { null }, before.context))
                if (generation == expected) change { it.copy(answer = result, answeredQuestion = before.message.trim(), message = if (it.message == before.message) "" else it.message) }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { if (generation == expected) change { it.copy(error = safeError(e)) } }
            finally { if (generation == expected) change { it.copy(busy = false) } }
        }
    }
    fun cancel() { generation++; request?.cancel(); change { it.copy(busy = false) } }
    fun close() { closed = true; generation++; request?.cancel(); catalogJob?.cancel(); mutable.value = ModelAccessState() }
}
