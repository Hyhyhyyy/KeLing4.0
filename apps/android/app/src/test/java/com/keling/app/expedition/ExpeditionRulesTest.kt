package com.keling.app.expedition

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.nio.file.Files
import java.time.Instant

class ExpeditionRulesTest {
    private val chapter = expeditionJson.decodeFromString<Chapter>(javaClass.getResource("/expedition/chapter.json")!!.readText())
    private val fixture = expeditionJson.parseToJsonElement(javaClass.getResource("/expedition/fixtures.json")!!.readText()).jsonObject
    private val now = fixture.getValue("now").jsonPrimitive.content
    private fun account() = AccountView(0, 1, 0, 0, LegacySnapshot(capturedAt = now), WorldState(), DailyQuota(ExpeditionRules.day(now)))
    private fun answer(exercise: Exercise) = ExpeditionRules.expected(exercise)

    @Test fun allSharedJudgmentFixturesMatchKotlinIncludingInputErrorsAndContainerSteps() {
        for (item in fixture.getValue("judgmentCases").jsonArray.map { it.jsonObject }) {
            val expected = item.getValue("expected").jsonObject; val id = item.getValue("id").jsonPrimitive.content
            try {
                val judged = ExpeditionRules.evaluate(chapter.exercises.first { it.id == item.getValue("exerciseId").jsonPrimitive.content }, expeditionJson.decodeFromJsonElement(item.getValue("answer")))
                assertFalse("$id should fail validation", expected.containsKey("errorCode"))
                val actual = expeditionJson.encodeToJsonElement(judged).jsonObject
                expected.forEach { (key, value) -> assertEquals("$id.$key", value, actual[key] ?: JsonNull) }
            } catch (e: ExpeditionException) { assertEquals(id, expected["errorCode"]?.jsonPrimitive?.content, e.detail.code) }
        }
    }
    @Test fun sharedLearningCycleFixtureSchedules24HoursAndNeverGrantsPendingHumanBadge() {
        val input = fixture.getValue("sequenceCases").jsonArray.first().jsonObject
        var result = ExpeditionRules.create(chapter, ExpeditionRules.progress(chapter), StartRunInput("start", "fixture-course", "EXPLORE", "bt.bfs.queue", "TRAINING", "phone"), "fixture-run", now, emptyList())
        input.getValue("actions").jsonArray.forEachIndexed { i, action -> result = ExpeditionRules.reduce(chapter, result.run, result.progress, expeditionJson.decodeFromJsonElement(action), now, "operation-$i") }
        val expected = input.getValue("expected").jsonObject
        assertEquals(expected.getValue("status").jsonPrimitive.content, result.run.status)
        assertEquals(expected.getValue("revision").jsonPrimitive.int, result.run.revision)
        assertEquals(expected.getValue("evidenceKind").jsonPrimitive.content, result.evidence.single().kind)
        assertFalse(result.evidence.single().strict)
        assertEquals(expected.getValue("rewardKey").jsonPrimitive.content, result.rewards.single().stableKey)
        val review = result.progress.objectives.first().review!!
        assertEquals(expected.getValue("dueAt").jsonPrimitive.content, review.dueAt)
        val minimum = fixture.getValue("sequenceCases").jsonArray[1].jsonObject
        try { ExpeditionRules.create(chapter, result.progress, StartRunInput("review", "fixture-course", "REVIEW", "bt.bfs.queue", "TRAINING", "phone"), "review", minimum.getValue("now").jsonPrimitive.content, emptyList()); fail("Early review") }
        catch (e: ExpeditionException) { assertEquals("REVIEW_NOT_DUE", e.detail.code) }
        val due = ExpeditionRules.create(chapter, result.progress, StartRunInput("review", "fixture-course", "REVIEW", "bt.bfs.queue", "TRAINING", "phone"), "review", review.dueAt, emptyList())
        assertEquals(review.id, due.run.reviewCycleId)
    }
    @Test fun sharedRewardFixturesCapAndDoNotRegrantTheSameCycleTomorrow() {
        val candidate = RewardCandidate("cycle:bt.bfs.queue:initial", "CYCLE", 10, 2, "test", "test")
        val duplicate = ExpeditionRules.settle(account(), listOf(candidate), setOf(candidate.stableKey), "2026-10-31T02:00:00.000Z")
        assertEquals(0, duplicate.first.exp); assertEquals(0, duplicate.first.crystals); assertTrue(duplicate.second.isEmpty())
        val daily = ExpeditionRules.settle(account(), (1..6).map { candidate.copy(stableKey = "test-$it") }, emptySet(), now)
        assertEquals(50, daily.first.exp); assertEquals(10, daily.first.crystals); assertEquals(5, daily.first.quota.cycleCount)
        assertEquals(6, daily.second.size); assertEquals(0, daily.second.last().exp)
        val capped = ExpeditionRules.settle(account().copy(quota = DailyQuota(ExpeditionRules.day(now), crystalsGranted = 29)), listOf(candidate.copy(kind = "INDEPENDENT", exp = 20, crystals = 4)), emptySet(), now)
        assertEquals(20, capped.first.exp); assertEquals(1, capped.first.crystals); assertEquals(30, capped.first.quota.crystalsGranted)
        assertEquals("2026-10-31", ExpeditionRules.day("2026-10-30T16:00:00.000Z"))
    }
    @Test fun approvedTestOnlyVariantNeedsFirstAnswerNoHintAndFreshness() {
        val approved = chapter.copy(exercises = chapter.exercises.map { it.copy(review = ContentReview(true, "APPROVED", "unit-test-only", now)) })
        val start = ExpeditionRules.create(approved, ExpeditionRules.progress(approved), StartRunInput("s", "c", "EXPLORE", "bt.bfs.queue", "INDEPENDENT", "phone"), "run", now, emptyList())
        val e = approved.exercises.first { it.id == start.run.exerciseIds.first() }
        val correct = ExpeditionRules.reduce(approved, start.run, start.progress, ExpeditionAction("SUBMIT", answer = answer(e)), now, "first")
        assertTrue(correct.run.feedback!!.independentEligible)
        val hinted = ExpeditionRules.reduce(approved, correct.run, correct.progress, ExpeditionAction("HINT"), now, "hint-after")
        assertFalse(hinted.run.feedback!!.independentEligible)
        val ack = ExpeditionRules.reduce(approved, hinted.run, hinted.progress, ExpeditionAction("ACK_FEEDBACK", nextStep = "继续练习"), now, "ack")
        assertFalse(ack.evidence.single().strict)
        val wrong = ExpeditionRules.reduce(approved, start.run, start.progress, ExpeditionAction("SUBMIT", answer = answer(e).copy(structure = "STACK")), now, "wrong")
        val corrected = ExpeditionRules.reduce(approved, wrong.run, wrong.progress, ExpeditionAction("SUBMIT", answer = answer(e)), now, "corrected")
        assertFalse(corrected.run.feedback!!.independentEligible)
        assertTrue(chapter.exercises.all { it.review.humanStatus == "PENDING" })
    }
    @Test fun guestCommandsReplayOnceSurviveTokenReissueAndRejectTakeoverBranches() = runBlocking {
        var clock = now; var open = true
        val guest = GuestExpedition(CatalogResponse(chapter, ExpeditionRules.decorations), { check(open) }, { true }, LegacySnapshot(capturedAt = now), clock = { clock })
        val started = guest.start(StartRunInput("start", "course", "EXPLORE", "bt.bfs.queue", "TRAINING", "phone"))
        val e = chapter.exercises.first { it.id == started.run.exerciseIds.first() }
        val submit = Command("answer", 0, started.writer, ExpeditionAction("SUBMIT", answer = answer(e)))
        val accepted = guest.command(started.run.id, submit)
        val writer = guest.lease(started.run.id, LeaseInput("reopen", accepted.revision, "phone", "acquire")).writer!!
        assertEquals(started.writer.epoch, writer.epoch); assertNotEquals(started.writer.token, writer.token)
        assertTrue(guest.command(started.run.id, submit.copy(writer = writer)).replayed)
        try { guest.command(started.run.id, submit.copy(writer = writer, action = ExpeditionAction("HINT"))); fail("op collision") } catch (e: ExpeditionException) { assertEquals("OPERATION_CONFLICT", e.detail.code) }
        val taken = guest.lease(started.run.id, LeaseInput("take", accepted.revision, "web", "takeover"))
        try { guest.command(started.run.id, Command("stale", accepted.revision, writer, ExpeditionAction("ACK_FEEDBACK", nextStep = "明天回访"))); fail("old writer") } catch (e: ExpeditionException) { assertEquals("VERSION_CONFLICT", e.detail.code) }
        val receipt = guest.command(started.run.id, Command("finish", taken.run.revision, taken.writer!!, ExpeditionAction("ACK_FEEDBACK", nextStep = "明天回访")))
        assertEquals(2, receipt.account.crystals); assertEquals(10, receipt.account.exp)
        clock = Instant.parse(now).plusSeconds(86400).toString()
        val second = guest.start(StartRunInput("second", "another-course", "EXPLORE", "bt.bfs.queue", "TRAINING", "phone"))
        val secondAnswer = guest.command(second.run.id, Command("answer2", 0, second.writer, ExpeditionAction("SUBMIT", answer = answer(chapter.exercises.first { it.id == second.run.exerciseIds.first() }))))
        val secondAck = guest.command(second.run.id, Command("ack2", secondAnswer.revision, second.writer, ExpeditionAction("ACK_FEEDBACK", nextStep = "重看资料")))
        assertTrue(secondAck.rewardGrants.isEmpty()); assertEquals(2, secondAck.account.crystals)
        guest.close(); open = false
        try { guest.chapter("course"); fail("closed guest") } catch (_: IllegalStateException) { }
    }
    @Test fun decorationPurchaseRetainsLegacyBalanceAndCannotMintKnowledgeOrRepeatCost() {
        val historical = account().copy(level = 3, crystals = 25, legacy = LegacySnapshot(3, 0, 25, 120, now))
        val bought = ExpeditionRules.decorate(historical, "BUY", "antenna")
        assertEquals(19, bought.first.crystals); assertEquals(6, bought.second)
        val again = ExpeditionRules.decorate(bought.first, "BUY", "antenna")
        assertEquals(19, again.first.crystals); assertEquals(0, again.second)
        assertEquals(historical.legacy, again.first.legacy)
    }
    @Test fun durableJournalRestoresOriginalBranchScopesOriginAndNeverStoresWriterSecrets() = runBlocking {
        val dir = Files.createTempDirectory("keling-expedition-test").toFile()
        try {
            val store = ExpeditionJournal.open(dir, "https://one.example/api", "account")
            val original = store.state.deviceId
            val op = PendingOperation("offline-operation", "COMMAND", "run", 7, 3, ExpeditionAction("SUBMIT", Answer(structure = "QUEUE", order = listOf("A"))))
            store.update { it.copy(pending = listOf(op), drafts = mapOf("run" to ExpeditionDraft("run", "exercise", 7, op.action!!.answer!!))) }
            store.close()
            val reopened = ExpeditionJournal.open(dir, "https://one.example/api/", "account")
            assertEquals(original, reopened.state.deviceId); assertEquals(op, reopened.state.pending.single())
            assertTrue(ExpeditionJournal.open(dir, "https://two.example/api", "account").state.pending.isEmpty())
            assertTrue(ExpeditionJournal.open(dir, "https://one.example/api", "another-account").state.pending.isEmpty())
            val persisted = File(dir, "expedition-v1").listFiles()!!.single().readText()
            assertFalse(persisted.contains("apiKey")); assertFalse(persisted.contains("token")); assertFalse(persisted.contains("Authorization"))
            try { ExpeditionJournal.open(dir, "https://one.example/api", "guest-memory:test"); fail("guest disk") } catch (_: IllegalArgumentException) { }
            reopened.close()
            try { reopened.update { it.copy(pending = emptyList()) }; fail("closed write") } catch (_: IllegalStateException) { }
        } finally {
            val resolved = dir.canonicalFile; val parent = File(requireNotNull(System.getProperty("java.io.tmpdir"))).canonicalFile
            check(resolved.parentFile == parent && resolved.name.startsWith("keling-expedition-test"))
            resolved.deleteRecursively()
        }
    }

