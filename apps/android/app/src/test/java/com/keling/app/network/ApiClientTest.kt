package com.keling.app.network

import io.ktor.client.engine.mock.*
import io.ktor.http.*
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test

class ApiClientTest {
    @Test fun unauthorizedResponseIsFailureInsteadOfEmptySuccess() = runBlocking {
        val client = createApiHttpClient(MockEngine) {
            engine { addHandler { respond("{\"error\":\"unauthorized\"}", HttpStatusCode.Unauthorized, headersOf(HttpHeaders.ContentType, "application/json")) } }
        }
        try {
            val error = CourseApi(client).getAll("token").exceptionOrNull()
            assertTrue(error is ApiException)
            assertEquals(401, (error as ApiException).statusCode)
        } finally { client.close() }
    }

    @Test fun failedDeleteIsNotReportedAsSuccess() = runBlocking {
        val client = createApiHttpClient(MockEngine) {
            engine { addHandler { respond("unavailable", HttpStatusCode.ServiceUnavailable) } }
        }
        try { assertTrue(CourseApi(client).delete("token", "course").isFailure) }
        finally { client.close() }
    }

    @Test fun successfulEmptyListIsValid() = runBlocking {
        val client = createApiHttpClient(MockEngine) {
            engine { addHandler { respond("{\"courses\":[]}", HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json")) } }
        }
        try { assertEquals(emptyList<CourseData>(), CourseApi(client).getAll("token").getOrThrow().courses) }
        finally { client.close() }
    }

    @Test fun cancellationEscapesResultWrapper() = runBlocking {
        val client = createApiHttpClient(MockEngine) { engine { addHandler { throw CancellationException("cancelled") } } }
        try {
            try { CourseApi(client).getAll("token"); fail("Cancellation must propagate") }
            catch (_: CancellationException) { /* Expected. */ }
        } finally { client.close() }
    }
}
