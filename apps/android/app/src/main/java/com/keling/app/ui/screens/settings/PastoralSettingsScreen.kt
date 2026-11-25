package com.keling.app.ui.screens.settings

import com.keling.app.ui.components.StellarHeading
import com.keling.app.ui.components.StellarSectionTitle
import com.keling.app.ui.components.StellarTitleMark
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import com.keling.app.BuildConfig
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
                item { StellarHeading("设置", mascot = 8) }
                item { SettingsCard("启用 AI") {
                    StellarSectionTitle("输入自己的 API Key", motif = 3)
                    Text(if (guest != null) "Key 退出试用即清除" else "Key 关闭配置页即清除")
                    Button(onClick = { showKeyPanel = true }, modifier = Modifier.fillMaxWidth()) { Text("配置模型") }
                } }
                item { SettingsCard("账户与记录") {
                    OutlinedButton(onClick = onNavigateToProfile, modifier = Modifier.fillMaxWidth()) { Text("个人资料") }
                    OutlinedButton(onClick = onNavigateToAchievements, modifier = Modifier.fillMaxWidth()) { Text("学习成就") }
                    TextButton(onClick = { confirmExit = !confirmExit }) { Text(if (guest != null) "退出试用并清空" else "退出登录") }
                    if (confirmExit) {
                        Text(if (guest != null) "退出将清空游客记录与 Key。" else "退出当前账号？", color = MaterialTheme.colorScheme.error)
                        Button(onClick = onLogout) { Text("确认退出") }
                        OutlinedButton(onClick = { confirmExit = false }) { Text("继续使用") }
                    }
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
                        if (version.updateUrl.startsWith("https://")) Button(onClick = { uri.openUri(version.updateUrl) }, modifier = Modifier.fillMaxWidth()) { Text("下载新版") }
                        else Text("下载地址无效，请访问项目发布页。", color = MaterialTheme.colorScheme.error)
                    }
                    OutlinedButton(onClick = { uri.openUri("https://github.com/Hyhyhyyy/KeLing4.0#readme") }, modifier = Modifier.fillMaxWidth()) { Text("使用指南") }
                    OutlinedButton(onClick = { uri.openUri("https://github.com/Hyhyhyyy/KeLing4.0/issues") }, modifier = Modifier.fillMaxWidth()) { Text("意见反馈") }
                    TextButton(onClick = { showAbout = !showAbout }) { Text(if (showAbout) "收起" else "关于课灵") }
                    if (showAbout) {
                        Text("课灵 · AI 学习与知识管理", style = MaterialTheme.typography.titleMedium)
                        OutlinedButton(onClick = { uri.openUri("https://ucn5aajxnx7f.feishuapp.com/app/app_17h4dw5jwdg") }, modifier = Modifier.fillMaxWidth()) { Text("访问网页版") }
                    }
                } }
            }
        }
    }
}

@Composable private fun SettingsCard(title: String, content: @Composable ColumnScope.() -> Unit) {
    Card(modifier = Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            StellarSectionTitle(title, color = MaterialTheme.colorScheme.primary)
            content()
        }
    }
}
