package com.keling.app.expedition

import java.time.Instant
import java.time.ZoneOffset

data class RewardCandidate(val stableKey: String, val kind: String, val exp: Int, val crystals: Int, val reason: String, val sourceId: String)
data class RuleResult(val run: RunView, val progress: ProgressState, val evidence: List<Evidence> = emptyList(), val rewards: List<RewardCandidate> = emptyList())

/** Kotlin translation of shared/expedition/core.ts, checked against its JSON fixtures. No network or storage. */
object ExpeditionRules {
    val decorations = listOf(
        Decoration("antenna", "信号天线", 6, "陈列本章广播推演记录，不改变知识评价。"),
        Decoration("archive", "星光档案柜", 9, "展示自己的学习档案，所有笔记始终免费可读。"),
        Decoration("observatory", "小型观测台", 12, "装扮基地并回看课程航线，不加成知识证据。")
    )
    fun check(ok: Boolean, code: String, message: String, status: Int = 409) {
        if (!ok) throw ExpeditionException(status, ExpeditionErrorBody(message, code))
    }
    fun day(now: String): String = Instant.parse(now).atOffset(ZoneOffset.ofHours(8)).toLocalDate().toString()
    fun progress(chapter: Chapter) = ProgressState(objectives = chapter.objectives.map { ObjectiveProgress(it.key) })
    fun expected(exercise: Exercise): Answer {
        val tree = exercise.tree; val nodes = tree.nodes.associateBy { it.id }; val seen = mutableSetOf<String>()
        check(tree.nodes.size in 1..64 && nodes.size == tree.nodes.size, "INVALID_CONTENT", "树节点数量或编号无效", 400)
        fun validate(id: String) {
            val node = nodes[id]; check(node != null && seen.add(id), "INVALID_CONTENT", "树包含缺失节点、环或共享孩子", 400)
            node!!.left?.let(::validate); node.right?.let(::validate)
        }
        validate(tree.root); check(seen.size == nodes.size, "INVALID_CONTENT", "树有未连接节点", 400)
        if (exercise.objectiveKey == "bt.bst.bounds") {
            val invalid = mutableListOf<String>()
            fun visit(id: String?, lo: Long, hi: Long) {
                if (id == null) return
                val node = nodes.getValue(id)
                if (node.value <= lo || node.value >= hi) invalid.add(id)
                visit(node.left, lo, minOf(hi, node.value.toLong())); visit(node.right, maxOf(lo, node.value.toLong()), hi)
            }
            visit(tree.root, Long.MIN_VALUE, Long.MAX_VALUE)
            return Answer(validBst = invalid.isEmpty(), order = invalid)
        }
        val bfs = exercise.objectiveKey == "bt.bfs.queue"; val container = mutableListOf(tree.root); val order = mutableListOf<String>()
        while (container.isNotEmpty()) {
            val id = container.removeAt(if (bfs) 0 else container.lastIndex); order.add(id); val node = nodes.getValue(id)
            container.addAll((if (bfs) listOf(node.left, node.right) else listOf(node.right, node.left)).filterNotNull())
        }
        return Answer(order = order, structure = if (bfs) "QUEUE" else "STACK")
    }
    fun evaluate(exercise: Exercise, answer: Answer): Feedback {
        if (exercise.template == "TEACH_COMPANION") {
            check(answer.explanation != null && answer.explanation.trim().length >= 12 && answer.explanation.length <= 4000,
                "INVALID_ANSWER", "请用至少12字、最多4000字解释自己的理解", 400)
            check(answer.selfCheck == null || answer.selfCheck.size <= 12 && answer.selfCheck.all { it.length <= 200 }, "INVALID_ANSWER", "自评条目无效", 400)
            return Feedback("SELF_REPORTED", message = "已保留你的解释。请对照评分条目修正；自评不等于人工审核或独立知识验证。", rubric = exercise.rubric)
        }
        check(answer.order != null && answer.order.size <= 64 && answer.order.all { it.length <= 80 }, "INVALID_ANSWER", "请提交节点编号列表", 400)
        check(answer.order!!.distinct().size == answer.order.size && answer.order.all { id -> exercise.tree.nodes.any { it.id == id } }, "INVALID_ANSWER", "节点编号重复或不存在，请检查输入方式", 400)
        val expected = expected(exercise); val bst = exercise.objectiveKey == "bt.bst.bounds"
        check(if (bst) answer.validBst != null else answer.structure in listOf("QUEUE", "STACK"), "INVALID_ANSWER", "请先选择数据结构或二叉搜索树判断", 400)
        val order = answer.order; val wanted = expected.order!!
        val deviation = if (bst) { if (order.toSet() == wanted.toSet()) null else 0 } else (0 until maxOf(order.size, wanted.size)).firstOrNull { order.getOrNull(it) != wanted.getOrNull(it) }
        var stepDeviation: Int? = null
        answer.steps?.let { steps ->
            check(steps.size <= 256 && steps.all { it.type in listOf("PUSH", "POP") }, "INVALID_ANSWER", "操作步骤无效", 400)
            if (!bst) {
                val canonical = mutableListOf(OperationStep("PUSH", exercise.tree.root)); val nodes = exercise.tree.nodes.associateBy { it.id }
                for (id in wanted) { canonical.add(OperationStep("POP", id)); val node = nodes.getValue(id)
                    (if (expected.structure == "QUEUE") listOf(node.left, node.right) else listOf(node.right, node.left)).filterNotNull().forEach { canonical.add(OperationStep("PUSH", it)) }
                }
                stepDeviation = (0 until maxOf(steps.size, canonical.size)).firstOrNull { steps.getOrNull(it) != canonical.getOrNull(it) }
            }
        }
        val choiceCorrect = if (bst) answer.validBst == expected.validBst else answer.structure == expected.structure
        val correct = choiceCorrect && deviation == null && stepDeviation == null
        return Feedback("RULE_CHECKED", correct, if (!choiceCorrect) 0 else deviation, wanted,
            if (correct) "本次输入符合题目规则。请回看推演并说明下一步；程序判定不代表内容已经人工审核。"
            else if (!choiceCorrect) "先检查容器或全局边界判断。阅读规则后可以修正，本题后续属于训练。"
            else if (stepDeviation != null) "第${stepDeviation!! + 1}次容器操作偏离规则；先检查压入孩子的顺序。"
            else "从第${(deviation ?: 0) + 1}个位置起与规则推演不一致；可对照顺序继续练习。", exercise.rubric, stepDeviation = stepDeviation)
    }
    fun create(chapter: Chapter, previous: ProgressState, input: StartRunInput, id: String, now: String, sources: List<SourceRef>): RuleResult {
        val key = input.objectiveKey ?: chapter.objectives.first().key
        check(chapter.objectives.any { it.key == key }, "INVALID_OBJECTIVE", "学习目标不存在", 400)
        check(input.questKind in listOf("EXPLORE", "TEACH", "TRIAL", "REVIEW") && input.mode in listOf("TRAINING", "INDEPENDENT"), "INVALID_QUEST", "任务或模式无效", 400)
        val review = previous.objectives.first { it.objectiveKey == key }.review
        if (input.questKind == "REVIEW") check(review != null && review.completedAt == null && Instant.parse(now) >= Instant.parse(review.dueAt), "REVIEW_NOT_DUE", "回访尚未到期；可以继续普通训练")
        val keys = if (input.questKind == "TRIAL") chapter.objectives.map { it.key } else listOf(key)
        val ids = keys.map { target ->
            val candidates = chapter.exercises.filter { it.objectiveKey == target && it.template == if (input.questKind == "TEACH") "TEACH_COMPANION" else "ROUTE_REPAIR" }
            val role = if (input.questKind == "REVIEW") "REVIEW" else if (input.mode == "INDEPENDENT" || input.questKind == "TRIAL") "FRESH" else "PRACTICE"
            val preferred = candidates.filter { it.role == role }
            fun unseen(e: Exercise) = "${e.id}@${e.version}" !in previous.seenExerciseIds
            val chosen = preferred.firstOrNull(::unseen) ?: candidates.firstOrNull(::unseen) ?: if (input.mode == "TRAINING") preferred.firstOrNull() ?: candidates.firstOrNull() else null
            check(chosen != null, "NO_FRESH_VARIANT", "当前没有未展示的新变式；可切换训练，不能复用旧题声明独立验证")
            chosen!!.id
        }
        val versions = ids.map { idValue -> chapter.exercises.first { it.id == idValue }.let { "${it.id}@${it.version}" } }
        val fresh = ids.filterIndexed { index, _ -> versions[index] !in previous.seenExerciseIds }
        val run = RunView(id = id, courseId = input.courseId, chapterId = chapter.id, contentVersion = chapter.version, questKind = input.questKind,
            mode = input.mode, objectiveKey = key, exerciseIds = ids, sources = sources, reviewCycleId = if (input.questKind == "REVIEW") review!!.id else null, startedAt = now, freshExerciseIds = fresh)
        return RuleResult(run, previous.copy(seenExerciseIds = (previous.seenExerciseIds + versions).distinct()))
    }
    fun reduce(chapter: Chapter, before: RunView, previous: ProgressState, action: ExpeditionAction, now: String, opId: String): RuleResult {
        var run = before; var progress = previous; val evidence = mutableListOf<Evidence>(); val rewards = mutableListOf<RewardCandidate>()
        check(run.contentVersion == chapter.version, "CONTENT_STALE", "关卡内容版本已变化，请保留草稿并重新开始")
        check(run.status !in listOf("SETTLED", "CANCELLED", "CONTENT_STALE"), "RUN_CLOSED", "本次远征已结束或内容已变化")
        val exercise = chapter.exercises.firstOrNull { it.id == run.exerciseIds.getOrNull(run.exerciseIndex) }
        check(exercise != null, "INVALID_CONTENT", "关卡题目不存在"); val e = exercise!!
        var objective = progress.objectives.first { it.objectiveKey == e.objectiveKey }
        when (action.type) {
            "CANCEL" -> run = run.copy(status = "CANCELLED", endedAt = now, pausedMs = run.pausedMs + (run.pausedAt?.let { maxOf(0L, Instant.parse(now).toEpochMilli() - Instant.parse(it).toEpochMilli()) } ?: 0L), pausedAt = null)
            "PAUSE" -> { check(run.status != "PAUSED", "INVALID_STATE", "已经暂停"); run = run.copy(status = "PAUSED", pausedAt = now) }
            "RESUME" -> { check(run.status == "PAUSED", "INVALID_STATE", "当前未暂停"); run = run.copy(status = if (run.feedback == null) "ACTIVE" else "AWAITING_FEEDBACK", pausedMs = run.pausedMs + (run.pausedAt?.let { maxOf(0L, Instant.parse(now).toEpochMilli() - Instant.parse(it).toEpochMilli()) } ?: 0L), pausedAt = null) }
            else -> {
                check(run.status != "PAUSED", "RUN_PAUSED", "请先恢复远征")
                when (action.type) {
                    "HINT" -> { check(run.nextStep == null, "STEP_SETTLED", "本题反馈已确认"); run = run.copy(hintsUsed = run.hintsUsed + 1, feedback = run.feedback?.copy(independentEligible = false)) }
                    "SUBMIT" -> {
                        check(run.nextStep == null, "STEP_SETTLED", "本题反馈已确认")
                        check(action.answer != null, "INVALID_ANSWER", "请提交实际作答", 400)
                        val first = run.attempts.none { it.exerciseId == e.id }; val judged = evaluate(e, action.answer!!)
                        val reviewed = e.review.humanStatus == "APPROVED" && !e.review.reviewer.isNullOrBlank() && !e.review.reviewedAt.isNullOrBlank()
                        val feedback = judged.copy(independentEligible = judged.correct == true && reviewed && first && run.hintsUsed == 0 && run.mode == "INDEPENDENT" && e.id in run.freshExerciseIds)
                        if (objective.state == "UNEXPLORED") { objective = objective.copy(state = "ATTEMPTED"); progress = progress.copy(objectives = progress.objectives.map { if (it.objectiveKey == objective.objectiveKey) objective else it }) }
                        run = run.copy(attempts = run.attempts + Attempt(opId, e.id, e.version, action.answer, now, run.hintsUsed, first, feedback), feedback = feedback, status = "AWAITING_FEEDBACK")
                    }
                    "ACK_FEEDBACK" -> {
                        check(run.status == "AWAITING_FEEDBACK" && run.feedback != null && run.nextStep == null, "NO_FEEDBACK", "请先作答并阅读反馈")
                        check(action.nextStep != null && action.nextStep.trim().length >= 2 && action.nextStep.length <= 600, "INVALID_NEXT_STEP", "请记录下一步学习安排", 400)
                        if (run.questKind == "REVIEW") check(objective.review != null && objective.review!!.id == run.reviewCycleId && Instant.parse(now) >= Instant.parse(objective.review!!.dueAt), "REVIEW_CYCLE_CHANGED", "回访周期已在另一轮完成或尚未到期，请刷新")
                        val feedback = run.feedback!!; val strict = feedback.independentEligible
                        val delayed = strict && run.questKind == "REVIEW" && objective.review?.kind == "VALIDATION" && objective.state in listOf("INDEPENDENT", "DELAYED")
                        val kind = if (strict) if (delayed) "DELAYED" else "INDEPENDENT" else "ATTEMPTED"
                        if (kind == "DELAYED") check(objective.review != null && objective.review!!.id == run.reviewCycleId && Instant.parse(now) >= Instant.parse(objective.review!!.dueAt), "REVIEW_NOT_DUE", "回访周期或时间已变化")
                        val item = Evidence("evidence:$opId", objective.objectiveKey, kind, run.id, e.id, e.version, now, run.sources, if (feedback.kind == "SELF_REPORTED") "SELF_REPORTED" else "RULE_CHECKED", strict)
                        evidence.add(item); val rank = listOf("UNEXPLORED", "ATTEMPTED", "INDEPENDENT", "DELAYED")
                        objective = objective.copy(evidenceIds = objective.evidenceIds + item.id, state = if (rank.indexOf(kind) > rank.indexOf(objective.state)) kind else objective.state)
                        val cycle = run.reviewCycleId ?: "initial"
                        rewards.add(RewardCandidate("cycle:${objective.objectiveKey}:$cycle", "CYCLE", 10, 2, "实际作答、阅读反馈并记录下一步", item.id))
                        if (strict) rewards.add(RewardCandidate(if (kind == "DELAYED") "review:${objective.objectiveKey}:$cycle" else "independent:${objective.objectiveKey}", if (kind == "DELAYED") "REVIEW" else "INDEPENDENT", if (kind == "DELAYED") 15 else 20, if (kind == "DELAYED") 3 else 4, if (kind == "DELAYED") "到期且通过人工审核新变式的延迟验证" else "通过人工审核新变式的首次独立验证", item.id))
                        if (objective.review == null || run.questKind == "REVIEW" || strict && objective.review?.kind != "VALIDATION") {
                            val ordinal = (objective.review?.id?.substringAfterLast(':')?.toIntOrNull() ?: 0) + 1
                            objective = objective.copy(review = ReviewCycle("${objective.objectiveKey}:review:$ordinal", objective.objectiveKey, java.time.format.DateTimeFormatterBuilder().appendInstant(3).toFormatter().format(Instant.parse(now).plusSeconds(86400)), now, if (objective.state in listOf("INDEPENDENT", "DELAYED")) "VALIDATION" else "PRACTICE_FOLLOWUP"))
                        }
                        progress = progress.copy(objectives = progress.objectives.map { if (it.objectiveKey == objective.objectiveKey) objective else it })
                        if (action.saveCompanion == true && e.template == "TEACH_COMPANION") progress = progress.copy(companionMemories = progress.companionMemories + CompanionMemory("memory:$opId", objective.objectiveKey, run.attempts.last().answer.explanation!!.trim(), run.sources, now))
                        run = run.copy(nextStep = action.nextStep!!.trim())
                        if (run.exerciseIndex == run.exerciseIds.lastIndex) run = run.copy(status = "SETTLED", settledAt = now, endedAt = now)
                    }
                    "NEXT" -> { check(run.nextStep != null && run.exerciseIndex < run.exerciseIds.lastIndex, "NO_NEXT_STEP", "请先完成当前作答与反馈"); run = run.copy(exerciseIndex = run.exerciseIndex + 1, hintsUsed = 0, feedback = null, nextStep = null, status = "ACTIVE") }
                    else -> check(false, "INVALID_ACTION", "不支持的学习操作", 400)
                }
            }
        }
        return RuleResult(run.copy(revision = run.revision + 1), progress, evidence, rewards)
    }
    fun settle(previous: AccountView, candidates: List<RewardCandidate>, existing: Set<String>, now: String): Pair<AccountView, List<RewardGrant>> {
        var account = previous; var quota = if (previous.quota.day == day(now)) previous.quota else DailyQuota(day(now)); val grants = mutableListOf<RewardGrant>(); val keys = existing.toMutableSet()
        for (candidate in candidates) {
            if (!keys.add(candidate.stableKey)) continue
            val allowed = when (candidate.kind) { "SELF_REPORT" -> quota.selfReportCount < 5; "CYCLE" -> quota.cycleCount < 5; else -> true }
            val exp = if (allowed) candidate.exp else 0; val crystals = if (allowed) minOf(candidate.crystals, maxOf(0, 30 - quota.crystalsGranted)) else 0
            quota = quota.copy(cycleCount = quota.cycleCount + if (candidate.kind == "CYCLE" && allowed) 1 else 0, crystalsGranted = quota.crystalsGranted + crystals, selfReportCount = quota.selfReportCount + if (candidate.kind == "SELF_REPORT" && allowed) 1 else 0)
            var level = account.level; var xp = account.exp + exp
            while (xp >= level * 100) { xp -= level * 100; level++ }
            account = account.copy(level = level, exp = xp, crystals = account.crystals + crystals)
            grants.add(RewardGrant("grant:${candidate.stableKey}", candidate.stableKey, candidate.kind, exp, crystals, candidate.reason, candidate.sourceId, "expedition-1", now))
        }
        return account.copy(revision = account.revision + 1, quota = quota) to grants
    }
    fun decorate(previous: AccountView, action: String, id: String): Pair<AccountView, Int> {
        val decoration = decorations.firstOrNull { it.id == id }; check(decoration != null, "INVALID_DECORATION", "装饰不存在", 400)
        var account = previous; var cost = 0
        check(action in listOf("BUY", "EQUIP"), "INVALID_ACTION", "操作无效", 400)
        if (action == "BUY" && id !in account.world.ownedDecorationIds) {
            check(account.crystals >= decoration!!.price, "INSUFFICIENT_CRYSTALS", "结晶不足，仍可继续所有学习功能")
            cost = decoration.price; account = account.copy(crystals = account.crystals - cost, world = account.world.copy(ownedDecorationIds = account.world.ownedDecorationIds + id))
        }
        check(id in account.world.ownedDecorationIds, "NOT_OWNED", "尚未拥有此装饰")
        return account.copy(revision = account.revision + 1, world = account.world.copy(slot = WorldSlot(decorationId = id))) to cost
    }
    fun selfReportCanonical(input: SelfReportInput, now: String): String {
        check(input.title.trim().length >= 2 && input.title.length <= 180, "VALIDATION", "自述标题需为2至180字", 400)
        check(input.notes.length <= 2000, "VALIDATION", "自述说明最多2000字", 400)
        check(input.durationMinutes in 1..1440, "VALIDATION", "自述学习时长须为1至1440分钟", 400)
        return expeditionJson.encodeToString(kotlinx.serialization.builtins.ListSerializer(kotlinx.serialization.serializer<String>()),
            listOf(day(now), input.courseId.orEmpty(), input.title.trim(), input.notes.trim(), input.durationMinutes.toString()))
    }

    fun timing(run: RunView, now: String): SessionTiming {
        val end = Instant.parse(run.endedAt ?: run.settledAt ?: now).toEpochMilli()
        val elapsed = maxOf(0L, end - Instant.parse(run.startedAt).toEpochMilli())
        val paused = minOf(elapsed, run.pausedMs + (run.pausedAt?.let { maxOf(0L, end - Instant.parse(it).toEpochMilli()) } ?: 0L))
        return SessionTiming(now, elapsed, paused, elapsed - paused)
    }

}
