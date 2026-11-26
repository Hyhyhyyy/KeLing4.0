package com.keling.app.ui.screens.agent

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.keling.app.network.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class WorkspaceState(val busy: Boolean = false, val error: String? = null, val notice: String? = null,
    val profile: WorkspaceProfile? = null, val notes: List<NoteData> = emptyList(), val tasks: List<TaskData> = emptyList(),
    val courses: List<CourseData> = emptyList(), val checkin: CheckInResponse? = null, val savedRevision: Int = 0)
class WorkspaceViewModel(private val token: String, private val api: WorkspaceApi = WorkspaceApi(), private val agent: AgentApi = AgentApi()) : ViewModel() {
    private val mutable = MutableStateFlow(WorkspaceState()); val state = mutable.asStateFlow()
    init { refresh() }
    private fun action(block: suspend () -> Unit) {
        if (mutable.value.busy) return
        mutable.update { it.copy(busy = true, error = null, notice = null) }
        viewModelScope.launch {
            try { block() } catch (e: CancellationException) { throw e }
            catch (e: Exception) { mutable.update { it.copy(error = e.message ?: "连接失败，请重试") } }
            finally { mutable.update { it.copy(busy = false) } }
        }
    }
    private suspend fun load() {
        val profile = api.profile(token).user; val notes = api.notes(token).notes.orEmpty()
        val courses = api.courses(token).courses.orEmpty(); val tasks = agent.tasks(token).tasks.orEmpty(); val checkin = api.checkinStatus(token)
        mutable.update { it.copy(profile = profile, notes = notes, courses = courses, tasks = tasks, checkin = checkin) }
    }
    fun refresh() = action { load() }
    fun checkin() = action { api.checkin(token); load(); mutable.update { it.copy(notice = if (token.startsWith("guest-memory:")) "已签到" else "已签到") } }
    fun avatar(index: Int) = action { require(index in 0..8); api.avatar(token, index); load() }
    fun saveNote(id: String?, title: String, content: String, expected: String?) = action {
        require(title.isNotBlank() && content.isNotBlank()) { "请填写标题和内容" }
        api.saveNote(token, id, WorkspaceNoteInput(title.trim(), content, expected))
        mutable.update { it.copy(savedRevision = it.savedRevision + 1) }; load()
    }
    fun deleteNote(id: String) = action { api.deleteNote(token, id); load() }
    fun complete(id: String, minutes: Int, onSaved: () -> Unit = {}) = action { agent.complete(token, id, minutes); onSaved(); load(); mutable.update { it.copy(notice = "完成记录已保存") } }
    fun createTask(input: WorkspaceTaskInput, onSaved: () -> Unit) = action { api.createTask(token, input); onSaved(); load(); mutable.update { it.copy(notice = "任务已创建") } }
    fun deleteTask(id: String, onSaved: () -> Unit) = action { api.deleteTask(token, id); onSaved(); load() }
    fun createCourse(name: String, planetStyleIndex: Int = 0, onSaved: () -> Unit = {}) = action {
        require(name.isNotBlank()); agent.createCourse(token, name.trim(), planetStyleIndex); onSaved(); load()
    }
    fun updatePlanet(courseId: String, planetStyleIndex: Int, onSaved: () -> Unit) = action {
        api.updatePlanet(token, courseId, planetStyleIndex); onSaved(); load()
        mutable.update { it.copy(notice = if (token.startsWith("guest-memory:")) "形象已保存" else "形象已保存") }
    }
}
