package com.keling.app.expedition

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.keling.app.ui.components.*
import kotlinx.coroutines.delay
import java.time.Instant

@Composable
fun ExpeditionScreen(vm: ExpeditionViewModel, tab: String, guest: Boolean, onNavigate: (String) -> Unit, onAsk: (String, String) -> Unit) {
    val state by vm.state.collectAsStateWithLifecycle()
    var associateCourse by remember { mutableStateOf(true) }
    var selfTitle by remember { mutableStateOf("") }; var selfNotes by remember { mutableStateOf("") }; var selfMinutes by remember { mutableStateOf("25") }
    var memoryEdit by remember { mutableStateOf<CompanionMemory?>(null) }; var memoryText by remember { mutableStateOf("") }; var memoryDelete by remember { mutableStateOf<CompanionMemory?>(null) }
    var coursePicker by remember { mutableStateOf(false) }; var newCourse by remember { mutableStateOf("") }
    var showSchedule by remember { mutableStateOf(false) }; var takeover by remember { mutableStateOf(false) }; var keepRemote by remember { mutableStateOf(false) }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(vm, lifecycle) { lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) { while (true) { delay(40_000); vm.keepAlive() } } }
    val course = state.courses.firstOrNull { it.id == state.saved.selectedCourseId }
    StellarTheme(reducedMotion = state.saved.preferences.reducedMotion) { Surface(Modifier.fillMaxSize()) { Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            StellarArt("title_logo", "课灵", Modifier.width(106.dp).height(48.dp))
            Spacer(Modifier.weight(1f)); TextButton(onClick = { onNavigate("ai") }) { Text("问星芽") }
            TextButton(onClick = vm::refresh, enabled = !state.busy) { Text("刷新") }
        }
        if (state.busy || state.loading) LinearProgressIndicator(Modifier.fillMaxWidth())
        LazyColumn(Modifier.weight(1f).padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(vertical = 12.dp)) {
            item { Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                StellarHeading(when (tab) { "star_map" -> "星图"; "base" -> "基地"; "profile" -> "我的"; else -> "远航" }, mascot = when (tab) { "star_map" -> 3; "base" -> 8; "profile" -> 7; else -> 2 }, modifier = Modifier.weight(1f))
                UsageGuideButton()
            } }
            state.notice?.let { item { Text(it, color = MaterialTheme.colorScheme.primary) } }
            state.error?.let { item { Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) { Column(Modifier.padding(12.dp)) {
                Text(it); if (state.offline) Text(if (guest) "本次作答已保留" else "离线草稿已保留，待同步")
                TextButton(onClick = vm::refresh, enabled = !state.busy) { Text("重试") }
            } } } }
            if (state.saved.pending.isNotEmpty()) item { Card { Column(Modifier.padding(12.dp)) {
                Text("${state.saved.pending.size} 项操作待同步", style = MaterialTheme.typography.titleMedium)
                TextButton(onClick = vm::retryPending, enabled = !state.busy) { Text("重试同步") }
                TextButton(onClick = vm::preservePendingAndRefresh, enabled = !state.busy) { Text("保留副本并刷新") }
            } } }
            if (state.conflict != null && state.run != null) item { Card { Column(Modifier.padding(12.dp)) {
                Text("进度冲突 · 原草稿已保留")
                TextButton(onClick = { keepRemote = true }, enabled = !state.busy) { Text("保留副本并采用远端") }
                TextButton(onClick = { takeover = true }, enabled = !state.busy) { Text("接管本次远征") }
            } } }
            item { Text("规则练习 · 待人工审核", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            if (tab != "profile" || course == null) item { OutlinedButton(onClick = { coursePicker = true }, modifier = Modifier.fillMaxWidth()) { Text(course?.let { "${it.name} · 切换课程" } ?: "选择课程") } }
            if (tab == "home") {
                if (state.run != null && state.exercise != null) item { Challenge(state, vm, guest, { takeover = true }, onAsk) }
                else {
                    item { Card { Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            CoursePlanetArt(course?.planetStyleIndex ?: 0, Modifier.size(82.dp))
                            Column(Modifier.weight(1f).padding(start = 12.dp)) {
                                Text(if (state.saved.preferences.narrative == "LIGHT") "今天，从一个目标开始" else "重启通信站", style = MaterialTheme.typography.headlineSmall)
                                Text("二叉树 · 队列、栈与全局边界")
                                Text("10–25分钟", style = MaterialTheme.typography.bodySmall)
                            }
                        }
                        StellarArt("expedition_voyage", "通信站远征场景", Modifier.fillMaxWidth().aspectRatio(1.5f))
                        Text("可用时间")
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { listOf(10, 20, 25).forEach { minutes -> FilterChip(state.saved.preferences.minutes == minutes, { vm.preferences { it.copy(minutes = minutes) } }, label = { Text("${minutes}分钟") }, enabled = !state.busy) } }
                        Button(onClick = { vm.start(when (state.saved.preferences.minutes) { 20 -> "TEACH"; 25 -> "TRIAL"; else -> "EXPLORE" }, "bt.bfs.queue") }, enabled = course != null && !state.busy && state.saved.pending.isEmpty(), modifier = Modifier.fillMaxWidth()) { Text(when (state.saved.preferences.minutes) { 20 -> "教星芽"; 25 -> "开始综合试炼"; else -> "开始远征" }) }
                    } } }
                    state.saved.selectedCourseId?.let { selected ->
                        val runs = state.saved.chapters[selected]?.runs.orEmpty().filter { it.status !in listOf("SETTLED", "CANCELLED") }
                        if (runs.isNotEmpty()) item { StellarSectionTitle("继续上一次探索", motif = 3) }
                        items(runs, key = { it.id }) { run -> OutlinedButton(onClick = { vm.openRun(run.id) }, modifier = Modifier.fillMaxWidth()) { Text("${objectiveTitle(state, run.objectiveKey)} · ${statusLabel(run.status)}") } }
                    }
                    item { OutlinedButton(onClick = { showSchedule = true }, enabled = course != null && state.chapter != null, modifier = Modifier.fillMaxWidth()) { Text("安排学习时间") } }
                    item { Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = { onNavigate("tasks") }, modifier = Modifier.weight(1f)) { Text("任务与专注") }
                        OutlinedButton(onClick = { onNavigate("cloud_agent") }, modifier = Modifier.weight(1f)) { Text("调整学习计划") }
                    } }
                    state.progress?.state?.objectives?.filter { it.review != null }?.forEach { objective -> item {
                        Card { Column(Modifier.fillMaxWidth().padding(12.dp)) {
                            Text("回访：${objectiveTitle(state, objective.objectiveKey)}")
                            Text("${objective.review!!.dueAt} 起可回访", style = MaterialTheme.typography.bodySmall)
                            TextButton(onClick = { vm.start("REVIEW", objective.objectiveKey) }, enabled = !state.busy && Instant.now() >= Instant.parse(objective.review.dueAt)) { Text("开始回访练习") }
                        } }
                    } }
                }
            }
            if (tab == "star_map") {
                item { StellarArt("expedition_starmap", "知识星图", Modifier.fillMaxWidth().aspectRatio(1.5f)) }
                item { StellarSectionTitle("${state.chapter?.title ?: "二叉树区域"} · 学习目标", motif = 1) }
                items(state.chapter?.objectives.orEmpty(), key = { it.key }) { objective ->
                    val progress = state.progress?.state?.objectives?.firstOrNull { it.objectiveKey == objective.key }
                    Card { Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(objective.title, style = MaterialTheme.typography.titleLarge); Text(objective.description)
                        Text(evidenceLabel(progress?.state), color = MaterialTheme.colorScheme.primary)
                        Button(onClick = { vm.start("EXPLORE", objective.key); onNavigate("home") }, enabled = course != null && !state.busy && state.saved.pending.isEmpty(), modifier = Modifier.fillMaxWidth()) { Text("开始练习") }
                        OutlinedButton(onClick = { vm.start("TEACH", objective.key); onNavigate("home") }, enabled = course != null && !state.busy && state.saved.pending.isEmpty(), modifier = Modifier.fillMaxWidth()) { Text("教星芽") }
                        TextButton(onClick = { vm.start("EXPLORE", objective.key, "INDEPENDENT"); onNavigate("home") }, enabled = course != null && !state.busy && state.saved.pending.isEmpty()) { Text("变式练习") }
                    } }
                }
                item { Button(onClick = { vm.start("TRIAL", null); onNavigate("home") }, enabled = course != null && !state.busy && state.saved.pending.isEmpty(), modifier = Modifier.fillMaxWidth()) { Text("综合试炼") } }
                item { OutlinedButton(onClick = { onNavigate("greenhouse") }, modifier = Modifier.fillMaxWidth()) { Text("管理课程") } }
                item { OutlinedButton(onClick = { onNavigate("notes") }, modifier = Modifier.fillMaxWidth()) { Text("笔记") } }
                item { OutlinedButton(onClick = { onNavigate("expedition_materials") }, modifier = Modifier.fillMaxWidth()) { Text("课程资料") } }
                item { Card { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(state.chapter?.materialTitle.orEmpty(), style = MaterialTheme.typography.titleMedium)
                    state.chapter?.materialParagraphs?.forEachIndexed { index, text -> SelectionContainer { Text("${index + 1}. $text") } }
                    Text("原创教材片段 · 版本 ${state.chapter?.version}", style = MaterialTheme.typography.bodySmall)
                } } }
            }
            if (tab == "base") {
                val account = state.saved.account
                val selected = state.saved.catalog?.decorations?.firstOrNull { it.id == account?.world?.slot?.decorationId }
                item { Card { Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    BoxWithConstraints(Modifier.fillMaxWidth().aspectRatio(1.5f)) {
                        StellarArt("expedition_base", "基地场景与一号建设位", Modifier.fillMaxSize())
                        selected?.let { decoration -> StellarArt("decoration_${decoration.id}", decoration.name,
                            Modifier.width(maxWidth * 0.28f).height(maxWidth * 0.28f).align(Alignment.TopStart).offset(x = maxWidth * 0.38f, y = maxHeight * 0.80f - maxWidth * 0.28f)) }
                    }
                    Text(selected?.let { "基地1号建设位 · ${it.name}" } ?: "基地1号建设位 · 未装备", style = MaterialTheme.typography.titleMedium)
                    Text("结晶 ${account?.crystals ?: 0} · Lv.${account?.level ?: 1} · 当前经验 ${account?.exp ?: 0}")
                } } }
                items(state.saved.catalog?.decorations.orEmpty(), key = { it.id }) { decoration -> Card { Column(Modifier.fillMaxWidth().padding(12.dp)) {
                    StellarArt("decoration_${decoration.id}", decoration.name, Modifier.size(100.dp))
                    Text(decoration.name, style = MaterialTheme.typography.titleMedium); Text(decoration.description)
                    val owned = decoration.id in account?.world?.ownedDecorationIds.orEmpty()
                    Button(onClick = { vm.buyOrEquip(decoration.id) }, enabled = !state.busy && state.saved.pending.isEmpty() && (owned || (account?.crystals ?: 0) >= decoration.price), modifier = Modifier.fillMaxWidth()) { Text(if (owned) "已拥有 · 装备" else "${decoration.price} 结晶 · 购买") }
                } } }
                item { StellarSectionTitle("星芽学习档案", motif = 2) }
                val memories = state.progress?.state?.companionMemories.orEmpty().filter { it.deletedAt == null }
                if (memories.isEmpty()) item { Text("暂无档案") }
                items(memories, key = { it.id }) { memory -> Card { Column(Modifier.fillMaxWidth().padding(12.dp)) {
                    Text(objectiveTitle(state, memory.objectiveKey)); SelectionContainer { Text(memory.text) }; Text("自述解释 · ${memory.confirmedAt}", style = MaterialTheme.typography.bodySmall)
                    Row { TextButton(onClick = { memoryEdit = memory; memoryText = memory.text }, enabled = !state.busy) { Text("编辑解释") }; TextButton(onClick = { memoryDelete = memory }, enabled = !state.busy) { Text("删除档案") } }
                } } }
            }
            if (tab == "profile") {
                item { Card { Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    StellarSectionTitle("学习偏好", motif = 1)
                    Row(verticalAlignment = Alignment.CenterVertically) { Switch(state.saved.preferences.narrative == "STANDARD", { checked -> vm.preferences { it.copy(narrative = if (checked) "STANDARD" else "LIGHT") } }); Text("远征叙事", Modifier.weight(1f)) }
                    Row(verticalAlignment = Alignment.CenterVertically) { Switch(state.saved.preferences.reducedMotion, { checked -> vm.preferences { it.copy(reducedMotion = checked) } }); Text("减少动效", Modifier.weight(1f)) }
                } } }
                item { Card { Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    StellarSectionTitle("线下学习记录", motif = 2)
                    Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(associateCourse && course != null, { associateCourse = it }, enabled = course != null); Text(if (associateCourse && course != null) "关联：${course.name}" else "不关联课程", Modifier.weight(1f)) }
                    OutlinedTextField(selfTitle, { selfTitle = it.take(180) }, label = { Text("学习内容（2–180字）") }, modifier = Modifier.fillMaxWidth(), enabled = !state.busy)
                    OutlinedTextField(selfMinutes, { selfMinutes = it.filter(Char::isDigit).take(4) }, label = { Text("学习分钟（1–1440）") }, modifier = Modifier.fillMaxWidth(), enabled = !state.busy)
                    OutlinedTextField(selfNotes, { selfNotes = it.take(2000) }, label = { Text("学习笔记") }, modifier = Modifier.fillMaxWidth(), minLines = 2, enabled = !state.busy)
                    Button(onClick = { vm.selfReport(selfTitle, selfNotes, selfMinutes.toInt(), associateCourse) }, enabled = !state.busy && state.saved.pending.isEmpty() && selfTitle.trim().length >= 2 && (selfMinutes.toIntOrNull() ?: 0) in 1..1440, modifier = Modifier.fillMaxWidth()) { Text("保存记录") }
                    state.saved.selfReports.sortedByDescending { it.createdAt }.forEach { Text("${it.createdAt} · ${it.durationMinutes}分钟 · ${it.notes}", style = MaterialTheme.typography.bodySmall) }
                    if (state.saved.selfReportsCursor != null) TextButton(onClick = vm::moreSelfReports, enabled = !state.busy) { Text("更早记录") }
                } } }
                item { Card { Column(Modifier.fillMaxWidth().padding(16.dp)) {
                    StellarSectionTitle("成长记录", motif = 0)
                    Text("Lv.${state.saved.account?.level ?: 1} · ${state.saved.account?.exp ?: 0} XP · ${state.saved.account?.crystals ?: 0} 结晶")
                    state.saved.account?.legacy?.let { Text("历史记录：Lv.${it.level}，${it.exp} XP，${it.crystals} 结晶，能量 ${it.energy}（只读）", style = MaterialTheme.typography.bodySmall) }
                    Text(if (guest) "游客记录退出即清空" else "草稿存于本机 · 提交后同步", style = MaterialTheme.typography.bodySmall)
                } } }
                items(state.progress?.state?.objectives.orEmpty(), key = { it.objectiveKey }) { objective -> Text("${objectiveTitle(state, objective.objectiveKey)}：${evidenceLabel(objective.state)} · ${objective.evidenceIds.size} 条依据") }
                items(state.saved.evidence[state.saved.selectedCourseId].orEmpty().reversed(), key = { it.id }) { evidence -> Card { Column(Modifier.fillMaxWidth().padding(12.dp)) {
                    Text("${objectiveTitle(state, evidence.objectiveKey)} · ${evidenceLabel(evidence.kind)}")
                    Text("${if (evidence.judgment == "SELF_REPORTED") "自评" else "规则判定"} · ${if (evidence.strict) "严格验证" else "练习记录"}")
                    Text("题目 v${evidence.exerciseVersion} · ${evidence.at}", style = MaterialTheme.typography.bodySmall)
                    evidence.sources.forEach { source -> Text("第${(source.paragraphIndex ?: 0) + 1}段 · 字元${source.startUtf16}–${source.endUtf16}", style = MaterialTheme.typography.bodySmall) }
                    TextButton(onClick = { vm.openRun(evidence.runId); onNavigate("home") }) { Text("查看作答") }
                } } }
                item { StellarSectionTitle("学习记录", motif = 2) }
                items(state.saved.runs.values.filter { it.run.courseId == state.saved.selectedCourseId }.sortedByDescending { it.run.startedAt }, key = { it.run.id }) { record ->
                    OutlinedButton(onClick = { vm.openRun(record.run.id); onNavigate("home") }, modifier = Modifier.fillMaxWidth()) { Text("${objectiveTitle(state, record.run.objectiveKey)} · ${record.run.attempts.size} 次作答 · ${statusLabel(record.run.status)}") }
                }
                if (state.saved.preservedDrafts.isNotEmpty()) item { Card { Column(Modifier.padding(12.dp)) {
                    Text("练习副本（${state.saved.preservedDrafts.size}）")
                    state.saved.preservedDrafts.takeLast(5).forEach { draft ->
                        Text(draft.savedAt)
                        draft.answer.explanation?.let { SelectionContainer { Text(it) } }
                            ?: StellarSequence("访问顺序", draft.answer.order.orEmpty(), "尚未访问")
                    }
                } } }
                if (state.saved.preservedOperations.isNotEmpty()) item { Card { Column(Modifier.padding(12.dp)) { Text("操作副本"); state.saved.preservedOperations.takeLast(5).forEach { operation -> SelectionContainer { Text("已保存操作\n${operation.memory?.text ?: operation.selfReport?.let { it.title + "\n" + it.notes } ?: operation.action?.answer?.explanation.orEmpty()}", style = MaterialTheme.typography.bodySmall) } } } } }
            }
        }
    } } }
    memoryEdit?.let { memory -> AlertDialog(onDismissRequest = { memoryEdit = null }, title = { Text("编辑解释") }, text = { OutlinedTextField(memoryText, { memoryText = it.take(4000) }, modifier = Modifier.fillMaxWidth(), minLines = 4, label = { Text("我的解释") }) }, confirmButton = { TextButton(onClick = { vm.memory(memory.id, memoryText); memoryEdit = null }, enabled = !state.busy && memoryText.trim().length >= 2) { Text("确认修订") } }, dismissButton = { TextButton(onClick = { memoryEdit = null }) { Text("取消") } }) }
    memoryDelete?.let { memory -> AlertDialog(onDismissRequest = { memoryDelete = null }, title = { Text("删除这条伙伴档案？") }, text = { Text("删除此档案，历史作答保留。") }, confirmButton = { TextButton(onClick = { vm.memory(memory.id, null); memoryDelete = null }, enabled = !state.busy) { Text("确认删除") } }, dismissButton = { TextButton(onClick = { memoryDelete = null }) { Text("取消") } }) }
    if (showSchedule && course != null && state.chapter != null) ExpeditionScheduleDialog(vm.sessionToken, course.id, state.chapter!!) { showSchedule = false }
    if (coursePicker) AlertDialog(onDismissRequest = { coursePicker = false }, title = { Text("选择课程") }, text = {
        LazyColumn(Modifier.heightIn(max = 400.dp)) {
            items(state.courses, key = { it.id }) { course -> TextButton(onClick = { vm.selectCourse(course.id); coursePicker = false }) { Text(course.name) } }
            item { OutlinedTextField(newCourse, { newCourse = it.take(100) }, label = { Text("新课程名称") }) }
        }
    }, confirmButton = { TextButton(onClick = { vm.createCourse(newCourse); newCourse = ""; coursePicker = false }, enabled = newCourse.isNotBlank() && !state.busy) { Text("创建课程") } }, dismissButton = { TextButton(onClick = { coursePicker = false }) { Text("关闭") } })
    if (takeover) AlertDialog(onDismissRequest = { takeover = false }, title = { Text("由本设备接管？") }, text = { Text("接管后仅本设备可编辑，其他设备草稿保留。") }, confirmButton = { TextButton(onClick = { takeover = false; vm.takeOver() }) { Text("接管") } }, dismissButton = { TextButton(onClick = { takeover = false }) { Text("取消") } })
    if (keepRemote) AlertDialog(onDismissRequest = { keepRemote = false }, title = { Text("保留副本并采用远端？") }, text = { Text("保存当前草稿副本，并载入云端进度。") }, confirmButton = { TextButton(onClick = { keepRemote = false; vm.preserveAndUseRemote() }) { Text("确认载入") } }, dismissButton = { TextButton(onClick = { keepRemote = false }) { Text("取消") } })
}

