package com.keling.app.planet

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import java.time.Instant
import java.text.Normalizer
import java.util.Locale

@Serializable data class PlanetQuestion(val id: String, val prompt: String, val options: List<String> = emptyList(), val answerIndex: Int = 0, val explanation: String, val kind: String = "single_choice", val answerIndices: List<Int>? = null, val acceptedAnswers: List<String>? = null, val referenceAnswer: String? = null, val rubric: List<String>? = null, val sourceIds: List<String>? = null, val similarTo: String? = null, val practiceResearch: PlanetResearch? = null)
@Serializable data class PlanetRegion(val id: String, val title: String, val description: String, val prerequisiteIds: List<String> = emptyList(), val estimatedMinutes: Int, val lesson: String, val objectives: List<String>, val questions: List<PlanetQuestion>, val sourceIds: List<String>? = null)
@Serializable data class PlanetGenerator(val providerId: String, val model: String, val at: String)
@Serializable data class PlanetSource(val id: String, val title: String, val url: String, val snippet: String, val publishedAt: String? = null)
@Serializable data class PlanetResearch(val status: String, val intent: String, val sources: List<PlanetSource> = emptyList(), val searchedAt: String, val queries: List<String> = emptyList(), val summary: String? = null)
@Serializable data class PlanetMeaning(val label: String, val description: String, val context: String)
@Serializable data class PlanetMeaningAnalysis(val overview: String, val interpretations: List<PlanetMeaning>, val contrasts: List<String>, val caveats: List<String>)
@Serializable data class PlanetArtwork(val status: String, val prompt: String, val url: String? = null, val provider: String? = null, val generatedAt: String? = null)
@Serializable data class PlanetKnowledgeNode(val id: String, val title: String, val summary: String, val sourceIds: List<String>)
@Serializable data class PlanetKnowledgeEdge(val source: String, val target: String, val label: String, val kind: String)
@Serializable data class PlanetKnowledgeGraph(val nodes: List<PlanetKnowledgeNode>, val edges: List<PlanetKnowledgeEdge>)
@Serializable data class PlanetDraft(val id: String, val subject: String, val level: String = "", val goal: String = "", val title: String, val story: String, val planetStyleIndex: Int, val regions: List<PlanetRegion>, val reviewStatus: String = "UNREVIEWED", val generatedBy: PlanetGenerator, val research: PlanetResearch? = null, val meaningAnalysis: PlanetMeaningAnalysis? = null, val artwork: PlanetArtwork? = null, val knowledgeGraph: PlanetKnowledgeGraph? = null)
@Serializable data class PlanetResponse(val selectedIndex: Int? = null, val selectedIndices: List<Int>? = null, val text: String? = null, val orderedIndices: List<Int>? = null, val selfReview: Boolean? = null)
@Serializable data class PlanetAnswer(val selectedIndex: Int = -1, val correct: Boolean, val attempts: Int, val updatedAt: String, val selectedIndices: List<Int>? = null, val text: String? = null, val orderedIndices: List<Int>? = null, val reviewed: Boolean? = null, val evaluation: String? = null)
@Serializable data class PlanetProgress(val answers: Map<String, PlanetAnswer> = emptyMap(), val completedRegionIds: List<String> = emptyList())
@Serializable data class PlanetRecord(val id: String, val courseId: String, val draft: PlanetDraft, val progress: PlanetProgress = PlanetProgress(), val createdAt: String, val updatedAt: String)
@Serializable data class PlanetFeedback(val correct: Boolean, val expectedIndex: Int = -1, val explanation: String, val requiresSelfReview: Boolean? = null, val referenceAnswer: String? = null, val rubric: List<String>? = null, val expectedIndices: List<Int>? = null, val acceptedAnswers: List<String>? = null)
@Serializable data class PlanetAnswerResult(val planet: PlanetRecord, val feedback: PlanetFeedback)

fun answerPlanetQuestion(record: PlanetRecord, questionId: String, selectedIndex: Int): PlanetAnswerResult {
    return answerPlanetQuestion(record, questionId, PlanetResponse(selectedIndex = selectedIndex))
}

fun planetAnswerComplete(question: PlanetQuestion, answer: PlanetAnswer?): Boolean =
    if (question.kind == "short_answer") answer?.reviewed == true else answer?.correct == true
fun completedPlanetRegions(draft: PlanetDraft, answers: Map<String, PlanetAnswer>): List<String> {
    val done = linkedSetOf<String>()
    draft.regions.forEach { region ->
        val coreQuestions = region.questions.filter { it.similarTo.isNullOrBlank() }
        if (region.prerequisiteIds.all { it in done } && coreQuestions.isNotEmpty() && coreQuestions.all { planetAnswerComplete(it, answers[it.id]) }) done.add(region.id)
    }
    return done.toList()
}

fun normalizePlanetAnswer(value: String): String = Normalizer.normalize(value, Normalizer.Form.NFKC).trim { it.isWhitespace() || it == '\uFEFF' }.replace(Regex("[\\s\\p{Z}\uFEFF]+"), " ").lowercase(Locale.ROOT)

