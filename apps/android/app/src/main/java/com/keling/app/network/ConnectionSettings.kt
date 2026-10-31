package com.keling.app.network

import android.content.Context
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.net.URI
import java.util.Locale

const val LEGACY_CLOUD_API = "https://keling-ict-preview.vercel.app/api"
const val DIRECT_CLOUD_API = "https://ucn5aajxnx7f.feishu.link/app/app_17h4dw5jwdg/api"
fun sameAccountService(first: String, second: String): Boolean = first == second ||
    (first in setOf(LEGACY_CLOUD_API, DIRECT_CLOUD_API) && second in setOf(LEGACY_CLOUD_API, DIRECT_CLOUD_API))

object ConnectionSettings {
    fun initialize(context: Context) {
        ApiConfig.customBaseUrl = context.getSharedPreferences("connection", Context.MODE_PRIVATE)
            .getString("api", null)?.let { runCatching { normalizeEndpoint(it) }.getOrNull() }
            ?.takeUnless { it == LEGACY_CLOUD_API && ApiConfig.BASE_URL == DIRECT_CLOUD_API }
    }

    fun save(context: Context, address: String) {
        val normalized = normalizeEndpoint(address)
        check(context.getSharedPreferences("connection", Context.MODE_PRIVATE).edit()
            .putString("api", normalized).commit()) { "未能保存服务地址，请重试" }
        ApiConfig.customBaseUrl = normalized
    }
}

fun normalizeEndpoint(value: String): String {
    val uri = runCatching { URI(value.trim().trimEnd('/')) }.getOrNull()
        ?: throw IllegalArgumentException("请输入完整的 HTTPS 服务地址")
    val path = uri.path.orEmpty().removeSuffix("/api")
    require(uri.scheme.equals("https", true) && !uri.host.isNullOrBlank() &&
        uri.rawUserInfo == null && uri.rawQuery == null && uri.rawFragment == null &&
        (uri.port == -1 || uri.port in 1..65535) && (path.isEmpty() || Regex("/app/app_[a-z0-9]+").matches(path))) {
        "请填写 HTTPS 服务地址，例如 https://你的课灵域名/api"
    }
    return "https://${uri.rawAuthority.lowercase(Locale.ROOT)}$path/api"
}

// Liveness alone is insufficient: the account database must also be reachable.
suspend fun checkAccountService(client: HttpClient, address: String) {
    val base = normalizeEndpoint(address)
    val health = Json.parseToJsonElement(client.get("$base/health").bodyAsText()).jsonObject
    check(health["status"]?.jsonPrimitive?.content == "ok" && health["version"] != null) {
        "该地址未返回课灵服务信息，请核对地址"
    }
    val ready = Json.parseToJsonElement(client.get("$base/ready").bodyAsText()).jsonObject
    check(ready["status"]?.jsonPrimitive?.content == "ready") { "账号数据库暂不可用，请稍后重试" }
}

fun connectionError(error: Throwable): String {
    val causes = generateSequence(error) { it.cause }.take(10).toList()
    return when {
        error is ApiException -> error.message ?: "服务请求失败"
        causes.any { it is java.net.UnknownHostException } -> "无法解析学习服务地址。请切换 Wi-Fi / 移动网络后重试，或打开连接检测核对服务地址。"
        causes.any { it is javax.net.ssl.SSLException } -> "无法建立安全连接。请检查设备日期与网络，连接检测中核对服务地址。"
        causes.any { it is java.io.IOException || it is io.ktor.client.plugins.HttpRequestTimeoutException } ->
            "当前网络无法连接学习服务或连接超时。请切换 Wi-Fi / 移动网络后重试。电脑能打开网页不代表手机可连接；可在连接检测中查看服务地址。"
        error is kotlinx.serialization.SerializationException -> "服务返回的数据无法识别，请检查服务地址或更新应用。"
        else -> error.message?.take(240) ?: "操作未完成，请重试"
    }
}

fun authInputError(email: String, password: String, name: String? = null): String? = when {
    email.trim().length > 254 || !Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$").matches(email.trim()) -> "请输入有效邮箱地址"
    name != null && name.trim().length !in 1..80 -> "名字需为 1–80 个字符"
    name != null && password.length !in 10..128 -> "密码需为 10–128 位"
    password.isEmpty() -> "请输入密码"
    password.length > 128 -> "密码不能超过 128 位"
    else -> null
}
