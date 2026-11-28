package com.keling.app.planet

import com.keling.app.network.*
import io.ktor.client.engine.mock.*
import io.ktor.http.*
import io.ktor.http.content.TextContent
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

class PlanetTopicTest {
    private val stamp = "2026-11-28T00:00:00Z"
    private val questions = listOf(
        PlanetQuestion("single", "单选", listOf("甲", "乙"), 1, "乙符合资料"),
        PlanetQuestion("multiple", "多选", listOf("甲", "乙", "丙"), explanation = "甲、丙符合资料", kind = "multiple_choice", answerIndices = listOf(0, 2)),
        PlanetQuestion("boolean", "判断", listOf("正确", "错误"), 0, "本题正确", "true_false"),
        PlanetQuestion("blank", "填空", explanation = "输入约定词", kind = "fill_blank", acceptedAnswers = listOf("AI culture", "网络文化")),
        PlanetQuestion("order", "排序", listOf("回看", "检索", "比较"), explanation = "先检索再比较最后回看", kind = "ordering", answerIndices = listOf(1, 2, 0)),
        PlanetQuestion("written", "解释语境差异", explanation = "比较原义和流行用法", kind = "short_answer", referenceAnswer = "原义和流行用法需要不同证据。", rubric = listOf("说明原义", "说明流行用法", "区分证据"))
    )
    private fun record() = PlanetRecord("topic-test", "course-test", PlanetDraft("topic-test", "抽象词", title = "语境星球", story = "比较不同含义。", planetStyleIndex = 0,
        regions = listOf(PlanetRegion("r1", "比较", "探索语境", estimatedMinutes = 15, lesson = "按照资料辨认含义", objectives = listOf("区分语境"), questions = questions),
            PlanetRegion("r2", "应用", "练习用法", listOf("r1"), 15, "应用已有理解", listOf("应用"), listOf(questions.first().copy(id = "next")))),
        generatedBy = PlanetGenerator("test", "test", stamp)), createdAt = stamp, updatedAt = stamp)

    @Test fun objectiveKindsCompareSetsOrdersAndNormalizedAcceptedAnswersWithoutFuzzyGrading() {
        val original = record()
        assertTrue(answerPlanetQuestion(original, "single", 1).feedback.correct)
        assertTrue(answerPlanetQuestion(original, "multiple", PlanetResponse(selectedIndices = listOf(2, 0))).feedback.correct)
        assertFalse(answerPlanetQuestion(original, "multiple", PlanetResponse(selectedIndices = listOf(0))).feedback.correct)
        assertTrue(runCatching { answerPlanetQuestion(original, "multiple", PlanetResponse(selectedIndices = listOf(0, 0, 2))) }.isFailure)
        assertTrue(answerPlanetQuestion(original, "boolean", 0).feedback.correct)
        assertTrue(answerPlanetQuestion(original, "blank", PlanetResponse(text = "  ＡＩ   CULTURE  ")).feedback.correct)
        assertFalse(answerPlanetQuestion(original, "blank", PlanetResponse(text = "AI cultures")).feedback.correct)
        assertTrue(answerPlanetQuestion(original, "order", PlanetResponse(orderedIndices = listOf(1, 2, 0))).feedback.correct)
        assertFalse(answerPlanetQuestion(original, "order", PlanetResponse(orderedIndices = listOf(0, 1, 2))).feedback.correct)
        assertTrue(runCatching { answerPlanetQuestion(original, "order", PlanetResponse(orderedIndices = listOf(1, 1, 0))) }.isFailure)
    }

