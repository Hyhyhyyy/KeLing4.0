package com.keling.app.expedition

import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant

class ExpeditionRecoveryTest {
    private val chapter = expeditionJson.decodeFromString<Chapter>(javaClass.getResource("/expedition/chapter.json")!!.readText())
    private val time = "2026-10-30T02:00:00.000Z"
    private fun guest(clock: () -> String = { time }, report: (SelfReportRecord) -> Unit = {}) =
        GuestExpedition(CatalogResponse(chapter, ExpeditionRules.decorations), {}, { true }, LegacySnapshot(capturedAt = time), onSelfReport = report, clock = clock)
    private suspend fun start(api: GuestExpedition, kind: String = "EXPLORE") = api.start(StartRunInput("start", "course", kind, "bt.bfs.queue", "TRAINING", "phone"))

    @Test fun restartReceiptProbeWorksDespiteAnotherDevicesTakeover() = runBlocking {
        val api = guest(); val started = start(api)
        val exercise = chapter.exercises.first { it.id == started.run.exerciseIds.first() }
        val action = ExpeditionAction("SUBMIT", ExpeditionRules.expected(exercise))
        val receipt = api.command(started.run.id, Command("answer", 0, started.writer, action))
        val other = api.lease(started.run.id, LeaseInput("takeover", 1, "web", "takeover"))
        val current = api.command(started.run.id, Command("ack", other.run.revision, other.writer!!, ExpeditionAction("ACK_FEEDBACK", nextStep = "明天回访")))
        val replay = replayPreservedCommand(api, PendingOperation("answer", "COMMAND", started.run.id, 0, 1, action), "phone", null) { fail("Must not acquire for an existing receipt") }
        assertTrue(replay.replayed); assertEquals(receipt.revision, replay.revision)
        assertTrue(api.run(started.run.id).run.revision > replay.revision)
        assertEquals(current.account, api.rewards().account)
    }

    @Test fun unsubmittedOutboxReSignsAliveLeaseButExpiredEpochIsPreserved() = runBlocking {
        var now = time; val api = guest({ now }); val started = start(api)
        val pending = PendingOperation("hint", "COMMAND", started.run.id, 0, 1, ExpeditionAction("HINT"))
        var reissued: Writer? = null
        val receipt = replayPreservedCommand(api, pending, "phone", null) { reissued = it }
        assertNotNull(reissued); assertEquals(1, receipt.run.hintsUsed); assertEquals(1, reissued!!.epoch)
        now = Instant.parse(time).plusSeconds(121).toString()
        val next = PendingOperation("hint-after-expiry", "COMMAND", started.run.id, 1, 1, ExpeditionAction("HINT"))
        try { replayPreservedCommand(api, next, "phone", null) {}; fail("Cannot transplant expired branch") }
        catch (e: ExpeditionException) { assertEquals("DRAFT_REVISION_CHANGED", e.detail.code) }
        assertEquals(1, api.run(started.run.id).run.hintsUsed)
    }

    @Test fun selfReportsUseCanonicalDeduplicationDailyCapsAndNoKnowledgeGrant() = runBlocking {
        var total = 0; var now = time
        val api = guest({ now }) { total += it.durationMinutes }
        val input = SelfReportInput("report", "course", " 阅读教材 ", " 我的笔记 ", 25)
        assertEquals("[\"2026-10-30\",\"course\",\"阅读教材\",\"我的笔记\",\"25\"]", ExpeditionRules.selfReportCanonical(input, now))
        val first = api.selfReport(input); assertEquals(2, first.account.exp); assertEquals(0, first.account.crystals)
        assertTrue(api.selfReport(input).replayed)
        assertTrue(api.selfReport(input.copy(opId = "same-content")).alreadyRecorded); assertEquals(25, total)
        for (i in 2..6) api.selfReport(input.copy(opId = "report-$i", title = "阅读第${i}章"))
        val capped = api.rewards(); assertEquals(10, capped.account.exp); assertEquals(5, capped.account.quota.selfReportCount)
        assertEquals(0, capped.grants.last().exp); assertEquals(150, total)
        assertTrue(api.chapter("course").progress.state.objectives.all { it.state == "UNEXPLORED" })
        now = Instant.parse(time).plusSeconds(86400).toString()
        assertEquals(12, api.selfReport(input.copy(opId = "next-day")).account.exp)
        assertEquals(1, api.rewards().account.quota.selfReportCount)
    }

