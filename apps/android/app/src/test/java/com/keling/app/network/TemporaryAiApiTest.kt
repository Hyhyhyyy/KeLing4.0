package com.keling.app.network

import io.ktor.client.engine.mock.*
import io.ktor.http.*
import io.ktor.http.content.TextContent
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

class TemporaryAiApiTest {
    private val headers = headersOf(HttpHeaders.ContentType, "application/json")
    @Test fun trialConfigAndQuestionUsePublicEndpointsWithoutAccountHeaders() = runBlocking {
        val paths = mutableListOf<String>()
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            assertNull(request.headers[HttpHeaders.Authorization])
            paths += request.url.encodedPath
            if (request.method == HttpMethod.Get) respond("""{"ai":{"available":false,"model":null,"reason":"未配置"}}""", HttpStatusCode.OK, headers)
            else {
                val body = Json.parseToJsonElement((request.body as TextContent).text).jsonObject
                assertEquals(setOf("message", "context"), body.keys)
                assertEquals("限定资料", body.getValue("context").jsonArray.single().jsonObject.getValue("text").jsonPrimitive.content)
                respond("""{"answer":"测试回答","model":"test-model","usage":{"inputTokens":3}}""", HttpStatusCode.OK, headers)
            }
        } } }
        try {
            val api = TrialApi(client)
            assertFalse(api.config().ai.available)
            assertEquals("测试回答", api.ask(TrialQuestion("问题", listOf(TrialContext("资料", "限定资料")))).answer)
            assertTrue(paths[0].endsWith("/trial/config")); assertTrue(paths[1].endsWith("/trial/ai"))
        } finally { client.close() }
    }
    @Test fun invalidTrialContextIsRejectedBeforeNetwork() = runBlocking {
        var requests = 0
        val client = createApiHttpClient(MockEngine) { engine { addHandler { requests++; respond("{}", HttpStatusCode.OK, headers) } } }
        try {
            try { TrialApi(client).ask(TrialQuestion("问题", listOf(TrialContext("资料", "x".repeat(2001))))); fail("Expected input validation") }
            catch (_: IllegalArgumentException) { }
            assertEquals(0, requests)
        } finally { client.close() }
    }
    @Test fun privateKeyGoesOnlyToExplicitSelectedProviderRequestAndIsNotAccountAuth() = runBlocking {
        val paths = mutableListOf<String>()
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            paths += request.url.encodedPath
            assertNull(request.headers[HttpHeaders.Authorization])
            if (request.method == HttpMethod.Get) respond("""{"providers":[]}""", HttpStatusCode.OK, headers)
            else {
                val body = Json.parseToJsonElement((request.body as TextContent).text).jsonObject
                assertEquals("anthropic", body.getValue("providerId").jsonPrimitive.content)
                assertEquals("not-a-real-key", body.getValue("apiKey").jsonPrimitive.content)
                assertFalse(body.containsKey("baseUrl"))
                assertFalse(body.containsKey("token")); assertFalse(body.containsKey("sessionId"))
                if (request.url.encodedPath.endsWith("/discover")) respond("""{"providerId":"anthropic","models":[{"id":"test-model","capabilities":[]}],"fetchedAt":"2026-10-30T00:00:00Z","note":"能力未报告"}""", HttpStatusCode.OK, headers)
                else {
                    assertEquals("test-model", body.getValue("model").jsonPrimitive.content)
                    assertEquals("问题", body.getValue("message").jsonPrimitive.content)
                    respond("""{"answer":"测试响应","model":"test-model","usage":{}}""", HttpStatusCode.OK, headers)
                }
            }
        } } }
        try {
            val api = ModelAccessApi(client)
            api.catalog()
            assertTrue(api.discover(AccessCredentials("anthropic", "not-a-real-key")).models.single().capabilities.isEmpty())
            assertEquals("测试响应", api.complete(AccessQuestion("anthropic", "not-a-real-key", "test-model", "问题")).answer)
            assertEquals(3, paths.size)
            assertTrue(paths.all { it.contains("/model-access/") })
            assertFalse(AccessCredentials("anthropic", "not-a-real-key").toString().contains("not-a-real-key"))
        } finally { client.close() }
    }
}
