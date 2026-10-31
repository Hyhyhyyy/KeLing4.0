package com.keling.app.network

import com.keling.app.data.PlanetStyles
import io.ktor.client.engine.mock.*
import io.ktor.http.*
import io.ktor.http.content.TextContent
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

class CoursePlanetTest {
    private val headers = headersOf(HttpHeaders.ContentType, "application/json")

    @Test fun accountCreateAndStyleOnlyUpdateUseSharedContract() = runBlocking {
        val paths = mutableListOf<String>()
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            assertEquals("Bearer account-session", request.headers[HttpHeaders.Authorization])
            val body = Json.parseToJsonElement((request.body as TextContent).text).jsonObject
            paths.add(request.url.encodedPath)
            when (request.method) {
                HttpMethod.Post -> {
                    assertEquals(setOf("name", "planetStyleIndex"), body.keys)
                    assertEquals(9, body.getValue("planetStyleIndex").jsonPrimitive.int)
                    respond("""{"course":{"id":"course-1","name":"物理","planetStyleIndex":9}}""", HttpStatusCode.OK, headers)
                }
                HttpMethod.Put -> {
                    // Existing material, name, mastery and schedule must not be sent as defaults.
                    assertEquals(setOf("planetStyleIndex"), body.keys)
                    assertEquals(3, body.getValue("planetStyleIndex").jsonPrimitive.int)
                    respond("""{"course":{"id":"course-1","name":"物理","planetStyleIndex":3,"totalStudyMinutes":127,"masteryLevel":0.8}}""", HttpStatusCode.OK, headers)
                }
                else -> error("Unexpected course request")
            }
        } } }
        try {
            val created = AgentApi(client).createCourse("account-session", "物理", 9).course!!
            assertEquals(9, created.planetStyleIndex)
            val updated = WorkspaceApi(client).updatePlanet("account-session", created.id, 3).course!!
            assertEquals(3, updated.planetStyleIndex)
            assertEquals("物理", updated.name)
            assertEquals(127, updated.totalStudyMinutes)
            assertEquals(0.8, updated.masteryLevel, 0.001)
            assertTrue(paths[0].endsWith("/courses"))
            assertTrue(paths[1].endsWith("/courses/course-1"))
        } finally { client.close() }
    }

    @Test fun guestPlanetChangesPreserveMaterialStayIsolatedAndNeverHitAccountNetwork() = runBlocking {
        val client = createApiHttpClient(MockEngine) { engine { addHandler { error("Guest must stay in memory") } } }
        val first = GuestWorkspaces.create(client); val second = GuestWorkspaces.create(client)
        try {
            val agent = AgentApi(client); val api = WorkspaceApi(client)
            val created = agent.createCourse(first.token, "保留资料的课程", 8).course!!
            agent.addSource(first.token, created.id, "原有资料", "这段资料不可被换装覆盖")
            val before = api.courses(first.token).courses!!.first { it.id == created.id }
            for (index in 0..9) {
                val after = api.updatePlanet(first.token, created.id, index).course!!
                assertEquals(before.copy(planetStyleIndex = index), after)
                assertEquals(index, agent.courses(first.token).courses.first { it.id == created.id }.planetStyleIndex)
                assertEquals("这段资料不可被换装覆盖", agent.sources(first.token, created.id).nodes.single().description)
            }
            assertFalse(api.courses(second.token).courses!!.any { it.id == created.id })
            for (bad in listOf(-1, 10, Int.MAX_VALUE)) {
                try { api.updatePlanet(first.token, created.id, bad); fail("Reject invalid style") } catch (_: IllegalArgumentException) { }
                try { agent.createCourse(first.token, "无效", bad); fail("Reject invalid new style") } catch (_: IllegalArgumentException) { }
            }
            assertEquals(2, api.courses(first.token).courses!!.size)
            GuestWorkspaces.close(first.token)
            try { api.updatePlanet(first.token, created.id, 0); fail("Closed guest must fail closed") } catch (e: ApiException) { assertEquals(410, e.statusCode) }
        } finally { GuestWorkspaces.close(first.token); GuestWorkspaces.close(second.token); client.close() }
    }

    @Test fun newCatalogAndLegacyAssetsResolveWithoutRewritingStoredIndices() {
        assertEquals(10, PlanetStyles.entries.size)
        assertEquals(10, PlanetStyles.entries.map { it.assetPath }.toSet().size)
        assertEquals("翡翠书环", PlanetStyles.name(0))
        assertEquals("银月陨坑", PlanetStyles.name(9))
        assertEquals("stellar/planet_01.webp", PlanetStyles.assetPath(0))
        assertEquals("stellar/planet_10.webp", PlanetStyles.assetPath(9))
        assertEquals("legacy-planets/planet-10.png", PlanetStyles.assetPath(10))
        assertEquals("legacy-planets/planet-25.png", PlanetStyles.assetPath(25))
        assertEquals(PlanetStyles.assetPath(-1, "old-course"), PlanetStyles.assetPath(-1, "old-course"))
        assertTrue(PlanetStyles.entries.any { it.assetPath == PlanetStyles.assetPath(-1, "old-course") })
        assertEquals("stellar/planet_01.webp", PlanetStyles.assetPath(999))
        for (index in 0..25) {
            val root = if (index < 10) "../../../assets" else "src/main/assets"
            val resolved = java.io.File(root, PlanetStyles.assetPath(index))
            assertTrue("Missing planet source asset for index $index", resolved.isFile)
        }
    }
}