fun answerPlanetQuestion(record: PlanetRecord, questionId: String, response: PlanetResponse): PlanetAnswerResult {
    val region = record.draft.regions.singleOrNull { r -> r.questions.any { it.id == questionId } } ?: throw IllegalArgumentException("题目不存在")
    val question = region.questions.single { it.id == questionId }
    val complete = completedPlanetRegions(record.draft, record.progress.answers).toSet()
    require(region.prerequisiteIds.all { it in complete }) { "请先完成前面的探索区域" }
    val previous = record.progress.answers[questionId]
    val present = listOfNotNull(response.selectedIndex?.let { "selectedIndex" }, response.selectedIndices?.let { "selectedIndices" }, response.orderedIndices?.let { "orderedIndices" }, response.text?.let { "text" }, response.selfReview?.let { "selfReview" })
    val allowed = when (question.kind) { "multiple_choice" -> setOf("selectedIndices"); "ordering" -> setOf("orderedIndices"); "fill_blank" -> setOf("text"); "short_answer" -> setOf("text", "selfReview"); else -> setOf("selectedIndex") }
    require(present.all { it in allowed }) { "作答内容与题型不符" }
    val correct = when (question.kind) {
        "single_choice", "true_false" -> {
            require(response.selectedIndex in question.options.indices && question.answerIndex in question.options.indices) { "选项无效" }
            response.selectedIndex == question.answerIndex
        }
        "multiple_choice" -> {
            val selected = requireNotNull(response.selectedIndices) { "请选择选项" }
            require(selected.isNotEmpty() && selected.distinct().size == selected.size && selected.all { it in question.options.indices }) { "多选选项无效" }
            selected.toSet() == question.answerIndices.orEmpty().toSet()
        }
        "ordering" -> {
            val ordered = requireNotNull(response.orderedIndices) { "请完成排序" }
            require(ordered.size == question.options.size && ordered.toSet() == question.options.indices.toSet()) { "排序内容不完整" }
            ordered == question.answerIndices
        }
        "fill_blank" -> {
            val text = response.text?.trim().orEmpty()
            require(text.isNotEmpty() && text.length <= 500) { "请填写答案（不超过500字）" }
            question.acceptedAnswers.orEmpty().any { normalizePlanetAnswer(text) == normalizePlanetAnswer(it) }
        }
        "short_answer" -> {
            val text = response.text?.trim().orEmpty()
            require(text.isNotEmpty() && text.length <= 2000) { "请写下自己的理解（不超过2000字）" }
            if (response.selfReview == true) require(previous?.evaluation == "self_review" && previous.text == text) { "请先提交本次回答，再对照参考自核" }
            false
        }
        else -> throw IllegalArgumentException("此题型需要更新课灵后再作答")
    }
    val stamp = Instant.now().toString()
    val selfReview = question.kind == "short_answer"
    val answer = PlanetAnswer(response.selectedIndex ?: -1, correct, (previous?.attempts ?: 0) + 1, stamp, response.selectedIndices, response.text?.trim(), response.orderedIndices, selfReview && response.selfReview == true, if (selfReview) "self_review" else "objective")
    val answers = record.progress.answers + (questionId to answer)
    val completed = completedPlanetRegions(record.draft, answers)
    return PlanetAnswerResult(record.copy(progress = PlanetProgress(answers, completed), updatedAt = stamp), PlanetFeedback(answer.correct, question.answerIndex, question.explanation, selfReview && answer.reviewed != true, question.referenceAnswer, question.rubric, question.answerIndices, question.acceptedAnswers))
}

/** RAM-only and owned by the guest workspace, never shared between accounts. */
class GuestPlanetStore(private val ensureOpen: () -> Unit) {
    private val records = linkedMapOf<String, PlanetRecord>()
    private val draftTokens = mutableMapOf<String, String>()
    private val rawDrafts = mutableMapOf<String, JsonObject>()
    private val receipts = mutableMapOf<String, Pair<String, PlanetAnswerResult>>()
    fun list(): List<PlanetRecord> { ensureOpen(); return records.values.toList() }
    fun get(id: String): PlanetRecord { ensureOpen(); return records[id] ?: error("星球不存在") }
    fun add(draft: PlanetDraft, draftToken: String? = null, rawDraft: JsonObject? = null, createCourse: () -> String): PlanetRecord {
        ensureOpen(); records[draft.id]?.let { return it }
        if (draftToken != null) draftTokens[draft.id] = draftToken
        if (rawDraft != null) rawDrafts[draft.id] = rawDraft
        val now = Instant.now().toString()
        return PlanetRecord(draft.id, createCourse(), draft, createdAt = now, updatedAt = now).also { records[it.id] = it }
    }
    fun signedPreview(id: String): GeneratedPlanet { ensureOpen(); return GeneratedPlanet(get(id).draft, draftTokens[id] ?: error("此预览已过期，请重新生成星球"), rawDrafts[id]) }
    fun replaceDraft(id: String, generated: GeneratedPlanet): PlanetRecord {
        ensureOpen(); require(generated.draft.id == id) { "重新生成的星球编号不一致" }
        val original = get(id)
        val questionIds = generated.draft.regions.flatMap { it.questions }.map { it.id }.toSet()
        val answers = original.progress.answers.filterKeys { it in questionIds }
        val completed = completedPlanetRegions(generated.draft, answers)
        val result = original.copy(draft = generated.draft, progress = PlanetProgress(answers, completed), updatedAt = Instant.now().toString())
        records[id] = result; draftTokens[id] = generated.draftToken
        generated.rawDraft?.let { rawDrafts[id] = it } ?: rawDrafts.remove(id)
        receipts.entries.removeAll { it.value.second.planet.id == id }
        return result
    }
    fun answer(id: String, questionId: String, selected: Int, requestId: String): PlanetAnswerResult {
        return answer(id, questionId, PlanetResponse(selectedIndex = selected), requestId)
    }
    fun answer(id: String, questionId: String, response: PlanetResponse, requestId: String): PlanetAnswerResult {
        ensureOpen(); val signature = "$id/$questionId/$response"
        receipts[requestId]?.let { require(it.first == signature) { "请求编号冲突" }; return it.second }
        return answerPlanetQuestion(get(id), questionId, response).also { records[id] = it.planet; receipts[requestId] = signature to it }
    }
    fun clear() { records.clear(); receipts.clear(); draftTokens.clear(); rawDrafts.clear() }
}
