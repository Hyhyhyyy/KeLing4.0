package com.keling.app.network

import io.ktor.client.engine.mock.*
import io.ktor.client.request.*
import io.ktor.http.*
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test

class AiJobsTest {
    private val headers = headersOf(HttpHeaders.ContentType, "application/json")

    @Test fun synchronousByokAndAnonymousJobsUseTheirOwnResponseContracts() = runBlocking {
        var polls = 0
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            assertNull(request.headers[HttpHeaders.Authorization])
            when (request.url.encodedPath) {
                "/sync" -> respond("""{"answer":"BYOK fixture","model":"own"}""", HttpStatusCode.OK, headers)
                "/async" -> respond("""{"jobId":"job-1","jobToken":"fixture-job-token","status":"RUNNING"}""", HttpStatusCode.Accepted, headers)
                "/api/ai-jobs/job-1" -> {
                    assertEquals("fixture-job-token", request.headers["X-AI-Job-Token"])
                    polls++
                    respond(if (polls == 1) """{"jobId":"job-1","status":"RUNNING"}""" else """{"jobId":"job-1","status":"SUCCEEDED","result":{"answer":"Hosted fixture","model":"miaoda-chat"}}""", HttpStatusCode.OK, headers)
                }
                else -> error("Unexpected request")
            }
        } } }
        try {
            val sync = awaitAiResult(client, client.post("https://fixture.test/sync"), TrialAnswer.serializer())
            assertEquals("own", sync.model); assertEquals(0, polls)
            val async = awaitAiResult(client, client.post("https://fixture.test/async"), TrialAnswer.serializer(), origin = "https://fixture.test/api")
            assertEquals("Hosted fixture", async.answer); assertEquals(2, polls)
        } finally { client.close() }
    }

    @Test fun accountJobUsesBearerAndFailedResultNeverBecomesAnAnswer() = runBlocking {
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            if (request.url.encodedPath == "/start") respond("""{"jobId":"account-job","status":"RUNNING"}""", HttpStatusCode.Accepted, headers)
            else {
                assertEquals("Bearer fixture-session", request.headers[HttpHeaders.Authorization])
                assertNull(request.headers["X-AI-Job-Token"])
                respond("""{"jobId":"account-job","status":"FAILED","code":"MODEL_FAILED","error":"模型暂不可用"}""", HttpStatusCode.OK, headers)
            }
        } } }
        try {
            try { awaitAiResult(client, client.post("https://fixture.test/start"), TrialAnswer.serializer(), "fixture-session", "https://fixture.test/api"); fail("Failed job must throw") }
            catch (e: ApiException) { assertEquals("模型暂不可用", e.message) }
        } finally { client.close() }
    }

    @Test fun cancellationStopsPollingAndDoesNotTurnIntoFailureOrSuccess() = runBlocking {
        var polls = 0
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            if (request.url.encodedPath == "/start") respond("""{"jobId":"cancel-job","jobToken":"fixture","status":"RUNNING"}""", HttpStatusCode.Accepted, headers)
            else { polls++; respond("""{"jobId":"cancel-job","status":"RUNNING"}""", HttpStatusCode.OK, headers) }
        } } }
        try {
            val pending = async { awaitAiResult(client, client.post("https://fixture.test/start"), TrialAnswer.serializer(), origin = "https://fixture.test/api") }
            withTimeout(5000) { while (polls == 0) delay(20) }
            pending.cancelAndJoin()
            val before = polls
            delay(1600)
            assertTrue(pending.isCancelled); assertTrue(before > 0); assertEquals(before, polls)
        } finally { client.close() }
    }
}
