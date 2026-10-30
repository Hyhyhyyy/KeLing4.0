package com.keling.app.network

import io.ktor.client.engine.mock.*
import io.ktor.http.*
import io.ktor.http.content.TextContent
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

class AssistantApiTest {
    @Test fun sharedAssistantUsesAccountTokenAndStableRequestId() = runBlocking {
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            assertEquals("Bearer user-session", request.headers[HttpHeaders.Authorization])
            assertTrue(request.url.encodedPath.endsWith("/ai/sessions/s1/turns"))
            val body = (request.body as TextContent).text
            assertTrue(body.contains("clientRequestId")); assertTrue(body.contains("request-stable")); assertFalse(body.contains("API_KEY"))
            assertFalse(Json.parseToJsonElement(body).jsonObject.containsKey("context"))
            respond("""{"id":"t1","status":"RUNNING"}""", HttpStatusCode.Accepted, headersOf(HttpHeaders.ContentType, "application/json"))
        } } }
        try { val receipt = AssistantApi(client).send("user-session", "s1", "解释极限", "request-stable"); assertEquals("RUNNING", receipt.status) } finally { client.close() }
    }
    @Test fun retrievalSourcesAndUsageSurviveNativeDecoding() = runBlocking {
        val client = createApiHttpClient(MockEngine) { engine { addHandler {
            respond("""{"session":{"id":"s","title":"主题","providerId":"gemini","modelId":"configured-model","activeRequestId":""},"turns":[{"id":"t","status":"SUCCEEDED","userText":"问题","assistantText":"答案 [资料1]","modelId":"configured-model","sources":[{"id":"n","title":"课堂笔记","text":"资料正文","kind":"note"}],"usage":{"inputTokens":9,"outputTokens":4}}]}""", HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
        } } }
        try { val data = AssistantApi(client).get("token", "s"); assertEquals("课堂笔记", data.turns.single().sources.single().title); assertEquals(9, data.turns.single().usage.inputTokens); assertNull(data.turns.single().sources.single().updatedAt); assertFalse(data.turns.single().sources.single().truncated) } finally { client.close() }
    }
    @Test fun previewSendsOnlyAuthenticatedReferenceForAllEntryKinds() = runBlocking {
        val kinds = mutableListOf<String>()
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            assertEquals(HttpMethod.Post, request.method)
            assertTrue(request.url.encodedPath.endsWith("/ai/context-preview"))
            assertEquals("Bearer own-account", request.headers[HttpHeaders.Authorization])
            val body = Json.parseToJsonElement((request.body as TextContent).text).jsonObject
            assertEquals(setOf("kind", "id"), body.keys)
            val kind = body.getValue("kind").jsonPrimitive.content
            kinds += kind
            respond("""{"ref":{"kind":"$kind","id":"source-1"},"title":"真实资料","fingerprint":"version-one","sources":[{"id":"source-1","kind":"$kind","title":"摘录","text":"限定范围","updatedAt":"2026-10-29T01:00:00.000Z","truncated":true}],"warnings":["正文已截断"]}""", HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
        } } }
        try {
            for (kind in listOf("course", "task", "note")) {
                val preview = AssistantApi(client).preview("own-account", AssistantContextRef(kind, "source-1"))
                assertEquals(kind, preview.ref.kind)
                assertEquals("version-one", preview.input().fingerprint)
                assertTrue(preview.sources.single().truncated)
                assertEquals("2026-10-29T01:00:00.000Z", preview.sources.single().updatedAt)
                assertEquals(listOf("正文已截断"), preview.warnings)
            }
            assertEquals(listOf("course", "task", "note"), kinds)
        } finally { client.close() }
    }
    @Test fun sendEncodesFingerprintWithoutSourceText() = runBlocking {
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            val body = Json.parseToJsonElement((request.body as TextContent).text).jsonObject
            val context = body.getValue("context").jsonObject
            assertEquals(setOf("kind", "id", "fingerprint"), context.keys)
            assertEquals("note", context.getValue("kind").jsonPrimitive.content)
            assertEquals("note-1", context.getValue("id").jsonPrimitive.content)
            assertEquals("sha256-reviewed-snapshot", context.getValue("fingerprint").jsonPrimitive.content)
            assertEquals("request-with-context", body.getValue("clientRequestId").jsonPrimitive.content)
            respond("""{"id":"t1","status":"RUNNING"}""", HttpStatusCode.Accepted, headersOf(HttpHeaders.ContentType, "application/json"))
        } } }
        try { assertEquals("RUNNING", AssistantApi(client).send("token", "s1", "解释", "request-with-context", AssistantContextInput("note", "note-1", "sha256-reviewed-snapshot")).status) }
        finally { client.close() }
    }
    @Test fun failedTurnRetainsVersionedSnapshot() = runBlocking {
        val client = createApiHttpClient(MockEngine) { engine { addHandler {
            respond("""{"session":{"id":"s","title":"主题","providerId":"gemini","modelId":"model"},"turns":[{"id":"failed","status":"FAILED","userText":"问题","error":"服务超时","modelId":"model","sources":[{"id":"n","kind":"note","title":"提交时的标题","text":"提交时的片段","updatedAt":"2026-10-29T02:00:00.000Z","truncated":true}]}]}""", HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
        } } }
        try {
            val turn = AssistantApi(client).get("token", "s").turns.single()
            assertEquals("FAILED", turn.status)
            assertEquals("提交时的片段", turn.sources.single().text)
            assertEquals("2026-10-29T02:00:00.000Z", turn.sources.single().updatedAt)
            assertTrue(turn.sources.single().truncated)
        } finally { client.close() }
    }
    @Test fun conflictingNoteEditIsNotSilentlyOverwritten() = runBlocking {
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            assertTrue((request.body as TextContent).text.contains("expectedUpdatedAt"))
            respond("""{"error":"笔记已在另一端修改"}""", HttpStatusCode.Conflict, headersOf(HttpHeaders.ContentType, "application/json"))
        } } }
        try { WorkspaceApi(client).saveNote("token", "n", WorkspaceNoteInput("标题", "内容", "2026-10-29T00:00:00.000Z")); fail("Expected conflict") }
        catch (e: ApiException) { assertEquals(409, e.statusCode); assertTrue(e.message!!.contains("另一端")) }
        finally { client.close() }
    }
}
