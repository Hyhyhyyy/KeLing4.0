package com.keling.app.planet

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.unit.dp
import java.net.URI

fun planetQuestionLabel(kind: String): String = when (kind) {
    "single_choice" -> "单选"
    "multiple_choice" -> "多选"
    "true_false" -> "判断"
    "fill_blank" -> "填空"
    "ordering" -> "排序"
    "short_answer" -> "简答自核"
    else -> "新题型"
}

fun planetSourceLink(url: String): String? = runCatching { URI(url).takeIf { it.scheme in setOf("http", "https") && !it.host.isNullOrBlank() && it.userInfo == null }?.toASCIIString() }.getOrNull()
fun planetArtworkLink(url: String): String? = planetSourceLink(url)?.takeIf {
    val parsed = URI(it); val host = parsed.host.lowercase()
    parsed.scheme == "https" && host.contains('.') && !host.startsWith('[') && !host.matches(Regex("[0-9.]+")) && !host.matches(Regex(".*(?:^|\\.)(?:localhost|local|internal|test|invalid)$"))
}

@Composable internal fun PlanetSources(research: PlanetResearch?, sourceIds: List<String>? = null) {
    if (research == null) return
    val uri = LocalUriHandler.current
    var expanded by remember(research, sourceIds) { mutableStateOf(false) }
    val sources = research.sources.filter { sourceIds == null || it.id in sourceIds }
    if (sources.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        TextButton(onClick = { expanded = !expanded }) { Text(if (expanded) "收起来源" else "查看 ${sources.size} 条来源") }
        if (expanded) sources.forEach { source ->
            val link = planetSourceLink(source.url)
            TextButton(onClick = { link?.let { runCatching { uri.openUri(it) } } }, enabled = link != null) { Text(source.title) }
            Text(source.snippet, style = MaterialTheme.typography.bodySmall)
            source.publishedAt?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.labelSmall) }
        }
    }
}

fun planetSimilarButtonLabel(question: PlanetQuestion, questions: List<PlanetQuestion>): String =
    if (!question.similarTo.isNullOrBlank() || questions.any { it.similarTo == question.id }) "再做两道" else "相似碎片搜索"

