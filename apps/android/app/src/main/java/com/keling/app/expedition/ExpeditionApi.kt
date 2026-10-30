package com.keling.app.expedition

import com.keling.app.network.ApiConfig
import com.keling.app.network.KelingHttpClient
import io.ktor.client.HttpClient
import io.ktor.client.plugins.expectSuccess
import io.ktor.client.request.*
import io.ktor.client.statement.bodyAsText
import io.ktor.http.*
import kotlinx.serialization.encodeToString

interface ExpeditionTransport {
    suspend fun catalog(): CatalogResponse
    suspend fun chapter(courseId: String): ChapterResponse
    suspend fun start(input: StartRunInput): StartRunResponse
    suspend fun run(id: String): RunResponse
    suspend fun command(id: String, input: Command): Receipt
    suspend fun lease(id: String, input: LeaseInput): LeaseResponse
    suspend fun rewards(): RewardsResponse
    suspend fun base(input: BaseCommand): BaseResponse
    suspend fun memory(id: String, input: MemoryCommand): MemoryResponse
    suspend fun evidence(courseId: String): EvidenceResponse
    suspend fun selfReports(cursor: String? = null): SelfReportPage
    suspend fun selfReport(input: SelfReportInput): SelfReportResponse
}

/** Freeze origin with the account session: changing a connection cannot redirect its outbox. */
class ExpeditionApi(private val token: String, baseUrl: String = ApiConfig.actualBaseUrl,
    private val client: HttpClient = KelingHttpClient.client) : ExpeditionTransport {
    private val prefix = "${baseUrl.trimEnd('/')}/expedition/v1"
    init { require(token.isNotBlank() && !token.startsWith("guest-memory:")) { "游客请求不得进入账号接口" } }
    private suspend inline fun <reified T> request(path: String, method: HttpMethod = HttpMethod.Get, jsonBody: String? = null): T {
        val response = client.request("$prefix$path") {
            this.method = method; expectSuccess = false; bearerAuth(token)
            if (jsonBody != null) { contentType(ContentType.Application.Json); setBody(jsonBody) }
        }
        val body = response.bodyAsText()
        if (!response.status.isSuccess()) {
            val error = runCatching { expeditionJson.decodeFromString<ExpeditionErrorBody>(body) }.getOrElse {
                ExpeditionErrorBody(if (response.status.value == 401) "登录已失效，请重新登录" else "远征服务暂不可用，请保留草稿后重试", "HTTP_${response.status.value}")
            }
            throw ExpeditionException(response.status.value, error)
        }
        return expeditionJson.decodeFromString(body)
    }
    override suspend fun catalog() = request<CatalogResponse>("/catalog")
    override suspend fun chapter(courseId: String) = request<ChapterResponse>("/courses/${courseId.encodeURLPathPart()}/chapters/binary-tree")
    override suspend fun start(input: StartRunInput) = request<StartRunResponse>("/runs", HttpMethod.Post, expeditionJson.encodeToString(input))
    override suspend fun run(id: String) = request<RunResponse>("/runs/${id.encodeURLPathPart()}")
    override suspend fun command(id: String, input: Command) = request<Receipt>("/runs/${id.encodeURLPathPart()}/commands", HttpMethod.Post, expeditionJson.encodeToString(input))
    override suspend fun lease(id: String, input: LeaseInput) = request<LeaseResponse>("/runs/${id.encodeURLPathPart()}/lease", HttpMethod.Post, expeditionJson.encodeToString(input))
    override suspend fun rewards() = request<RewardsResponse>("/rewards")
    override suspend fun memory(id: String, input: MemoryCommand) = request<MemoryResponse>("/progress/${id.encodeURLPathPart()}/memory", HttpMethod.Post, expeditionJson.encodeToString(input))
    override suspend fun evidence(courseId: String) = request<EvidenceResponse>("/courses/${courseId.encodeURLPathPart()}/evidence")
    override suspend fun selfReports(cursor: String?) = request<SelfReportPage>("/self-report" + (cursor?.let { "?cursor=${it.encodeURLParameter()}" } ?: ""))
    override suspend fun selfReport(input: SelfReportInput) = request<SelfReportResponse>("/self-report", HttpMethod.Post, expeditionJson.encodeToString(input))
    override suspend fun base(input: BaseCommand) = request<BaseResponse>("/base/commands", HttpMethod.Post, expeditionJson.encodeToString(input))
}
