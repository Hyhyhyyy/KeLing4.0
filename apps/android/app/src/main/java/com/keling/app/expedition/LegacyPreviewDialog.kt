package com.keling.app.expedition

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.keling.app.data.LegacyDataPreview
import com.keling.app.data.inspectLegacyData
import com.keling.app.network.WorkspaceProfile
import kotlinx.coroutines.CancellationException

@Composable fun LegacyPreviewCard(accountId: String, cloud: WorkspaceProfile?, onClose: () -> Unit) {
    val context = LocalContext.current
    var loading by remember { mutableStateOf(true) }; var snapshot by remember { mutableStateOf<LegacyDataPreview?>(null) }; var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(accountId) { try { snapshot = inspectLegacyData(context, accountId) } catch (e: CancellationException) { throw e } catch (_: Exception) { error = "旧资料读取失败" } finally { loading = false } }
    Card { Column(Modifier.fillMaxWidth().padding(16.dp)) {
        Text("历史资料", style = MaterialTheme.typography.titleLarge)
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            when {
                loading -> Text("正在读取…")
                error != null -> Text(error!!)
                snapshot == null -> Text("未找到旧存档")
                else -> snapshot?.let { old ->
                    Text(when (old.ownership) { "MATCH" -> "当前账号存档"; "OTHER" -> "其他账号存档 · 只读"; else -> "归属不明 · 只读" })
                    Text("课程 ${old.courses?.toString() ?: "未知"} · 笔记 ${old.notes?.toString() ?: "未知"} · 任务 ${old.tasks?.toString() ?: "未知"}")
                    Text("本机存档：等级 ${old.level ?: "未读到"}，结晶 ${old.crystals ?: "未读到"}，能量 ${old.energy ?: "未读到"}")
                }
            }
            cloud?.let { Text("当前云账号：Lv.${it.level}，结晶 ${it.crystals}，历史能量 ${it.energy}") }
        }
        TextButton(onClick = onClose) { Text("收起") }
    } }
}