    @Test fun writtenAnswerRequiresSeparateUnchangedSelfReviewAndNeverClaimsObjectiveCorrectness() {
        val original = record()
        val text = "我分别考察原作与网络语境，比较不同来源。"
        assertTrue(runCatching { answerPlanetQuestion(original, "written", PlanetResponse(text = text, selfReview = true)) }.isFailure)
        var next = original
        listOf("single" to PlanetResponse(selectedIndex = 1), "multiple" to PlanetResponse(selectedIndices = listOf(0, 2)), "boolean" to PlanetResponse(selectedIndex = 0), "blank" to PlanetResponse(text = "网络文化"), "order" to PlanetResponse(orderedIndices = listOf(1, 2, 0))).forEach { (id, response) -> next = answerPlanetQuestion(next, id, response).planet }
        val submitted = answerPlanetQuestion(next, "written", PlanetResponse(text = text))
        assertFalse(submitted.feedback.correct); assertEquals(true, submitted.feedback.requiresSelfReview)
        assertTrue(submitted.planet.progress.completedRegionIds.isEmpty())
        assertTrue(runCatching { answerPlanetQuestion(submitted.planet, "next", 1) }.isFailure)
        assertTrue(runCatching { answerPlanetQuestion(submitted.planet, "written", PlanetResponse(text = "改变了回答", selfReview = true)) }.isFailure)
        val reviewed = answerPlanetQuestion(submitted.planet, "written", PlanetResponse(text = text, selfReview = true))
        assertFalse(reviewed.feedback.correct); assertEquals(true, reviewed.planet.progress.answers["written"]!!.reviewed)
        assertEquals(listOf("r1"), reviewed.planet.progress.completedRegionIds)
        val nextRegion = answerPlanetQuestion(reviewed.planet, "next", 1)
        assertTrue(nextRegion.feedback.correct); assertEquals(listOf("r1", "r2"), nextRegion.planet.progress.completedRegionIds)
        val edited = answerPlanetQuestion(nextRegion.planet, "written", PlanetResponse(text = "重新理解并回答"))
        assertEquals(false, edited.planet.progress.answers["written"]!!.reviewed)
        assertTrue(edited.planet.progress.completedRegionIds.isEmpty())
    }

    @Test fun structuralResponsesPreserveIdempotenceAndRejectReceiptReuse() {
        val store = GuestPlanetStore {}
        val original = record()
        store.add(original.draft) { "course" }
        val response = PlanetResponse(selectedIndices = listOf(2, 0))
        val first = store.answer(original.id, "multiple", response, "request-one")
        assertEquals(first, store.answer(original.id, "multiple", response, "request-one"))
        assertEquals(1, first.planet.progress.answers["multiple"]!!.attempts)
        assertTrue(runCatching { store.answer(original.id, "multiple", PlanetResponse(selectedIndices = listOf(0)), "request-one") }.isFailure)
    }

    @Test fun sourceLinksRejectScriptAndCredentialUrls() {
        assertEquals("https://example.org/source", planetSourceLink("https://example.org/source"))
        assertNull(planetSourceLink("javascript:alert(1)"))
        assertNull(planetSourceLink("file:///etc/passwd"))
        assertNull(planetSourceLink("https://user:secret@example.org/source"))
        assertNull(planetSourceLink("not a URL"))
        assertEquals("http://example.org/source", planetSourceLink("http://example.org/source"))
        assertNull(planetArtworkLink("http://example.org/planet.png"))
        assertNull(planetArtworkLink("https://127.0.0.1/planet.png"))
        assertNull(planetArtworkLink("https://host.internal/planet.png"))
        assertEquals("https://cdn.example.org/planet.png", planetArtworkLink("https://cdn.example.org/planet.png"))
    }

