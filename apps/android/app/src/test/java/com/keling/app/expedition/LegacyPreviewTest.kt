package com.keling.app.expedition

import androidx.datastore.preferences.core.*
import com.keling.app.data.summarizeLegacyData
import org.junit.Assert.*
import org.junit.Test

class LegacyPreviewTest {
    @Test fun ownershipAndUnreadableCountsAreExplicitWithoutChangingSource() {
        val source = mutablePreferencesOf(stringPreferencesKey("user_id") to "previous-account",
            stringPreferencesKey("courses_data") to "[{\"name\":\"旧课\"}]", stringPreferencesKey("notes_data") to "broken",
            intPreferencesKey("user_crystals") to 25)
        val original = source.toPreferences()
        val other = summarizeLegacyData(source, "new-account")
        assertEquals("OTHER", other.ownership); assertEquals(1, other.courses); assertNull(other.notes); assertNull(other.tasks)
        assertEquals(25, other.crystals); assertEquals(original, source.toPreferences())
        assertEquals("MATCH", summarizeLegacyData(source, "previous-account").ownership)
        assertEquals("UNKNOWN", summarizeLegacyData(emptyPreferences(), "new-account").ownership)
    }
}
