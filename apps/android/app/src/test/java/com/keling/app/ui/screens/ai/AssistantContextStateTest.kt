package com.keling.app.ui.screens.ai

import com.keling.app.network.*
import io.ktor.client.engine.mock.*
import io.ktor.http.*
import io.ktor.http.content.TextContent
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.*
import kotlinx.serialization.json.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AssistantContextStateTest {
    private val settings = NewAssistantSession("test", "model")
    private val conversation = """{"session":{"id":"s1","title":"学习","providerId":"test","modelId":"model"},"turns":[]}"""
    private val jsonHeaders = headersOf(HttpHeaders.ContentType, "application/json")
    @Before fun installMain() { Dispatchers.setMain(UnconfinedTestDispatcher()) }
    @After fun restoreMain() { Dispatchers.resetMain() }
    private fun catalog(configured: Boolean = true) = """{"providers":[{"id":"test","name":"测试提供商","protocol":"openai","configured":$configured,"chatModels":["model"]}]}"""
    private fun preview(id: String = "n1", version: String = "v1") = """{"ref":{"kind":"note","id":"$id"},"title":"已保存笔记","fingerprint":"$version","sources":[{"id":"$id","kind":"note","title":"笔记","text":"待核对资料","updatedAt":"2026-10-29T01:00:00.000Z","truncated":false}],"warnings":[]}"""
    private suspend fun AssistantViewModel.await(predicate: (AssistantUiState) -> Boolean): AssistantUiState = withTimeout(5000) { state.first(predicate) }

    @Test fun noModelStillPreviewsAndEditsWithoutCreatingConversation() = runBlocking {
        var mutations = 0
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            val body = when {
                request.url.encodedPath.endsWith("/catalog") -> catalog(false)
                request.url.encodedPath.endsWith("/context-preview") -> preview()
                request.method == HttpMethod.Get && request.url.encodedPath.endsWith("/sessions") -> """{"sessions":[]}"""
                else -> { mutations++; conversation }
            }
            respond(body, HttpStatusCode.OK, jsonHeaders)
        } } }
        val vm = AssistantViewModel("account-one", AssistantApi(client))
        try {
            vm.await { !it.busy }
            vm.beginContext(AssistantContextRef("note", "n1"), "我的初始问题")
            vm.await { it.preview != null }
            vm.editPrompt("我修改的问题")
            vm.send(vm.state.value.draft, settings)
            val result = vm.await { !it.busy && it.error != null }
            assertEquals("我修改的问题", result.draft)
            assertNotNull(result.preview)
            assertTrue(result.contextReady)
            assertNull(result.conversation)
            assertEquals(0, mutations)
        } finally { vm.leaveScreen(); client.close() }
    }

    @Test fun changedSourceRequiresManualRefreshAndNewSendKeepsDraft() = runBlocking {
        var sourceVersion = "v1"
        val sent = mutableListOf<JsonObject>()
        var createCount = 0
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            when {
                request.url.encodedPath.endsWith("/catalog") -> respond(catalog(), HttpStatusCode.OK, jsonHeaders)
                request.url.encodedPath.endsWith("/context-preview") -> respond(preview(version = sourceVersion), HttpStatusCode.OK, jsonHeaders)
                request.url.encodedPath.endsWith("/turns") -> {
                    sent += Json.parseToJsonElement((request.body as TextContent).text).jsonObject
                    if (sent.size == 1) respond("""{"error":"资料已更新","code":"CONTEXT_CHANGED"}""", HttpStatusCode.Conflict, jsonHeaders)
                    else respond("""{"id":"t1","status":"RUNNING"}""", HttpStatusCode.Accepted, jsonHeaders)
                }
                request.method == HttpMethod.Post -> {
                    createCount++
                    val body = Json.parseToJsonElement((request.body as TextContent).text).jsonObject
                    assertNotEquals(JsonPrimitive(true), body["includeContext"])
                    respond(conversation, HttpStatusCode.Created, jsonHeaders)
                }
                request.url.encodedPath.endsWith("/sessions") -> respond("""{"sessions":[]}""", HttpStatusCode.OK, jsonHeaders)
                else -> respond(conversation, HttpStatusCode.OK, jsonHeaders)
            }
        } } }
        val vm = AssistantViewModel("account-one", AssistantApi(client))
        try {
            vm.await { !it.busy }
            vm.beginContext(AssistantContextRef("note", "n1"), "请解释这篇笔记")
            vm.await { it.preview != null }
            assertEquals(0, createCount)
            vm.send(vm.state.value.draft, settings.copy(includeContext = true))
            val conflict = vm.await { !it.busy && it.previewError != null }
            assertEquals("请解释这篇笔记", conflict.draft)
            assertNull(conflict.preview)
            assertFalse(conflict.contextReady)
            vm.send(conflict.draft, settings)
            vm.await { !it.busy }
            assertEquals(1, sent.size)
            sourceVersion = "v2"
            vm.refreshPreview()
            vm.await { it.preview?.fingerprint == "v2" }
            assertEquals(1, sent.size)
            assertEquals("请解释这篇笔记", vm.state.value.draft)
            vm.send(vm.state.value.draft, settings)
            vm.await { !it.busy && it.draft.isBlank() }
            assertEquals(1, createCount)
            assertEquals(2, sent.size)
            assertEquals("v1", sent[0].getValue("context").jsonObject.getValue("fingerprint").jsonPrimitive.content)
            assertEquals("v2", sent[1].getValue("context").jsonObject.getValue("fingerprint").jsonPrimitive.content)
            assertNotEquals(sent[0]["clientRequestId"], sent[1]["clientRequestId"])
        } finally { vm.leaveScreen(); client.close() }
    }

    @Test fun removedPreviewCannotReturnFromAnOldRequest() = runBlocking {
        val started = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        val finished = CompletableDeferred<Unit>()
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            val body = when {
                request.url.encodedPath.endsWith("/catalog") -> catalog()
                request.url.encodedPath.endsWith("/context-preview") -> {
                    started.complete(Unit)
                    withContext(NonCancellable) { release.await() }
                    finished.complete(Unit)
                    preview()
                }
                else -> """{"sessions":[]}"""
            }
            respond(body, HttpStatusCode.OK, jsonHeaders)
        } } }
        val vm = AssistantViewModel("account-one", AssistantApi(client))
        try {
            vm.await { !it.busy }
            vm.beginContext(AssistantContextRef("note", "n1"), "保留的问题")
            withTimeout(5000) { started.await() }
            assertFalse(vm.state.value.contextReady)
            vm.removeContext()
            release.complete(Unit)
            withTimeout(5000) { finished.await() }
            assertNull(vm.state.value.preview)
            assertNull(vm.state.value.contextRef)
            assertEquals("保留的问题", vm.state.value.draft)
            assertTrue(vm.state.value.contextReady)
        } finally { release.complete(Unit); vm.leaveScreen(); client.close() }
    }

    @Test fun openingHistoryAndNewConversationClearPriorSourceAndDraft() = runBlocking {
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            val body = when {
                request.url.encodedPath.endsWith("/catalog") -> catalog()
                request.url.encodedPath.endsWith("/context-preview") -> preview()
                request.url.encodedPath.endsWith("/sessions") -> """{"sessions":[]}"""
                else -> conversation
            }
            respond(body, HttpStatusCode.OK, jsonHeaders)
        } } }
        val vm = AssistantViewModel("account-one", AssistantApi(client))
        try {
            vm.await { !it.busy }
            vm.beginContext(AssistantContextRef("note", "n1"), "来源问题")
            vm.await { it.preview != null }
            vm.open("s1")
            val history = vm.await { !it.busy && it.conversation != null }
            assertNull(history.contextRef)
            assertNull(history.preview)
            assertEquals("", history.draft)
            vm.editPrompt("历史会话草稿")
            vm.newConversation()
            assertNull(vm.state.value.conversation)
            assertEquals("", vm.state.value.draft)
            vm.beginContext(AssistantContextRef("note", "n1"), "临时问题")
            vm.await { it.preview != null }
            vm.leaveScreen()
            assertNull(vm.state.value.contextRef)
            assertNull(vm.state.value.preview)
            assertEquals("", vm.state.value.draft)
        } finally { vm.leaveScreen(); client.close() }
    }

    @Test fun inaccessibleSourceKeepsQuestionAndBlocksSendUntilRemoved() = runBlocking {
        var mutations = 0
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            when {
                request.url.encodedPath.endsWith("/context-preview") -> respond("""{"error":"不可访问","code":"CONTEXT_NOT_FOUND"}""", HttpStatusCode.NotFound, jsonHeaders)
                request.url.encodedPath.endsWith("/catalog") -> respond(catalog(), HttpStatusCode.OK, jsonHeaders)
                request.method == HttpMethod.Get -> respond("""{"sessions":[]}""", HttpStatusCode.OK, jsonHeaders)
                else -> { mutations++; respond(conversation, HttpStatusCode.Created, jsonHeaders) }
            }
        } } }
        val vm = AssistantViewModel("account-one", AssistantApi(client))
        try {
            vm.await { !it.busy }
            vm.beginContext(AssistantContextRef("note", "deleted-or-not-owned"), "我的问题")
            val missing = vm.await { it.previewError != null }
            assertFalse(missing.previewLoading)
            assertFalse(missing.contextReady)
            assertEquals("我的问题", missing.draft)
            vm.send(missing.draft, settings)
            vm.await { !it.busy }
            assertEquals(0, mutations)
            vm.removeContext()
            assertTrue(vm.state.value.contextReady)
            assertEquals("我的问题", vm.state.value.draft)
        } finally { vm.leaveScreen(); client.close() }
    }

    @Test fun lateHistoryResponseCannotOverwriteNewContextConversation() = runBlocking {
        val started = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        val finished = CompletableDeferred<Unit>()
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            val body = when {
                request.url.encodedPath.endsWith("/catalog") -> catalog()
                request.url.encodedPath.endsWith("/context-preview") -> preview()
                request.url.encodedPath.endsWith("/sessions") -> """{"sessions":[]}"""
                else -> {
                    started.complete(Unit)
                    withContext(NonCancellable) { release.await() }
                    finished.complete(Unit)
                    conversation
                }
            }
            respond(body, HttpStatusCode.OK, jsonHeaders)
        } } }
        val vm = AssistantViewModel("account-one", AssistantApi(client))
        try {
            vm.await { !it.busy }
            vm.open("s1")
            withTimeout(5000) { started.await() }
            vm.beginContext(AssistantContextRef("note", "n1"), "新主题")
            vm.await { it.preview != null }
            release.complete(Unit)
            withTimeout(5000) { finished.await() }
            assertNull(vm.state.value.conversation)
            assertEquals("n1", vm.state.value.preview?.ref?.id)
            assertEquals("新主题", vm.state.value.draft)
        } finally { release.complete(Unit); vm.leaveScreen(); client.close() }
    }
}
