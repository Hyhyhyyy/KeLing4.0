package com.keling.app.planet

import com.keling.app.network.*
import com.keling.app.ui.screens.ai.ModelAccessSession
import io.ktor.client.engine.mock.*
import io.ktor.http.*
import io.ktor.http.content.TextContent
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class PlanetSimilarTutorTest {
    private val stamp = "2026-11-28T00:00:00Z"
    private val json = Json { encodeDefaults = true; ignoreUnknownKeys = true }
    private val headers = headersOf(HttpHeaders.ContentType, "application/json")
    private val base = PlanetQuestion("base", "比较两种含义", listOf("原义", "流行用法"), 1, "EXPLANATION_SECRET")
    private val research = PlanetResearch("grounded", "相似题独立检索", listOf(PlanetSource("practice-1", "新增证据", "https://example.org/practice", "可核对片段")), stamp, listOf("词义 辨析"))
    private fun draft() = PlanetDraft("p", "多义词", title = "语境星球", story = "比较不同语境", planetStyleIndex = 0,
        regions = listOf(PlanetRegion("r1", "原义", "比较", estimatedMinutes = 10, lesson = "这是本区课文，只提供概念。", objectives = listOf("区分语境"), questions = listOf(base)), PlanetRegion("r2", "应用", "应用", listOf("r1"), 10, "后续课文", listOf("迁移"), listOf(base.copy(id = "next")))), generatedBy = PlanetGenerator("test", "model", stamp))
    private fun record() = PlanetRecord("p", "course", draft(), createdAt = stamp, updatedAt = stamp)
    private fun supplemented(original: PlanetDraft): PlanetDraft = original.copy(regions = original.regions.mapIndexed { index, r -> if (index == 0) r.copy(questions = r.questions + listOf(
        base.copy(id = "similar-1", prompt = "新场景一", similarTo = "base", practiceResearch = research, sourceIds = listOf("practice-1")),
        base.copy(id = "similar-2", prompt = "新场景二", similarTo = "base", practiceResearch = research, sourceIds = listOf("practice-1")))) else r })

    @Test fun supplementaryAttemptsAndSelfReviewNeverRelockCompletedCoreRegions() {
        var current = answerPlanetQuestion(record(), "base", 1).planet
        current = answerPlanetQuestion(current, "next", 1).planet
        current = current.copy(draft = supplemented(current.draft))
        val coreAnswers = current.progress.answers
        assertEquals(listOf("r1", "r2"), completedPlanetRegions(current.draft, coreAnswers))
        val wrong = answerPlanetQuestion(current, "similar-1", 0).planet
        assertFalse(wrong.progress.answers.getValue("similar-1").correct)
        assertEquals(listOf("r1", "r2"), wrong.progress.completedRegionIds)
        assertEquals(coreAnswers["base"], wrong.progress.answers["base"])
        val written = base.copy(id = "similar-written", kind = "short_answer", options = emptyList(), similarTo = "base", referenceAnswer = "比较语境", rubric = listOf("区分原义"))
        val withWritten = wrong.copy(draft = wrong.draft.copy(regions = wrong.draft.regions.mapIndexed { i, r -> if (i == 0) r.copy(questions = r.questions + written) else r }))
        val submitted = answerPlanetQuestion(withWritten, written.id, PlanetResponse(text = "我先确定语境"))
        assertEquals(true, submitted.feedback.requiresSelfReview)
        assertEquals(listOf("r1", "r2"), submitted.planet.progress.completedRegionIds)
        val reviewed = answerPlanetQuestion(submitted.planet, written.id, PlanetResponse(text = "我先确定语境", selfReview = true))
        assertTrue(reviewed.planet.progress.answers.getValue(written.id).reviewed == true)
        assertFalse(reviewed.feedback.correct)
        assertTrue(answerPlanetQuestion(reviewed.planet, "base", 0).planet.progress.completedRegionIds.isEmpty())
    }

    @Test fun guestSimilarAppendPreservesSignedRawFieldsOriginalQuestionsAndCompletedAnswers() = runBlocking {
        val raw = JsonObject(json.encodeToJsonElement(PlanetDraft.serializer(), draft()).jsonObject + ("futureMetadata" to JsonPrimitive("retain-this")))
        val next = supplemented(draft())
        val nextRaw = JsonObject(json.encodeToJsonElement(PlanetDraft.serializer(), next).jsonObject + ("futureMetadata" to JsonPrimitive("retain-after-append")))
        var calls = 0
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            calls++
            assertTrue(request.url.encodedPath.endsWith("/regenerate-preview")); assertNull(request.headers[HttpHeaders.Authorization])
            val body = Json.parseToJsonElement((request.body as TextContent).text).jsonObject
            assertEquals("similar", body.getValue("kind").jsonPrimitive.content)
            assertEquals("base", body.getValue("questionId").jsonPrimitive.content)
            assertEquals(raw, body["draft"]); assertEquals("signed-original", body.getValue("draftToken").jsonPrimitive.content)
            respond(buildJsonObject { put("draft", nextRaw); put("draftToken", "signed-appended") }.toString(), HttpStatusCode.OK, headers)
        } } }
        val guest = GuestWorkspaces.create(client)
        try {
            val api = PlanetApi(guest.token, client)
            var current = api.confirm(GeneratedPlanet(draft(), "signed-original", raw), "confirm")
            current = api.answer(current.id, "base", 1, "base-answer").planet
            current = api.answer(current.id, "next", 1, "next-answer").planet
            val result = api.regenerate(current, null, "similar", "base", "联网搜索并生成两道同题型练习", "similar-request").planet!!
            assertEquals(current.progress, result.progress)
            assertEquals(base, result.draft.regions.first().questions.first())
            assertEquals(research, result.draft.regions.first().questions.last().practiceResearch)
            assertEquals(nextRaw, guest.learningPlanets.signedPreview("p").rawDraft)
            assertEquals("signed-appended", guest.learningPlanets.signedPreview("p").draftToken)
            assertEquals(1, guest.courseList().courses!!.size); assertEquals(1, calls)
        } finally { GuestWorkspaces.close(guest.token); client.close() }
    }

    @Test fun storedSimilarUsesStoredEndpointAndRejectsMissingOrForeignQuestionBeforeRequest() = runBlocking {
        var calls = 0
        val expected = record().copy(draft = supplemented(draft()))
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            calls++; assertTrue(request.url.encodedPath.endsWith("/p/regenerate"))
            assertEquals("Bearer account-token", request.headers[HttpHeaders.Authorization])
            val body = Json.parseToJsonElement((request.body as TextContent).text).jsonObject
            assertEquals("similar", body.getValue("kind").jsonPrimitive.content)
            assertFalse(body.containsKey("draft")); assertFalse(body.containsKey("draftToken"))
            respond(json.encodeToString(PlanetEnvelope.serializer(), PlanetEnvelope(expected)), HttpStatusCode.OK, headers)
        } } }
        try {
            val api = PlanetApi("account-token", client)
            assertTrue(runCatching { api.regenerate(record(), null, "similar", null, "相似题", "missing") }.isFailure)
            assertTrue(runCatching { api.regenerate(record(), null, "similar", "foreign", "相似题", "foreign") }.isFailure)
            assertEquals(expected, api.regenerate(record(), null, "similar", "base", "相似题", "append").planet)
            assertEquals(1, calls)
        } finally { client.close() }
    }

    @Test fun failedSimilarSearchLeavesOriginalGuestRecordUntouched() = runBlocking {
        val client = createApiHttpClient(MockEngine) { engine { addHandler { respond("""{"code":"RESEARCH_UNAVAILABLE","error":"搜索暂不可用"}""", HttpStatusCode.BadGateway, headers) } } }
        val guest = GuestWorkspaces.create(client)
        try {
            val api = PlanetApi(guest.token, client)
            val original = api.confirm(GeneratedPlanet(draft(), "signed-original"), "confirm")
            val answered = api.answer(original.id, "base", 1, "base-answer").planet
            assertTrue(runCatching { api.regenerate(answered, null, "similar", "base", "相似题", "fail") }.isFailure)
            assertEquals(answered, api.get(original.id))
            assertEquals("signed-original", guest.learningPlanets.signedPreview(original.id).draftToken)
        } finally { GuestWorkspaces.close(guest.token); client.close() }
    }

    @Test fun tutorPayloadUsesLessonAndQuestionOnlyNeverAnswerMetadataOrPracticeSources() {
        val question = base.copy(answerIndices = listOf(0), acceptedAnswers = listOf("ACCEPTED_SECRET"), referenceAnswer = "REFERENCE_SECRET", rubric = listOf("RUBRIC_SECRET"), practiceResearch = research, sourceIds = listOf("practice-1"))
        val history = (1..20).map { PlanetTutorTurn("提问$it", "回复$it".repeat(1000), "model") }
        val payload = planetTutorPayload(draft(), draft().regions.first(), question, "如何分辨语境？", history, "public", "model")
        val text = payload.toString()
        listOf("EXPLANATION_SECRET", "ACCEPTED_SECRET", "REFERENCE_SECRET", "RUBRIC_SECRET", "answerIndex", "answerIndices", "acceptedAnswers", "practiceResearch", "https://example.org/practice").forEach { assertFalse(it, text.contains(it)) }
        assertTrue(text.contains(base.prompt)); assertTrue(text.contains("流行用法"))
        assertEquals("CASUAL_CHAT", payload.getValue("scenario").jsonPrimitive.content)
        assertEquals("selected", payload.getValue("retrievalMode").jsonPrimitive.content)
        assertEquals(draft().regions.first().lesson, payload.getValue("sources").jsonArray.single().jsonObject.getValue("text").jsonPrimitive.content)
        assertEquals(10, payload.getValue("history").jsonArray.size)
        assertTrue(payload.getValue("history").jsonArray.sumOf { it.jsonObject.getValue("content").jsonPrimitive.content.length } <= 20000)
        assertFalse(payload.containsKey("credentials"))
    }

    @Test fun guestTutorSupportsRealAsyncProtocolWithoutSendingGuestBearer() = runBlocking {
        var chatSeen = false; var pollSeen = false
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            assertNull(request.headers[HttpHeaders.Authorization])
            if (request.url.encodedPath.endsWith("/workspace/chat")) {
                chatSeen = true
                val body = Json.parseToJsonElement((request.body as TextContent).text).jsonObject
                assertEquals("public", body.getValue("providerId").jsonPrimitive.content)
                respond("""{"jobId":"tutor_job","jobToken":"job-secret","status":"RUNNING"}""", HttpStatusCode.Accepted, headers)
            } else {
                pollSeen = true; assertTrue(request.url.encodedPath.endsWith("/ai-jobs/tutor_job"))
                assertEquals("job-secret", request.headers["X-AI-Job-Token"])
                respond("""{"status":"SUCCEEDED","result":{"answer":"先判断说话场景，再辨别用词。","model":"test-model"}}""", HttpStatusCode.OK, headers)
            }
        } } }
        val guest = GuestWorkspaces.create(client)
        try {
            val answer = PlanetApi(guest.token, client).tutor(draft(), draft().regions.first(), base, "提示第一步", emptyList(), "public", "test-model")
            assertEquals("先判断说话场景，再辨别用词。", answer.answer); assertTrue(chatSeen); assertTrue(pollSeen)
        } finally { GuestWorkspaces.close(guest.token); client.close() }
    }

    @Test fun tutorFailurePreservesInputAndRetryAddsOnlyActualResponse() = runBlocking {
        var fail = true
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            when {
                request.url.encodedPath.endsWith("/catalog") -> respond("""{"providers":[{"id":"public","name":"测试公共模型","chatModels":["model"]}]}""", HttpStatusCode.OK, headers)
                fail -> respond("""{"error":"服务不可用"}""", HttpStatusCode.ServiceUnavailable, headers)
                else -> respond("""{"answer":"先看这个词出现的场景。","model":"model"}""", HttpStatusCode.OK, headers)
            }
        } } }
        val access = ModelAccessSession()
        val controller = PlanetTutorController(PlanetApi("account-token", client), access, { draft() }, this)
        try {
            controller.loadCatalog(); withTimeout(5000) { controller.state.first { !it.catalogLoading && it.providers.isNotEmpty() } }
            controller.edit("base", "从哪开始？"); controller.send("base", false, "public", "model")
            withTimeout(5000) { controller.state.first { it.conversations["base"]?.busy == false } }
            val failed = controller.state.value.conversations.getValue("base")
            assertEquals("从哪开始？", failed.input); assertTrue(failed.turns.isEmpty()); assertNotNull(failed.error); assertFalse(failed.busy)
            fail = false; controller.send("base", false, "public", "model")
            withTimeout(5000) { controller.state.first { it.conversations["base"]?.busy == false } }
            val succeeded = controller.state.value.conversations.getValue("base")
            assertEquals("", succeeded.input); assertNull(succeeded.error)
            assertEquals("先看这个词出现的场景。", succeeded.turns.single().answer)
        } finally { controller.close(); access.close(); client.close() }
    }
}
