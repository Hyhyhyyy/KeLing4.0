package com.keling.app.network

import io.ktor.client.engine.mock.*
import io.ktor.client.request.get
import io.ktor.http.*
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test

class ConnectionSettingsTest {
    @Test fun hostedPrefixAndKnownAccountAliasAreExplicit() {
        assertEquals(DIRECT_CLOUD_API, normalizeEndpoint(DIRECT_CLOUD_API.removeSuffix("/api")))
        assertTrue(sameAccountService(LEGACY_CLOUD_API, DIRECT_CLOUD_API))
        assertFalse(sameAccountService(LEGACY_CLOUD_API, "https://different.example/api"))
        assertTrue(runCatching { normalizeEndpoint(DIRECT_CLOUD_API + "/../auth") }.isFailure)
    }
    @Test fun hostingCsrfIsSentOnlyToTheKnownHostingService() = runBlocking<Unit> {
        val client = createApiHttpClient(MockEngine) { engine { addHandler {
            if (it.url.host == "ucn5aajxnx7f.feishu.link") {
                val csrf = it.headers["X-Suda-Csrf-Token"]
                assertFalse(csrf.isNullOrBlank())
                assertEquals("suda-csrf-token=$csrf", it.headers[HttpHeaders.Cookie])
            } else { assertNull(it.headers[HttpHeaders.Cookie]); assertNull(it.headers["X-Suda-Csrf-Token"]) }
            respond("{}", HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
        } } }
        try { client.get("$DIRECT_CLOUD_API/health"); client.get("https://other.example/api/health") }
        finally { client.close() }
    }
    @Test fun endpointRequiresSecureUnambiguousServer() {
        assertEquals("https://learn.example/api", normalizeEndpoint(" HTTPS://Learn.Example/ "))
        for (bad in listOf("http://learn.example", "https://u:p@learn.example", "https://learn.example/?key=x", "https://learn.example/foo", "https://learn.example/#x")) {
            assertTrue(runCatching { normalizeEndpoint(bad) }.isFailure)
        }
    }
    @Test fun validationAcceptsTrimmedEmailAndOneCharacterName() {
        assertNull(authInputError(" A@Example.com ", "abcdefghij", "名"))
        assertNotNull(authInputError("not-email", "abcdefghij"))
        assertNotNull(authInputError("a@b.com", "short", "名"))
        assertNull(authInputError("a@b.com", "legacy"))
    }
    @Test fun unreachableHostDoesNotBlamePasswordOrExposeRawException() {
        val message = connectionError(java.io.IOException("private transport details", java.net.UnknownHostException("internal-host")))
        assertTrue(message.contains("无法解析")); assertFalse(message.contains("internal-host"))
        assertTrue(connectionError(java.net.SocketTimeoutException()).contains("超时"))
    }
    @Test fun aliveServerWithUnavailableDatabaseFailsReadiness() = runBlocking {
        var requests = 0
        val client = createApiHttpClient(MockEngine) {
            engine { addHandler {
                requests++
                if (it.url.encodedPath.endsWith("/health")) respond("""{"status":"ok","version":"test"}""", HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
                else respond("""{"status":"unavailable"}""", HttpStatusCode.ServiceUnavailable, headersOf(HttpHeaders.ContentType, "application/json"))
            } }
        }
        try {
            assertTrue(runCatching { checkAccountService(client, "https://learn.example") }.isFailure)
            assertEquals(2, requests)
        } finally { client.close() }
    }
    @Test fun registerResponseAndRejectedLoginAreHandled() = runBlocking {
        val client = createApiHttpClient(MockEngine) { engine { addHandler {
            assertEquals(ContentType.Application.Json, it.body.contentType)
            if (it.url.encodedPath.endsWith("/register")) respond("""{"token":"session","user":{"id":"id","name":"名","email":"a@b.com"}}""", HttpStatusCode.Created, headersOf(HttpHeaders.ContentType,"application/json"))
            else respond("""{"error":"邮箱或密码错误"}""", HttpStatusCode.Unauthorized, headersOf(HttpHeaders.ContentType,"application/json"))
        } } }
        try {
            assertEquals("session", AuthApi(client).register("名","a@b.com","abcdefghij").getOrThrow().token)
            val failure = AuthApi(client).login("a@b.com","wrong").exceptionOrNull() as ApiException
            assertEquals(401, failure.statusCode)
            assertTrue(failure.message!!.contains("邮箱或密码错误"))
        } finally { client.close() }
    }
}
