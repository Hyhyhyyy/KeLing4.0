package com.keling.app.expedition

import com.keling.app.network.*
import io.ktor.client.engine.mock.*
import io.ktor.http.*
import io.ktor.http.content.TextContent
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant

class LearningMaterialsTest {
    private fun parsed(text: String = "队列按先进先出访问节点。") = ParsedMaterial("队列原文", "教材", "TEXT", text, "hash-$text", "test-parser", "READY", listOf(MaterialSpan(ordinal = 0, startUtf16 = 0, endUtf16 = text.length, textHash = "span-$text")))
    private val headers = headersOf(HttpHeaders.ContentType, "application/json")

    @Test fun guestVersionsAreImmutableSaveIsIdempotentAndMapRejectsOldSources() {
        val store = GuestLearningStore({}); val p = parsed()
        val first = store.save("course", p, null, "one")
        assertEquals(first, store.save("course", p, null, "one")); assertEquals(1, store.list("course").size)
        val candidates = store.draft("course", listOf(first.id)).candidates
        var created = 0
        store.confirm("course", "map", candidates) { _, _ -> created++ }
        store.confirm("course", "map", candidates) { _, _ -> created++ }; assertEquals(1, created)
        val second = store.save("course", parsed("修订后内容"), first, "two")
        assertEquals(2, second.version); assertEquals(p.content, store.get(first.id).content)
        try { store.confirm("course", "old-map", candidates) { _, _ -> fail("No stale source writes") }; fail("Stale expected") } catch (e: ExpeditionException) { assertEquals("SOURCE_INVALID", e.detail.code) }
        try { store.save("course", p, first, "new-from-old"); fail("Old edit") } catch (e: ExpeditionException) { assertEquals("CONTENT_STALE", e.detail.code) }
        try { store.save("course", parsed("other"), null, "one"); fail("Op collision") } catch (e: ExpeditionException) { assertEquals("OP_CONFLICT", e.detail.code) }
        store.delete(second.id); assertTrue(store.list("course").isEmpty()); assertEquals(p.content, store.get(first.id).content)
        store.close(); try { store.get(first.id); fail("Closed") } catch (_: IllegalStateException) { }
    }