    @Test fun companionEditsAndDeletionAreVersionedAndNeverUpgradeEvidence() = runBlocking {
        val api = guest(); val started = start(api, "TEACH")
        val answer = api.command(started.run.id, Command("answer", 0, started.writer, ExpeditionAction("SUBMIT", Answer(explanation = "队列先放入的节点先取出，访问后从左到右加入孩子。"))))
        val settled = api.command(started.run.id, Command("ack", answer.revision, started.writer, ExpeditionAction("ACK_FEEDBACK", nextStep = "用新例子再推演", saveCompanion = true)))
        val memory = settled.progress.state.companionMemories.single()
        val edit = MemoryCommand("edit", settled.progress.revision, memory.id, "UPDATE", "修订：队列使用先进先出的规则来逐层访问所有节点。")
        val updated = api.memory(settled.progress.id, edit)
        assertTrue(api.memory(settled.progress.id, edit).replayed)
        try { api.memory(settled.progress.id, edit.copy(opId = "stale")); fail("Expected stale version") } catch (e: ExpeditionException) { assertEquals("VERSION_CONFLICT", e.detail.code) }
        val deleted = api.memory(settled.progress.id, MemoryCommand("delete", updated.progress.revision, memory.id, "DELETE"))
        assertEquals("", deleted.progress.state.companionMemories.single().text)
        assertNotNull(deleted.progress.state.companionMemories.single().deletedAt)
        assertEquals("ATTEMPTED", deleted.progress.state.objectives.first().state)
        assertEquals(settled.account, api.rewards().account)
    }

    @Test fun simultaneousDueReviewsCannotAdvanceTheSameCycleTwice() = runBlocking {
        var now = time; val api = guest({ now }); val first = start(api)
        suspend fun submit(run: StartRunResponse, id: String): Receipt {
            val exercise = chapter.exercises.first { it.id == run.run.exerciseIds.first() }
            return api.command(run.run.id, Command(id, 0, run.writer, ExpeditionAction("SUBMIT", ExpeditionRules.expected(exercise))))
        }
        val answer = submit(first, "first-answer")
        assertEquals("ATTEMPTED", answer.progress.state.objectives.first().state)
        api.command(first.run.id, Command("first-ack", answer.revision, first.writer, ExpeditionAction("ACK_FEEDBACK", nextStep = "明天回访")))
        now = Instant.parse(time).plusSeconds(86400).toString()
        val one = api.start(StartRunInput("review-one", "course", "REVIEW", "bt.bfs.queue", "TRAINING", "phone"))
        val two = api.start(StartRunInput("review-two", "course", "REVIEW", "bt.bfs.queue", "TRAINING", "phone"))
        val a = submit(one, "review-answer-one"); val b = submit(two, "review-answer-two")
        api.command(one.run.id, Command("review-ack-one", a.revision, one.writer, ExpeditionAction("ACK_FEEDBACK", nextStep = "再来练习")))
        try { api.command(two.run.id, Command("review-ack-two", b.revision, two.writer, ExpeditionAction("ACK_FEEDBACK", nextStep = "再来练习"))); fail("Cycle already advanced") }
        catch (e: ExpeditionException) { assertEquals("REVIEW_CYCLE_CHANGED", e.detail.code) }
        assertEquals(4, api.rewards().account.crystals)
    }

