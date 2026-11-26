package com.keling.app.network

import io.ktor.client.engine.mock.*
import io.ktor.http.*
import io.ktor.http.content.TextContent
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

class WorkspaceTaskTest {
    @Test fun guestTasksCanBeCreatedCompletedAndDeletedWithoutNetworkOrRewards() = runBlocking {
        val client = createApiHttpClient(MockEngine) { engine { addHandler { error("Guest mutation must not use network") } } }
        val guest = GuestWorkspaces.create(client); val other = GuestWorkspaces.create(client)
        try {
            val api = WorkspaceApi(client)
            val task = api.createTask(guest.token, WorkspaceTaskInput("  复习队列  ", courseId = guest.courseList().courses!!.first().id, estimatedMinutes = 10)).task!!
            assertEquals("复习队列", task.title)
            assertEquals(0, task.rewardsEnergy + task.rewardsExp + task.rewardsCrystals)
            assertTrue(other.taskList().tasks!!.isEmpty())
            guest.complete(task.id, 7); guest.complete(task.id, 7)
            assertEquals(7, guest.profile.totalStudyMinutes)
            assertEquals("COMPLETED", guest.taskList().tasks!!.single().status)
            api.deleteTask(guest.token, task.id)
            assertTrue(guest.taskList().tasks!!.isEmpty())
            assertEquals(7, guest.profile.totalStudyMinutes)
            GuestWorkspaces.close(guest.token)
            try { api.createTask(guest.token, WorkspaceTaskInput("结束后")); fail("Closed guest") } catch (e: ApiException) { assertEquals(410, e.statusCode) }
        } finally { GuestWorkspaces.close(guest.token); GuestWorkspaces.close(other.token); client.close() }
    }

    @Test fun accountTaskMutationsUseAuthenticatedMinimalPayloadAndPreserveErrors() = runBlocking {
        var calls = 0
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            calls++
            assertEquals("Bearer account-session", request.headers[HttpHeaders.Authorization])
            if (request.method == HttpMethod.Post) {
                val body = Json.parseToJsonElement((request.body as TextContent).text).jsonObject
                assertEquals("真实任务", body["title"]!!.jsonPrimitive.content)
                assertEquals(15, body["estimatedMinutes"]!!.jsonPrimitive.int)
                assertFalse(body.containsKey("status")); assertFalse(body.containsKey("rewardsExp"))
                respond("""{"task":{"id":"task-a","title":"真实任务","estimatedMinutes":15}}""", HttpStatusCode.Created, headersOf(HttpHeaders.ContentType, "application/json"))
            } else {
                assertEquals(HttpMethod.Delete, request.method)
                assertTrue(request.url.encodedPath.endsWith("/tasks/task-a"))
                respond("""{"error":"资料已变化"}""", HttpStatusCode.Conflict, headersOf(HttpHeaders.ContentType, "application/json"))
            }
        } } }
        try {
            val api = WorkspaceApi(client)
            assertEquals("task-a", api.createTask("account-session", WorkspaceTaskInput(" 真实任务 ", estimatedMinutes = 15)).task!!.id)
            try { api.deleteTask("account-session", "task-a"); fail("Delete must not report success") } catch (e: ApiException) { assertEquals(409, e.statusCode) }
            assertEquals(2, calls)
        } finally { client.close() }
    }

    @Test fun guestTaskRejectsForeignCourseAndInvalidTime() = runBlocking {
        val client = createApiHttpClient(MockEngine) { engine { addHandler { error("No request expected") } } }
        val guest = GuestWorkspaces.create(client)
        try {
            val api = WorkspaceApi(client)
            try { api.createTask(guest.token, WorkspaceTaskInput("任务", courseId = "other-account")); fail("Foreign course") } catch (e: ApiException) { assertEquals(404, e.statusCode) }
            for (minutes in listOf(0, 1441)) assertTrue(runCatching { api.createTask(guest.token, WorkspaceTaskInput("任务", estimatedMinutes = minutes)) }.isFailure)
            assertTrue(guest.taskList().tasks!!.isEmpty())
        } finally { GuestWorkspaces.close(guest.token); client.close() }
    }
}
