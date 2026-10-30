package com.keling.app.expedition

import java.util.UUID

/** Replay original semantics before acquiring a lease. A receipt survives subsequent takeovers. */
suspend fun replayPreservedCommand(api: ExpeditionTransport, operation: PendingOperation, deviceId: String,
    writer: Writer?, onWriter: (Writer) -> Unit): Receipt {
    val runId = requireNotNull(operation.runId)
    fun command(token: String) = Command(operation.opId, operation.expectedRevision,
        Writer(deviceId, operation.leaseEpoch, token), requireNotNull(operation.action))
    try { return api.command(runId, command(writer?.token ?: "resume-probe")) }
    catch (failure: ExpeditionException) {
        if (failure.status != 409 || failure.detail.code !in listOf("WRITER_CHANGED", "LEASE_LOST")) throw failure
        val current = api.run(runId)
        ExpeditionRules.check(current.run.leaseEpoch == operation.leaseEpoch && current.run.revision == operation.expectedRevision,
            "DRAFT_REVISION_CHANGED", "原操作属于较早进度，已保留草稿，请核对当前远征")
        val lease = api.lease(runId, LeaseInput(UUID.randomUUID().toString(), current.run.revision, deviceId, "acquire"))
        val acquired = requireNotNull(lease.writer); onWriter(acquired)
        // Expired acquisition increments epoch: keep the old operation for explicit conflict resolution.
        ExpeditionRules.check(acquired.epoch == operation.leaseEpoch, "DRAFT_REVISION_CHANGED", "原操作的写入资格已过期，请保留副本并重新核对")
        return api.command(runId, command(acquired.token))
    }
}
