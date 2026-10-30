package com.keling.app.expedition

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

/** Mirror of packages/shared/src/expedition/types.ts; all authoritative decisions stay in the shared rule contract. */
@OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)
val expeditionJson = Json { ignoreUnknownKeys = true; encodeDefaults = true; explicitNulls = false }

@Serializable data class TreeNode(val id: String, val value: Int, val left: String? = null, val right: String? = null)
@Serializable data class Tree(val root: String, val nodes: List<TreeNode>)
@Serializable data class SourceRef(val materialVersionId: String, val spanId: String, val contentHash: String, val startUtf16: Int, val endUtf16: Int, val page: Int? = null, val paragraphIndex: Int? = null)
@Serializable data class ContentReview(val ruleVerified: Boolean = true, val humanStatus: String = "PENDING", val reviewer: String? = null, val reviewedAt: String? = null)
@Serializable data class Exercise(val id: String, val version: String, val objectiveKey: String, val template: String, val role: String, val title: String, val prompt: String,
    val tree: Tree, val hints: List<String> = emptyList(), val rubric: List<String> = emptyList(), val sourceParagraph: Int, val review: ContentReview)
@Serializable data class LearningObjective(val key: String, val title: String, val description: String)
@Serializable data class Chapter(val id: String, val version: String, val title: String, val materialTitle: String, val materialParagraphs: List<String>, val references: List<String>, val objectives: List<LearningObjective>, val exercises: List<Exercise>)
@Serializable data class Feedback(val kind: String, val correct: Boolean? = null, val firstDeviation: Int? = null, val expectedOrder: List<String>? = null, val message: String,
    val rubric: List<String> = emptyList(), val independentEligible: Boolean = false, val stepDeviation: Int? = null)
@Serializable data class Evidence(val id: String, val objectiveKey: String, val kind: String, val runId: String, val exerciseId: String, val exerciseVersion: String,
    val at: String, val sources: List<SourceRef>, val judgment: String, val strict: Boolean)
@Serializable data class ReviewCycle(val id: String, val objectiveKey: String, val dueAt: String, val anchorAt: String, val kind: String, val completedAt: String? = null)
@Serializable data class ObjectiveProgress(val objectiveKey: String, val state: String = "UNEXPLORED", val evidenceIds: List<String> = emptyList(), val review: ReviewCycle? = null)
@Serializable data class CompanionMemory(val id: String, val objectiveKey: String, val text: String, val sources: List<SourceRef>, val confirmedAt: String,
    val verification: String = "SELF_REPORTED", val deletedAt: String? = null)
@Serializable data class ProgressState(val schemaVersion: Int = 1, val objectives: List<ObjectiveProgress>, val seenExerciseIds: List<String> = emptyList(), val companionMemories: List<CompanionMemory> = emptyList())
@Serializable data class OperationStep(val type: String, val nodeId: String)
@Serializable data class Answer(val structure: String? = null, val order: List<String>? = null, val validBst: Boolean? = null, val explanation: String? = null, val selfCheck: List<String>? = null, val steps: List<OperationStep>? = null)
@Serializable data class Attempt(val id: String, val exerciseId: String, val exerciseVersion: String, val answer: Answer, val at: String, val hintsUsed: Int, val firstSubmission: Boolean, val feedback: Feedback)
@Serializable data class RunView(val schemaVersion: Int = 1, val id: String, val courseId: String, val chapterId: String, val contentVersion: String, val questKind: String,
    val mode: String, val objectiveKey: String, val exerciseIds: List<String>, val exerciseIndex: Int = 0, val status: String = "ACTIVE", val revision: Int = 0,
    val hintsUsed: Int = 0, val attempts: List<Attempt> = emptyList(), val feedback: Feedback? = null, val sources: List<SourceRef> = emptyList(),
    val nextStep: String? = null, val reviewCycleId: String? = null, val startedAt: String, val settledAt: String? = null,
    val freshExerciseIds: List<String> = emptyList(), val writerDeviceId: String? = null, val leaseEpoch: Int = 0, val leaseExpiresAt: String? = null, val pausedAt: String? = null, val pausedMs: Long = 0, val endedAt: String? = null, val timing: SessionTiming? = null)
