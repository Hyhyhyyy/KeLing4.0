package com.keling.app.data

/** Server lacks revision metadata. Keep local edits; import unseen records only. */
internal fun <T> importUnseen(local: List<T>, remote: List<T>, seenIds: Set<String>, id: (T) -> String): List<T> {
    val existing = local.map(id).toSet() + seenIds
    return local + remote.distinctBy(id).filter { id(it) !in existing }
}

/** Imported cloud tasks are owned by the server; local-only tasks and local deletions stay intact. */
internal fun reconcileCloudTasks(local: List<Task>, remote: List<Task>, seenIds: Set<String>): List<Task> {
    val latest = remote.associateBy { it.id }
    val kept = local.mapNotNull { if (it.id in seenIds) latest[it.id] else it }
    return importUnseen(kept, remote, seenIds) { it.id }
}

data class SyncUiState(
    val isReady: Boolean = false,
    val isSyncing: Boolean = false,
    val error: String? = null,
    val lastSyncTime: Long? = null
)