    @Test fun pauseResumeCancelTimingMatchesWallClockWithoutWritingStudyOrRewards() = runBlocking {
        var now = time; var recorded = 0
        val api = guest({ now }) { recorded += it.durationMinutes }; val started = start(api)
        now = Instant.parse(time).plusSeconds(60).toString()
        val paused = api.command(started.run.id, Command("pause", 0, started.writer, ExpeditionAction("PAUSE")))
        now = Instant.parse(time).plusSeconds(90).toString()
        val reading = api.run(started.run.id).run.timing!!
        assertEquals(90000L, reading.elapsedMs); assertEquals(30000L, reading.pausedMs); assertEquals(60000L, reading.runningMs)
        val resumed = api.command(started.run.id, Command("resume", paused.revision, started.writer, ExpeditionAction("RESUME")))
        now = Instant.parse(time).plusSeconds(100).toString()
        api.command(started.run.id, Command("cancel", resumed.revision, started.writer, ExpeditionAction("CANCEL")))
        now = Instant.parse(time).plusSeconds(400).toString()
        val ended = api.run(started.run.id).run.timing!!
        assertEquals(100000L, ended.elapsedMs); assertEquals(30000L, ended.pausedMs)
        assertEquals(0, recorded); assertTrue(api.rewards().grants.isEmpty())
    }

    @Test fun guestPurchasesCreateNegativeLedgerAndSelfReportPagesRetainEarlierRecords() = runBlocking {
        val api = GuestExpedition(CatalogResponse(chapter, ExpeditionRules.decorations), {}, { true }, LegacySnapshot(crystals = 25, capturedAt = time), clock = { time })
        val bought = api.base(BaseCommand("purchase", 0, "antenna", "BUY"))
        val grant = requireNotNull(bought.grant); assertEquals(-6, grant.crystals); assertEquals("PURCHASE", grant.kind)
        assertTrue(api.base(BaseCommand("purchase", 0, "antenna", "BUY")).replayed)
        assertEquals(1, api.rewards().grants.size); assertEquals(19, api.rewards().account.crystals)
        for (i in 1..51) api.selfReport(SelfReportInput("report-$i", title = "线下内容$i", durationMinutes = 1))
        val first = api.selfReports(); assertEquals(50, first.records.size); assertNotNull(first.nextCursor)
        val last = api.selfReports(first.nextCursor); assertEquals(1, last.records.size); assertNull(last.nextCursor)
        assertEquals(51, (first.records + last.records).map { it.id }.distinct().size)
        try { api.selfReports("unknown"); fail("Unknown cursor") } catch (e: ExpeditionException) { assertEquals(404, e.status) }
    }

    @Test fun firstApprovedFollowupCreatesIndependentEvidenceBeforeDelayedValidation() {
        val reviewed = chapter.copy(exercises = chapter.exercises.map { it.copy(review = ContentReview(true, "APPROVED", "test-only", time)) })
        val followup = ReviewCycle("bt.bfs.queue:review:1", "bt.bfs.queue", time, Instant.parse(time).minusSeconds(86400).toString(), "PRACTICE_FOLLOWUP")
        val progress = ExpeditionRules.progress(reviewed).let { it.copy(objectives = it.objectives.map { o -> if (o.objectiveKey == "bt.bfs.queue") o.copy(state = "ATTEMPTED", review = followup) else o }) }
        val start = ExpeditionRules.create(reviewed, progress, StartRunInput("start", "course", "REVIEW", "bt.bfs.queue", "INDEPENDENT", "phone"), "run", time, emptyList())
        val exercise = reviewed.exercises.first { it.id == start.run.exerciseIds.first() }
        val answer = ExpeditionRules.reduce(reviewed, start.run, start.progress, ExpeditionAction("SUBMIT", ExpeditionRules.expected(exercise)), time, "answer")
        val result = ExpeditionRules.reduce(reviewed, answer.run, answer.progress, ExpeditionAction("ACK_FEEDBACK", nextStep = "明天再验证"), time, "ack")
        assertEquals("INDEPENDENT", result.evidence.single().kind)
        assertEquals("VALIDATION", result.progress.objectives.first().review!!.kind)
        assertEquals(Instant.parse(time).plusSeconds(86400), Instant.parse(result.progress.objectives.first().review!!.dueAt))
        assertFalse(result.rewards.any { it.kind == "REVIEW" })
    }

