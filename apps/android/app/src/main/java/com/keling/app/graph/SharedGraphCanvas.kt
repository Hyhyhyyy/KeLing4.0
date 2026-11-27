package com.keling.app.graph

import android.annotation.SuppressLint
import android.webkit.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import com.keling.app.R
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.util.UUID

@Serializable data class GraphEvent(val type: String, val protocol: Int = 1, val sessionId: String? = null, val courseId: String? = null, val nodeId: String? = null, val positions: List<GraphPosition> = emptyList(), val dirty: Boolean = false, val message: String? = null)
private val graphJson = Json { ignoreUnknownKeys = true; encodeDefaults = true }
fun decodeGraphEvent(raw: String, course: String, session: String, ids: Set<String>): GraphEvent? {
    if (raw.length > 1_000_000) return null
    val event = runCatching { graphJson.decodeFromString<GraphEvent>(raw) }.getOrNull() ?: return null
    if (event.protocol != 1) return null
    if (event.type == "keling-graph:ready") return event
    if (event.courseId != course || event.sessionId != session) return null
    if (event.type !in setOf("keling-graph:readyState", "keling-graph:saveState", "keling-graph:selected", "keling-graph:editRequested", "keling-graph:layoutChanged", "keling-graph:saveRequested", "keling-graph:error")) return null
    if (event.type in setOf("keling-graph:selected", "keling-graph:editRequested") && event.nodeId !in ids) return null
    if (event.type in setOf("keling-graph:layoutChanged", "keling-graph:saveRequested") && runCatching { validateGraphPositions(event.positions, ids) }.isFailure) return null
    if (event.type == "keling-graph:saveRequested" && event.positions.map { it.id }.toSet() != ids) return null
    return event
}

private const val GRAPH_ORIGIN = "https://appassets.androidplatform.net"
private const val GRAPH_PAGE = "$GRAPH_ORIGIN/graph-editor/index.html"
private class GraphBridge(val receive: (String) -> Unit) { @JavascriptInterface fun postMessage(raw: String) { receive(raw) } }

// R.font.stzhongs is the packaged TTF file. openRawResource streams its existing
// bytes for WebView, avoiding a second copy of the licensed font in the APK.
@SuppressLint("ResourceType")
private fun sharedFontStream(context: android.content.Context) = context.resources.openRawResource(R.font.stzhongs)

@SuppressLint("SetJavaScriptEnabled")
@Composable fun SharedGraphCanvas(courseId: String, document: GraphDocument, refreshKey: Int, modifier: Modifier = Modifier,
    onSelect: (String) -> Unit, onEdit: (String) -> Unit = onSelect, onDirty: (Boolean) -> Unit, onError: (String) -> Unit,
    onSave: suspend (List<GraphPosition>) -> List<GraphPosition>) {
    val session = remember(courseId) { UUID.randomUUID().toString() }
    val scope = rememberCoroutineScope()
    val currentDocument by rememberUpdatedState(document)
    val selected by rememberUpdatedState(onSelect); val dirty by rememberUpdatedState(onDirty)
    val edit by rememberUpdatedState(onEdit)
    val error by rememberUpdatedState(onError); val save by rememberUpdatedState(onSave)
    var webView by remember(courseId) { mutableStateOf<WebView?>(null) }
    var ready by remember(courseId) { mutableStateOf(false) }
    var initialized by remember(courseId) { mutableStateOf(false) }
    var previousRefresh by remember(courseId) { mutableIntStateOf(refreshKey) }
    fun send(type: String, extra: JSONObject = JSONObject()) {
        extra.put("type", "keling-graph:$type").put("protocol", 1).put("sessionId", session).put("courseId", courseId)
        webView?.evaluateJavascript("window.KelingGraphEditor && window.KelingGraphEditor.receive(${JSONObject.quote(extra.toString())})", null)
    }
    val semanticKey = document.nodes.map { it.copy(positionX = 0.0, positionY = 0.0, updatedAt = "") }
    LaunchedEffect(ready, semanticKey, refreshKey) {
        if (ready) { send("init", JSONObject().put("nodes", org.json.JSONArray(graphJson.encodeToString(document.nodes)))
            .put("layoutSaved", document.layoutSaved).put("savedNodeIds", org.json.JSONArray(document.savedNodeIds))
            .put("preserveLayout", initialized && previousRefresh == refreshKey)
            .put("fontUrl", "$GRAPH_ORIGIN/fonts/STZHONGS.TTF")); initialized = true; previousRefresh = refreshKey }
    }
    AndroidView(modifier = modifier, factory = { context -> WebView(context).apply {
        // WebView uses layoutParams to resolve CSS viewport height, independently
        // of Compose's measured bounds. WRAP_CONTENT collapses a 100% canvas.
        layoutParams = android.widget.FrameLayout.LayoutParams(
            android.view.ViewGroup.LayoutParams.MATCH_PARENT,
            android.view.ViewGroup.LayoutParams.MATCH_PARENT,
        )
        settings.javaScriptEnabled = true; settings.domStorageEnabled = false
        settings.allowFileAccess = false; settings.allowContentAccess = false
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        settings.setSupportMultipleWindows(false); settings.javaScriptCanOpenWindowsAutomatically = false
        webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = request.url.toString() != GRAPH_PAGE
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse {
                val uri = request.url
                if (uri.scheme != "https" || uri.host != "appassets.androidplatform.net" || uri.port !in listOf(-1, 443)) return denied()
                val path = uri.path.orEmpty()
                return try {
                    when {
                        path == "/fonts/STZHONGS.TTF" -> WebResourceResponse("font/ttf", null, sharedFontStream(context))
                        path.startsWith("/graph-editor/") && !path.contains("..") -> WebResourceResponse(when { path.endsWith(".html") -> "text/html"; path.endsWith(".js") -> "application/javascript"; path.endsWith(".css") -> "text/css"; path.endsWith(".svg") -> "image/svg+xml"; else -> "application/octet-stream" }, "UTF-8", context.assets.open(path.removePrefix("/")))
                        else -> denied()
                    }
                } catch (_: Exception) { denied() }
            }
            private fun denied() = WebResourceResponse("text/plain", "UTF-8", 403, "Blocked", emptyMap(), ByteArrayInputStream(byteArrayOf()))
        }
        addJavascriptInterface(GraphBridge { raw -> post {
            if (url != GRAPH_PAGE) return@post
            val event = decodeGraphEvent(raw, courseId, session, currentDocument.nodes.map { it.id }.toSet()) ?: return@post
            when (event.type) {
                "keling-graph:ready" -> ready = true
                "keling-graph:readyState", "keling-graph:saveState" -> dirty(event.dirty)
                "keling-graph:selected" -> event.nodeId?.let(selected)
                "keling-graph:editRequested" -> event.nodeId?.let(edit)
                "keling-graph:layoutChanged" -> dirty(event.dirty)
                "keling-graph:error" -> error(event.message?.take(200) ?: "图谱未能加载")
                "keling-graph:saveRequested" -> scope.launch {
                    try { val saved = save(event.positions); send("saved", JSONObject().put("positions", org.json.JSONArray(graphJson.encodeToString(saved)))) }
                    catch (e: kotlinx.coroutines.CancellationException) { throw e }
                    catch (_: Exception) { send("saveError", JSONObject().put("message", "保存失败，布局已保留，请重试")) }
                }
            }
        } }, "KelingGraph")
        webView = this; loadUrl(GRAPH_PAGE)
    } })
    DisposableEffect(courseId) { onDispose { ready = false; webView?.apply { stopLoading(); removeJavascriptInterface("KelingGraph"); destroy() }; webView = null } }
}