@Composable internal fun PlanetQuestionCard(question: PlanetQuestion, answer: PlanetAnswer?, feedback: PlanetFeedback?, enabled: Boolean, similarLabel: String, onSimilar: () -> Unit, onTutor: () -> Unit, onRegenerate: (String) -> Unit, onAnswer: (PlanetResponse) -> Unit) {
    var selected by rememberSaveable(question.id) { mutableStateOf(answer?.selectedIndex?.takeIf { it in question.options.indices }) }
    var multiple by rememberSaveable(question.id) { mutableStateOf(answer?.selectedIndices.orEmpty()) }
    var ordering by rememberSaveable(question.id) { mutableStateOf(answer?.orderedIndices ?: question.options.indices.toList()) }
    var value by rememberSaveable(question.id) { mutableStateOf(answer?.text.orEmpty()) }
    val supported = question.kind in listOf("single_choice", "multiple_choice", "true_false", "fill_blank", "ordering", "short_answer")
    val canSubmit = when (question.kind) {
        "multiple_choice" -> multiple.isNotEmpty()
        "fill_blank", "short_answer" -> value.isNotBlank()
        "ordering" -> ordering.isNotEmpty()
        else -> selected != null && supported
    }
    fun response() = when (question.kind) {
        "multiple_choice" -> PlanetResponse(selectedIndices = multiple.sorted())
        "ordering" -> PlanetResponse(orderedIndices = ordering)
        "fill_blank", "short_answer" -> PlanetResponse(text = value.trim())
        else -> PlanetResponse(selectedIndex = selected)
    }
    Card { Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text((if (question.similarTo.isNullOrBlank()) "" else "相似碎片 · ") + planetQuestionLabel(question.kind), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.secondary)
        Text(question.prompt, style = MaterialTheme.typography.titleMedium)
        TextButton(onClick = onTutor) { Text("问星芽") }
        when (question.kind) {
            "single_choice", "true_false", "multiple_choice" -> question.options.forEachIndexed { index, option ->
                val checked = if (question.kind == "multiple_choice") index in multiple else selected == index
                val select = { if (question.kind == "multiple_choice") multiple = if (index in multiple) multiple - index else multiple + index else selected = index }
                Row(Modifier.fillMaxWidth().clickable(enabled = enabled, onClick = select), verticalAlignment = Alignment.CenterVertically) {
                    if (question.kind == "multiple_choice") Checkbox(checked, { select() }, enabled = enabled)
                    else RadioButton(checked, select, enabled = enabled)
                    Text(option, Modifier.weight(1f).padding(vertical = 8.dp))
                }
            }
            "fill_blank", "short_answer" -> OutlinedTextField(value, { value = it.take(if (question.kind == "short_answer") 2000 else 500) }, label = { Text(if (question.kind == "short_answer") "用自己的话回答" else "填写答案") }, minLines = if (question.kind == "short_answer") 3 else 1, enabled = enabled, modifier = Modifier.fillMaxWidth())
            "ordering" -> {
                Text("按顺序排列", style = MaterialTheme.typography.bodySmall)
                ordering.forEachIndexed { position, option ->
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text("${position + 1}. ${question.options[option]}", Modifier.weight(1f))
                        Column {
                            TextButton(onClick = { ordering = ordering.toMutableList().apply { val prior = get(position - 1); set(position - 1, option); set(position, prior) } }, enabled = enabled && position > 0) { Text("上移") }
                            TextButton(onClick = { ordering = ordering.toMutableList().apply { val next = get(position + 1); set(position + 1, option); set(position, next) } }, enabled = enabled && position < ordering.lastIndex) { Text("下移") }
                        }
                    }
                }
            }
            else -> Text("请更新课灵后使用此题型")
        }
        Button(onClick = { onAnswer(response()) }, enabled = enabled && canSubmit) { Text(if (answer == null) "提交探索" else "重新尝试") }
        if (answer != null) {
            if (question.kind == "short_answer") {
                Text(if (answer.reviewed == true) "已完成自核" else "对照参考，检查自己的理解", color = MaterialTheme.colorScheme.primary)
                Text(feedback?.referenceAnswer ?: question.referenceAnswer.orEmpty())
                (feedback?.rubric ?: question.rubric).orEmpty().forEachIndexed { i, point -> Text("${i + 1}. $point", style = MaterialTheme.typography.bodyMedium) }
                if (answer.reviewed != true) OutlinedButton(onClick = { onAnswer(PlanetResponse(text = value.trim(), selfReview = true)) }, enabled = enabled && value.trim() == answer.text && answer.evaluation == "self_review") { Text("已逐项核对，记录自评") }
                Text("自核记录，不计为模型判分", style = MaterialTheme.typography.bodySmall)
            } else {
                Text(if (answer.correct) "与参考答案一致" else "还有一处值得再想想", color = MaterialTheme.colorScheme.primary)
                val reference = when (question.kind) {
                    "multiple_choice", "ordering" -> (feedback?.expectedIndices ?: question.answerIndices).orEmpty().mapNotNull { question.options.getOrNull(it) }.joinToString(if (question.kind == "ordering") "、" else "；")
                    "fill_blank" -> (feedback?.acceptedAnswers ?: question.acceptedAnswers).orEmpty().joinToString(" / ")
                    else -> question.options.getOrNull(feedback?.expectedIndex ?: question.answerIndex).orEmpty()
                }
                Text("参考答案：$reference", style = MaterialTheme.typography.bodyMedium)
            }
            Text(feedback?.explanation ?: question.explanation)
        }
        OutlinedButton(onClick = onSimilar, enabled = enabled) { Text(similarLabel) }
        PlanetRegenerationControl("调整这道题", "例如：换成情境题，比较两种不同语境", enabled, onRegenerate)
    } }
}

@Composable internal fun PlanetRegenerationControl(label: String, hint: String, enabled: Boolean, onRegenerate: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    var instruction by remember { mutableStateOf("") }
    TextButton(onClick = { open = !open }, enabled = enabled) { Text(if (open) "收起修改要求" else label) }
    if (open) Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        OutlinedTextField(instruction, { instruction = it.take(800) }, label = { Text("修改要求") }, placeholder = { Text(hint) }, modifier = Modifier.fillMaxWidth(), minLines = 2, enabled = enabled)
        OutlinedButton(onClick = { onRegenerate(instruction) }, enabled = enabled && instruction.isNotBlank()) { Text("按要求重新生成") }
    }
}

@Composable internal fun PlanetMeaningCard(analysis: PlanetMeaningAnalysis?) {
    if (analysis == null) return
    var expanded by remember(analysis) { mutableStateOf(false) }
    Text(analysis.overview)
    TextButton(onClick = { expanded = !expanded }) { Text(if (expanded) "收起辨析" else "查看不同含义与边界") }
    if (expanded) Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        analysis.interpretations.forEach { meaning ->
            Text(meaning.label, style = MaterialTheme.typography.titleMedium)
            Text(meaning.description)
            Text(meaning.context, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary)
        }
        if (analysis.contrasts.isNotEmpty()) Text("比较与联系", style = MaterialTheme.typography.titleSmall)
        analysis.contrasts.forEach { Text(it) }
        if (analysis.caveats.isNotEmpty()) Text("适用边界", style = MaterialTheme.typography.titleSmall)
        analysis.caveats.forEach { Text(it) }
    }
}
