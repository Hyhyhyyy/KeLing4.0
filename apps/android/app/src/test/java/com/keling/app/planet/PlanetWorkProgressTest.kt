package com.keling.app.planet

import androidx.lifecycle.viewModelScope
import com.keling.app.network.*
import com.keling.app.ui.screens.agent.WorkspaceViewModel
import io.ktor.client.engine.mock.*
import io.ktor.http.*
import io.ktor.http.content.TextContent
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class PlanetWorkProgressTest {
    private val headers = headersOf(HttpHeaders.ContentType, "application/json")
    private val json = Json { encodeDefaults = true }
    private val stamp = "2026-11-28T12:00:00Z"
    private val draft = PlanetDraft("p1", "同名主题", title = "已生成星球", story = "启航", planetStyleIndex = 2,
        regions = listOf(PlanetRegion("r1", "探索", "探索", estimatedMinutes = 10, lesson = "课文", objectives = listOf("理解"),
            questions = listOf(PlanetQuestion("q1", "问题", listOf("甲", "乙"), 0, "说明")))),
        generatedBy = PlanetGenerator("fixture", "fixture", stamp), artwork = PlanetArtwork("generated", "形象", "https://images.example.org/first.png"))
    private val record = PlanetRecord("p1", "generated-course", draft, createdAt = stamp, updatedAt = stamp)
    private fun progress(kind: String, revision: Int, state: String, activity: String = "drafting") = PlanetWorkProgress(kind, revision, stamp, stamp,
        listOf(PlanetWorkStep("research", "completed", "ready"), PlanetWorkStep("compose", state, activity), PlanetWorkStep("artwork", if (state == "completed") "skipped" else "running", if (state == "completed") "unavailable" else "rendering"), PlanetWorkStep("finalize", if (state == "completed") "completed" else "pending")))
    private fun job(kind: String, revision: Int, state: String, terminal: Boolean = false, failure: Boolean = false) = buildJsonObject {
        put("jobId", "job-$kind"); put("jobToken", "job-secret"); put("status", if (failure) "FAILED" else if (terminal) "SUCCEEDED" else "RUNNING")
        put("progress", json.encodeToJsonElement(PlanetWorkProgress.serializer(), progress(kind, revision, state, if (failure) "unavailable" else "drafting")))
        if (failure) { put("code", "CONTENT_REVIEW_FAILED"); put("error", "内容未通过复核") }
    }

    @Test fun optionalMetadataRejectsMalformedAndStaleUpdatesWithoutInventingCompletion() {
        val initial = progress("planet", 2, "running")
        val parsed = parsePlanetWorkProgress(json.encodeToJsonElement(PlanetWorkProgress.serializer(), initial))!!
        assertEquals(2, parsed.steps.count { it.state == "running" })
        assertEquals(1, parsed.steps.count { it.state == "completed" })
        assertEquals(initial, latestPlanetWorkProgress(initial, initial.copy(revision = 1, steps = emptyList())))
        assertEquals(initial, latestPlanetWorkProgress(initial, initial.copy(startedAt = "2026-11-29T00:00:00Z", revision = 9)))
        val repair = initial.copy(revision = 3, steps = initial.steps.map { if (it.id == "compose") it.copy(activity = "repairing") else it })
        assertEquals(repair, latestPlanetWorkProgress(initial, repair))
        for (invalid in listOf(initial.copy(revision = -1), initial.copy(steps = initial.steps + initial.steps[0]), initial.copy(startedAt = "not-a-date"), initial.copy(steps = listOf(PlanetWorkStep("unknown", "completed"))))) {
            assertNull(parsePlanetWorkProgress(json.encodeToJsonElement(PlanetWorkProgress.serializer(), invalid)))
        }
        assertNull(parsePlanetWorkProgress(JsonPrimitive("invalid")))
        assertNull(parsePlanetWorkProgress(null))
    }

    @Test fun generationEmitsInitialParallelAndTerminalStagesAndKeepsSignedDraftRaw() = runBlocking {
        var poll = 0
        val rawDraft = JsonObject(json.encodeToJsonElement(PlanetDraft.serializer(), draft).jsonObject + ("futureSignedField" to JsonPrimitive("preserve")))
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            if (request.method == HttpMethod.Post) respond(job("planet", 0, "running").toString(), HttpStatusCode.Accepted, headers)
            else {
                assertEquals("job-secret", request.headers["X-Planet-Job-Token"])
                poll++
                val payload = if (poll == 1) job("planet", 1, "running") else JsonObject(job("planet", 2, "completed", terminal = true) + mapOf("draft" to rawDraft, "draftToken" to JsonPrimitive("signed")))
                respond(payload.toString(), HttpStatusCode.OK, headers)
            }
        } } }
        try {
            val stages = mutableListOf<PlanetWorkProgress>()
            val result = PlanetApi("account", client).generate(GeneratePlanetInput("同名主题")) { stages.add(it) }
            assertEquals(listOf(0, 1, 2), stages.map { it.revision })
            assertEquals("pending", stages.first().steps.last().state)
            assertEquals("completed", stages.last().steps.last().state)
            assertEquals("skipped", stages.last().steps.first { it.id == "artwork" }.state)
            assertEquals(rawDraft, result.rawDraft)
        } finally { client.close() }
    }

    @Test fun everyRegenerationKindCarriesProgressForStoredAndPreviewEndpoints() = runBlocking {
        var kind = ""; var preview = false
        val paths = mutableListOf<String>()
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            if (request.method == HttpMethod.Post) {
                paths.add(request.url.encodedPath)
                kind = Json.parseToJsonElement((request.body as TextContent).text).jsonObject.getValue("kind").jsonPrimitive.content
                respond(job(kind, 0, "running").toString(), HttpStatusCode.Accepted, headers)
            } else {
                val result = if (preview) mapOf("draft" to json.encodeToJsonElement(PlanetDraft.serializer(), draft), "draftToken" to JsonPrimitive("signed"))
                    else mapOf("planet" to json.encodeToJsonElement(PlanetRecord.serializer(), record))
                respond(JsonObject(job(kind, 1, "completed", terminal = true) + result).toString(), HttpStatusCode.OK, headers)
            }
        } } }
        try {
            val api = PlanetApi("account", client)
            for (requestedKind in listOf("artwork", "question", "similar")) {
                preview = requestedKind == "question"
                val stages = mutableListOf<PlanetWorkProgress>()
                val result = api.regenerate(if (preview) null else record, if (preview) GeneratedPlanet(draft, "signed") else null,
                    requestedKind, if (requestedKind == "artwork") null else "q1", "调整探索内容", "request-$requestedKind") { stages.add(it) }
                assertEquals(listOf(requestedKind, requestedKind), stages.map { it.kind })
                assertEquals(listOf(0, 1), stages.map { it.revision })
                assertTrue(result.generated != null || result.planet != null)
            }
            assertTrue(paths[0].endsWith("/p1/regenerate")); assertTrue(paths[1].endsWith("/regenerate-preview")); assertTrue(paths[2].endsWith("/p1/regenerate"))
        } finally { client.close() }
    }

    @Test fun failedJobsEmitFailedStageBeforeThrowingAndMalformedProgressDoesNotBreakOldServers() = runBlocking {
        var rejectJob = true
        val client = createApiHttpClient(MockEngine) { engine { addHandler {
            if (rejectJob) respond(job("planet", 3, "failed", failure = true).toString(), HttpStatusCode.Accepted, headers)
            else respond(buildJsonObject { put("draft", json.encodeToJsonElement(PlanetDraft.serializer(), draft)); put("draftToken", "signed"); put("progress", "bad metadata") }.toString(), HttpStatusCode.OK, headers)
        } } }
        try {
            val stages = mutableListOf<PlanetWorkProgress>()
            val api = PlanetApi("account", client)
            try { api.generate(GeneratePlanetInput("主题")) { stages.add(it) }; fail("Failure must not become a draft") }
            catch (e: ApiException) { assertEquals("CONTENT_REVIEW_FAILED", e.code) }
            assertEquals("failed", stages.single().steps.first { it.id == "compose" }.state)
            rejectJob = false
            val old = api.generate(GeneratePlanetInput("主题")) { fail("Malformed metadata must be ignored") }
            assertEquals(draft, old.draft)
        } finally { client.close() }
    }

    @Test fun cancellationClearsGenerationProgressAndOrdinaryReadsNeverClaimModelWork() = runBlocking {
        Dispatchers.setMain(Dispatchers.Unconfined)
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            val path = request.url.encodedPath
            when {
                path.endsWith("/generate") -> respond(job("planet", 0, "running").toString(), HttpStatusCode.Accepted, headers)
                path.endsWith("/catalog") -> respond("{\"providers\":[]}", HttpStatusCode.OK, headers)
                path.endsWith("/p1") -> respond(json.encodeToString(PlanetEnvelope.serializer(), PlanetEnvelope(record)), HttpStatusCode.OK, headers)
                else -> respond("{\"planets\":[]}", HttpStatusCode.OK, headers)
            }
        } } }
        val vm = PlanetViewModel("account", PlanetApi("account", client))
        try {
            withTimeout(3000) { vm.state.first { !it.busy } }
            assertNull(vm.state.value.generationKind)
            vm.generate("主题", "入门", "", false, "public", "fixture")
            withTimeout(3000) { vm.state.first { it.generationProgress != null } }
            assertTrue(vm.state.value.busy)
            vm.cancelGeneration()
            assertFalse(vm.state.value.busy); assertNull(vm.state.value.generationProgress); assertNull(vm.state.value.generationKind)
            vm.open("p1")
            withTimeout(3000) { vm.state.first { it.current != null && !it.busy } }
            assertNull(vm.state.value.generationKind); assertEquals(record, vm.state.value.current)
        } finally { vm.shutdown(); client.close(); Dispatchers.resetMain() }
    }

    @Test fun failedRegenerationKeepsSavedPlanetAndStopsBusyStateWithActualReviewError() = runBlocking {
        Dispatchers.setMain(Dispatchers.Unconfined)
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            val path = request.url.encodedPath
            when {
                path.endsWith("/regenerate") -> respond(job("similar", 3, "failed", failure = true).toString(), HttpStatusCode.Accepted, headers)
                path.endsWith("/catalog") -> respond("{\"providers\":[]}", HttpStatusCode.OK, headers)
                path.endsWith("/p1") -> respond(json.encodeToString(PlanetEnvelope.serializer(), PlanetEnvelope(record)), HttpStatusCode.OK, headers)
                else -> respond(json.encodeToString(PlanetList.serializer(), PlanetList(listOf(record))), HttpStatusCode.OK, headers)
            }
        } } }
        val vm = PlanetViewModel("account", PlanetApi("account", client))
        try {
            withTimeout(3000) { vm.state.first { !it.busy } }
            vm.open("p1"); withTimeout(3000) { vm.state.first { it.current != null && !it.busy } }
            vm.similar("q1"); withTimeout(3000) { vm.state.first { it.error != null && !it.busy } }
            assertEquals(record, vm.state.value.current)
            assertEquals("内容未通过复核", vm.state.value.error)
            assertEquals("similar", vm.state.value.generationKind)
            assertEquals("failed", vm.state.value.generationProgress!!.steps.first { it.id == "compose" }.state)
        } finally { vm.shutdown(); client.close(); Dispatchers.resetMain() }
    }

    @Test fun courseArtworkMatchesCourseIdRefreshesAfterRedrawAndSurvivesArtworkReadFailure() = runBlocking {
        Dispatchers.setMain(Dispatchers.Unconfined)
        var current = record; var failArtwork = false
        val courses = """{"courses":[{"id":"generated-course","name":"同名主题","code":"AI_PLANET","planetStyleIndex":2},{"id":"ordinary-course","name":"同名主题","planetStyleIndex":7}]}"""
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            val path = request.url.encodedPath
            when {
                path.endsWith("/learning/v1/planets") -> if (failArtwork) respond("{\"error\":\"unavailable\"}", HttpStatusCode.ServiceUnavailable, headers) else respond(json.encodeToString(PlanetList.serializer(), PlanetList(listOf(current))), HttpStatusCode.OK, headers)
                path.endsWith("/courses") -> respond(courses, HttpStatusCode.OK, headers)
                path.endsWith("/user/profile") -> respond("{\"user\":{\"id\":\"account\",\"name\":\"探索者\"}}", HttpStatusCode.OK, headers)
                path.endsWith("/notes") -> respond("{\"notes\":[]}", HttpStatusCode.OK, headers)
                path.endsWith("/tasks") -> respond("{\"tasks\":[]}", HttpStatusCode.OK, headers)
                else -> respond("{}", HttpStatusCode.OK, headers)
            }
        } } }
        val vm = WorkspaceViewModel("account", WorkspaceApi(client), AgentApi(client), PlanetApi("account", client))
        try {
            withTimeout(3000) { vm.state.first { !it.busy } }
            assertEquals(setOf("generated-course"), vm.state.value.coursePlanets.keys)
            assertEquals(draft.artwork!!.url, vm.state.value.coursePlanets.getValue("generated-course").draft.artwork!!.url)
            assertEquals(7, vm.state.value.courses.first { it.id == "ordinary-course" }.planetStyleIndex)
            current = current.copy(draft = draft.copy(artwork = draft.artwork!!.copy(url = "https://images.example.org/redrawn.png")))
            vm.refresh(); withTimeout(3000) { vm.state.first { !it.busy } }
            assertEquals(current.draft.artwork, vm.state.value.coursePlanets.getValue("generated-course").draft.artwork)
            failArtwork = true
            vm.refresh(); withTimeout(3000) { vm.state.first { !it.busy } }
            assertEquals(current, vm.state.value.coursePlanets.getValue("generated-course"))
            assertNotNull(vm.state.value.artworkError); assertEquals(2, vm.state.value.courses.size)
        } finally { vm.viewModelScope.cancel(); client.close(); Dispatchers.resetMain() }
    }
}
