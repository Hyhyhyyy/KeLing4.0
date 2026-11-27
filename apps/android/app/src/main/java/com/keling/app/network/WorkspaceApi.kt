package com.keling.app.network

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.*
import io.ktor.http.*
import kotlinx.serialization.Serializable

@Serializable data class WorkspaceProfile(val id: String, val name: String, val avatarUrl: String? = null, val bio: String = "", val level: Int = 1, val energy: Int = 0, val crystals: Int = 0, val totalStudyMinutes: Int = 0, val streakDays: Int = 0)
@Serializable data class WorkspaceUser(val user: WorkspaceProfile)
@Serializable data class WorkspaceNoteInput(val title: String, val content: String, val expectedUpdatedAt: String? = null,
    val sourceType: String? = null, val tags: List<String>? = null)
@Serializable data class WorkspaceTaskInput(val title: String, val description: String = "", val courseId: String? = null, val estimatedMinutes: Int = 25)
@Serializable private data class CoursePlanetInput(val planetStyleIndex: Int)
@Serializable private data class AvatarInput(val avatarUrl: String)
class WorkspaceApi(private val client: HttpClient = KelingHttpClient.client, private val origin: String = ApiConfig.actualBaseUrl) {
    private fun url(path: String) = "$origin$path"
    suspend fun profile(token: String): WorkspaceUser = GuestWorkspaces.find(token)?.let { WorkspaceUser(it.profile) } ?: client.get(url("/user/profile")) { bearerAuth(token) }.body()
    suspend fun notes(token: String): NoteResponse = GuestWorkspaces.find(token)?.let { it.noteList() } ?: client.get(url("/notes")) { bearerAuth(token) }.body()
    suspend fun courses(token: String): CourseResponse = GuestWorkspaces.find(token)?.let { it.courseList() } ?: client.get(url("/courses")) { bearerAuth(token) }.body()
    suspend fun updatePlanet(token: String, courseId: String, planetStyleIndex: Int): CourseResponse {
        com.keling.app.data.PlanetStyles.requireIndex(planetStyleIndex)
        return GuestWorkspaces.find(token)?.let { it.updatePlanet(courseId, planetStyleIndex) } ?: client.put(url("/courses/$courseId")) {
            bearerAuth(token); contentType(ContentType.Application.Json); setBody(CoursePlanetInput(planetStyleIndex))
        }.body()
    }
    suspend fun checkinStatus(token: String): CheckInResponse = GuestWorkspaces.find(token)?.let { it.checkinStatus() } ?: client.get(url("/checkin/status")) { bearerAuth(token) }.body()
    suspend fun checkin(token: String) { GuestWorkspaces.find(token)?.let { it.checkin(); return }; client.post(url("/checkin")) { bearerAuth(token) } }
    suspend fun avatar(token: String, index: Int) { GuestWorkspaces.find(token)?.let { it.avatar(index); return }; client.put(url("/user/profile")) { bearerAuth(token); contentType(ContentType.Application.Json); setBody(AvatarInput("stellar:avatar-$index")) } }
    suspend fun saveNote(token: String, id: String?, input: WorkspaceNoteInput) {
        GuestWorkspaces.find(token)?.let { it.saveNote(id, input); return }
        if (id == null) client.post(url("/notes")) { bearerAuth(token); contentType(ContentType.Application.Json); setBody(input) }
        else client.put(url("/notes/$id")) { bearerAuth(token); contentType(ContentType.Application.Json); setBody(input) }
    }
    suspend fun deleteNote(token: String, id: String) { GuestWorkspaces.find(token)?.let { it.deleteNote(id); return }; client.delete(url("/notes/$id")) { bearerAuth(token) } }
    suspend fun createTask(token: String, input: WorkspaceTaskInput): TaskResponse {
        require(input.title.trim().length in 1..180 && input.description.length <= 4000 && input.estimatedMinutes in 1..1440) { "请填写标题和 1–1440 分钟的预计时长" }
        return GuestWorkspaces.find(token)?.let { it.createTask(input) } ?: client.post(url("/tasks")) {
            bearerAuth(token); contentType(ContentType.Application.Json); setBody(input.copy(title = input.title.trim()))
        }.body()
    }
    suspend fun deleteTask(token: String, id: String) { GuestWorkspaces.find(token)?.let { it.deleteTask(id); return }; client.delete(url("/tasks/$id")) { bearerAuth(token) } }
}
