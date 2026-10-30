package com.keling.app.expedition

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import java.io.File
import java.io.FileOutputStream
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.security.MessageDigest
import java.util.UUID

@Serializable data class DraftStep(val type: String, val nodeId: String, val container: List<String>, val visited: List<String>)
@Serializable data class ExpeditionDraft(val runId: String, val exerciseId: String, val baseRevision: Int, val answer: Answer = Answer(),
    val container: List<String> = emptyList(), val steps: List<DraftStep> = emptyList(), val nextStep: String = "", val savedAt: String = "")

/** Neither the JWT, provider Key nor writer token is ever serialized. */
@Serializable data class PendingOperation(val opId: String, val kind: String, val runId: String? = null,
    val expectedRevision: Int = 0, val leaseEpoch: Int = 0, val action: ExpeditionAction? = null,
    val start: StartRunInput? = null, val base: BaseCommand? = null, val selfReport: SelfReportInput? = null, val progressId: String? = null, val memory: MemoryCommand? = null)
@Serializable data class ExpeditionJournalState(val schemaVersion: Int = 1, val deviceId: String = UUID.randomUUID().toString(),
    val selectedCourseId: String? = null, val currentRunId: String? = null, val catalog: CatalogResponse? = null,
    val chapters: Map<String, ChapterResponse> = emptyMap(), val runs: Map<String, RunResponse> = emptyMap(),
    val drafts: Map<String, ExpeditionDraft> = emptyMap(), val pending: List<PendingOperation> = emptyList(),
    val receipts: List<Receipt> = emptyList(), val preservedDrafts: List<ExpeditionDraft> = emptyList(),
    val account: AccountView? = null, val grants: List<RewardGrant> = emptyList(),
    val courses: List<com.keling.app.network.CourseData> = emptyList(), val selfReports: List<SelfReportRecord> = emptyList(), val selfReportsCursor: String? = null,
    val preservedOperations: List<PendingOperation> = emptyList(), val evidence: Map<String, List<Evidence>> = emptyMap(), val preferences: ExpeditionPreferences = ExpeditionPreferences())

class ExpeditionJournal private constructor(private val file: File?, initial: ExpeditionJournalState) {
    private val mutex = Mutex()
    private var closed = false
    var state: ExpeditionJournalState = initial
        private set
    suspend fun update(transform: (ExpeditionJournalState) -> ExpeditionJournalState): ExpeditionJournalState = mutex.withLock {
        check(!closed) { "远征会话已结束" }
        val next = transform(state)
        if (file != null) withContext(Dispatchers.IO) {
            file.parentFile?.mkdirs()
            val temp = File(file.parentFile, "${file.name}.pending")
            FileOutputStream(temp).use { stream -> stream.write(expeditionJson.encodeToString(next).toByteArray(Charsets.UTF_8)); stream.fd.sync() }
            Files.move(temp.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
        }
        check(!closed) { "远征会话已结束" }
        state = next; next
    }
    fun close() { closed = true; state = ExpeditionJournalState() }
    companion object {
        fun memory() = ExpeditionJournal(null, ExpeditionJournalState())
        fun namespace(baseUrl: String, accountId: String): String {
            require(accountId.isNotBlank() && !accountId.startsWith("guest-memory:"))
            return MessageDigest.getInstance("SHA-256").digest("${baseUrl.trimEnd('/')}\n$accountId".toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
        }
        suspend fun open(noBackupDirectory: File, baseUrl: String, accountId: String): ExpeditionJournal = withContext(Dispatchers.IO) {
            val file = File(noBackupDirectory, "expedition-v1/${namespace(baseUrl, accountId)}.json")
            // A malformed existing journal is surfaced, never silently replaced with an empty save.
            val stored = if (file.exists()) expeditionJson.decodeFromString<ExpeditionJournalState>(file.readText()) else ExpeditionJournalState()
            require(stored.schemaVersion == 1) { "存档版本不兼容，原文件已保留" }
            ExpeditionJournal(file, stored)
        }
    }
}
