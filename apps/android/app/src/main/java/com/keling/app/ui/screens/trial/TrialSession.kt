package com.keling.app.ui.screens.trial

import com.keling.app.network.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import java.util.UUID

data class TrialConcept(val title: String, val text: String)
data class TrialCourse(val id: String, val title: String, val concepts: List<TrialConcept>)
data class TrialTask(val id: String, val title: String, val description: String, val minutes: Int, val completed: Boolean = false, val focusMinutes: Int = 0)
data class TrialNote(val id: String, val title: String, val text: String)
data class TrialPreview(val title: String, val text: String, val truncated: Boolean)
data class TrialState(
    val tab: String = "home", val courses: List<TrialCourse> = emptyList(),
    val tasks: List<TrialTask> = emptyList(), val notes: List<TrialNote> = emptyList(),
    val prompt: String = "", val context: List<TrialPreview> = emptyList(), val answer: String = "",
    val answeredQuestion: String = "", val answerModel: String? = null, val example: Boolean = false,
    val usage: TrialUsage = TrialUsage(), val config: TrialConfig? = null,
    val configuring: Boolean = false, val sending: Boolean = false, val error: String? = null
)

/** One screen's memory only. It has no repository, file, preference or database dependency. */
class TrialSession(private val api: TrialApi = TrialApi()) {
    private val mutable = MutableStateFlow(samples())
    val state = mutable.asStateFlow()
    private var closed = false
    private var generation = 0L
    private var sendJob: Job? = null
    private var configJob: Job? = null
    private fun change(transform: (TrialState) -> TrialState) { if (!closed) mutable.update(transform) }

    fun navigate(tab: String) { require(tab in listOf("home", "courses", "tasks", "notes", "ai")); change { it.copy(tab = tab) } }
    fun addTask(title: String, description: String, minutes: Int) {
        require(title.trim().isNotEmpty() && minutes in 1..480)
        change { it.copy(tasks = it.tasks + TrialTask(UUID.randomUUID().toString(), title.trim().take(120), description.take(2000), minutes)) }
    }
    fun deleteTask(id: String) { change { it.copy(tasks = it.tasks.filterNot { task -> task.id == id }) } }
    fun completeTask(id: String, focusMinutes: Int = 0) {
        require(focusMinutes in 0..480)
        change { it.copy(tasks = it.tasks.map { task -> if (task.id == id) task.copy(completed = true, focusMinutes = maxOf(task.focusMinutes, focusMinutes)) else task }) }
    }
    fun saveNote(id: String?, title: String, text: String) {
        require(title.trim().isNotEmpty())
        val note = TrialNote(id ?: UUID.randomUUID().toString(), title.trim().take(120), text.take(12000))
        change { before -> before.copy(notes = if (id == null) before.notes + note else before.notes.map { if (it.id == id) note else it }) }
    }
    fun deleteNote(id: String) { change { it.copy(notes = it.notes.filterNot { note -> note.id == id }) } }
    fun editPrompt(prompt: String) { change { it.copy(prompt = prompt.take(4000)) } }
    fun selectContext(sources: List<TrialContext>, question: String) {
        cancel()
        change { it.copy(tab = "ai", context = sources.take(3).map { source -> TrialPreview(source.title.take(120), source.text.take(2000), source.text.length > 2000 || source.title.length > 120) },
            prompt = question.take(4000), answer = "", answeredQuestion = "", error = null, example = false, answerModel = null) }
    }
    fun removeContext(index: Int) { if (!mutable.value.sending) change { it.copy(context = it.context.filterIndexed { i, _ -> i != index }) } }
    fun showExample() {
        cancel()
        change { it.copy(answeredQuestion = "固定示例题：前序、中序、后序遍历有什么区别？", example = true, answerModel = null, error = null,
            answer = "这是内置固定演示，不是实际 AI 生成，也不根据你的问题生成。\n\n用根节点 A、左孩子 B、右孩子 C 的二叉树演示：\n前序先根：A → B → C；中序根在中间：B → A → C；后序最后根：B → C → A。\n\n练习：为 B 添加一个左孩子 D，自己写出三种顺序，再核对定义。", usage = TrialUsage()) }
    }
    fun loadConfig(scope: CoroutineScope) {
        if (closed || mutable.value.configuring) return
        change { it.copy(configuring = true, error = null) }
        configJob = scope.launch {
            try { val config = api.config(); change { it.copy(config = config) } }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { change { it.copy(config = TrialConfig(TrialAiAvailability(false, reason = "无法读取试用模型配置，请检查网络后刷新。")), error = e.message) } }
            finally { change { it.copy(configuring = false) } }
        }
    }
    fun send(scope: CoroutineScope) {
        val before = mutable.value
        if (closed || before.sending) return
        if (before.config?.ai?.available != true) { change { it.copy(error = before.config?.ai?.reason?.ifBlank { "当前没有可用的真实模型" } ?: "请先读取试用配置") }; return }
        val question = before.prompt.trim()
        if (question.isEmpty()) return
        val expectedGeneration = ++generation
        val request = TrialQuestion(question, before.context.map { TrialContext(it.title, it.text) })
        change { it.copy(sending = true, error = null) }
        sendJob = scope.launch {
            try {
                val response = api.ask(request)
                if (!closed && generation == expectedGeneration) change { it.copy(answer = response.answer, answerModel = response.model, example = false,
                    answeredQuestion = question, usage = response.usage, prompt = if (it.prompt.trim() == question) "" else it.prompt) }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { if (generation == expectedGeneration) change { it.copy(error = e.message ?: "发送失败，问题已保留") } }
            finally { if (generation == expectedGeneration) change { it.copy(sending = false) } }
        }
    }
    fun cancel() {
        generation++
        sendJob?.cancel()
        change { it.copy(sending = false) }
    }
    fun close() {
        closed = true
        generation++
        sendJob?.cancel()
        configJob?.cancel()
        mutable.value = TrialState()
    }

    companion object {
        private fun samples(): TrialState = TrialState(
            courses = listOf(
                TrialCourse("sample-algorithm", "数据结构 · 内置示例", listOf(
                    TrialConcept("二叉树遍历", "前序遍历依次访问根、左子树、右子树；中序遍历访问左子树、根、右子树；后序遍历访问左子树、右子树、根。例：A 为根，B、C 分别为左右孩子。"),
                    TrialConcept("复杂度", "遍历包含 n 个节点的二叉树时，每个节点被访问一次，时间复杂度为 O(n)。递归额外空间与树高有关；树退化成链时可能达到 O(n)。"))),
                TrialCourse("sample-network", "网络基础 · 内置示例", listOf(
                    TrialConcept("IP 与路由", "IP 地址用于网络寻址，路由器根据目的地址及路由表选择转发方向。具体设备配置应查阅设备和课程的正式资料。"),
                    TrialConcept("学习验证", "先画出两台主机与一台路由器的拓扑，再解释每个端口的网络归属；不要把示意图当成已完成的华为设备实测。")))),
            tasks = listOf(TrialTask("sample-task", "画一棵二叉树并写遍历顺序", "创建 A 为根、B 和 C 为孩子的树，分别写出三种遍历，再用定义核对。此为可修改的内置示例。", 15)),
            notes = listOf(TrialNote("sample-note", "我的第一份试用笔记", "内置示例：前序、中序、后序的差异在于访问根节点的时机。你可以修改或删除这篇笔记；它只保留在本次试用的内存里。"))
        )
    }
}
