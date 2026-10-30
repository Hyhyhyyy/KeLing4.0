package com.keling.app.network

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.*
import io.ktor.http.*
import kotlinx.serialization.Serializable

@Serializable data class WorkspaceProfile(val id: String, val name: String, val avatarUrl: String? = null, val bio: String = "", val level: Int = 1, val energy: Int = 0, val crystals: Int = 0, val totalStudyMinutes: Int = 0, val streakDays: Int = 0)
@Serializable data class WorkspaceUser(val user: WorkspaceProfile)
@Serializable data class WorkspaceNoteInput(val title: String, val content: String, val expectedUpdatedAt: String? = null)
@Serializable private data class AvatarInput(val avatarUrl: String)
class WorkspaceApi(private val client: HttpClient = KelingHttpClient.client) {
    private fun url(path: String) = "${ApiConfig.actualBaseUrl}$path"
    suspend fun profile(token: String): WorkspaceUser = GuestWorkspaces.find(token)?.let { WorkspaceUser(it.profile) } ?: client.get(url("/user/profile")) { bearerAuth(token) }.body()
    suspend fun notes(token: String): NoteResponse = GuestWorkspaces.find(token)?.let { it.noteList() } ?: client.get(url("/notes")) { bearerAuth(token) }.body()
    suspend fun courses(token: String): CourseResponse = GuestWorkspaces.find(token)?.let { it.courseList() } ?: client.get(url("/courses")) { bearerAuth(token) }.body()
    suspend fun checkinStatus(token: String): CheckInResponse = GuestWorkspaces.find(token)?.let { it.checkinStatus() } ?: client.get(url("/checkin/status")) { bearerAuth(token) }.body()
    suspend fun checkin(token: String) { GuestWorkspaces.find(token)?.let { it.checkin(); return }; client.post(url("/checkin")) { bearerAuth(token) } }
    suspend fun avatar(token: String, index: Int) { GuestWorkspaces.find(token)?.let { it.avatar(index); return }; client.put(url("/user/profile")) { bearerAuth(token); contentType(ContentType.Application.Json); setBody(AvatarInput("stellar:avatar-$index")) } }
    suspend fun saveNote(token: String, id: String?, input: WorkspaceNoteInput) {
        GuestWorkspaces.find(token)?.let { it.saveNote(id, input); return }
        if (id == null) client.post(url("/notes")) { bearerAuth(token); contentType(ContentType.Application.Json); setBody(input) }
        else client.put(url("/notes/$id")) { bearerAuth(token); contentType(ContentType.Application.Json); setBody(input) }
    }
    suspend fun deleteNote(token: String, id: String) { GuestWorkspaces.find(token)?.let { it.deleteNote(id); return }; client.delete(url("/notes/$id")) { bearerAuth(token) } }
}
