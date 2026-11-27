package com.keling.app.planet

import kotlinx.serialization.Serializable
import java.time.Instant

@Serializable data class PlanetQuestion(val id: String, val prompt: String, val options: List<String>, val answerIndex: Int, val explanation: String)
@Serializable data class PlanetRegion(val id: String, val title: String, val description: String, val prerequisiteIds: List<String> = emptyList(), val estimatedMinutes: Int, val lesson: String, val objectives: List<String>, val questions: List<PlanetQuestion>)
@Serializable data class PlanetGenerator(val providerId: String, val model: String, val at: String)
@Serializable data class PlanetDraft(val id: String, val subject: String, val level: String = "", val goal: String = "", val title: String, val story: String, val planetStyleIndex: Int, val regions: List<PlanetRegion>, val reviewStatus: String = "UNREVIEWED", val generatedBy: PlanetGenerator)
@Serializable data class PlanetAnswer(val selectedIndex: Int, val correct: Boolean, val attempts: Int, val updatedAt: String)
@Serializable data class PlanetProgress(val answers: Map<String, PlanetAnswer> = emptyMap(), val completedRegionIds: List<String> = emptyList())
@Serializable data class PlanetRecord(val id: String, val courseId: String, val draft: PlanetDraft, val progress: PlanetProgress = PlanetProgress(), val createdAt: String, val updatedAt: String)
@Serializable data class PlanetFeedback(val correct: Boolean, val expectedIndex: Int, val explanation: String)
@Serializable data class PlanetAnswerResult(val planet: PlanetRecord, val feedback: PlanetFeedback)

fun answerPlanetQuestion(record: PlanetRecord, questionId: String, selectedIndex: Int): PlanetAnswerResult {
    val region = record.draft.regions.singleOrNull { r -> r.questions.any { it.id == questionId } } ?: throw IllegalArgumentException("题目不存在")
    val question = region.questions.single { it.id == questionId }
    val complete = record.draft.regions.filter { r -> r.questions.isNotEmpty() && r.questions.all { record.progress.answers[it.id]?.correct == true } }.map { it.id }.toSet()
    require(region.prerequisiteIds.all { it in complete }) { "请先完成前面的探索区域" }
    require(selectedIndex in question.options.indices && question.answerIndex in question.options.indices) { "选项无效" }
    val stamp = Instant.now().toString()
    val answer = PlanetAnswer(selectedIndex, selectedIndex == question.answerIndex, (record.progress.answers[questionId]?.attempts ?: 0) + 1, stamp)
    val answers = record.progress.answers + (questionId to answer)
    val completed = record.draft.regions.filter { it.questions.isNotEmpty() && it.questions.all { q -> answers[q.id]?.correct == true } }.map { it.id }
    return PlanetAnswerResult(record.copy(progress = PlanetProgress(answers, completed), updatedAt = stamp), PlanetFeedback(answer.correct, question.answerIndex, question.explanation))
}

/** RAM-only and owned by the guest workspace, never shared between accounts. */
class GuestPlanetStore(private val ensureOpen: () -> Unit) {
    private val records = linkedMapOf<String, PlanetRecord>()
    private val receipts = mutableMapOf<String, Pair<String, PlanetAnswerResult>>()
    fun list(): List<PlanetRecord> { ensureOpen(); return records.values.toList() }
    fun get(id: String): PlanetRecord { ensureOpen(); return records[id] ?: error("星球不存在") }
    fun add(draft: PlanetDraft, createCourse: () -> String): PlanetRecord {
        ensureOpen(); records[draft.id]?.let { return it }
        val now = Instant.now().toString()
        return PlanetRecord(draft.id, createCourse(), draft, createdAt = now, updatedAt = now).also { records[it.id] = it }
    }
    fun answer(id: String, questionId: String, selected: Int, requestId: String): PlanetAnswerResult {
        ensureOpen(); val signature = "$id/$questionId/$selected"
        receipts[requestId]?.let { require(it.first == signature) { "请求编号冲突" }; return it.second }
        return answerPlanetQuestion(get(id), questionId, selected).also { records[id] = it.planet; receipts[requestId] = signature to it }
    }
    fun clear() { records.clear(); receipts.clear() }
}
