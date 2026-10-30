package com.keling.app.network

import io.ktor.client.engine.mock.*
import io.ktor.http.*
import io.ktor.http.content.TextContent
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class FullGuestWorkspaceTest {
    private val headers = headersOf(HttpHeaders.ContentType, "application/json")
    @Test fun fullWorkspaceCrudIsIsolatedAndCannotFallThroughAfterExit() = runBlocking {
        var calls = 0
        val client = createApiHttpClient(MockEngine) { engine { addHandler { calls++; error("Account data must stay in memory") } } }
        val first = GuestWorkspaces.create(client); val second = GuestWorkspaces.create(client)
        try {
            val api = WorkspaceApi(client); val agent = AgentApi(client)
            api.saveNote(first.token, null, WorkspaceNoteInput("临时笔记", "正文"))
            val note = api.notes(first.token).notes!!.single()
            api.saveNote(first.token, note.id, WorkspaceNoteInput("已编辑", "正文2", note.updatedAt))
            assertEquals("已编辑", api.notes(first.token).notes!!.single().title)
            assertTrue(api.notes(second.token).notes!!.isEmpty())
            try { api.saveNote(first.token, note.id, WorkspaceNoteInput("过期", "不可覆盖", note.updatedAt)); fail("Expected stale version") } catch (e: ApiException) { assertEquals(409, e.statusCode) }
            val course = agent.createCourse(first.token, "新课程").course!!
            agent.addSource(first.token, course.id, "新资料", "真实输入")
            assertEquals("真实输入", agent.sources(first.token, course.id).nodes.single().description)
            api.checkin(first.token); api.checkin(first.token)
            api.avatar(first.token, 3)
            assertEquals(0, api.profile(first.token).user.energy)
            assertEquals("stellar:avatar-3", api.profile(first.token).user.avatarUrl)
            assertEquals(0, api.profile(second.token).user.energy)
            api.deleteNote(first.token, note.id)
            assertTrue(api.notes(first.token).notes!!.isEmpty())
            GuestWorkspaces.close(first.token)
            try { api.notes(first.token); fail("Closed guest must not hit network") } catch (e: ApiException) { assertEquals(410, e.statusCode) }
            assertEquals(0, calls)
        } finally { GuestWorkspaces.close(first.token); GuestWorkspaces.close(second.token); client.close() }
    }
    @Test fun contextFingerprintRejectsChangedSourcesWithoutModelCall() = runBlocking {
        val client = createApiHttpClient(MockEngine) { engine { addHandler { error("No AI call expected") } } }
        val guest = GuestWorkspaces.create(client)
        try {
            val note = guest.saveNote(null, WorkspaceNoteInput("资料", "旧内容"))
            val preview = guest.preview(AssistantContextRef("note", note.id))
            val session = guest.create(NewAssistantSession("public", "model"))
            guest.saveNote(note.id, WorkspaceNoteInput("资料", "新内容", note.updatedAt))
            try { guest.send(session.session.id, "说明", "request", preview.input()); fail("Expected source version conflict") } catch (e: ApiException) { assertEquals(409, e.statusCode) }
            assertTrue(guest.conversation(session.session.id).turns.isEmpty())
        } finally { GuestWorkspaces.close(guest.token); client.close() }
    }
    @Test fun publicAiSessionUsesStatelessProtocolAndSaveIsIdempotent() = runBlocking {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        var chatCalls = 0
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            assertNull(request.headers[HttpHeaders.Authorization])
            assertTrue(request.url.encodedPath.endsWith("/trial/workspace/chat"))
            val body = Json.parseToJsonElement((request.body as TextContent).text).jsonObject
            assertEquals(setOf("model", "message", "scenario", "history", "sources", "retrievalMode"), body.keys)
            assertFalse(body.containsKey("token")); assertFalse(body.containsKey("credentials"))
            chatCalls++
            respond("""{"answer":"协议测试回答，不是真实模型","model":"test","sources":[],"usage":{}}""", HttpStatusCode.OK, headers)
        } } }
        val guest = GuestWorkspaces.create(client)
        try {
            val session = guest.create(NewAssistantSession("public", "test"))
            val receipt = guest.send(session.session.id, "问题", "once", null)
            guest.send(session.session.id, "问题", "once", null)
            try { guest.send(session.session.id, "不同问题", "once", null); fail("Request ID collision") } catch (e: ApiException) { assertEquals(409, e.statusCode) }
            withTimeout(5000) { while (guest.conversation(session.session.id).turns.single().status == "RUNNING") delay(5) }
            assertEquals(1, chatCalls)
            guest.saveTurn(receipt.id); guest.saveTurn(receipt.id)
            assertEquals(1, guest.noteList().notes!!.size)
            guest.remove(session.session.id)
            try { guest.send(session.session.id, "问题", "once", null); fail("Deleted session must not replay receipt") } catch (e: ApiException) { assertEquals(404, e.statusCode) }
            assertTrue(guest.sessions().sessions.isEmpty())
            assertEquals(1, guest.noteList().notes!!.size)
        } finally { GuestWorkspaces.close(guest.token); client.close(); Dispatchers.resetMain() }
    }
    @Test fun planProtocolAndConfirmationDoNotRepeatTasksOrRewards() = runBlocking {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        val today = java.time.LocalDate.now(java.time.ZoneId.of("Asia/Shanghai")).toString()
        var expired = false
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            assertNull(request.headers[HttpHeaders.Authorization])
            if (request.method == HttpMethod.Get) respond("""{"providers":[{"id":"public","name":"测试公共模型","protocol":"openai","configured":true,"chatModels":["test"]}]}""", HttpStatusCode.OK, headers)
            else {
                assertTrue(request.url.encodedPath.endsWith("/trial/workspace/plan"))
                val body = Json.parseToJsonElement((request.body as TextContent).text).jsonObject
                assertEquals(setOf("model", "request", "courseName", "sources", "tasks"), body.keys)
                // Other courses' completed tasks must not enter this course's planning context.
                assertEquals(0, body.getValue("tasks").jsonArray.size)
                val sourceId = body.getValue("sources").jsonArray.first().jsonObject.getValue("id").jsonPrimitive.content
                val date = if (expired) "2000-01-01" else today
                respond("""{"model":"test","result":{"summary":"协议计划","tasks":[{"title":"理解递归","description":"展开示例","date":"$date","minutes":25,"sourceIds":["$sourceId"]}]}}""", HttpStatusCode.OK, headers)
            }
        } } }
        val guest = GuestWorkspaces.create(client)
        try {
            val course = guest.courseList().courses!!.first()
            val run = guest.start(AgentRequest(course.id, "理解递归", today, 60))
            withTimeout(5000) { while (guest.run(run.id).status == "RUNNING") delay(5) }
            guest.confirm(run.id); guest.confirm(run.id)
            assertEquals(1, guest.taskList().tasks!!.size)
            val task = guest.taskList().tasks!!.single()
            guest.complete(task.id, 7); guest.complete(task.id, 10)
            assertEquals(7, guest.profile.totalStudyMinutes)
            assertEquals(0, guest.profile.energy)
            val other = guest.createCourse("其他课程").course!!
            guest.addSource(other.id, "其他资料", "不包含先前任务")
            val changed = guest.start(AgentRequest(other.id, "另一课程", today, 60))
            withTimeout(5000) { while (guest.run(changed.id).status == "RUNNING") delay(5) }
            guest.addSource(other.id, "新资料", "更新后的课程范围")
            try { guest.confirm(changed.id); fail("Changed sources must require replanning") } catch (e: ApiException) { assertEquals(409, e.statusCode) }
            expired = true
            val stale = guest.start(AgentRequest(other.id, "过期计划测试", today, 60))
            withTimeout(5000) { while (guest.run(stale.id).status == "RUNNING") delay(5) }
            try { guest.confirm(stale.id); fail("Expired plan must not create tasks") } catch (e: ApiException) { assertEquals(409, e.statusCode) }
            assertEquals(1, guest.taskList().tasks!!.size)
        } finally { GuestWorkspaces.close(guest.token); client.close(); Dispatchers.resetMain() }
    }
    @Test fun closedWorkspaceDropsKeyAndCannotBeResurrectedByLateAi() = runBlocking {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        val pending = CompletableDeferred<Unit>()
        val client = createApiHttpClient(MockEngine) { engine { addHandler {
            withContext(NonCancellable) { pending.await() }
            respond("""{"answer":"晚到回答","model":"test","sources":[]}""", HttpStatusCode.OK, headers)
        } } }
        val guest = GuestWorkspaces.create(client)
        try {
            val session = guest.create(NewAssistantSession("public", "test"))
            guest.send(session.session.id, "问题", "late", null)
            guest.modelAccess.editKey("not-a-real-secret")
            GuestWorkspaces.close(guest.token); pending.complete(Unit); delay(20)
            assertEquals("", guest.modelAccess.state.value.apiKey)
            try { guest.sessions(); fail("Closed workspace accessible") } catch (e: ApiException) { assertEquals(410, e.statusCode) }
        } finally { pending.complete(Unit); GuestWorkspaces.close(guest.token); client.close(); Dispatchers.resetMain() }
    }
}
