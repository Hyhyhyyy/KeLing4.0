package com.keling.app.planet

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.keling.app.ui.components.StellarArt
import kotlinx.coroutines.delay

private val explorationHints = listOf("好奇心，是探索的第一束光。", "把问题装进行囊，沿着线索出发。", "每一次追问，都在拓宽知识星图。", "星芽陪你寻找下一条航线。")

@Composable fun PlanetWorkPanel(kind: String, progress: PlanetWorkProgress?, active: Boolean, onCancel: () -> Unit) {
    val moving = active
    val scan = if (moving) {
        val transition = rememberInfiniteTransition(label = "stellar-work-scan")
        val value by transition.animateFloat(0f, 1f, infiniteRepeatable(tween(1600, easing = LinearEasing)), label = "activity-only")
        value
    } else 0f
    var hint by remember(kind) { mutableStateOf(0) }
    LaunchedEffect(kind, moving) { while (moving) { delay(4400); hint = (hint + 1) % explorationHints.size } }
    val heading = when (kind) { "artwork" -> "勾勒星球轮廓"; "question" -> "重组探索题"; "similar" -> "搜寻相似碎片"; else -> "点亮新的知识星球" }
    val current = progress?.steps.orEmpty().filter { it.state == "running" || it.state == "failed" }
    val mint = MaterialTheme.colorScheme.primary
    val background = MaterialTheme.colorScheme.outlineVariant
    val gold = Color(0xFFC99A42)
    val error = MaterialTheme.colorScheme.error
    Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                StellarArt("mascot_mentor", null, Modifier.size(48.dp).graphicsLayer { translationY = if (moving) kotlin.math.sin(scan * Math.PI * 2).toFloat() * 3.dp.toPx() else 0f })
                Column(Modifier.weight(1f).padding(start = 8.dp)) {
                    Text(heading, style = MaterialTheme.typography.titleMedium)
                    Text(if (active) explorationHints[hint] else "本次探索暂未完成", style = MaterialTheme.typography.bodySmall)
                }
                if (active) TextButton(onClick = onCancel) { Text("停止") }
            }
            if (progress == null) {
                if (moving) LinearProgressIndicator(Modifier.fillMaxWidth())
                Text(if (active) "等待服务响应" else "输入与原内容已保留", style = MaterialTheme.typography.bodySmall)
            } else {
                val description = progress.steps.joinToString("，") { "${planetWorkStageLabel(it.id)}${workStateLabel(it.state, active)}" }
                Canvas(Modifier.fillMaxWidth().height(12.dp).semantics { contentDescription = description }) {
                    val gap = 5.dp.toPx()
                    val width = (size.width - gap * (progress.steps.size - 1)) / progress.steps.size
                    progress.steps.forEachIndexed { index, step ->
                        val left = index * (width + gap)
                        val color = when (step.state) { "completed" -> mint; "skipped" -> background.copy(alpha = .7f); "failed" -> error; else -> background.copy(alpha = .35f) }
                        drawRect(color, Offset(left, 0f), Size(width, size.height))
                        if (step.state == "running" && moving) clipRect(left, 0f, left + width, size.height) {
                            drawRect(gold.copy(alpha = .28f), Offset(left, 0f), Size(width, size.height))
                            drawRect(gold, Offset(left - width * .3f + scan * width * 1.3f, 0f), Size(width * .3f, size.height))
                        }
                    }
                }
                current.forEach { step -> Text("${planetWorkStageLabel(step.id)} · ${if (active) planetWorkActivityLabel(step.activity) else "等待已结束"}", style = MaterialTheme.typography.bodySmall, color = if (step.state == "failed") error else MaterialTheme.colorScheme.onSurface) }
                progress.steps.chunked(2).forEach { row ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        row.forEach { step -> Text("${shortStageLabel(step.id)} · ${workStateLabel(step.state, active)}", Modifier.weight(1f), style = MaterialTheme.typography.labelSmall,
                            color = when (step.state) { "completed" -> mint; "running" -> gold; "failed" -> error; else -> MaterialTheme.colorScheme.onSurfaceVariant }) }
                        if (row.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

private fun shortStageLabel(id: String) = when (id) { "research" -> "检索"; "compose" -> "编排"; "review" -> "核对"; "visual_prepare" -> "设计"; "artwork" -> "绘制"; else -> "收拢" }
private fun workStateLabel(state: String, active: Boolean) = when (state) { "running" -> if (active) "进行中" else "等待结束"; "completed" -> "已完成"; "failed" -> "未完成"; "skipped" -> "已跳过"; else -> "待开始" }