@Composable private fun Challenge(state: ExpeditionUiState, vm: ExpeditionViewModel, guest: Boolean, takeOver: () -> Unit, onAsk: (String, String) -> Unit) {
    val run = state.run ?: return; val exercise = state.exercise ?: return; val draft = state.draft ?: return
    var showCancel by remember(run.id) { mutableStateOf(false) }
    if (showCancel) AlertDialog(onDismissRequest = { showCancel = false }, title = { Text("结束这次远征？") }, text = { Text("结束后保留已提交记录，当前题不结算。") }, confirmButton = { TextButton(onClick = { showCancel = false; vm.command(ExpeditionAction("CANCEL")) }, enabled = !state.busy) { Text("确认结束") } }, dismissButton = { TextButton(onClick = { showCancel = false }) { Text("继续学习") } })
    var direct by remember(run.id, exercise.id) { mutableStateOf(false) }; var saveMemory by remember(run.id, exercise.id) { mutableStateOf(false) }
    var orderInput by rememberSaveable(run.id, exercise.id) { mutableStateOf(draft.answer.order.orEmpty().joinToString(",")) }
    LaunchedEffect(draft.answer.order) {
        if (parseOrderInput(orderInput) != draft.answer.order.orEmpty()) {
            orderInput = draft.answer.order.orEmpty().joinToString(",")
        }
    }
    val ready = !state.busy && state.saved.pending.isEmpty() && run.status in listOf("ACTIVE", "AWAITING_FEEDBACK") && run.nextStep == null
    Card { Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        StellarSectionTitle(exercise.title, motif = 3, style = MaterialTheme.typography.headlineSmall)
        Text("${statusLabel(run.status)} · 题 ${run.exerciseIndex + 1}/${run.exerciseIds.size}", style = MaterialTheme.typography.labelMedium)
        SessionClock(run)
        Text(exercise.prompt)
        if (!guest) { Text("活动设备：${if (run.writerDeviceId == state.saved.deviceId) "本设备" else "其他设备"}", style = MaterialTheme.typography.bodySmall)
            Row { TextButton(onClick = vm::acquire, enabled = !state.busy) { Text("在此继续") }; TextButton(onClick = takeOver, enabled = !state.busy) { Text("接管") } } }
        Text("节点表", style = MaterialTheme.typography.titleMedium)
        exercise.tree.nodes.forEach { node -> Text("${node.id} = ${node.value}　左 ${node.left ?: "空"}　右 ${node.right ?: "空"}", style = MaterialTheme.typography.bodyMedium) }
        if (exercise.template == "TEACH_COMPANION") {
            OutlinedTextField(draft.answer.explanation.orEmpty(), { value -> vm.changeDraft { it.copy(answer = it.answer.copy(explanation = value.take(4000))) } }, modifier = Modifier.fillMaxWidth(), label = { Text("用自己的话解释（12–4000字）") }, minLines = 4, enabled = ready)
            Text("自查")
            exercise.rubric.forEach { item -> Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(item in draft.answer.selfCheck.orEmpty(), { checked -> vm.changeDraft { it.copy(answer = it.answer.copy(selfCheck = if (checked) it.answer.selfCheck.orEmpty() + item else it.answer.selfCheck.orEmpty() - item)) } }, enabled = ready)
                Text(item, Modifier.weight(1f))
            } }
        } else if (exercise.objectiveKey == "bt.bst.bounds") {
            Row { FilterChip(draft.answer.validBst == true, { vm.changeDraft { it.copy(answer = it.answer.copy(validBst = true, order = emptyList())) } }, label = { Text("符合BST") }, enabled = ready)
                Spacer(Modifier.width(8.dp)); FilterChip(draft.answer.validBst == false, { vm.changeDraft { it.copy(answer = it.answer.copy(validBst = false, order = emptyList())) } }, label = { Text("有越界节点") }, enabled = ready) }
            Text("选择违反任一祖先边界的节点：")
            exercise.tree.nodes.chunked(2).forEach { nodes -> Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) { nodes.forEach { node -> FilterChip(node.id in draft.answer.order.orEmpty(), { vm.changeDraft { it.copy(answer = it.answer.copy(order = if (node.id in it.answer.order.orEmpty()) it.answer.order.orEmpty() - node.id else it.answer.order.orEmpty() + node.id)) } }, label = { Text(node.id) }, enabled = ready) } } }
        } else {
            Column { FilterChip(draft.answer.structure == "QUEUE", { vm.changeDraft { it.copy(answer = Answer(structure = "QUEUE", order = emptyList()), container = emptyList(), steps = emptyList()) } }, label = { Text("队列 · 先进先出") }, enabled = ready)
                Spacer(Modifier.height(4.dp)); FilterChip(draft.answer.structure == "STACK", { vm.changeDraft { it.copy(answer = Answer(structure = "STACK", order = emptyList()), container = emptyList(), steps = emptyList()) } }, label = { Text("栈 · 后进先出") }, enabled = ready) }
            TextButton(onClick = { direct = !direct }, enabled = ready) { Text(if (direct) "切换到容器操作" else "直接输入顺序") }
            if (direct) OutlinedTextField(orderInput, { value ->
                orderInput = value.take(600)
                vm.changeDraft { it.copy(answer = it.answer.copy(order = parseOrderInput(orderInput)), steps = emptyList()) }
            }, modifier = Modifier.fillMaxWidth(), label = { Text("访问编号，逗号分隔，例如 A,B,C") }, enabled = ready)
            else {
                Text("容器：${draft.container.joinToString(" · ").ifBlank { "空" }}")
                exercise.tree.nodes.chunked(2).forEach { nodes -> Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) { nodes.forEach { node ->
                    OutlinedButton(onClick = { vm.changeDraft { old -> val container = old.container + node.id; old.copy(container = container, steps = old.steps + DraftStep("PUSH", node.id, container, old.answer.order.orEmpty())) } }, enabled = ready && draft.answer.structure != null && node.id !in draft.container && node.id !in draft.answer.order.orEmpty()) { Text("放入${node.id}") }
                } } }
                Button(onClick = { vm.changeDraft { old ->
                    val container = old.container.toMutableList(); val node = container.removeAt(if (old.answer.structure == "QUEUE") 0 else container.lastIndex); val visited = old.answer.order.orEmpty() + node
                    old.copy(container = container, answer = old.answer.copy(order = visited), steps = old.steps + DraftStep("POP", node, container, visited))
                } }, enabled = ready && draft.container.isNotEmpty(), modifier = Modifier.fillMaxWidth()) { Text("${if (draft.answer.structure == "QUEUE") "取队首" else "弹栈顶"}并访问") }
            }
            StellarSequence("访问结果", draft.answer.order.orEmpty(), "尚未访问")
            if (draft.steps.isNotEmpty()) { Text("步骤回放", style = MaterialTheme.typography.titleSmall); draft.steps.forEachIndexed { i, step -> Text("${i + 1}. ${if (step.type == "PUSH") "放入" else "取出"}${step.nodeId} · 容器 ${step.container.joinToString(",").ifBlank { "空" }}", style = MaterialTheme.typography.bodySmall) } }
            TextButton(onClick = { vm.changeDraft { it.copy(answer = Answer(structure = it.answer.structure, order = emptyList()), container = emptyList(), steps = emptyList()) } }, enabled = ready) { Text("清空重做") }
        }
        if (run.status !in listOf("SETTLED", "CANCELLED", "CONTENT_STALE")) {
            Button(onClick = { vm.command(ExpeditionAction("SUBMIT", answer = draft.answer.copy(steps = if (!direct && draft.steps.isNotEmpty()) draft.steps.map { OperationStep(it.type, it.nodeId) } else null))) }, enabled = ready, modifier = Modifier.fillMaxWidth()) { Text("提交答案") }
            TextButton(onClick = { vm.command(ExpeditionAction("HINT")) }, enabled = ready) { Text("查看提示") }
            exercise.hints.take(run.hintsUsed).forEach { Text("提示：$it") }
        }
        run.feedback?.let { feedback -> Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) { Column(Modifier.fillMaxWidth().padding(12.dp)) {
            StellarSectionTitle(if (feedback.kind == "SELF_REPORTED") "自评反馈" else if (feedback.correct == true) "规则判定 · 正确" else "规则判定 · 待修正")
            Text(feedback.message); feedback.expectedOrder?.let { StellarSequence("规则推演", it, "无越界节点") }
            feedback.rubric.forEach { Text("· $it") }
        } } }
        if (run.status == "AWAITING_FEEDBACK" && run.nextStep == null) {
            OutlinedTextField(draft.nextStep, { value -> vm.changeDraft { it.copy(nextStep = value.take(600)) } }, label = { Text("下一步（至少2字）") }, modifier = Modifier.fillMaxWidth(), minLines = 2, enabled = !state.busy)
            if (exercise.template == "TEACH_COMPANION") Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(saveMemory, { saveMemory = it }); Text("保存到星芽档案", Modifier.weight(1f)) }
            Button(onClick = { vm.command(ExpeditionAction("ACK_FEEDBACK", nextStep = draft.nextStep, saveCompanion = saveMemory)) }, enabled = ready && draft.nextStep.trim().length >= 2, modifier = Modifier.fillMaxWidth()) { Text("保存下一步") }
        }
        if (run.nextStep != null && run.status != "SETTLED") Button(onClick = { vm.command(ExpeditionAction("NEXT")) }, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) { Text("继续下一个目标") }
        SelectionContainer { Text("依据：${state.chapter?.materialTitle}，第${exercise.sourceParagraph + 1}段\n${state.chapter?.materialParagraphs?.getOrNull(exercise.sourceParagraph).orEmpty()}", style = MaterialTheme.typography.bodySmall) }
        TextButton(onClick = { vm.prepareAiHint { onAsk(run.courseId, "我正在做《${exercise.title}》。题目：${exercise.prompt}\n资料：${state.chapter?.materialParagraphs?.getOrNull(exercise.sourceParagraph)}\n我的作答：${draft.answer.explanation ?: draft.answer.order.orEmpty().joinToString(",")}。请给一个最小必要提示，不替我宣称已掌握。") } }, enabled = !state.busy && state.saved.pending.isEmpty()) { Text("问星芽") }
        if (run.status !in listOf("SETTLED", "CANCELLED", "CONTENT_STALE")) TextButton(onClick = { vm.command(ExpeditionAction(if (run.status == "PAUSED") "RESUME" else "PAUSE")) }, enabled = !state.busy && state.saved.pending.isEmpty()) { Text(if (run.status == "PAUSED") "恢复远征" else "暂停") }
        if (run.status !in listOf("SETTLED", "CANCELLED", "CONTENT_STALE")) TextButton(onClick = { showCancel = true }, enabled = !state.busy && state.saved.pending.isEmpty()) { Text("结束远征") }
        TextButton(onClick = vm::leaveRun, enabled = !state.busy) { Text(if (run.status == "SETTLED") "返回远航" else "保存草稿并返回") }
    } }
}
internal fun parseOrderInput(value: String): List<String> = value.split(',', '，', ' ', '\n', '\t').map(String::trim).filter(String::isNotBlank)
private fun objectiveTitle(state: ExpeditionUiState, key: String) = state.chapter?.objectives?.firstOrNull { it.key == key }?.title ?: key
private fun statusLabel(status: String) = when (status) { "ACTIVE" -> "进行中"; "PAUSED" -> "已暂停"; "AWAITING_FEEDBACK" -> "待确认反馈"; "SETTLED" -> "已结算"; "CANCELLED" -> "已取消"; "CONTENT_STALE" -> "资料已变化"; else -> status }
private fun evidenceLabel(value: String?) = when (value) { "ATTEMPTED" -> "已尝试"; "INDEPENDENT" -> "有独立证据"; "DELAYED" -> "有延迟证据"; else -> "待探索" }

@Composable private fun SessionClock(run: RunView) {
    val timing = run.timing ?: return
    val receivedAt = remember(run) { android.os.SystemClock.elapsedRealtime() }
    var tick by remember(run.id) { mutableStateOf(android.os.SystemClock.elapsedRealtime()) }
    val closed = run.status in listOf("SETTLED", "CANCELLED", "CONTENT_STALE")
    LaunchedEffect(run.id, closed) { if (!closed) while (true) { delay(1000); tick = android.os.SystemClock.elapsedRealtime() } }
    val delta = if (closed) 0L else (tick - receivedAt).coerceAtLeast(0L)
    fun duration(value: Long): String { val seconds = value / 1000; return "${seconds / 60}分${seconds % 60}秒" }
    Text("本次用时（估算） ${duration(timing.elapsedMs + delta)} · 已暂停 ${duration(timing.pausedMs + if (run.status == "PAUSED") delta else 0L)}", style = MaterialTheme.typography.bodySmall)
}
