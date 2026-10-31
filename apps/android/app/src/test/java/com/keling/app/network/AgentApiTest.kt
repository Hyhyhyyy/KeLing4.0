package com.keling.app.network

import com.keling.app.data.*
import io.ktor.client.engine.mock.*
import io.ktor.http.*
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

class AgentApiTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test fun `version check decodes the backend current version without invented asset fields`() = runBlocking {
        val client = createApiHttpClient(MockEngine) {
            engine { addHandler {
                respond("""{"success":true,"currentVersion":{"versionCode":8,"versionName":"3.0.9"},"latestVersion":{"versionCode":9,"versionName":"3.1.0","updateUrl":"https://github.com/CurryHeng/KeLing_ICT/releases/download/v3.1.0/app.apk","updateLog":"更新","fileSize":12345},"needUpdate":true,"forceUpdate":false}""", HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
            } }
        }
        val service = com.keling.app.update.UpdateService(client)
        try {
            val result = service.checkUpdate(8, "3.0.9").getOrThrow()
            assertEquals(8, result.currentVersion?.versionCode)
            assertEquals(9, result.latestVersion.versionCode)
            assertTrue(result.needUpdate)
        } finally { service.close() }
    }

    @Test fun `real API arrays and legacy strings both deserialize`() {
        for (schedule in listOf("[]", "\"[]\"")) {
            val course = json.decodeFromString<CourseData>("""{"id":"c","name":"数学","schedule":$schedule}""")
            assertTrue(course.toCourse().schedule.isEmpty())
            assertTrue(json.parseToJsonElement(json.encodeToString(course)).jsonObject["schedule"] == null ||
                json.parseToJsonElement(Json { encodeDefaults = true }.encodeToString(course)).jsonObject["schedule"] is JsonArray)
        }
        val note = json.decodeFromString<NoteData>("""{"id":"n","title":"笔记","content":"内容","tags":["数学"]}""")
        assertEquals("[\"数学\"]", note.tags)
    }

    @Test fun `background start decodes running response and sends only user authorization`() = runBlocking {
        val client = createApiHttpClient(MockEngine) {
            engine { addHandler { request ->
                assertTrue(request.url.encodedPath.endsWith("/api/agent/runs/start"))
                assertEquals("Bearer user-session", request.headers[HttpHeaders.Authorization])
                assertNull(request.headers["x-agentarts-tool-key"])
                respond("""{"id":"r","goal":"复习二叉树","status":"RUNNING","createdAt":"2026-10-28T00:00:00Z","events":[],"sources":[],"result":null}""", HttpStatusCode.Accepted, headersOf(HttpHeaders.ContentType, "application/json"))
            } }
        }
        try {
            val run = AgentApi(client).start("user-session", AgentRequest("course", "复习二叉树", "2026-10-29", 60))
            assertEquals("RUNNING", run.status)
            assertNull(run.result)
        } finally { client.close() }
    }

    @Test fun `remote completion refreshes imported tasks without discarding local drafts or resurrecting deletions`() {
        val local = Task(id = "local", title = "本地练习", description = "", type = TaskType.DAILY_CARE)
        val cloud = Task(id = "cloud", title = "云端练习", description = "", type = TaskType.DAILY_CARE)
        val deleted = Task(id = "deleted", title = "已隐藏", description = "", type = TaskType.DAILY_CARE)
        val result = reconcileCloudTasks(listOf(local, cloud), listOf(cloud.copy(status = TaskStatus.COMPLETED), deleted), setOf("cloud", "deleted"))
        assertEquals(listOf("local", "cloud"), result.map { it.id })
        assertEquals(TaskStatus.COMPLETED, result.last().status)
        assertEquals(listOf(local), reconcileCloudTasks(listOf(local, cloud), emptyList(), setOf("cloud")))
    }
}