    @Test fun generationOptionsAndRichAnswerAreSentAsExplicitStructuredFields() = runBlocking {
        val headers = headersOf(HttpHeaders.ContentType, "application/json")
        val json = Json { encodeDefaults = true }
        var generationSeen = false; var answerSeen = false
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            val body = Json.parseToJsonElement((request.body as TextContent).text).jsonObject
            if (request.url.encodedPath.endsWith("/generate")) {
                generationSeen = true
                assertEquals("internet_culture", body["contextMode"]!!.jsonPrimitive.content)
                assertEquals(18, body["questionCount"]!!.jsonPrimitive.int)
                respond(json.encodeToString(GeneratedPlanet.serializer(), GeneratedPlanet(record().draft, "signed-token")), HttpStatusCode.OK, headers)
            } else {
                answerSeen = true
                assertEquals(setOf("questionId", "clientRequestId", "selectedIndices"), body.keys)
                assertEquals(listOf(0, 2), body["selectedIndices"]!!.jsonArray.map { it.jsonPrimitive.int })
                respond(json.encodeToString(PlanetAnswerResult.serializer(), answerPlanetQuestion(record(), "multiple", PlanetResponse(selectedIndices = listOf(0, 2)))), HttpStatusCode.OK, headers)
            }
        } } }
        try {
            val api = PlanetApi("test-token", client)
            api.generate(GeneratePlanetInput("奶龙学", contextMode = "internet_culture", questionCount = 18))
            api.answer(record().id, "multiple", PlanetResponse(selectedIndices = listOf(0, 2)), "answer-request")
            assertTrue(generationSeen); assertTrue(answerSeen)
        } finally { client.close() }
    }

    @Test fun signedConfirmationPreservesRequiredDefaultsAndOptionalProvenanceWithoutInventingNulls() = runBlocking {
        val research = PlanetResearch("grounded", "比较语境", listOf(PlanetSource("s1", "资料", "https://example.org/source", "引用片段")), stamp, listOf("词语 多义"), "来源概述")
        val original = record().copy(draft = record().draft.copy(research = research, meaningAnalysis = PlanetMeaningAnalysis("有不同语境", listOf(PlanetMeaning("原义", "原本含义", "原作")), listOf("比较用法"), listOf("不可推断所有群体")), artwork = PlanetArtwork("generated", "主题像素星球", "https://example.org/planet.png", "test-art", stamp)))
        val headers = headersOf(HttpHeaders.ContentType, "application/json")
        var inspected = false
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            val body = Json.parseToJsonElement((request.body as TextContent).text).jsonObject
            val d = body["draft"]!!.jsonObject
            assertEquals("UNREVIEWED", d["reviewStatus"]!!.jsonPrimitive.content)
            assertEquals(JsonArray(emptyList()), d["regions"]!!.jsonArray.first().jsonObject["prerequisiteIds"])
            assertEquals("来源概述", d["research"]!!.jsonObject["summary"]!!.jsonPrimitive.content)
            assertFalse(d["research"]!!.jsonObject["sources"]!!.jsonArray.first().jsonObject.containsKey("publishedAt"))
            assertEquals("https://example.org/planet.png", d["artwork"]!!.jsonObject["url"]!!.jsonPrimitive.content)
            assertEquals("原义", d["meaningAnalysis"]!!.jsonObject["interpretations"]!!.jsonArray.first().jsonObject["label"]!!.jsonPrimitive.content)
            assertFalse(d["regions"]!!.jsonArray.first().jsonObject.containsKey("sourceIds"))
            inspected = true
            respond(Json.encodeToString(PlanetEnvelope.serializer(), PlanetEnvelope(original)), HttpStatusCode.OK, headers)
        } } }
        try { assertEquals(original, PlanetApi("test-token", client).confirm(GeneratedPlanet(original.draft, "signed-test-token"), "confirm-new")); assertTrue(inspected) }
        finally { client.close() }
    }

    @Test fun guestRegenerationUsesSignedPreviewAndReplacesOnlyChangedQuestionInMemory() = runBlocking {
        val original = record()
        val replacement = original.draft.copy(regions = original.draft.regions.mapIndexed { i, r -> if (i == 0) r.copy(questions = r.questions.map { if (it.id == "single") it.copy(id = "single-v2", prompt = "新的单选题") else it }) else r })
        var requestSeen = false
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            assertTrue(request.url.encodedPath.endsWith("/regenerate-preview")); assertNull(request.headers[HttpHeaders.Authorization])
            val body = Json.parseToJsonElement((request.body as TextContent).text).jsonObject
            assertEquals("question", body["kind"]!!.jsonPrimitive.content)
            assertEquals("signed-original", body["draftToken"]!!.jsonPrimitive.content)
            assertEquals("single", body["questionId"]!!.jsonPrimitive.content)
            assertEquals("增加生活语境", body["instruction"]!!.jsonPrimitive.content)
            requestSeen = true
            respond(Json.encodeToString(GeneratedPlanet.serializer(), GeneratedPlanet(replacement, "signed-replacement")), HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
        } } }
        val guest = GuestWorkspaces.create(client)
        try {
            val api = PlanetApi(guest.token, client)
            var current = api.confirm(GeneratedPlanet(original.draft, "signed-original"), "confirm-original")
            current = api.answer(current.id, "single", 1, "single-old").planet
            current = api.answer(current.id, "boolean", 0, "boolean-old").planet
            val next = api.regenerate(current, null, "question", "single", "增加生活语境", "regen-1").planet!!
            assertTrue(requestSeen); assertFalse(next.progress.answers.containsKey("single"))
            assertTrue(next.progress.answers["boolean"]!!.correct)
            assertEquals("single-v2", next.draft.regions.first().questions.first().id)
            assertEquals("signed-replacement", guest.learningPlanets.signedPreview(current.id).draftToken)
            assertEquals(1, guest.courseList().courses!!.size)
        } finally { GuestWorkspaces.close(guest.token); client.close() }
    }

    @Test fun regenerationFailurePreservesGuestDraftAndAnswers() = runBlocking {
        val client = createApiHttpClient(MockEngine) { engine { addHandler { respond("""{"code":"MODEL_FAILED","error":"生成失败"}""", HttpStatusCode.BadGateway, headersOf(HttpHeaders.ContentType, "application/json")) } } }
        val guest = GuestWorkspaces.create(client)
        try {
            val api = PlanetApi(guest.token, client)
            val original = api.confirm(GeneratedPlanet(record().draft, "signed-original"), "confirm-original")
            val answered = api.answer(original.id, "single", 1, "answer-original").planet
            assertTrue(runCatching { api.regenerate(answered, null, "artwork", null, "增加星环", "regen-fail") }.isFailure)
            assertEquals(answered, api.get(original.id)); assertEquals("signed-original", guest.learningPlanets.signedPreview(original.id).draftToken)
        } finally { GuestWorkspaces.close(guest.token); client.close() }
    }

    @Test fun dynamicGraphKeepsAllNodesAndTypedEdgesAndGuestConfirmationUsesActualGraph() = runBlocking {
        val graph = PlanetKnowledgeGraph((1..7).map { PlanetKnowledgeNode("n$it", "知识$it", "第${it}个概念的依据", emptyList()) }, listOf(
            PlanetKnowledgeEdge("n1", "n2", "包含", "hierarchy"), PlanetKnowledgeEdge("n1", "n3", "包含", "hierarchy"), PlanetKnowledgeEdge("n2", "n4", "应用", "hierarchy"), PlanetKnowledgeEdge("n4", "n5", "细分", "hierarchy"), PlanetKnowledgeEdge("n3", "n6", "实例", "hierarchy"), PlanetKnowledgeEdge("n1", "n7", "另一个分支", "hierarchy"), PlanetKnowledgeEdge("n5", "n6", "对比", "related")))
        val draft = record().draft.copy(knowledgeGraph = graph)
        val preview = planetPreviewGraph(draft)!!
        assertEquals(7, preview.nodes.size); assertEquals(7, preview.edges!!.size)
        assertEquals(listOf("n2", "n3", "n7"), preview.nodes.first().childIds)
        assertEquals(listOf("n3"), preview.nodes.find { it.id == "n6" }!!.parentIds)
        assertEquals("对比", preview.edges!!.last().label); assertEquals("related", preview.edges!!.last().kind)
        assertTrue(runCatching { planetPreviewGraph(draft.copy(knowledgeGraph = graph.copy(edges = graph.edges + PlanetKnowledgeEdge("missing", "n1", "错误", "related")))) }.isFailure)
        val client = createApiHttpClient(MockEngine) { engine { addHandler { error("Guest graph confirmation stays local") } } }
        val guest = GuestWorkspaces.create(client)
        try {
            val planet = PlanetApi(guest.token, client).confirm(GeneratedPlanet(draft, "signed-graph"), "graph-confirm")
            val saved = guest.graphDocument(planet.courseId)
            assertEquals(7, saved.nodes.size)
            assertEquals(6, saved.nodes.sumOf { it.parentIds.size })
            assertEquals(graph, planet.draft.knowledgeGraph)
        } finally { GuestWorkspaces.close(guest.token); client.close() }
    }

    @Test fun generatedSignedJsonIsPassedThroughIncludingUnknownOptionalServerFields() = runBlocking {
        val raw = Json.encodeToJsonElement(PlanetDraft.serializer(), record().draft).jsonObject.toMutableMap().apply { put("futureMetadata", buildJsonObject { put("value", "must-stay-intact") }) }.let(::JsonObject)
        var calls = 0
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            calls++
            if (request.url.encodedPath.endsWith("/generate")) respond(buildJsonObject { put("draft", raw); put("draftToken", "signed-exact-json") }.toString(), HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
            else {
                val sent = Json.parseToJsonElement((request.body as TextContent).text).jsonObject
                assertEquals(raw, sent["draft"])
                respond(Json.encodeToString(PlanetEnvelope.serializer(), PlanetEnvelope(record())), HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
            }
        } } }
        try { val api = PlanetApi("test-token", client); val result = api.generate(GeneratePlanetInput("抽象词")); api.confirm(result, "confirm-exact"); assertEquals(2, calls) }
        finally { client.close() }
    }
}
