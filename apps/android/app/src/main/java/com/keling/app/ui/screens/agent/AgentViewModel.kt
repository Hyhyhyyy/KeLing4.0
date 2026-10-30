package com.keling.app.ui.screens.agent

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.keling.app.network.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AgentUiState(
    val busy: Boolean = false, val polling: Boolean = true, val error: String? = null, val notice: String? = null,
    val status: AgentStatus? = null, val courses: List<CloudCourse> = emptyList(),
    val courseId: String = "", val sources: List<CloudNode> = emptyList(),
    val history: List<AgentRun> = emptyList(), val selected: AgentRun? = null,
    val tasks: List<TaskData> = emptyList()
)

class AgentViewModel(private val token: String, private val api: AgentApi = AgentApi()) : ViewModel() {
    private val mutable = MutableStateFlow(AgentUiState())
    val state = mutable.asStateFlow()
    init { refresh() }

    private fun action(block: suspend () -> Unit) {
        if (mutable.value.busy) return
        mutable.update { it.copy(busy = true, error = null, notice = null) }
        viewModelScope.launch {
            try { block() }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { mutable.update { it.copy(error = e.message ?: "连接失败，请重试") } }
            finally { mutable.update { it.copy(busy = false) } }
        }
    }
    private suspend fun load() {
        val status = api.status(token)
        val courses = api.courses(token).courses
        val history = api.history(token).runs
        val tasks = api.tasks(token).tasks.orEmpty()
        mutable.update { it.copy(status = status, courses = courses, history = history, tasks = tasks) }
    }
    fun refresh() = action {
        load()
        val id = mutable.value.courseId
        if (id.isNotBlank()) {
            val sources = api.sources(token, id).nodes
            mutable.update { it.copy(sources = sources) }
        }
        mutable.value.selected?.id?.let { id ->
            val run = api.get(token, id)
            mutable.update { it.copy(selected = run) }
        }
        mutable.update { it.copy(polling = true) }
    }
    fun selectCourse(id: String) = action {
        val sources = api.sources(token, id).nodes
        mutable.update { it.copy(courseId = id, sources = sources) }
    }
    fun createCourse(name: String) = action {
        require(name.trim().isNotEmpty()) { "请输入课程名称" }
        val course = requireNotNull(api.createCourse(token, name.trim()).course)
        mutable.update { it.copy(courseId = course.id, sources = emptyList(), notice = "课程已创建，请添加学习资料") }
        load()
    }
    fun addSource(name: String, text: String) = action {
        val id = mutable.value.courseId
        require(id.isNotBlank() && name.trim().isNotBlank() && text.trim().isNotBlank()) { "请选择课程并填写资料名称和内容" }
        api.addSource(token, id, name.trim(), text.trim())
        val sources = api.sources(token, id).nodes
        mutable.update { it.copy(sources = sources, notice = "资料已保存，可开始规划") }
        load()
    }
    fun start(request: AgentRequest) = action {
        require(request.courseId.isNotBlank() && request.goal.trim().length >= 2 && request.dailyMinutes in 10..480) { "请选择课程，填写目标和 10 至 480 分钟的每日时长" }
        val run = api.start(token, request.copy(goal = request.goal.trim()))
        mutable.update { it.copy(selected = run, polling = true) }
        load()
    }
    fun open(id: String) = action {
        val run = api.get(token, id)
        mutable.update { it.copy(selected = run, polling = true) }
    }
    suspend fun poll() {
        val before = mutable.value
        val id = before.selected?.takeIf { it.status == "RUNNING" }?.id ?: return
        if (!before.polling || before.busy) return
        try {
            val run = api.get(token, id)
            mutable.update { if (it.selected?.id == id) it.copy(selected = run) else it }
            if (run.status != "RUNNING") load()
        } catch (e: CancellationException) { throw e }
        catch (e: Exception) { mutable.update { it.copy(polling = false, error = "${e.message ?: "网络中断"}。运行已保留，点击刷新继续查看。") } }
    }
    fun confirm() = action {
        val run = mutable.value.selected ?: return@action
        api.confirm(token, run.id)
        val updated = api.get(token, run.id)
        mutable.update { it.copy(selected = updated, notice = if (token.startsWith("guest-memory:")) "计划已加入本次任务，可在任务页执行" else "计划已加入云端任务，可在下方或网页完成") }
        load()
    }
    fun complete(id: String, minutes: Int) = action {
        require(minutes in 0..1440) { "实际时长须在 0 至 1440 分钟之间" }
        api.complete(token, id, minutes)
        load()
        mutable.update { it.copy(notice = "完成记录已保存，复盘时会参考这次学习") }
    }
}
