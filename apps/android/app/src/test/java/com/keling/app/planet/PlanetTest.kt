package com.keling.app.planet

import com.keling.app.network.*
import io.ktor.client.engine.mock.*
import io.ktor.http.*
import io.ktor.http.content.TextContent
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

class PlanetTest {
    private val json = Json { encodeDefaults = true }
    private val headers = headersOf(HttpHeaders.ContentType, "application/json")
    private fun draft() = PlanetDraft("planet-math", "微积分", "入门", "理解变化率", "变化率星球", "从一段路程出发。", 1,
        (1..3).map { i -> PlanetRegion("r$i", "区域$i", "学习变化", if (i == 1) emptyList() else listOf("r${i - 1}"), 15,
            "平均变化率是因变量的增量除以自变量的增量。", listOf("计算变化率"), listOf(PlanetQuestion("q$i", "距离由2变4，时间由1变2，平均速率是多少？", listOf("1", "2", "4"), 1, "距离增量2除以时间增量1等于2。"))) },
        generatedBy = PlanetGenerator("test", "test-model", "2026-11-27T00:00:00Z"))
    private fun generated() = GeneratedPlanet(draft(), "signed-test-draft")

    @Test fun freshGuestIsEmptyAndPlanetConfirmationProgressAreIsolatedIdempotentAndEphemeral() = runBlocking {
        val client = createApiHttpClient(MockEngine) { engine { addHandler { error("Guest confirmation and progress must stay in memory") } } }
        val first = GuestWorkspaces.create(client); val other = GuestWorkspaces.create(client)
        try {
            assertTrue(first.courseList().courses!!.isEmpty()); assertTrue(first.learningPlanets.list().isEmpty())
            val api = PlanetApi(first.token, client)
            val planet = api.confirm(generated(), "confirm-123")
            assertEquals(planet.id, api.confirm(generated(), "confirm-123").id)
            assertEquals(1, first.courseList().courses!!.size)
            assertEquals("AI_PLANET", first.courseList().courses!!.single().code)
            assertTrue(com.keling.app.expedition.legacyExpeditionCourses(first.courseList().courses!!).isEmpty())
            assertEquals(3, first.sourceList(planet.courseId).nodes.size)
            assertEquals(1, first.taskList().tasks!!.size)
            assertTrue(other.courseList().courses!!.isEmpty()); assertTrue(other.learningPlanets.list().isEmpty())
            assertTrue(runCatching { api.answer(planet.id, "q2", 1, "locked-123") }.isFailure)
            val wrong = api.answer(planet.id, "q1", 0, "wrong-123")
            assertFalse(wrong.feedback.correct); assertTrue(wrong.planet.progress.completedRegionIds.isEmpty())
            val correct = api.answer(planet.id, "q1", 1, "correct-123")
            assertEquals(listOf("r1"), correct.planet.progress.completedRegionIds)
            assertEquals(2, api.answer(planet.id, "q1", 1, "correct-123").planet.progress.answers["q1"]!!.attempts)
            assertTrue(runCatching { api.answer(planet.id, "q1", 0, "correct-123") }.isFailure)
            assertEquals(listOf("r1", "r2"), api.answer(planet.id, "q2", 1, "next-123").planet.progress.completedRegionIds)
            assertEquals(0, first.profile.energy); assertEquals(0, first.profile.crystals)
            GuestWorkspaces.close(first.token)
            try { api.list(); fail("Closed guest must not hit account endpoints") } catch (e: ApiException) { assertEquals(410, e.statusCode) }
        } finally { GuestWorkspaces.close(first.token); GuestWorkspaces.close(other.token); client.close() }
    }

