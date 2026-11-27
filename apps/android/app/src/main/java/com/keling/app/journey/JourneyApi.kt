package com.keling.app.journey

import android.content.Context
import com.keling.app.network.*
import io.ktor.client.call.body
import io.ktor.client.request.*
import io.ktor.http.*
import kotlinx.serialization.json.*

class JourneyApi(private val token:String,context:Context) {
 private val json=Json{ignoreUnknownKeys=true}
 private val localCatalog= json.decodeFromString<JourneyCatalog>(context.assets.open("journey/catalog.json").bufferedReader().use{it.readText()})
 private val guest get()=GuestWorkspaces.find(token)
 private val client get()=KelingHttpClient.client
 private fun url(path:String)="${ApiConfig.actualBaseUrl}/journey$path"
 suspend fun catalog():JourneyCatalog=guest?.let{localCatalog} ?: client.get(url("/catalog")).body()
 suspend fun profile():JourneyProfile=guest?.journeyProfile(localCatalog) ?: client.get(url("/profile")){bearerAuth(token)}.body()
 suspend fun save(next:JourneyState,avatarChanged:Boolean=false):JourneyProfile {
  guest?.let{return it.saveJourney(localCatalog,next,avatarChanged)}
  val input=journeyPatchPayload(next,avatarChanged)
  return client.patch(url("/profile")){bearerAuth(token);contentType(ContentType.Application.Json);setBody(input)}.body()
 }
 suspend fun calendar(month:String):JourneyCalendar=guest?.journeyCalendar(month) ?: client.get(url("/calendar")){bearerAuth(token);parameter("month",month)}.body()
}
