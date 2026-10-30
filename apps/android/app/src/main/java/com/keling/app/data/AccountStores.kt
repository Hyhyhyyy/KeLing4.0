package com.keling.app.data

import android.content.Context
import androidx.datastore.core.DataMigration
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStoreFile
import kotlinx.coroutines.flow.first
import java.security.MessageDigest

/** One DataStore instance per account/file. Never share learning data across logins. */
internal object AccountStores {
    private val stores = mutableMapOf<String, DataStore<Preferences>>()

    @Synchronized
    fun get(context: Context, accountId: String, legacy: DataStore<Preferences>): DataStore<Preferences> {
        require(accountId.isNotBlank()) { "Account ID is required" }
        val digest = MessageDigest.getInstance("SHA-256")
            .digest(accountId.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
        val file = context.applicationContext.preferencesDataStoreFile("keling_account_$digest")
        return stores.getOrPut(file.absolutePath) {
            PreferenceDataStoreFactory.create(
                migrations = listOf(OwnedLegacyMigration(accountId, legacy)),
                produceFile = { file }
            )
        }
    }
}

internal class OwnedLegacyMigration(
    private val accountId: String,
    private val legacy: DataStore<Preferences>
) : DataMigration<Preferences> {
    override suspend fun shouldMigrate(currentData: Preferences): Boolean =
        currentData.asMap().isEmpty() &&
            legacy.data.first()[stringPreferencesKey("user_id")] == accountId

    override suspend fun migrate(currentData: Preferences): Preferences = legacy.data.first()

    // Keep the source intact for recovery, including data whose ownership is unknown.
    override suspend fun cleanUp() = Unit
}