    @Test fun parsingIsAnonymousForBothModesWhileAccountSaveUsesCapturedOriginAndToken() = runBlocking {
        var parsedCalls = 0; var saves = 0
        val doc = GuestLearningStore({}).save("course", parsed(), null, "create")
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            assertEquals("selected.example", request.url.host)
            if (request.url.encodedPath.endsWith("/materials/parse")) {
                assertNull(request.headers[HttpHeaders.Authorization]); parsedCalls++
                respond(expeditionJson.encodeToString(parsed()), HttpStatusCode.OK, headers)
            } else {
                assertEquals("Bearer test-session", request.headers[HttpHeaders.Authorization]); saves++
                val body = Json.parseToJsonElement((request.body as TextContent).text).jsonObject
                assertEquals("stable-op", body["opId"]!!.jsonPrimitive.content)
                respond(buildJsonObject { put("material", expeditionJson.encodeToJsonElement(LearningDoc.serializer(), doc)) }.toString(), HttpStatusCode.OK, headers)
            }
        } } }
        val guest = GuestWorkspaces.create(client)
        try {
            val account = LearningApi("test-session", client, "https://selected.example/api")
            val guestApi = LearningApi(guest.token, client, "https://selected.example/api")
            val input = MaterialInput("教材", text = parsed().content)
            account.parse(input); guestApi.parse(input)
            account.save("course", input, parsed(), null, "stable-op")
            assertEquals(2, parsedCalls); assertEquals(1, saves)
            GuestWorkspaces.close(guest.token)
            try { guestApi.parse(input); fail("Closed must not send") } catch (e: ApiException) { assertEquals(410, e.statusCode) }
            assertEquals(2, parsedCalls)
        } finally { GuestWorkspaces.close(guest.token); client.close() }
    }

    @Test fun guestScheduleConfirmationRejectsChangedWorkspaceAndDoesNotDuplicateTasks() = runBlocking {
        val future = Instant.now().plusSeconds(86400)
        val preview = SchedulePreview(method = "CONSTRAINT_SCHEDULER", timezone = "Asia/Shanghai", tasks = listOf(ScheduledTask("队列学习", 25, "2099-01-01", "18:30", future.toString(), "bt.bfs.queue")), unallocated = emptyList(), diff = ScheduleDiff(1, 0, 0, 0), warnings = emptyList(), note = "fixture")
        var calls = 0
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            assertNull(request.headers[HttpHeaders.Authorization]); assertTrue(request.url.encodedPath.endsWith("/schedule/preview"))
            assertFalse((request.body as TextContent).text.contains("guest-memory:")); calls++
            respond(expeditionJson.encodeToString(preview), HttpStatusCode.OK, headers)
        } } }
        val guest = GuestWorkspaces.create(client)
        try {
            val course = guest.createCourse("课程").course!!; val api = LearningApi(guest.token, client, "https://selected.example/api")
            val request = ScheduleRequest("2099-01-01", "2099-01-02", 50, "18:30", "21:00", units = listOf(ScheduleUnit("队列", 25)))
            val stale = api.schedule(course.id, request)
            guest.createCourse("另一门课")
            try { api.confirmSchedule(course.id, stale); fail("Basis changed") } catch (e: ApiException) { assertEquals(409, e.statusCode) }
            assertTrue(guest.taskList().tasks!!.isEmpty())
            val current = api.schedule(course.id, request); val confirmed = api.confirmSchedule(course.id, current)
            assertEquals(1, confirmed.added); assertTrue(api.confirmSchedule(course.id, current).replayed)
            assertEquals(1, guest.taskList().tasks!!.size); assertEquals(0, guest.taskList().tasks!!.single().rewardsExp)
            val expired = api.schedule(course.id, request).copy(expiresAt = Instant.now().minusSeconds(1).toString())
            try { api.confirmSchedule(course.id, expired); fail("Expired") } catch (e: ApiException) { assertEquals(409, e.statusCode) }
            assertEquals(3, calls)
        } finally { GuestWorkspaces.close(guest.token); client.close() }
    }

    @Test fun explicitCourseContextIncludesMaterialAndProgressButVersionChangesRequireConsentAgain() = runBlocking {
        var calls = 0
        val client = createApiHttpClient(MockEngine) { engine { addHandler { calls++; error("No automatic model request") } } }
        val guest = GuestWorkspaces.create(client)
        try {
            val course = guest.createCourse("课程").course!!
            val other = guest.createCourse("不能泄漏的课程").course!!
            guest.learningMaterials.save(other.id, parsed("另一门课的私人材料"), null, "private")
            val material = guest.learningMaterials.save(course.id, parsed(), null, "selected")
            val chapter = expeditionJson.decodeFromString<Chapter>(javaClass.getResource("/expedition/chapter.json")!!.readText())
            val game = guest.expedition(CatalogResponse(chapter, ExpeditionRules.decorations))
            val run = game.start(StartRunInput("start", course.id, "EXPLORE", "bt.bfs.queue", "TRAINING", "phone"))
            val preview = guest.preview(AssistantContextRef("course", course.id))
            assertTrue(preview.sources.any { it.kind == "material" && it.text.contains(material.id) })
            assertTrue(preview.sources.any { it.kind == "evidence" })
            assertFalse(preview.sources.any { it.text.contains("私人材料") || it.text.contains(run.writer.token) })
            val session = guest.create(NewAssistantSession("public", "fixture"))
            game.command(run.run.id, Command("hint", 0, run.writer, ExpeditionAction("HINT")))
            try { guest.send(session.session.id, "给提示", "send", preview.input()); fail("Changed progress must refresh preview") } catch (e: ApiException) { assertEquals(409, e.statusCode) }
            assertEquals(0, calls)
        } finally { GuestWorkspaces.close(guest.token); client.close() }
    }
}
