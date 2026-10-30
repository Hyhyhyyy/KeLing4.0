package com.keling.app.data

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.emptyPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** Implements the repository contract in RAM. No Context, file, Room or disk DataStore. */
class MemoryPreferences : DataStore<Preferences> {
    private val mutex = Mutex()
    private val values = MutableStateFlow(emptyPreferences())
    private var closed = false
    override val data = values
    override suspend fun updateData(transform: suspend (t: Preferences) -> Preferences): Preferences = mutex.withLock {
        check(!closed) { "本次试用已结束" }
        val next = transform(values.value).toPreferences()
        check(!closed) { "本次试用已结束" }
        values.value = next
        next
    }
    fun close() { closed = true; values.value = emptyPreferences() }
}
