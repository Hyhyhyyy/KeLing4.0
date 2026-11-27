package com.keling.app.planet

import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.keling.app.ui.components.StellarArt
import com.keling.app.ui.components.StellarSprite
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable data class SubjectPlanet(val id: String, val name: String, val column: Int, val row: Int, val aliases: List<String>)
@Serializable data class SubjectPlanetAtlas(val columns: Int, val rows: Int, val subjects: List<SubjectPlanet>) {
    fun find(subject: String): SubjectPlanet? {
        val normalized = subject.trim().lowercase()
        return subjects.firstOrNull { item -> item.aliases.any { normalized.contains(it.lowercase()) } }
    }
}

private object SubjectAtlasCache {
    @Volatile var value: SubjectPlanetAtlas? = null
    @Synchronized fun load(context: android.content.Context): SubjectPlanetAtlas? = value ?: runCatching {
        context.assets.open("stellar/subject-planets.json").bufferedReader().use { reader ->
            Json { ignoreUnknownKeys = true }.decodeFromString(SubjectPlanetAtlas.serializer(), reader.readText())
        }
    }.getOrNull()?.also { value = it }
}

@Composable fun SubjectPlanetArt(subject: String, fallbackStyle: Int, modifier: Modifier = Modifier, description: String? = subject) {
    val context = LocalContext.current.applicationContext
    val atlas by produceState(SubjectAtlasCache.value) { value = withContext(Dispatchers.IO) { SubjectAtlasCache.load(context) } }
    val item = atlas?.find(subject)
    if (item == null) StellarArt("planet_${(fallbackStyle.coerceIn(0, 9) + 1).toString().padStart(2, '0')}", description, modifier)
    else StellarSprite("subject_planets", item.row * atlas!!.columns + item.column, description, modifier, atlas!!.columns, atlas!!.rows)
}
