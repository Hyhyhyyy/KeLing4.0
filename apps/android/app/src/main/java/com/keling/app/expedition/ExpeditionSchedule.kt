package com.keling.app.expedition

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import java.time.LocalDate
import java.time.ZoneId

@Serializable data class ScheduleRest(val start: String, val end: String)
@Serializable data class ScheduleUnit(val title: String, val minutes: Int, val objectiveKey: String? = null)
@Serializable data class ScheduleRequest(val startDate: String, val examDate: String, val dailyMinutes: Int, val dayStart: String, val dayEnd: String,
    val rest: List<ScheduleRest> = emptyList(), val excludedDates: List<String> = emptyList(), val units: List<ScheduleUnit>)
@Serializable data class ScheduledTask(val title: String, val minutes: Int, val date: String, val startTime: String, val scheduledAt: String, val objectiveKey: String? = null)
@Serializable data class UnallocatedTask(val title: String, val minutes: Int, val reason: String)
@Serializable data class ScheduleDiff(val added: Int, val changed: Int, val deleted: Int, val retainedExisting: Int)
@Serializable data class SchedulePreview(val previewId: String? = null, val expiresAt: String? = null, val method: String, val timezone: String,
    val tasks: List<ScheduledTask>, val unallocated: List<UnallocatedTask>, val diff: ScheduleDiff, val warnings: List<String>, val note: String)
@Serializable data class ScheduleConfirmation(val taskIds: List<String>, val added: Int, val replayed: Boolean)

@Composable fun ExpeditionScheduleDialog(token: String, courseId: String, chapter: Chapter, onDismiss: () -> Unit) {
    val api = remember(token) { LearningApi(token) }; val scope = rememberCoroutineScope()
    val today = remember { LocalDate.now(ZoneId.of("Asia/Shanghai")) }
    var start by remember { mutableStateOf(today.toString()) }; var end by remember { mutableStateOf(today.plusDays(7).toString()) }
    var minutes by remember { mutableStateOf("50") }; var from by remember { mutableStateOf("18:30") }; var until by remember { mutableStateOf("21:00") }
    var restFrom by remember { mutableStateOf("19:30") }; var restUntil by remember { mutableStateOf("19:45") }; var exclude by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }; var error by remember { mutableStateOf<String?>(null) }; var preview by remember { mutableStateOf<SchedulePreview?>(null) }
    var confirmation by remember { mutableStateOf<ScheduleConfirmation?>(null) }
    fun action(block: suspend () -> Unit) { if (busy) return; busy = true; error = null; scope.launch { try { block() } catch (e: CancellationException) { throw e } catch (e: Exception) { error = e.message ?: "排程失败，预览已保留" } finally { busy = false } } }
    AlertDialog(onDismissRequest = { if (!busy) onDismiss() }, title = { Text("安排首章 · 3项25分钟目标") }, text = {
        LazyColumn(Modifier.heightIn(max = 500.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item { Text("按课表、已有任务、休息和日期预算计算。只在确认后新增任务，程序规则排程不是 AI 生成。", style = MaterialTheme.typography.bodySmall) }
            item { OutlinedTextField(start, { start = it; preview = null }, label = { Text("开始日期 YYYY-MM-DD") }, modifier = Modifier.fillMaxWidth()) }
            item { OutlinedTextField(end, { end = it; preview = null }, label = { Text("截止 / 考试日期") }, modifier = Modifier.fillMaxWidth()) }
            item { OutlinedTextField(minutes, { minutes = it.filter(Char::isDigit).take(3); preview = null }, label = { Text("每天最多学习分钟（10–240）") }, modifier = Modifier.fillMaxWidth()) }
            item { OutlinedTextField(from, { from = it; preview = null }, label = { Text("可用开始时间 HH:MM") }, modifier = Modifier.fillMaxWidth()) }
            item { OutlinedTextField(until, { until = it; preview = null }, label = { Text("可用结束时间 HH:MM") }, modifier = Modifier.fillMaxWidth()) }
            item { OutlinedTextField(restFrom, { restFrom = it; preview = null }, label = { Text("休息开始（可留空）") }, modifier = Modifier.fillMaxWidth()) }
            item { OutlinedTextField(restUntil, { restUntil = it; preview = null }, label = { Text("休息结束（可留空）") }, modifier = Modifier.fillMaxWidth()) }
            item { OutlinedTextField(exclude, { exclude = it; preview = null }, label = { Text("排除日期，逗号分隔") }, modifier = Modifier.fillMaxWidth()) }
            item { Button(onClick = { action {
                val request = ScheduleRequest(start, end, minutes.toInt(), from, until,
                    if (restFrom.isBlank() && restUntil.isBlank()) emptyList() else listOf(ScheduleRest(restFrom, restUntil)),
                    exclude.split(',', '，', ' ').filter(String::isNotBlank), chapter.objectives.map { ScheduleUnit(it.title, 25, it.key) })
                preview = api.schedule(courseId, request); confirmation = null
            } }, enabled = !busy && minutes.toIntOrNull()?.let { it in 10..240 } == true, modifier = Modifier.fillMaxWidth()) { Text("提交当前课表与任务，预览安排") } }
            error?.let { item { Text(it, color = MaterialTheme.colorScheme.error) } }
            preview?.let { plan ->
                item { Text("新增 ${plan.diff.added} 项；保留现有 ${plan.diff.retainedExisting} 项；修改 ${plan.diff.changed}，删除 ${plan.diff.deleted}。", style = MaterialTheme.typography.titleSmall) }
                plan.tasks.forEach { task -> item { Text("${task.date} ${task.startTime} · ${task.minutes}分钟\n${task.title}") } }
                plan.unallocated.forEach { task -> item { Text("未排入：${task.title} — ${task.reason}", color = MaterialTheme.colorScheme.error) } }
                plan.warnings.forEach { warning -> item { Text(warning) } }
                item { Text(plan.note, style = MaterialTheme.typography.bodySmall) }
                if (confirmation == null) item { Button(onClick = { action { confirmation = api.confirmSchedule(courseId, plan) } }, enabled = !busy && plan.tasks.isNotEmpty(), modifier = Modifier.fillMaxWidth()) { Text("确认这些新增任务") } }
            }
            confirmation?.let { item { Text("已添加 ${it.added} 项任务${if (it.replayed) "（重试未重复添加）" else ""}，可在远航的全部任务中继续。", color = MaterialTheme.colorScheme.primary) } }
        }
    }, confirmButton = { TextButton(onClick = onDismiss, enabled = !busy) { Text("关闭") } })
}
