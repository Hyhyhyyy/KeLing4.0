package com.keling.app.planet

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.keling.app.ui.components.*
import com.keling.app.ui.screens.ai.ModelAccessPanel

@Composable fun PlanetScreen(vm: PlanetViewModel, guest: Boolean, onNavigate: (String) -> Unit) {
    val state by vm.state.collectAsStateWithLifecycle()
    val access by vm.access.state.collectAsStateWithLifecycle()
    var story by remember(vm) { mutableStateOf(true) }
    var subject by remember(vm) { mutableStateOf("") }
    var level by remember(vm) { mutableStateOf("") }
    var goal by remember(vm) { mutableStateOf("") }
    var providerId by remember(vm) { mutableStateOf("") }
    var model by remember(vm) { mutableStateOf("") }
    var ownModel by remember(vm) { mutableStateOf(false) }
    var configure by remember(vm) { mutableStateOf(false) }
    var regionId by remember(vm) { mutableStateOf<String?>(null) }
    var reflection by remember(vm) { mutableStateOf("") }
    val selected = remember(vm) { mutableStateMapOf<String, Int>() }
    LaunchedEffect(state.loading) { if (!state.loading && state.planets.isNotEmpty()) story = false }
    LaunchedEffect(state.providers) { if (state.providers.none { it.id == providerId }) { providerId = state.providers.firstOrNull()?.id.orEmpty(); model = state.providers.firstOrNull()?.chatModels?.firstOrNull().orEmpty() } }
    LaunchedEffect(state.current?.id) { regionId = state.current?.draft?.regions?.firstOrNull()?.id; selected.clear(); reflection = "" }
    BackHandler(enabled = state.current != null || state.generated != null) { if (!state.busy) vm.overview() }
    StellarTheme { Surface(Modifier.fillMaxSize()) { Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            StellarArt("title_logo", "课灵", Modifier.width(108.dp).height(48.dp))
            Spacer(Modifier.weight(1f))
            TextButton(onClick = { vm.overview(); story = false }, enabled = !state.busy) { Text("星图") }
            TextButton(onClick = { onNavigate("notes") }) { Text("日志") }
            TextButton(onClick = vm::refresh, enabled = !state.busy) { Text("刷新") }
        }
        if (state.loading || state.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
        LazyColumn(Modifier.weight(1f).padding(horizontal = 16.dp), contentPadding = PaddingValues(vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            state.error?.let { item { Text(it, color = MaterialTheme.colorScheme.error) } }
            state.notice?.let { item { Text(it, color = MaterialTheme.colorScheme.primary) } }
            when {
                state.current != null -> {
                    val planet = state.current!!
                    item { PlanetHero(planet.draft) }
                    item { Text("探索记录 ${planet.progress.completedRegionIds.size} / ${planet.draft.regions.size}", style = MaterialTheme.typography.titleMedium) }
                    item { OutlinedButton(onClick = { onNavigate("cloud_graph:${planet.courseId}") }) { Text("展开知识图谱") } }
                    item { Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        OutlinedButton(onClick = { onNavigate("ask_course:${planet.courseId}") }, modifier = Modifier.weight(1f)) { Text("问星芽") }
                        OutlinedButton(onClick = { onNavigate("planet_materials:${planet.courseId}") }, modifier = Modifier.weight(1f)) { Text("资料问答") }
                    } }
                    item { StellarSelect("探索区域", regionId.orEmpty(), planet.draft.regions.map { it.id to it.title }, !state.busy) { regionId = it; reflection = "" } }
                    val region = planet.draft.regions.find { it.id == regionId }
                    if (region != null) {
                        val unlocked = region.prerequisiteIds.all { it in planet.progress.completedRegionIds }
                        if (!unlocked) item { Text("先完成：${region.prerequisiteIds.filterNot { it in planet.progress.completedRegionIds }.mapNotNull { id -> planet.draft.regions.find { it.id == id }?.title }.joinToString("、")}", color = MaterialTheme.colorScheme.secondary) }
                        item { Card { Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            StellarSectionTitle(region.title, motif = 3)
                            Text(region.description)
                            region.objectives.forEach { Text(it, style = MaterialTheme.typography.bodyMedium) }
                            Text(region.lesson, style = MaterialTheme.typography.bodyLarge)
                        } } }
                        items(region.questions, key = { it.id }) { question ->
                            val answer = planet.progress.answers[question.id]
                            val feedback = state.feedback[question.id]
                            Card { Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(question.prompt, style = MaterialTheme.typography.titleMedium)
                                question.options.forEachIndexed { index, option -> Row(Modifier.fillMaxWidth().clickable(enabled = !state.busy && unlocked) { selected[question.id] = index }, verticalAlignment = Alignment.CenterVertically) {
                                    RadioButton(selected = (selected[question.id] ?: answer?.selectedIndex) == index, onClick = { selected[question.id] = index }, enabled = !state.busy && unlocked)
                                    Text(option, Modifier.weight(1f).padding(vertical = 8.dp))
                                } }
                                Button(onClick = { (selected[question.id] ?: answer?.selectedIndex)?.let { vm.answer(question.id, it) } }, enabled = !state.busy && unlocked && (selected[question.id] ?: answer?.selectedIndex) != null) { Text(if (answer == null) "提交探索" else "重新尝试") }
                                if (answer != null) {
                                    Text(if (answer.correct) "与参考答案一致" else "还有一处值得再想想", color = MaterialTheme.colorScheme.primary)
                                    Text(feedback?.explanation ?: question.explanation)
                                    Text("参考选项：${question.options.getOrNull(feedback?.expectedIndex ?: question.answerIndex).orEmpty()}", style = MaterialTheme.typography.bodyMedium)
                                }
                            } }
                        }
                        item { Card { Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            StellarSectionTitle("航行日志", motif = 4)
                            OutlinedTextField(reflection, { reflection = it.take(4000) }, label = { Text("这次发现了什么，下次想弄懂什么？") }, modifier = Modifier.fillMaxWidth(), minLines = 3)
                            Button(onClick = { vm.saveJournal(region, reflection) }, enabled = !state.busy && reflection.isNotBlank()) { Text("保存发现") }
                            OutlinedButton(onClick = { vm.schedule(region) }, enabled = !state.busy) { Text("安排下一次探索") }
                            TextButton(onClick = { onNavigate("tasks") }) { Text("查看学习任务") }
                        } } }
                    }
                    item { TextButton(onClick = vm::overview, enabled = !state.busy) { Text("返回星图") } }
                }
                state.generated != null -> {
                    val draft = state.generated!!.draft
                    item { StellarHeading("星球已抵达", mascot = 2) }
                    item { PlanetHero(draft) }
                    items(draft.regions, key = { it.id }) { region -> Card { Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(region.title, style = MaterialTheme.typography.titleLarge)
                        Text(region.description)
                        Text("${region.questions.size} 道探索题 · 约 ${region.estimatedMinutes} 分钟", style = MaterialTheme.typography.bodySmall)
                    } } }
                    item { StellarActionButton("确认星球，开始探索", vm::confirm, Modifier.fillMaxWidth(), !state.busy) }
                    item { TextButton(onClick = vm::discardPreview, enabled = !state.busy) { Text("调整目标，重新生成") } }
                }
                else -> {
                    if (story) {
                        item { StellarSceneCard("hero_web", "星图，等你添上下一笔", "舷窗外，星河缓缓流动。操作台亮起，星芽向你挥了挥手。欢迎登舰，探索者！") }
                        item { Text("每一门学科，都有一片值得探索的天地。那些暂时没弄懂的问题，就是我们接下来要去的地方。", style = MaterialTheme.typography.bodyLarge) }
                        item { Text("数学的几何群山、英语的书页城堡、历史的文明遗迹……第一站，想去哪里？写下你想学的学科，再告诉我你的起点和目标。", style = MaterialTheme.typography.bodyLarge) }
                        item { Text("让我们一起一步一步探索这个知识星球的每一方寸文明！", style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary) }
                        item { StellarActionButton("选择第一颗星球", { story = false }, Modifier.fillMaxWidth()) }
                    } else item { StellarHeading("我的知识星图", mascot = 3) }
                    if (!state.loading) item { Card { Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        StellarSectionTitle(if (state.planets.isEmpty()) "命名你的第一颗星球" else "探索新的学科", motif = 2)
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            items(listOf("数学", "英语", "历史", "计算机", "经济", "政治", "语文", "物理", "化学", "生物", "地理", "艺术")) { name ->
                                Column(Modifier.width(82.dp).clickable(enabled = !state.busy) { subject = name }.padding(4.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                    SubjectPlanetArt(name, 0, Modifier.size(70.dp), "选择$name")
                                    Text(name, color = if (subject == name) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface)
                                }
                            }
                        }
                        OutlinedTextField(subject, { subject = it.take(80) }, label = { Text("想学习的学科") }, placeholder = { Text("例如：高等数学、英语、历史") }, singleLine = true, enabled = !state.busy, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(level, { level = it.take(80) }, label = { Text("当前基础（选填）") }, enabled = !state.busy, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(goal, { goal = it.take(300) }, label = { Text("这次想学会什么（选填）") }, enabled = !state.busy, modifier = Modifier.fillMaxWidth())
                        Row(verticalAlignment = Alignment.CenterVertically) { Switch(ownModel, { ownModel = it }, enabled = !state.busy); Text("使用自己的模型", Modifier.padding(start = 8.dp)) }
                        if (ownModel) {
                            Text(if (access.model.isBlank()) "尚未配置模型" else "${access.providerId} · ${access.model}")
                            OutlinedButton(onClick = { configure = true }, enabled = !state.busy) { Text("配置模型") }
                        } else {
                            state.catalogError?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                            if (state.providers.isNotEmpty()) {
                                StellarSelect("模型服务", providerId, state.providers.map { it.id to it.name }, !state.busy) { providerId = it; model = state.providers.find { p -> p.id == it }?.chatModels?.firstOrNull().orEmpty() }
                                val models = state.providers.find { it.id == providerId }?.chatModels.orEmpty()
                                if (models.isNotEmpty()) StellarSelect("模型", model, models.map { it to it }, !state.busy) { model = it }
                            }
                        }
                        StellarActionButton(if (state.busy) "星芽正在绘制星球…" else "生成我的学习星球", { vm.generate(subject, level, goal, ownModel, providerId, model) }, Modifier.fillMaxWidth(), !state.busy && subject.isNotBlank())
                        if (state.busy) TextButton(onClick = vm::cancelGeneration) { Text("停止等待") }
                        Text(if (guest) "游客星球退出即清空" else "确认后保存到账号", style = MaterialTheme.typography.bodySmall)
                    } } }
                    items(state.planets, key = { it.id }) { planet -> Card(onClick = { if (!state.busy) vm.open(planet.id) }) {
                        Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                            SubjectPlanetArt(planet.draft.subject, planet.draft.planetStyleIndex, Modifier.size(80.dp), null)
                            Column(Modifier.weight(1f).padding(start = 12.dp)) { Text(planet.draft.title, style = MaterialTheme.typography.titleLarge); Text("${planet.draft.subject} · ${planet.progress.completedRegionIds.size}/${planet.draft.regions.size} 区域") }
                            StellarArrow(Modifier.size(36.dp))
                        }
                    } }
                    item { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        TextButton(onClick = { story = true }) { Text("回看序章") }
                        TextButton(onClick = { onNavigate("legacy_expedition") }) { Text("二叉树示例") }
                        TextButton(onClick = { onNavigate("greenhouse") }) { Text("课程资料") }
                    } }
                }
            }
        }
    } } }
    if (configure) ModelAccessPanel(sharedSession = vm.access, onClose = { configure = false })
}

@Composable private fun PlanetHero(draft: PlanetDraft) {
    Card { Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SubjectPlanetArt(draft.subject, draft.planetStyleIndex, Modifier.fillMaxWidth().height(150.dp))
        Text(draft.title, style = MaterialTheme.typography.headlineMedium)
        Text(draft.story)
        Text("AI 生成内容，待核对", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary)
    } }
}