@Serializable data class Writer(val deviceId: String, val epoch: Int, val token: String)
@Serializable data class ExpeditionAction(val type: String, val answer: Answer? = null, val nextStep: String? = null, val saveCompanion: Boolean? = null)
@Serializable data class Command(val opId: String, val expectedRevision: Int, val writer: Writer, val action: ExpeditionAction)
@Serializable data class RewardGrant(val id: String, val stableKey: String, val kind: String, val exp: Int, val crystals: Int, val reason: String, val sourceId: String, val ruleVersion: String, val createdAt: String)
@Serializable data class Decoration(val id: String, val name: String, val price: Int, val description: String)
@Serializable data class WorldSlot(val id: String = "base-1", val decorationId: String? = null)
@Serializable data class WorldState(val slot: WorldSlot = WorldSlot(), val ownedDecorationIds: List<String> = emptyList())
@Serializable data class LegacySnapshot(val level: Int = 1, val exp: Int = 0, val crystals: Int = 0, val energy: Int = 0, val capturedAt: String)
@Serializable data class DailyQuota(val day: String, val cycleCount: Int = 0, val crystalsGranted: Int = 0, val selfReportCount: Int = 0)
@Serializable data class AccountView(val revision: Int, val level: Int, val exp: Int, val crystals: Int, val legacy: LegacySnapshot, val world: WorldState, val quota: DailyQuota)
@Serializable data class ProgressView(val id: String, val courseId: String, val chapterId: String, val revision: Int, val contentVersion: String, val state: ProgressState)
@Serializable data class Receipt(val opId: String, val revision: Int, val serverTime: String, val run: RunView, val progress: ProgressView, val account: AccountView,
    val feedback: Feedback? = null, val evidenceDelta: List<Evidence> = emptyList(), val rewardGrants: List<RewardGrant> = emptyList(), val replayed: Boolean = false)
@Serializable data class StartRunInput(val opId: String, val courseId: String, val questKind: String, val objectiveKey: String? = null, val mode: String, val deviceId: String)
@Serializable data class StartRunResponse(val run: RunView, val writer: Writer, val progress: ProgressView, val account: AccountView)
@Serializable data class LeaseInput(val opId: String, val expectedRevision: Int, val deviceId: String, val intent: String, val writer: Writer? = null)
@Serializable data class LeaseResponse(val run: RunView, val writer: Writer? = null, val serverTime: String)
@Serializable data class CatalogResponse(val chapter: Chapter, val decorations: List<Decoration>, val rules: JsonObject = JsonObject(emptyMap()))
@Serializable data class ChapterResponse(val chapter: Chapter, val progress: ProgressView, val account: AccountView, val runs: List<RunView>, val serverTime: String)
@Serializable data class RunResponse(val run: RunView, val progress: ProgressView, val account: AccountView, val serverTime: String)
@Serializable data class RewardsResponse(val grants: List<RewardGrant>, val account: AccountView)
@Serializable data class BaseCommand(val opId: String, val expectedRevision: Int, val decorationId: String, val action: String)
@Serializable data class BaseResponse(val account: AccountView, val grant: RewardGrant? = null, val replayed: Boolean = false)
@Serializable data class ExpeditionErrorBody(val error: String, val code: String, val current: JsonObject? = null)
class ExpeditionException(val status: Int, val detail: ExpeditionErrorBody) : Exception(detail.error)

@Serializable data class SelfReportInput(val opId: String, val courseId: String? = null, val title: String, val notes: String = "", val durationMinutes: Int)
@Serializable data class SelfReportRecord(val id: String, val courseId: String? = null, val type: String = "SELF_REPORTED", val durationMinutes: Int, val notes: String, val createdAt: String)
@Serializable data class SelfReportResponse(val account: AccountView, val record: SelfReportRecord, val rewardGrants: List<RewardGrant>, val alreadyRecorded: Boolean, val replayed: Boolean)

@Serializable data class MemoryCommand(val opId: String, val expectedRevision: Int, val memoryId: String, val action: String, val text: String? = null)
@Serializable data class MemoryResponse(val progress: ProgressView, val replayed: Boolean)
@Serializable data class EvidenceResponse(val evidence: List<Evidence>)
@Serializable data class ExpeditionPreferences(val hints: String = "KEY_MOMENTS", val narrative: String = "LIGHT", val reducedMotion: Boolean = false, val minutes: Int = 10)

@Serializable data class SessionTiming(val asOf: String, val elapsedMs: Long, val pausedMs: Long, val runningMs: Long, val label: String = "SESSION_TIME_NOT_STUDY")

@Serializable data class SelfReportPage(val records: List<SelfReportRecord>, val nextCursor: String? = null)
