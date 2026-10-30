package com.keling.app.network

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.*
import io.ktor.http.*
import kotlinx.serialization.Serializable

@Serializable data class AgentStatus(val configured: Boolean, val provider: String? = null)
@Serializable data class CloudCourse(val id: String, val name: String, val knowledgeNodeCount: Int = 0, val planetStyleIndex: Int = 0)
@Serializable data class CloudCourses(val courses: List<CloudCourse> = emptyList(), val course: CloudCourse? = null)
@Serializable data class CloudNode(val id: String, val name: String, val description: String = "")
@Serializable data class CloudNodes(val nodes: List<CloudNode> = emptyList())
@Serializable data class AgentRequest(val courseId: String, val goal: String, val examDate: String, val dailyMinutes: Int, val mode: String = "plan")
@Serializable data class AgentSource(val id: String, val title: String)
@Serializable data class AgentEvent(val name: String, val status: String, val at: String)
@Serializable data class AgentPlanTask(val title: String, val description: String, val date: String, val minutes: Int, val sourceIds: List<String>)
@Serializable data class AgentPlan(val summary: String, val tasks: List<AgentPlanTask>)
@Serializable data class AgentRun(
    val id: String, val goal: String, val status: String, val createdAt: String,
    val error: String = "", val sources: List<AgentSource> = emptyList(),
    val events: List<AgentEvent> = emptyList(), val result: AgentPlan? = null
)
@Serializable data class AgentRuns(val runs: List<AgentRun> = emptyList())
@Serializable private data class NewCourse(val name: String, val planetStyleIndex: Int)
@Serializable private data class NewSource(val name: String, val description: String)
@Serializable private data class CompleteCloudTask(val actualMinutes: Int)

/** Uses the signed-in user's server session; Huawei/model credentials never enter the APK. */
class AgentApi(private val client: HttpClient = KelingHttpClient.client) {
    private fun url(path: String) = "${ApiConfig.actualBaseUrl}$path"
    suspend fun status(token: String): AgentStatus = GuestWorkspaces.find(token)?.let { it.status() } ?: client.get(url("/agent/status")) { bearerAuth(token) }.body()
    suspend fun courses(token: String): CloudCourses = GuestWorkspaces.find(token)?.let { it.cloudCourses() } ?: client.get(url("/courses")) { bearerAuth(token) }.body()
    suspend fun createCourse(token: String, name: String, planetStyleIndex: Int = 0): CloudCourses {
        com.keling.app.data.PlanetStyles.requireIndex(planetStyleIndex)
        return GuestWorkspaces.find(token)?.let { it.createCourse(name, planetStyleIndex) } ?: client.post(url("/courses")) {
            bearerAuth(token); contentType(ContentType.Application.Json); setBody(NewCourse(name, planetStyleIndex))
        }.body()
    }
    suspend fun sources(token: String, courseId: String): CloudNodes = GuestWorkspaces.find(token)?.let { it.sourceList(courseId) } ?: client.get(url("/knowledge/$courseId/nodes")) { bearerAuth(token) }.body()
    suspend fun addSource(token: String, courseId: String, name: String, text: String) {
        GuestWorkspaces.find(token)?.let { it.addSource(courseId, name, text); return }
        client.post(url("/knowledge/$courseId/nodes")) {
            bearerAuth(token); contentType(ContentType.Application.Json); setBody(NewSource(name, text))
        }
    }
    suspend fun history(token: String): AgentRuns = GuestWorkspaces.find(token)?.let { it.history() } ?: client.get(url("/agent/runs")) { bearerAuth(token) }.body()
    suspend fun get(token: String, id: String): AgentRun = GuestWorkspaces.find(token)?.let { it.run(id) } ?: client.get(url("/agent/runs/$id")) { bearerAuth(token) }.body()
    suspend fun start(token: String, request: AgentRequest): AgentRun = GuestWorkspaces.find(token)?.let { it.start(request) } ?: client.post(url("/agent/runs/start")) {
        bearerAuth(token); contentType(ContentType.Application.Json); setBody(request)
    }.body()
    suspend fun confirm(token: String, id: String) {
        GuestWorkspaces.find(token)?.let { it.confirm(id); return }
        client.post(url("/agent/runs/$id/confirm")) { bearerAuth(token) }
    }
    suspend fun tasks(token: String): TaskResponse = GuestWorkspaces.find(token)?.let { it.taskList() } ?: client.get(url("/tasks")) { bearerAuth(token) }.body()
    suspend fun complete(token: String, id: String, minutes: Int): TaskResponse = GuestWorkspaces.find(token)?.let { it.complete(id, minutes) } ?: client.post(url("/tasks/$id/complete")) {
        bearerAuth(token); contentType(ContentType.Application.Json); setBody(CompleteCloudTask(minutes))
    }.body()
}
