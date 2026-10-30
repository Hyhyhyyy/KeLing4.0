package com.keling.app.expedition

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.encodeToString
import java.security.MessageDigest
import java.time.Instant
import java.util.UUID

/** Same protocol and rules, isolated memory only. No Context, file, database or network client. */
class GuestExpedition(private val content: CatalogResponse, private val ensureGuest: () -> Unit,
    private val ownsCourse: (String) -> Boolean, initial: LegacySnapshot,
    private val onAccount: (AccountView) -> Unit = {}, private val onSelfReport: (SelfReportRecord) -> Unit = {}, private val clock: () -> String = { Instant.now().toString() }) : ExpeditionTransport {
    private val mutex = Mutex(); private var closed = false
    private var account = AccountView(0, initial.level, initial.exp, initial.crystals, initial, WorldState(), DailyQuota(ExpeditionRules.day(clock())))
    private val progresses = mutableMapOf<String, ProgressView>(); private val runs = mutableMapOf<String, RunView>()
    private val writers = mutableMapOf<String, Writer>(); private val grants = mutableListOf<RewardGrant>()
    private data class Saved(val request: String, val value: Any)
    private val operations = mutableMapOf<String, Saved>()
    private val selfReports = mutableMapOf<String, SelfReportRecord>()
    private fun ensure() { ensureGuest(); check(!closed) { "本次游客远征已结束" } }
    private fun checkedCourse(id: String) { ensure(); ExpeditionRules.check(ownsCourse(id), "COURSE_NOT_FOUND", "课程不存在或已归档", 404) }
    private fun progress(id: String): ProgressView = progresses.getOrPut(id) { ProgressView("guest-progress:$id", id, content.chapter.id, 0, content.chapter.version, ExpeditionRules.progress(content.chapter)) }
    private fun timed(run: RunView) = run.copy(timing = ExpeditionRules.timing(run, clock()))
    private fun getRun(id: String): RunView = runs[id] ?: throw ExpeditionException(404, ExpeditionErrorBody("远征不存在", "RUN_NOT_FOUND"))
    private fun previous(opId: String, request: String): Any? {
        val old = operations[opId] ?: return null
        ExpeditionRules.check(old.request == request, "OPERATION_CONFLICT", "操作编号已用于其他内容，请保留草稿后重试")
        return old.value
    }
    private fun sources(courseId: String): List<SourceRef> {
        var offset = 0
        val contentHash = MessageDigest.getInstance("SHA-256").digest(content.chapter.materialParagraphs.joinToString("\n\n").toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
        return content.chapter.materialParagraphs.mapIndexed { index, paragraph ->
            val start = offset; offset += paragraph.length + 2
            SourceRef("guest-seed:$courseId:${content.chapter.version}", "guest-seed-span:$courseId:$index", contentHash, start, start + paragraph.length, paragraphIndex = index)
        }
    }
    override suspend fun catalog(): CatalogResponse = mutex.withLock { ensure(); content }
    override suspend fun chapter(courseId: String): ChapterResponse = mutex.withLock {
        checkedCourse(courseId); ChapterResponse(content.chapter, progress(courseId), account, runs.values.filter { it.courseId == courseId }.reversed().map(::timed), clock())
    }
    override suspend fun start(input: StartRunInput): StartRunResponse = mutex.withLock {
        checkedCourse(input.courseId); val signature = "start:" + expeditionJson.encodeToString(input)
        (previous(input.opId, signature) as? StartRunResponse)?.let { saved ->
            val current = getRun(saved.run.id)
            ExpeditionRules.check(current.writerDeviceId == input.deviceId && current.leaseExpiresAt?.let { Instant.parse(it) > Instant.parse(clock()) } == true, "WRITER_CHANGED", "远征已存在，请查看当前进度并主动接续")
            val writer = Writer(input.deviceId, current.leaseEpoch, UUID.randomUUID().toString())
            val renewed = current.copy(leaseExpiresAt = Instant.parse(clock()).plusSeconds(120).toString()); runs[current.id] = renewed; writers[current.id] = writer
            return@withLock saved.copy(run = timed(renewed), writer = writer)
        }
        val now = clock(); val old = progress(input.courseId)
        val globalSeen = progresses.values.flatMap { it.state.seenExerciseIds }.distinct()
        val result = ExpeditionRules.create(content.chapter, old.state.copy(seenExerciseIds = globalSeen), input, UUID.randomUUID().toString(), now, sources(input.courseId))
        val writer = Writer(input.deviceId, 1, UUID.randomUUID().toString())
        val run = result.run.copy(writerDeviceId = input.deviceId, leaseEpoch = 1, leaseExpiresAt = Instant.parse(now).plusSeconds(120).toString())
        val updated = old.copy(revision = old.revision + 1, state = result.progress)
        progresses[input.courseId] = updated; runs[run.id] = run; writers[run.id] = writer
        StartRunResponse(timed(run), writer, updated, account).also { operations[input.opId] = Saved(signature, it) }
    }
    override suspend fun run(id: String): RunResponse = mutex.withLock { ensure(); val run = getRun(id); RunResponse(timed(run), progress(run.courseId), account, clock()) }
    override suspend fun command(id: String, input: Command): Receipt = mutex.withLock {
        ensure(); val signature = "command:$id:" + expeditionJson.encodeToString(input.copy(writer = input.writer.copy(token = "")))
        (previous(input.opId, signature) as? Receipt)?.let { return@withLock it.copy(replayed = true) }
        val run = getRun(id); checkedCourse(run.courseId); val writer = writers[id]; val now = clock()
        ExpeditionRules.check(run.revision == input.expectedRevision, "VERSION_CONFLICT", "远征已有新进度，原作答已保留")
        ExpeditionRules.check(writer == input.writer && run.leaseExpiresAt != null && Instant.parse(run.leaseExpiresAt) > Instant.parse(now), "WRITER_CHANGED", "操作资格已失效，请明确接续后重试")
        val old = progress(run.courseId); val reduced = ExpeditionRules.reduce(content.chapter, run, old.state, input.action, now, input.opId)
        val settlement = ExpeditionRules.settle(account, reduced.rewards, grants.map { it.stableKey }.toSet(), now)
        account = settlement.first; grants.addAll(settlement.second); onAccount(account)
        val updated = old.copy(revision = old.revision + 1, state = reduced.progress)
        runs[id] = reduced.run; progresses[run.courseId] = updated
        Receipt(input.opId, reduced.run.revision, now, timed(reduced.run), updated, account, reduced.run.feedback, reduced.evidence, settlement.second).also { operations[input.opId] = Saved(signature, it) }
    }
    override suspend fun lease(id: String, input: LeaseInput): LeaseResponse = mutex.withLock {
        ensure(); val run = getRun(id); val now = clock(); val alive = run.leaseExpiresAt?.let { Instant.parse(it) > Instant.parse(now) } == true
        ExpeditionRules.check(input.intent in listOf("acquire", "renew", "release", "takeover"), "VALIDATION", "无效的接续操作", 400)
        val signature = "lease:$id:" + expeditionJson.encodeToString(input.copy(writer = input.writer?.copy(token = "")))
        fun issue(epoch: Int, revision: Int): LeaseResponse {
            val writer = Writer(input.deviceId, epoch, UUID.randomUUID().toString())
            val updated = run.copy(writerDeviceId = input.deviceId, leaseEpoch = epoch, revision = revision, leaseExpiresAt = Instant.parse(now).plusSeconds(120).toString())
            runs[id] = updated; writers[id] = writer
            return LeaseResponse(timed(updated), writer, now)
        }
        (previous(input.opId, signature) as? LeaseResponse)?.let { saved ->
            if (input.intent == "release") return@withLock saved
            ExpeditionRules.check(run.writerDeviceId == input.deviceId && run.leaseEpoch == saved.run.leaseEpoch && alive, "WRITER_CHANGED", "旧接续操作已被后续操作替代")
            return@withLock issue(run.leaseEpoch, run.revision)
        }
        ExpeditionRules.check(run.revision == input.expectedRevision, "VERSION_CONFLICT", "远征版本变化，请先读取新进度")
        ExpeditionRules.check(run.status !in listOf("SETTLED", "CANCELLED", "CONTENT_STALE"), "RUN_CLOSED", "本次远征已结束或内容失效")
        if (input.intent == "release" || input.intent == "renew") ExpeditionRules.check(writers[id] == input.writer && alive, "WRITER_CHANGED", "操作资格已失效")
        if (input.intent == "release") {
            val updated = run.copy(writerDeviceId = null, leaseExpiresAt = null, leaseEpoch = run.leaseEpoch + 1, revision = run.revision + 1); runs[id] = updated; writers.remove(id)
            return@withLock LeaseResponse(timed(updated), serverTime = now).also { operations[input.opId] = Saved(signature, it) }
        }
        ExpeditionRules.check(!alive || run.writerDeviceId == input.deviceId || input.intent == "takeover", "LEASE_HELD", "另一设备正在操作，可查看或明确接管")
        val same = alive && run.writerDeviceId == input.deviceId && input.intent != "takeover"
        issue(if (same) run.leaseEpoch else run.leaseEpoch + 1, if (same) run.revision else run.revision + 1).also { operations[input.opId] = Saved(signature, it) }
    }
    override suspend fun rewards(): RewardsResponse = mutex.withLock { ensure(); RewardsResponse(grants.toList(), account) }
    override suspend fun base(input: BaseCommand): BaseResponse = mutex.withLock {
        ensure(); val signature = "base:" + expeditionJson.encodeToString(input)
        (previous(input.opId, signature) as? BaseResponse)?.let { return@withLock it.copy(replayed = true) }
        ExpeditionRules.check(input.expectedRevision == account.revision, "REVISION_CONFLICT", "基地已有新状态，请刷新后选择")
        val result = ExpeditionRules.decorate(account, input.action, input.decorationId)
        account = result.first; onAccount(account)
        val grant = if (result.second > 0) RewardGrant("grant:purchase:${input.decorationId}", "purchase:${input.decorationId}", "PURCHASE", 0, -result.second, "确定性基地装饰购买", input.decorationId, "expedition-1", clock()).also { grants.add(it) } else null
        BaseResponse(account, grant).also { operations[input.opId] = Saved(signature, it) }
    }


    override suspend fun evidence(courseId: String): EvidenceResponse = mutex.withLock {
        checkedCourse(courseId); EvidenceResponse(operations.values.mapNotNull { it.value as? Receipt }.filter { it.run.courseId == courseId }.flatMap { it.evidenceDelta }.distinctBy { it.id })
    }
    override suspend fun memory(id: String, input: MemoryCommand): MemoryResponse = mutex.withLock {
        ensure(); val signature = "memory:$id:" + expeditionJson.encodeToString(input)
        (previous(input.opId, signature) as? MemoryResponse)?.let { return@withLock it.copy(replayed = true) }
        val previous = progresses.values.firstOrNull { it.id == id } ?: throw ExpeditionException(404, ExpeditionErrorBody("学习档案不存在", "NOT_FOUND"))
        ExpeditionRules.check(previous.revision == input.expectedRevision, "VERSION_CONFLICT", "学习档案已变化，请保留原文后重新读取")
        val memory = previous.state.companionMemories.firstOrNull { it.id == input.memoryId && it.deletedAt == null }
        ExpeditionRules.check(memory != null, "NOT_FOUND", "伙伴档案不存在", 404)
        val changed = if (input.action == "DELETE") memory!!.copy(text = "", sources = emptyList(), deletedAt = clock()) else {
            ExpeditionRules.check(input.action == "UPDATE" && input.text != null && input.text.trim().length >= 2 && input.text.length <= 4000, "VALIDATION", "修改内容无效", 400)
            memory!!.copy(text = input.text!!.trim(), confirmedAt = clock())
        }
        val updated = previous.copy(revision = previous.revision + 1, state = previous.state.copy(companionMemories = previous.state.companionMemories.map { if (it.id == changed.id) changed else it }))
        progresses[previous.courseId] = updated
        MemoryResponse(updated, false).also { operations[input.opId] = Saved(signature, it) }
    }
    override suspend fun selfReports(cursor: String?): SelfReportPage = mutex.withLock {
        ensure(); val sorted = selfReports.values.sortedWith(compareByDescending<SelfReportRecord> { it.createdAt }.thenByDescending { it.id })
        val index = if (cursor == null) 0 else { val found = sorted.indexOfFirst { it.id == cursor }; ExpeditionRules.check(found >= 0, "NOT_FOUND", "记录游标不存在", 404); found + 1 }
        val page = sorted.drop(index).take(50)
        SelfReportPage(page, if (sorted.size > index + page.size) page.lastOrNull()?.id else null)
    }
    override suspend fun selfReport(input: SelfReportInput): SelfReportResponse = mutex.withLock {
        ensure(); val signature = "self-report:" + expeditionJson.encodeToString(input)
        (previous(input.opId, signature) as? SelfReportResponse)?.let { return@withLock it.copy(replayed = true) }
        input.courseId?.let(::checkedCourse)
        val now = clock(); val canonical = ExpeditionRules.selfReportCanonical(input, now)
        val key = "self-report:" + MessageDigest.getInstance("SHA-256").digest(canonical.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
        selfReports[key]?.let { record -> return@withLock SelfReportResponse(account, record, emptyList(), true, false).also { operations[input.opId] = Saved(signature, it) } }
        val record = SelfReportRecord(UUID.randomUUID().toString(), input.courseId, durationMinutes = input.durationMinutes, notes = input.title.trim() + if (input.notes.isNotBlank()) "\n" + input.notes.trim() else "", createdAt = now)
        val result = ExpeditionRules.settle(account, listOf(RewardCandidate(key, "SELF_REPORT", 2, 0, "线下学习自述；不代表独立知识验证", record.id)), grants.map { it.stableKey }.toSet(), now)
        account = result.first; grants.addAll(result.second); selfReports[key] = record; onAccount(account); onSelfReport(record)
        SelfReportResponse(account, record, result.second, false, false).also { operations[input.opId] = Saved(signature, it) }
    }
    fun contextSnapshot(courseId: String): Pair<ProgressView?, List<RunView>> {
        checkedCourse(courseId)
        return progresses[courseId] to runs.values.filter { it.courseId == courseId }.sortedByDescending { it.startedAt }.take(3)
    }
    fun close() { closed = true; progresses.clear(); runs.clear(); writers.clear(); grants.clear(); operations.clear(); selfReports.clear(); account = AccountView(0, 1, 0, 0, LegacySnapshot(capturedAt = ""), WorldState(), DailyQuota("")) }
}