    @Test fun generationSendsRealSubjectAndTemporaryCredentialsWithoutGuestBearerOrPersistence() = runBlocking {
        var calls = 0
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            calls++; assertNull(request.headers[HttpHeaders.Authorization]); assertTrue(request.url.encodedPath.endsWith("/planets/generate"))
            val body = Json.parseToJsonElement((request.body as TextContent).text).jsonObject
            assertEquals("微积分", body["subject"]!!.jsonPrimitive.content)
            assertEquals("temporary-test-key", body["credentials"]!!.jsonObject["apiKey"]!!.jsonPrimitive.content)
            respond(json.encodeToString(GeneratedPlanet.serializer(), generated()), HttpStatusCode.OK, headers)
        } } }
        val guest = GuestWorkspaces.create(client)
        try {
            val api = PlanetApi(guest.token, client)
            val input = GeneratePlanetInput("微积分", model = "test-model", credentials = AccessCredentials("openai", "temporary-test-key"))
            assertFalse(input.toString().contains("temporary-test-key"))
            assertEquals("微积分", api.generate(input).draft.subject)
            assertEquals(1, calls); assertTrue(api.list().planets.isEmpty()); assertTrue(guest.courseList().courses!!.isEmpty())
        } finally { GuestWorkspaces.close(guest.token); client.close() }
    }

    @Test fun accountReopensSavedPlanetAndUsesAuthenticatedConfirmationAndAnswerRequests() = runBlocking {
        val original = PlanetRecord(draft().id, "course-saved", draft(), createdAt = "2026-11-27T00:00:00Z", updatedAt = "2026-11-27T00:00:00Z")
        var saved = original
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            assertEquals("Bearer account-token", request.headers[HttpHeaders.Authorization])
            val response = when {
                request.url.encodedPath.endsWith("/confirm") -> {
                    val body = Json.parseToJsonElement((request.body as TextContent).text).jsonObject
                    assertEquals("signed-test-draft", body["draftToken"]!!.jsonPrimitive.content)
                    assertEquals("confirm-123", body["clientRequestId"]!!.jsonPrimitive.content)
                    json.encodeToString(PlanetEnvelope.serializer(), PlanetEnvelope(saved))
                }
                request.url.encodedPath.endsWith("/answers") -> {
                    val body = Json.parseToJsonElement((request.body as TextContent).text).jsonObject
                    assertEquals(setOf("questionId", "selectedIndex", "clientRequestId"), body.keys)
                    val answer = answerPlanetQuestion(saved, "q1", body["selectedIndex"]!!.jsonPrimitive.int); saved = answer.planet
                    json.encodeToString(PlanetAnswerResult.serializer(), answer)
                }
                request.url.encodedPath.endsWith("/planets") -> json.encodeToString(PlanetList.serializer(), PlanetList(listOf(saved)))
                else -> json.encodeToString(PlanetEnvelope.serializer(), PlanetEnvelope(saved))
            }
            respond(response, HttpStatusCode.OK, headers)
        } } }
        try {
            val api = PlanetApi("account-token", client)
            assertEquals(original, api.confirm(generated(), "confirm-123"))
            api.answer(original.id, "q1", 1, "answer-123")
            val reopened = PlanetApi("account-token", client)
            assertEquals(listOf("r1"), reopened.list().planets.single().progress.completedRegionIds)
            assertEquals(1, reopened.get(original.id).progress.answers["q1"]!!.attempts)
        } finally { client.close() }
    }

    @Test fun unavailableModelDoesNotCreateFallbackPlanet() = runBlocking {
        val client = createApiHttpClient(MockEngine) { engine { addHandler { respond("""{"code":"NOT_CONFIGURED","error":"模型未配置"}""", HttpStatusCode.ServiceUnavailable, headers) } } }
        val guest = GuestWorkspaces.create(client)
        try {
            try { PlanetApi(guest.token, client).generate(GeneratePlanetInput("历史")); fail("A real model is required") } catch (e: ApiException) { assertEquals(503, e.statusCode) }
            assertTrue(guest.learningPlanets.list().isEmpty()); assertTrue(guest.courseList().courses!!.isEmpty())
        } finally { GuestWorkspaces.close(guest.token); client.close() }
    }

    @Test fun nativeGenerationPollsWithScopedGuestJobTokenUntilDraftArrives() = runBlocking {
        var polls = 0
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            assertNull(request.headers[HttpHeaders.Authorization])
            if (request.method == HttpMethod.Post) respond("""{"jobId":"native-job","status":"RUNNING","jobToken":"scoped-test-token"}""", HttpStatusCode.Accepted, headers)
            else {
                polls++; assertTrue(request.url.encodedPath.endsWith("/generation-jobs/native-job"))
                assertEquals("scoped-test-token", request.headers["X-Planet-Job-Token"])
                respond(json.encodeToString(GeneratedPlanet.serializer(), generated()).dropLast(1) + ",\"status\":\"SUCCEEDED\"}", HttpStatusCode.OK, headers)
            }
        } } }
        val guest = GuestWorkspaces.create(client)
        try {
            assertEquals("微积分", PlanetApi(guest.token, client).generate(GeneratePlanetInput("微积分")).draft.subject)
            assertEquals(1, polls); assertTrue(guest.learningPlanets.list().isEmpty())
        } finally { GuestWorkspaces.close(guest.token); client.close() }
    }

    @Test fun subjectArtMatchesAliasesAndUnknownSubjectsStayGeneric() {
        val atlas = SubjectPlanetAtlas(3, 4, listOf(SubjectPlanet("math", "数学", 0, 0, listOf("数学", "微积分")), SubjectPlanet("english", "英语", 1, 0, listOf("english", "英语"))))
        assertEquals("math", atlas.find("高等数学")!!.id)
        assertEquals("english", atlas.find("Business ENGLISH")!!.id)
        assertNull(atlas.find("天文学"))
    }

    @Test fun legacyExpeditionSelectionPreservesExistingCoursesButExcludesAiPlanets() {
        val old = CourseData("legacy-course", "旧课程")
        val generated = CourseData("ai-course", "英语", code = "AI_PLANET")
        val archived = CourseData("archived-course", "旧归档", isArchived = true)
        assertEquals(listOf(old), com.keling.app.expedition.legacyExpeditionCourses(listOf(generated, old, archived)))
    }
}
