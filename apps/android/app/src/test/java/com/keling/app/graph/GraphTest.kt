package com.keling.app.graph

import com.keling.app.network.*
import io.ktor.client.engine.mock.*
import io.ktor.http.*
import io.ktor.http.content.TextContent
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

class GraphTest {
    @Test fun guestLayoutIsExplicitAtomicPreservesRelationsAndRejectsStaleBatch() = runBlocking {
        val client = createApiHttpClient(MockEngine) { engine { addHandler { error("Guest graph must stay local") } } }
        val guest = GuestWorkspaces.create(client); val other = GuestWorkspaces.create(client)
        try {
            val course = guest.createCourse("数学").course!!
            val root = guest.saveGraphNode(course.id, null, GraphNodeInput("函数", "定义", emptyList(), 2, 0f))
            val child = guest.saveGraphNode(course.id, null, GraphNodeInput("一次函数", "性质", listOf(root), 3, 0f))
            val api = GraphApi(guest.token, client); val initial = api.load(course.id)
            assertFalse(initial.layoutSaved); assertTrue(initial.savedNodeIds.isEmpty())
            assertEquals(listOf(root), initial.nodes.find { it.id == child }!!.parentIds)
            assertEquals(listOf(child), initial.nodes.find { it.id == root }!!.childIds)
            assertTrue(runCatching { guest.saveGraphNode(course.id, root, GraphNodeInput("函数", "定义", listOf(child), 2, 0f)) }.isFailure)
            val writes = initial.nodes.mapIndexed { i, n -> GraphPositionWrite(n.id, .2 + i * .3, .5, n.updatedAt) }
            val saved = api.saveLayout(course.id, GraphLayoutInput(writes))
            assertTrue(saved.layoutSaved); assertEquals(2, saved.savedNodeIds.size)
            val before = api.load(course.id)
            try { api.saveLayout(course.id, GraphLayoutInput(writes.map { it.copy(positionX = .9) })); fail("Stale batch") } catch (e: ApiException) { assertEquals(409, e.statusCode) }
            assertEquals(before, api.load(course.id))
            assertTrue(runCatching { GraphApi(other.token, client).load(course.id) }.isFailure)
            val newlyAdded = guest.saveGraphNode(course.id, null, GraphNodeInput("图像", "例子", listOf(child), 3, 0f))
            assertFalse(api.load(course.id).layoutSaved); assertFalse(api.load(course.id).savedNodeIds.contains(newlyAdded))
            assertTrue(runCatching { api.saveLayout(course.id, GraphLayoutInput(listOf(writes.first().copy(positionX = Double.NaN)))) }.isFailure)
            guest.deleteGraphNode(course.id, root)
            assertTrue(api.load(course.id).nodes.find { it.id == child }!!.parentIds.isEmpty())
            GuestWorkspaces.close(guest.token)
            assertTrue(runCatching { api.load(course.id) }.isFailure)
        } finally { GuestWorkspaces.close(guest.token); GuestWorkspaces.close(other.token); client.close() }
    }

    @Test fun accountLayoutUsesMinimalPayloadAndSurfacesConflict() = runBlocking {
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            assertEquals("Bearer account-session", request.headers[HttpHeaders.Authorization])
            assertTrue(request.url.encodedPath.endsWith("/knowledge/course-1/layout")); assertEquals(HttpMethod.Put, request.method)
            val body = Json.parseToJsonElement((request.body as TextContent).text).jsonObject
            assertEquals(setOf("positions"), body.keys)
            val node = body["positions"]!!.jsonArray.single().jsonObject
            assertEquals(setOf("id", "positionX", "positionY", "expectedUpdatedAt"), node.keys)
            assertEquals("version-before", node["expectedUpdatedAt"]!!.jsonPrimitive.content)
            respond("""{"code":"LAYOUT_CONFLICT","error":"图谱已变化"}""", HttpStatusCode.Conflict, headersOf(HttpHeaders.ContentType, "application/json"))
        } } }
        try { try { GraphApi("account-session", client).saveLayout("course-1", GraphLayoutInput(listOf(GraphPositionWrite("n1", .5, .4, "version-before")))); fail("Must retain failure") } catch (e: ApiException) { assertEquals(409, e.statusCode) } }
        finally { client.close() }
    }

    @Test fun bridgeRejectsWrongSessionForeignNodeAndNonfiniteOrOutOfRangeCoordinates() {
        val valid = """{"type":"keling-graph:saveRequested","protocol":1,"sessionId":"session","courseId":"course","positions":[{"id":"n1","positionX":0.2,"positionY":0.5}]}"""
        assertNotNull(decodeGraphEvent(valid, "course", "session", setOf("n1")))
        assertNull(decodeGraphEvent(valid, "other", "session", setOf("n1")))
        assertNull(decodeGraphEvent(valid, "course", "stale-session", setOf("n1")))
        assertNull(decodeGraphEvent(valid, "course", "session", setOf("foreign")))
        assertNull(decodeGraphEvent(valid, "course", "session", setOf("n1", "n2")))
        assertNull(decodeGraphEvent(valid.replace("0.2", "2.0"), "course", "session", setOf("n1")))
        assertNull(decodeGraphEvent(valid.replace("saveRequested", "deleteNode"), "course", "session", setOf("n1")))
    }
}
