package com.keling.app.planet

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import java.time.Instant

@Serializable data class PlanetWorkStep(val id: String, val state: String, val activity: String? = null, val startedAt: String? = null, val finishedAt: String? = null)
@Serializable data class PlanetWorkProgress(val kind: String, val revision: Int, val startedAt: String, val updatedAt: String, val steps: List<PlanetWorkStep>)

private val workJson = Json { ignoreUnknownKeys = true }
private val workKinds = setOf("planet", "artwork", "question", "similar")
private val workSteps = setOf("research", "compose", "review", "visual_prepare", "artwork", "finalize")
private val workStates = setOf("pending", "running", "completed", "failed", "skipped")
private val workActivities = setOf("searching", "drafting", "validating", "reviewing", "repairing", "visual_search", "visual_design", "visual_reference", "rendering", "packaging", "reusing_evidence", "ready", "unavailable")
private fun workDate(value: String) = value.length <= 40 && runCatching { Instant.parse(value) }.isSuccess

/** Progress is optional transport metadata; malformed metadata must not invalidate a signed draft. */
fun parsePlanetWorkProgress(raw: JsonElement?): PlanetWorkProgress? = raw?.let {
    runCatching { workJson.decodeFromJsonElement(PlanetWorkProgress.serializer(), it) }.getOrNull()
}?.takeIf { p -> p.kind in workKinds && p.revision >= 0 && workDate(p.startedAt) && workDate(p.updatedAt) &&
    p.steps.size in 1..6 && p.steps.map { it.id }.toSet().size == p.steps.size && p.steps.all { s ->
        s.id in workSteps && s.state in workStates && (s.activity == null || s.activity in workActivities) &&
            (s.startedAt == null || workDate(s.startedAt)) && (s.finishedAt == null || workDate(s.finishedAt)) } }

internal fun latestPlanetWorkProgress(previous: PlanetWorkProgress?, next: PlanetWorkProgress): PlanetWorkProgress =
    if (previous == null || (next.kind == previous.kind && next.startedAt == previous.startedAt && next.revision > previous.revision)) next else previous

internal fun planetWorkStageLabel(id: String) = when (id) {
    "research" -> "搜集知识碎片"; "compose" -> "编织学习航线"; "review" -> "核对知识坐标"
    "visual_prepare" -> "寻找星球模样"; "artwork" -> "绘制星球形象"; "finalize" -> "收拢启航行囊"
    else -> "准备探索"
}
internal fun planetWorkActivityLabel(activity: String?) = when (activity) {
    "searching" -> "联网检索中"; "drafting" -> "正在组织内容"; "validating" -> "正在检查结构"
    "reviewing" -> "正在核对内容"; "repairing" -> "正在修订并复核"; "visual_search" -> "正在检索形象"
    "visual_design" -> "正在设计形象"; "visual_reference" -> "正在参考原图"; "rendering" -> "正在绘制"
    "packaging" -> "正在保存"; "reusing_evidence" -> "沿用本次资料"; "ready" -> "准备就绪"
    "unavailable" -> "暂未完成"; else -> "等待服务响应"
}