    @Test fun sharedUtf8SelfReportAndPauseTimingFixturesMatchExactly() {
        val self = fixture.getValue("selfReportCases").jsonArray.first().jsonObject
        val canonical = ExpeditionRules.selfReportCanonical(expeditionJson.decodeFromJsonElement(self.getValue("input")), self.getValue("now").jsonPrimitive.content)
        assertEquals(self.getValue("canonical").jsonPrimitive.content, canonical)
        val hash = java.security.MessageDigest.getInstance("SHA-256").digest(canonical.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
        assertEquals(self.getValue("stableKey").jsonPrimitive.content, "self-report:$hash")
        val cap = fixture.getValue("selfReportCases").jsonArray[1].jsonObject
        val count = cap.getValue("count").jsonPrimitive.int
        val capped = ExpeditionRules.settle(account(), (1..count).map { RewardCandidate("self-$it", "SELF_REPORT", 2, 0, "fixture", "record-$it") }, emptySet(), now)
        val expected = cap.getValue("expected").jsonObject
        assertEquals(expected.getValue("exp").jsonPrimitive.int, capped.first.exp)
        assertEquals(expected.getValue("selfReportCount").jsonPrimitive.int, capped.first.quota.selfReportCount)
        assertEquals(expected.getValue("grants").jsonPrimitive.int, capped.second.size)
        fixture.getValue("timingCases").jsonArray.forEach { raw ->
            val item = raw.jsonObject
            var result = ExpeditionRules.create(chapter, ExpeditionRules.progress(chapter), StartRunInput("fixture-time", "course", "EXPLORE", "bt.bfs.queue", "TRAINING", "phone"), "fixture-run", item.getValue("startedAt").jsonPrimitive.content, emptyList())
            item.getValue("actions").jsonArray.forEachIndexed { i, rawAction -> val action = rawAction.jsonObject
                result = ExpeditionRules.reduce(chapter, result.run, result.progress, ExpeditionAction(action.getValue("type").jsonPrimitive.content), action.getValue("at").jsonPrimitive.content, "time-$i")
            }
            val timing = expeditionJson.encodeToJsonElement(ExpeditionRules.timing(result.run, item.getValue("observedAt").jsonPrimitive.content)).jsonObject
            item.getValue("expected").jsonObject.forEach { (key, value) -> assertEquals(value, timing[key]) }
        }
    }
}