    @Test fun leasesReplayWithoutExtraRevisionAndRejectStaleRenewOrClosedRuns() = runBlocking {
        var now = time; val api = guest({ now }); val input = StartRunInput("start", "course", "EXPLORE", "bt.bfs.queue", "TRAINING", "phone")
        val started = api.start(input); val reopened = api.start(input)
        assertNotEquals(started.writer.token, reopened.writer.token); assertEquals(started.run.revision, reopened.run.revision)
        try { api.lease(started.run.id, LeaseInput("bad-renew", 0, "phone", "renew", started.writer)); fail("Old token") } catch (e: ExpeditionException) { assertEquals("WRITER_CHANGED", e.detail.code) }
        val take = LeaseInput("take", 0, "web", "takeover")
        val taken = api.lease(started.run.id, take); assertEquals(1, taken.run.revision); assertEquals(2, taken.run.leaseEpoch)
        val replayed = api.lease(started.run.id, take); assertEquals(taken.run.revision, replayed.run.revision); assertEquals(taken.run.leaseEpoch, replayed.run.leaseEpoch)
        val release = LeaseInput("release", replayed.run.revision, "web", "release", replayed.writer)
        val released = api.lease(started.run.id, release); assertEquals(2, released.run.revision); assertEquals(3, released.run.leaseEpoch)
        assertEquals(released, api.lease(started.run.id, release))
        try { api.lease(started.run.id, take); fail("Replaced old takeover") } catch (e: ExpeditionException) { assertEquals("WRITER_CHANGED", e.detail.code) }
        val acquired = api.lease(started.run.id, LeaseInput("acquire", released.run.revision, "phone", "acquire"))
        val ended = api.command(started.run.id, Command("end", acquired.run.revision, acquired.writer!!, ExpeditionAction("CANCEL")))
        try { api.lease(started.run.id, LeaseInput("closed", ended.run.revision, "phone", "acquire")); fail("Closed run") } catch (e: ExpeditionException) { assertEquals("RUN_CLOSED", e.detail.code) }
        now = Instant.parse(time).plusSeconds(121).toString()
        try { api.start(input); fail("Expired start replay") } catch (e: ExpeditionException) { assertEquals("WRITER_CHANGED", e.detail.code) }
    }

    @Test fun seenVariantsSpanCoursesAndRemovedCourseCannotMintNewRewards() = runBlocking {
        var owned = true
        val api = GuestExpedition(CatalogResponse(chapter, ExpeditionRules.decorations), {}, { owned }, LegacySnapshot(capturedAt = time), clock = { time })
        val first = api.start(StartRunInput("one", "course-one", "EXPLORE", "bt.bfs.queue", "INDEPENDENT", "phone"))
        val second = api.start(StartRunInput("two", "course-two", "EXPLORE", "bt.bfs.queue", "INDEPENDENT", "phone"))
        assertNotEquals(first.run.exerciseIds.first(), second.run.exerciseIds.first())
        val action = ExpeditionAction("HINT")
        val old = Command("old", 0, first.writer, action); api.command(first.run.id, old)
        owned = false
        assertTrue(api.command(first.run.id, old).replayed)
        try { api.command(second.run.id, Command("new", 0, second.writer, action)); fail("Removed course") } catch (e: ExpeditionException) { assertEquals(404, e.status) }
        assertTrue(api.rewards().grants.isEmpty())
    }
}
