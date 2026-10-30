package com.keling.app.ui.screens.ai

import com.keling.app.network.*
import com.keling.app.ui.screens.trial.TrialSession
import io.ktor.client.engine.mock.*
import io.ktor.http.*
import io.ktor.http.content.TextContent
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

class TemporaryAiStateTest {
    private val headers = headersOf(HttpHeaders.ContentType, "application/json")
    private val catalog = """{"providers":[{"id":"openai","name":"OpenAI","documentation":"https://platform.openai.com/docs","chat":true,"embedding":true}]}"""
    @Test fun trialDataIsIsolatedAndCloseDropsEveryUserEntry() {
        val client = createApiHttpClient(MockEngine) { engine { addHandler { error("Memory changes must not make network requests") } } }
        val first = TrialSession(TrialApi(client)); val second = TrialSession(TrialApi(client))
        try {
            first.addTask("私人临时任务", "说明", 25)
            val task = first.state.value.tasks.last()
            first.completeTask(task.id, 2); first.completeTask(task.id, 1)
            assertEquals(2, first.state.value.tasks.last().focusMinutes)
            first.saveNote(null, "私人临时笔记", "仅内存")
            val note = first.state.value.notes.last()
            first.saveNote(note.id, "已编辑", "新内容")
            assertEquals("新内容", first.state.value.notes.last().text)
            assertFalse(second.state.value.tasks.any { it.id == task.id })
            assertFalse(second.state.value.notes.any { it.id == note.id })
            first.deleteTask(task.id); first.deleteNote(note.id)
            assertFalse(first.state.value.tasks.any { it.id == task.id })
            first.selectContext(listOf(TrialContext("临时", "资料")), "问题")
            first.showExample()
            assertTrue(first.state.value.example)
            first.close()
            assertTrue(first.state.value.courses.isEmpty()); assertTrue(first.state.value.tasks.isEmpty()); assertTrue(first.state.value.notes.isEmpty())
            assertTrue(first.state.value.context.isEmpty()); assertEquals("", first.state.value.prompt); assertEquals("", first.state.value.answer)
            first.saveNote(null, "关闭后", "不会回填")
            assertTrue(first.state.value.notes.isEmpty())
        } finally { first.close(); second.close(); client.close() }
    }
    @Test fun trialPreviewIsABoundedSnapshotAndExampleDoesNotSend() {
        val client = createApiHttpClient(MockEngine) { engine { addHandler { error("Preview and example must stay local") } } }
        val session = TrialSession(TrialApi(client))
        try {
            session.selectContext((1..4).map { TrialContext("标题".repeat(100), "x".repeat(2500)) }, "q".repeat(4500))
            assertEquals(3, session.state.value.context.size)
            assertTrue(session.state.value.context.all { it.text.length == 2000 && it.title.length == 120 && it.truncated })
            assertEquals(4000, session.state.value.prompt.length)
            session.removeContext(1)
            assertEquals(2, session.state.value.context.size)
            session.showExample()
            assertTrue(session.state.value.answer.contains("不是实际 AI"))
            assertEquals(4000, session.state.value.prompt.length)
        } finally { session.close(); client.close() }
    }
    @Test fun trialUnavailableModelCannotSendAndPreservesQuestion() = runBlocking {
        var posts = 0
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            if (request.method == HttpMethod.Post) posts++
            respond("""{"ai":{"available":false,"model":null,"reason":"没有模型"}}""", HttpStatusCode.OK, headers)
        } } }
        val session = TrialSession(TrialApi(client))
        try {
            session.loadConfig(this)
            withTimeout(5000) { session.state.first { it.config != null && !it.configuring } }
            session.editPrompt("保留问题"); session.send(this)
            assertEquals(0, posts)
            assertEquals("保留问题", session.state.value.prompt)
            assertEquals("没有模型", session.state.value.error)
        } finally { session.close(); client.close() }
    }
    @Test fun keyPrefixCandidateNeverTreatsSharedPrefixesAsVerifiedProvider() {
        assertEquals("anthropic", identifyKeyCandidate("sk-ant-demo").providerId)
        assertEquals("openai", identifyKeyCandidate("sk-proj-demo").providerId)
        assertEquals("openai", identifyKeyCandidate("sk-svcacct-demo").providerId)
        assertEquals("gemini", identifyKeyCandidate("AIzaDemo").providerId)
        assertNull(identifyKeyCandidate("sk-shared-demo").providerId)
        assertNull(identifyKeyCandidate("aaa.bbb.ccc").providerId)
        assertNull(identifyKeyCandidate("").providerId)
    }
    @Test fun realTrialAnswerNeedsExplicitMemoryNoteOrTaskCreation() = runBlocking {
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            if (request.method == HttpMethod.Get) respond("""{"ai":{"available":true,"model":"test-model","reason":""}}""", HttpStatusCode.OK, headers)
            else respond("""{"answer":"先阅读定义，再做一道题。","model":"test-model","usage":{"outputTokens":8}}""", HttpStatusCode.OK, headers)
        } } }
        val session = TrialSession(TrialApi(client))
        try {
            val noteCount = session.state.value.notes.size; val taskCount = session.state.value.tasks.size
            session.loadConfig(this)
            withTimeout(5000) { session.state.first { it.config != null && !it.configuring } }
            session.editPrompt("如何开始？"); session.send(this)
            val response = withTimeout(5000) { session.state.first { !it.sending && it.answer.isNotBlank() } }
            assertFalse(response.example); assertEquals("test-model", response.answerModel)
            assertEquals(noteCount, response.notes.size); assertEquals(taskCount, response.tasks.size)
            session.saveNote(null, "明确保存", response.answer)
            session.addTask("我确认的任务", response.answer, 10)
            assertEquals(noteCount + 1, session.state.value.notes.size)
            assertEquals(taskCount + 1, session.state.value.tasks.size)
        } finally { session.close(); client.close() }
    }
    @Test fun trialCancelKeepsDraftAndExitRejectsLateReply() = runBlocking {
        val started = CompletableDeferred<Unit>(); val release = CompletableDeferred<Unit>(); val finished = CompletableDeferred<Unit>()
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            if (request.method == HttpMethod.Get) respond("""{"ai":{"available":true,"model":"test-model","reason":""}}""", HttpStatusCode.OK, headers)
            else {
                started.complete(Unit)
                withContext(NonCancellable) { release.await() }
                finished.complete(Unit)
                respond("""{"answer":"late","model":"test-model"}""", HttpStatusCode.OK, headers)
            }
        } } }
        val session = TrialSession(TrialApi(client))
        try {
            session.loadConfig(this)
            withTimeout(5000) { session.state.first { it.config != null && !it.configuring } }
            session.editPrompt("还未收到回答的问题"); session.send(this)
            withTimeout(5000) { started.await() }
            session.cancel()
            assertEquals("还未收到回答的问题", session.state.value.prompt)
            assertFalse(session.state.value.sending)
            session.close(); release.complete(Unit)
            withTimeout(5000) { finished.await() }
            assertEquals("", session.state.value.answer); assertTrue(session.state.value.notes.isEmpty())
        } finally { release.complete(Unit); session.close(); client.close() }
    }
    @Test fun keyEditsStayLocalAndOnlyExplicitDiscoveryUsesSelectedProvider() = runBlocking {
        val posts = mutableListOf<JsonObject>()
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            if (request.method == HttpMethod.Get) respond(catalog, HttpStatusCode.OK, headers)
            else {
                posts += Json.parseToJsonElement((request.body as TextContent).text).jsonObject
                if (request.url.encodedPath.endsWith("/discover")) respond("""{"providerId":"openai","models":[{"id":"embedding-only","capabilities":["embedding"]},{"id":"unknown-model","capabilities":[]}],"fetchedAt":"now","note":"能力未知"}""", HttpStatusCode.OK, headers)
                else respond("""{"answer":"实际请求测试","model":"unknown-model"}""", HttpStatusCode.OK, headers)
            }
        } } }
        val session = ModelAccessSession("问题", api = ModelAccessApi(client))
        try {
            session.loadCatalog(this)
            withTimeout(5000) { session.state.first { it.providers.isNotEmpty() } }
            session.editKey("sk-proj-local-test"); session.selectProvider("openai")
            assertEquals(0, posts.size)
            session.discover(this)
            withTimeout(5000) { session.state.first { !it.busy && it.models.isNotEmpty() } }
            assertEquals(1, posts.size)
            assertEquals("openai", posts.single().getValue("providerId").jsonPrimitive.content)
            session.editModel("embedding-only"); assertFalse(session.state.value.canSend)
            session.editModel("unknown-model"); assertTrue(session.state.value.canSend)
            session.send(this)
            withTimeout(5000) { session.state.first { !it.busy && it.answer != null } }
            assertEquals(2, posts.size)
            assertEquals("", session.state.value.message)
            session.editKey("second-key")
            assertTrue(session.state.value.models.isEmpty()); assertEquals("", session.state.value.model); assertNull(session.state.value.answer)
            assertFalse(session.state.value.toString().contains("second-key"))
            session.close()
            assertEquals("", session.state.value.apiKey); assertTrue(session.state.value.models.isEmpty())
        } finally { session.close(); client.close() }
    }
    @Test fun failedKeyRequestKeepsQuestionWithoutDisplayingCredential() = runBlocking {
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            if (request.method == HttpMethod.Get) respond(catalog, HttpStatusCode.OK, headers)
            else respond("""{"error":"do not echo secret-test-key"}""", HttpStatusCode.BadRequest, headers)
        } } }
        val session = ModelAccessSession("问题必须保留", api = ModelAccessApi(client))
        try {
            session.loadCatalog(this)
            withTimeout(5000) { session.state.first { it.providers.isNotEmpty() } }
            session.selectProvider("openai"); session.editKey("secret-test-key"); session.editModel("manual-model")
            session.send(this)
            withTimeout(5000) { session.state.first { !it.busy && it.error != null } }
            assertEquals("问题必须保留", session.state.value.message)
            assertFalse(session.state.value.error!!.contains("secret-test-key"))
        } finally { session.close(); client.close() }
    }
    @Test fun closingKeyPanelPreventsLateResponseFromRestoringSecretsOrAnswer() = runBlocking {
        val started = CompletableDeferred<Unit>(); val release = CompletableDeferred<Unit>(); val finished = CompletableDeferred<Unit>()
        val client = createApiHttpClient(MockEngine) { engine { addHandler { request ->
            if (request.method == HttpMethod.Get) respond(catalog, HttpStatusCode.OK, headers)
            else {
                started.complete(Unit)
                withContext(NonCancellable) { release.await() }
                finished.complete(Unit)
                respond("""{"answer":"late","model":"manual"}""", HttpStatusCode.OK, headers)
            }
        } } }
        val session = ModelAccessSession("私密问题", listOf(TrialContext("私密资料", "内存内容")), ModelAccessApi(client))
        try {
            session.loadCatalog(this)
            withTimeout(5000) { session.state.first { it.providers.isNotEmpty() } }
            session.selectProvider("openai"); session.editKey("temporary-key"); session.editModel("manual"); session.send(this)
            withTimeout(5000) { started.await() }
            session.close(); release.complete(Unit)
            withTimeout(5000) { finished.await() }
            assertEquals("", session.state.value.apiKey); assertEquals("", session.state.value.message)
            assertTrue(session.state.value.context.isEmpty()); assertNull(session.state.value.answer)
        } finally { release.complete(Unit); session.close(); client.close() }
    }
}
