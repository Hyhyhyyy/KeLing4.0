package com.keling.app.ui.screens.settings

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import com.keling.app.BuildConfig
import com.keling.app.ui.components.StellarSceneCard
import com.keling.app.ui.components.StellarTheme
import com.keling.app.ui.screens.ai.ModelAccessPanel

/** Persistent settings destination, using the shared stellar visual language. */
@Composable
fun PastoralSettingsScreen(
    onBack: () -> Unit,
    onNavigateToProfile: () -> Unit,
    onNavigateToAchievements: () -> Unit,
    onLogout: () -> Unit = {},
    guest: com.keling.app.network.GuestWorkspace? = null
) {
    val uri = LocalUriHandler.current
    var showKeyPanel by remember { mutableStateOf(false) }
    var showAbout by remember { mutableStateOf(false) }
    var confirmExit by remember { mutableStateOf(false) }
    var checking by remember { mutableStateOf(false) }
    var updateStatus by remember { mutableStateOf<String?>(null) }
    var latest by remember { mutableStateOf<com.keling.app.update.VersionInfo?>(null) }
    val scope = rememberCoroutineScope()
    StellarTheme {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            if (showKeyPanel) {
                androidx.activity.compose.BackHandler { showKeyPanel = false }
                ModelAccessPanel(onClose = { showKeyPanel = false }, sharedSession = guest?.modelAccess, embedded = true)
            } else LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(16.dp), contentPadding = PaddingValues(vertical = 20.dp)) {
                item { Text("设置 · 星舰控制台", style = MaterialTheme.typography.headlineSmall) }
                item { StellarSceneCard("scene_settings", "让学习空间适合你", "配置自己的模型、管理身份与隐私，查看版本与帮助。") }
                item { SettingsCard("启用 AI") {
                    Text("输入自己的 API Key", style = MaterialTheme.typography.titleLarge)
                    Text(if (guest != null) "临时配置可供本次试用各模块使用，退出即清空。" else "Key 仅保留在当前配置页内存，关闭清除，不云同步。")
                    Button(onClick = { showKeyPanel = true }, modifier = Modifier.fillMaxWidth()) { Text("配置 Key · 获取最新模型") }
                } }
                item { SettingsCard("账户与记录") {
                    OutlinedButton(onClick = onNavigateToProfile, modifier = Modifier.fillMaxWidth()) { Text("管理昵称与星际头像") }
                    OutlinedButton(onClick = onNavigateToAchievements, modifier = Modifier.fillMaxWidth()) { Text("查看学习成就") }
                    Text(if (guest != null) "本次数据仅在内存；关闭应用或退出后清空。" else "账号资料使用共享服务；本机历史资料仍保留。", style = MaterialTheme.typography.bodyMedium)
                    TextButton(onClick = { confirmExit = !confirmExit }) { Text(if (guest != null) "退出试用并清空" else "退出登录") }
                    if (confirmExit) {
                        Text(if (guest != null) "确认退出？本次内容与 Key 将清空，下次从初始空间开始。" else "确认退出？本机学习数据保留在当前账号下，下次登录可继续使用。", color = MaterialTheme.colorScheme.error)
                        Button(onClick = onLogout) { Text("确认退出") }
                        OutlinedButton(onClick = { confirmExit = false }) { Text("继续使用") }
                    }
                } }
                item { SettingsCard("设备能力") {
                    Text("通知、学习提醒、签到提醒、音效与震动尚未接入，暂不可启用。", style = MaterialTheme.typography.bodyMedium)
                    Text("叙事浓度、伙伴提示与低动效，可在“我的”中调整。", color = MaterialTheme.colorScheme.primary)
                } }
                item { SettingsCard("帮助与版本") {
                    Text("课灵 ${BuildConfig.VERSION_NAME}", style = MaterialTheme.typography.titleMedium)
                    OutlinedButton(onClick = {
                        checking = true; updateStatus = null; latest = null
                        scope.launch {
                            try {
                                com.keling.app.update.UpdateService().checkUpdate(BuildConfig.VERSION_CODE, BuildConfig.VERSION_NAME)
                                    .onSuccess { result ->
                                        latest = result.latestVersion.takeIf { result.needUpdate }
                                        updateStatus = if (result.needUpdate) "发现版本 ${result.latestVersion.versionName}\n${result.latestVersion.updateLog}" else "当前版本无需更新。"
                                    }.onFailure { updateStatus = "检查未成功：${it.message ?: "网络连接失败"}" }
                            } finally { checking = false }
                        }
                    }, enabled = !checking, modifier = Modifier.fillMaxWidth()) { Text(if (checking) "正在检查版本" else "检查更新") }
                    updateStatus?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
                    latest?.let { version ->
                        if (version.updateUrl.startsWith("https://")) Button(onClick = { uri.openUri(version.updateUrl) }, modifier = Modifier.fillMaxWidth()) { Text("打开新版下载页面") }
                        else Text("更新地址不是 HTTPS，请到项目发布页获取安装包。", color = MaterialTheme.colorScheme.error)
                    }
                    OutlinedButton(onClick = { uri.openUri("https://github.com/Hyhyhyyy/KeLing4.0#readme") }, modifier = Modifier.fillMaxWidth()) { Text("阅读使用指南") }
                    OutlinedButton(onClick = { uri.openUri("https://github.com/Hyhyhyyy/KeLing4.0/issues") }, modifier = Modifier.fillMaxWidth()) { Text("提交意见反馈") }
                    TextButton(onClick = { showAbout = !showAbout }) { Text(if (showAbout) "收起产品介绍" else "关于课灵") }
                    if (showAbout) {
                        Text("课灵 · AI 学习与知识管理", style = MaterialTheme.typography.titleMedium)
                        Text("把课程资料转化为问题、计划、实践与可回看的学习过程。网页与 Kotlin Android 共享账号数据，游客空间仅保留本次记录。")
                        Text("真实 AI 需有效模型配置；模型建议需要核实。")
                        OutlinedButton(onClick = { uri.openUri("https://keling-ict-preview.vercel.app") }, modifier = Modifier.fillMaxWidth()) { Text("访问网页版") }
                    }
                } }
            }
        }
    }
}

@Composable private fun SettingsCard(title: String, content: @Composable ColumnScope.() -> Unit) {
    Card(modifier = Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
            content()
        }
    }
}
