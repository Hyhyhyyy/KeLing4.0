package com.keling.app.expedition

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.keling.app.network.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.Instant
import java.util.UUID

data class ExpeditionUiState(val saved: ExpeditionJournalState = ExpeditionJournalState(), val courses: List<CourseData> = emptyList(),
    val loading: Boolean = true, val busy: Boolean = false, val error: String? = null, val notice: String? = null,
    val conflict: String? = null, val offline: Boolean = false) {
    val run: RunView? get() = saved.currentRunId?.let { saved.runs[it]?.run }
    val chapter: Chapter? get() = saved.catalog?.chapter
    val progress: ProgressView? get() = saved.selectedCourseId?.let { saved.chapters[it]?.progress }
    val exercise: Exercise? get() = run?.let { active -> chapter?.exercises?.firstOrNull { it.id == active.exerciseIds.getOrNull(active.exerciseIndex) } }
    val draft: ExpeditionDraft? get() = run?.let { saved.drafts[it.id] }
}

class ExpeditionViewModel(context: Context, private val token: String, private val accountId: String) : ViewModel() {
    val sessionToken: String get() = token
    private val baseUrl = ApiConfig.actualBaseUrl
    private val guest = GuestWorkspaces.find(token)
    private val mutable = MutableStateFlow(ExpeditionUiState()); val state = mutable.asStateFlow()
    private val actions = Mutex(); private var closed = false
    private lateinit var journal: ExpeditionJournal; private lateinit var api: ExpeditionTransport
    private val writers = mutableMapOf<String, Writer>()
    private val liveDrafts = mutableMapOf<String, ExpeditionDraft>()
    private fun id() = UUID.randomUUID().toString()
    private fun checkOpen() { check(!closed) { "本次远征会话已结束" }; guest?.ensureOpen() }
    init { val app = context.applicationContext; viewModelScope.launch {
        try {
            val chapter = withContext(Dispatchers.IO) { app.assets.open("expedition/chapter.json").bufferedReader().use { expeditionJson.decodeFromString<Chapter>(it.readText()) } }
            val bundled = CatalogResponse(chapter, ExpeditionRules.decorations)
            journal = guest?.expeditionJournal ?: ExpeditionJournal.open(app.noBackupFilesDir, baseUrl, accountId)
            api = guest?.expedition(bundled) ?: ExpeditionApi(token, baseUrl)
            checkOpen(); persist { if (it.catalog == null) it.copy(catalog = bundled) else it }
            mutable.update { it.copy(loading = false) }
            refresh()
        } catch (e: CancellationException) { throw e }
        catch (e: Exception) { if (!closed) mutable.update { it.copy(loading = false, error = e.message ?: "无法打开远征存档，原文件已保留") } }
    } }
    private suspend fun persist(block: (ExpeditionJournalState) -> ExpeditionJournalState) {
        checkOpen(); val saved = journal.update(block); checkOpen(); mutable.update { it.copy(saved = saved.copy(drafts = saved.drafts + liveDrafts), courses = saved.courses) }
    }
    private fun act(block: suspend () -> Unit) {
        if (closed || !::api.isInitialized) return
        viewModelScope.launch { actions.withLock {
            checkOpen(); mutable.update { it.copy(busy = true, error = null, notice = null) }
            try { block(); checkOpen(); mutable.update { it.copy(offline = false) } }
            catch (e: CancellationException) { throw e }
            catch (e: ExpeditionException) { if (!closed) mutable.update { it.copy(error = e.message, conflict = if (e.status == 409) e.detail.code else it.conflict, offline = false) } }
            catch (e: Exception) { if (!closed) mutable.update { it.copy(error = "${e.message ?: "连接失败"}；草稿与待同步操作已保留", offline = true) } }
            finally { if (!closed) mutable.update { it.copy(busy = false) } }
        } }
    }
    fun refresh() = act {
        val catalog = api.catalog(); checkOpen(); persist { it.copy(catalog = catalog) }
        val courses = WorkspaceApi().courses(token).courses.orEmpty().filter { !it.isArchived }; checkOpen()
        persist { it.copy(courses = courses) }
        val selected = journal.state.selectedCourseId?.takeIf { key -> courses.any { it.id == key } } ?: courses.firstOrNull()?.id
        persist { it.copy(selectedCourseId = selected) }
        if (selected != null) loadChapter(selected)
        journal.state.currentRunId?.let { loadRun(it) }
        val rewards = api.rewards(); persist { it.copy(account = rewards.account, grants = rewards.grants) }
        val reports = api.selfReports(); persist { it.copy(selfReports = reports.records, selfReportsCursor = reports.nextCursor) }
    }
    private suspend fun loadChapter(id: String) {
        val response = api.chapter(id); persist { it.copy(chapters = it.chapters + (id to response), account = response.account,
            runs = it.runs + response.runs.associate { run -> run.id to RunResponse(run, response.progress, response.account, response.serverTime) }) }
        val evidence = api.evidence(id); persist { it.copy(evidence = it.evidence + (id to evidence.evidence)) }
    }
    private suspend fun loadRun(id: String) {
        val response = api.run(id); persist { old -> old.copy(runs = old.runs + (id to response), account = response.account,
            chapters = old.chapters.mapValues { (_, value) -> if (value.progress.courseId == response.run.courseId) value.copy(progress = response.progress, account = response.account) else value }) }
        ensureDraft(response.run)
    }
    private suspend fun ensureDraft(run: RunView) {
        val exerciseId = run.exerciseIds[run.exerciseIndex]
        if (journal.state.drafts[run.id]?.exerciseId == exerciseId) return
        persist { it.copy(drafts = it.drafts + (run.id to ExpeditionDraft(run.id, exerciseId, run.revision))) }
    }
    fun selectCourse(id: String) = act { persist { it.copy(selectedCourseId = id, currentRunId = null) }; loadChapter(id) }
    fun createCourse(name: String) = act {
        require(name.trim().length in 1..100) { "请填写课程名称" }
        val created = AgentApi().createCourse(token, name.trim(), 0).course ?: error("课程返回为空")
        val courses = WorkspaceApi().courses(token).courses.orEmpty(); persist { it.copy(courses = courses) }; mutable.update { it.copy(notice = "课程已创建") }
        persist { it.copy(selectedCourseId = created.id, currentRunId = null) }; loadChapter(created.id)
    }
    fun openRun(id: String) = act { persist { it.copy(currentRunId = id) }; loadRun(id) }
    fun leaveRun() = act { persist { it.copy(currentRunId = null) } }
    fun start(kind: String, objective: String?, mode: String = "TRAINING") = act {
        require(journal.state.pending.isEmpty()) { "请先处理待同步操作" }
        val course = requireNotNull(journal.state.selectedCourseId) { "请先选择课程" }
        val opId = id(); val input = StartRunInput(opId, course, kind, objective, mode, journal.state.deviceId)
        persist { it.copy(pending = it.pending + PendingOperation(opId, "START", start = input)) }; flush()
    }
    fun changeDraft(transform: (ExpeditionDraft) -> ExpeditionDraft) {
        val before = mutable.value.draft ?: return
        val next = transform(before).copy(savedAt = Instant.now().toString())
        liveDrafts[before.runId] = next
        mutable.update { it.copy(saved = it.saved.copy(drafts = it.saved.drafts + (before.runId to next))) }
        viewModelScope.launch {
            try {
                checkOpen(); val stored = journal.update { it.copy(drafts = it.drafts + (before.runId to next)) }; checkOpen()
                if (liveDrafts[before.runId] === next) liveDrafts.remove(before.runId)
                mutable.update { it.copy(saved = stored.copy(drafts = stored.drafts + liveDrafts)) }
            }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { if (!closed) mutable.update { it.copy(error = "草稿尚未写入本机：${e.message}") } }
        }
    }
    fun command(action: ExpeditionAction) = act {
        require(journal.state.pending.isEmpty()) { "已有操作待同步，请先重试或处理冲突" }
        val run = requireNotNull(mutable.value.run); val opId = id()
        val draft = mutable.value.draft
        if (action.type == "SUBMIT" && draft != null && draft.baseRevision != run.revision) {
            ExpeditionRules.check(false, "DRAFT_REVISION_CHANGED", "原草稿来自较早版本，请先保留副本并采用当前进度")
        }
        persist { it.copy(pending = it.pending + PendingOperation(opId, "COMMAND", run.id, run.revision, writers[run.id]?.epoch ?: run.leaseEpoch, action)) }
        flush()
    }
    fun prepareAiHint(onReady: () -> Unit) = act {
        val run = requireNotNull(mutable.value.run)
        if (run.status in listOf("ACTIVE", "AWAITING_FEEDBACK") && run.nextStep == null) {
            require(journal.state.pending.isEmpty()) { "先处理待同步操作，之后才可记录求助" }
            val op = id()
            persist { it.copy(pending = it.pending + PendingOperation(op, "COMMAND", run.id, run.revision, writers[run.id]?.epoch ?: run.leaseEpoch, ExpeditionAction("HINT"))) }
            flush()
        }
        checkOpen(); onReady()
    }
    fun buyOrEquip(id: String) = act {
        require(journal.state.pending.isEmpty()) { "请先处理待同步操作" }
        val account = requireNotNull(journal.state.account); val op = id()
        val input = BaseCommand(op, account.revision, id, if (id in account.world.ownedDecorationIds) "EQUIP" else "BUY")
        persist { it.copy(pending = it.pending + PendingOperation(op, "BASE", base = input)) }; flush()
    }
    fun preferences(change: (ExpeditionPreferences) -> ExpeditionPreferences) = act { persist { it.copy(preferences = change(it.preferences)) } }
    fun memory(memoryId: String, text: String?) = act {
        require(journal.state.pending.isEmpty()) { "请先处理待同步操作" }
        val progress = requireNotNull(mutable.value.progress)
        val input = MemoryCommand(id(), progress.revision, memoryId, if (text == null) "DELETE" else "UPDATE", text)
        persist { it.copy(pending = it.pending + PendingOperation(input.opId, "MEMORY", progressId = progress.id, memory = input)) }; flush()
    }
    fun selfReport(title: String, notes: String, minutes: Int, associateCourse: Boolean = true) = act {
        require(journal.state.pending.isEmpty()) { "请先处理待同步操作" }
        val input = SelfReportInput(id(), if (associateCourse) journal.state.selectedCourseId else null, title, notes, minutes)
        ExpeditionRules.selfReportCanonical(input, Instant.now().toString())
        persist { it.copy(pending = it.pending + PendingOperation(input.opId, "SELF_REPORT", selfReport = input)) }; flush()
    }
    fun moreSelfReports() = act {
        val cursor = journal.state.selfReportsCursor ?: return@act
        val page = api.selfReports(cursor); persist { it.copy(selfReports = (it.selfReports + page.records).distinctBy { record -> record.id }, selfReportsCursor = page.nextCursor) }
    }
    fun retryPending() = act { flush() }
    private suspend fun obtainWriter(runId: String, takeover: Boolean = false) {
        val current = api.run(runId); checkOpen()
        val lease = api.lease(runId, LeaseInput(id(), current.run.revision, journal.state.deviceId, if (takeover) "takeover" else "acquire", writers[runId]))
        checkOpen(); lease.writer?.let { writers[runId] = it }
        persist { it.copy(runs = it.runs + (runId to current.copy(run = lease.run))) }
    }
    fun takeOver() = act {
        val run = requireNotNull(mutable.value.run)
        obtainWriter(run.id, true)
        mutable.update { it.copy(notice = "已接管；旧草稿和待同步操作仍保留，请核对后继续") }
    }
    fun acquire() = act { val run = requireNotNull(mutable.value.run); obtainWriter(run.id); mutable.update { it.copy(notice = "已取得本设备操作资格") } }
    fun keepAlive() {
        val run = mutable.value.run ?: return
        if (mutable.value.busy || mutable.value.saved.pending.isNotEmpty() || run.status in listOf("SETTLED", "CANCELLED")) return
        val writer = writers[run.id] ?: return
        act {
            val lease = api.lease(run.id, LeaseInput(id(), run.revision, journal.state.deviceId, "renew", writer))
            lease.writer?.let { writers[run.id] = it }
            persist { it.copy(runs = it.runs + (run.id to it.runs.getValue(run.id).copy(run = lease.run))) }
        }
    }
    /** User explicitly accepts remote state; preserve their branch before changing the active editor. */
    fun preserveAndUseRemote() = act {
        val run = requireNotNull(mutable.value.run)
        val remote = api.run(run.id)
        val old = journal.state.drafts[run.id]
        persist { it.copy(preservedDrafts = (it.preservedDrafts + listOfNotNull(old)).takeLast(50),
            pending = it.pending.filterNot { op -> op.runId == run.id }, drafts = it.drafts - run.id,
            runs = it.runs + (run.id to remote), account = remote.account) }
        writers.remove(run.id); ensureDraft(remote.run)
        mutable.update { it.copy(conflict = null, notice = "原草稿已保存为练习副本；已采用远端进度") }
    }
    fun preservePendingAndRefresh() = act {
        persist { it.copy(preservedDrafts = (it.preservedDrafts + it.drafts.values).takeLast(50), preservedOperations = (it.preservedOperations + it.pending).takeLast(50), pending = emptyList()) }
        mutable.update { it.copy(conflict = null, notice = "草稿副本已保留；未确认的开始或购买请求请先刷新核对") }
        journal.state.selectedCourseId?.let { loadChapter(it) }
        val rewards = api.rewards(); persist { it.copy(account = rewards.account, grants = rewards.grants) }
    }
    private suspend fun flush() {
        while (journal.state.pending.isNotEmpty()) {
            checkOpen(); val op = journal.state.pending.first()
            when (op.kind) {
                "START" -> {
                    val result = api.start(requireNotNull(op.start)); checkOpen(); writers[result.run.id] = result.writer
                    val latest = api.run(result.run.id); checkOpen()
                    persist { it.copy(currentRunId = result.run.id, account = latest.account,
                        runs = it.runs + (result.run.id to latest),
                        chapters = it.chapters.mapValues { (_, value) -> if (value.progress.courseId == result.run.courseId) value.copy(progress = latest.progress) else value },
                        pending = it.pending.filterNot { saved -> saved.opId == op.opId }) }
                    ensureDraft(latest.run)
                }
                "COMMAND" -> {
                    val runId = requireNotNull(op.runId)
                    val receipt = replayPreservedCommand(api, op, journal.state.deviceId, writers[runId]) { writers[runId] = it }; checkOpen()
                    // An idempotent receipt is immutable history; refresh before changing the visible projection.
                    val projection = if (receipt.replayed) api.run(runId) else RunResponse(receipt.run, receipt.progress, receipt.account, receipt.serverTime)
                    val rewards = if (receipt.replayed) api.rewards() else null; checkOpen()
                    persist { saved -> saved.copy(account = rewards?.account ?: projection.account, runs = saved.runs + (runId to projection),
                        chapters = saved.chapters.mapValues { (_, value) -> if (value.progress.courseId == projection.run.courseId) value.copy(progress = projection.progress, account = projection.account) else value },
                        evidence = saved.evidence + (projection.run.courseId to (saved.evidence[projection.run.courseId].orEmpty() + receipt.evidenceDelta).distinctBy { it.id }),
                        pending = saved.pending.filterNot { it.opId == op.opId }, receipts = (saved.receipts.filterNot { it.opId == receipt.opId } + receipt).takeLast(150),
                        grants = rewards?.grants ?: (saved.grants + receipt.rewardGrants).distinctBy { it.id },
                        preservedDrafts = if (receipt.replayed && projection.run.revision != receipt.run.revision) (saved.preservedDrafts + listOfNotNull(saved.drafts[runId])).takeLast(50) else saved.preservedDrafts,
                        drafts = saved.drafts.mapValues { (key, draft) -> if (key == runId && projection.run.revision == receipt.run.revision) draft.copy(baseRevision = receipt.run.revision) else draft }) }
                    ensureDraft(projection.run)
                    mutable.update { it.copy(conflict = null, notice = if (receipt.rewardGrants.isNotEmpty()) "学习记录已结算：${receipt.rewardGrants.sumOf { g -> g.exp }} XP · ${receipt.rewardGrants.sumOf { g -> g.crystals }} 结晶" else "操作已保存") }
                }
                "MEMORY" -> {
                    val result = api.memory(requireNotNull(op.progressId), requireNotNull(op.memory)); checkOpen()
                    val progress = if (result.replayed) api.chapter(result.progress.courseId).progress else result.progress
                    persist { it.copy(chapters = it.chapters.mapValues { (_, value) -> if (value.progress.id == progress.id) value.copy(progress = progress) else value },
                        pending = it.pending.filterNot { saved -> saved.opId == op.opId }) }
                    mutable.update { it.copy(notice = "伙伴档案已更新，知识证据未改变") }
                }
                "SELF_REPORT" -> {
                    val result = api.selfReport(requireNotNull(op.selfReport)); checkOpen()
                    val latest = if (result.replayed) api.rewards() else null
                    persist { it.copy(account = latest?.account ?: result.account, selfReports = (it.selfReports + result.record).distinctBy { record -> record.id },
                        grants = latest?.grants ?: (it.grants + result.rewardGrants).distinctBy { grant -> grant.id }, pending = it.pending.filterNot { saved -> saved.opId == op.opId }) }
                    mutable.update { it.copy(notice = if (result.alreadyRecorded || result.replayed) "这份线下自述已记录，未重复累计时长" else "线下自述已记录：${result.rewardGrants.sumOf { g -> g.exp }} XP，无结晶，不改变知识证据") }
                }
                "BASE" -> {
                    val result = api.base(requireNotNull(op.base)); val latest = if (result.replayed) api.rewards().account else result.account
                    persist { it.copy(account = latest, grants = (it.grants + listOfNotNull(result.grant)).distinctBy { grant -> grant.id }, pending = it.pending.filterNot { saved -> saved.opId == op.opId }) }
                    mutable.update { it.copy(notice = "基地装饰已更新") }
                }
                else -> error("不支持的本机操作版本，原队列已保留")
            }
        }
    }
    fun shutdown() { closed = true; writers.clear(); liveDrafts.clear(); viewModelScope.cancel(); if (::journal.isInitialized && guest == null) journal.close() }
    override fun onCleared() { shutdown() }
}
