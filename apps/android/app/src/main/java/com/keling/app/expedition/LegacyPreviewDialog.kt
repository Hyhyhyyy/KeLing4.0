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

@Composable fun LegacyPreviewDialog(accountId: String, cloud: WorkspaceProfile?, onClose: () -> Unit) {
    val context = LocalContext.current
    var loading by remember { mutableStateOf(true) }; var snapshot by remember { mutableStateOf<LegacyDataPreview?>(null) }; var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(accountId) { try { snapshot = inspectLegacyData(context, accountId) } catch (e: CancellationException) { throw e } catch (_: Exception) { error = "未能读取旧资料；原文件保持不变。" } finally { loading = false } }
    AlertDialog(onDismissRequest = onClose, title = { Text("旧田园资料 · 归属与回退核对") }, text = {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            when {
                loading -> Text("正在只读检查本机旧存档…")
                error != null -> Text(error!!)
                snapshot == null -> Text("没有读取到旧版 keling_data 存档；这不表示已经迁移了0条记录。")
                else -> snapshot?.let { old ->
                    Text(when (old.ownership) { "MATCH" -> "旧存档记录的账号与当前账号匹配。"; "OTHER" -> "旧存档属于另一个已记录账号，不会并入当前账号。"; else -> "旧存档未标明账号，无法确认归属，不会自动并入。" })
                    Text("可读取数量：课程 ${old.courses?.toString() ?: "未读到或不可解析"} · 笔记 ${old.notes?.toString() ?: "未读到或不可解析"} · 任务 ${old.tasks?.toString() ?: "未读到或不可解析"}")
                    Text("旧本机快照：等级 ${old.level ?: "未读到"}，结晶 ${old.crystals ?: "未读到"}，能量 ${old.energy ?: "未读到"}")
                }
            }
            cloud?.let { Text("当前云账号：Lv.${it.level}，结晶 ${it.crystals}，历史能量 ${it.energy}") }
            Text("两份资源不相加。本核对不修改、不上传旧资料。已有迁移只在来源账号匹配且目标本机存档为空时复制；原文件不删除，可作回退依据。未知归属只提供只读概览。", style = MaterialTheme.typography.bodySmall)
        }
    }, confirmButton = { TextButton(onClick = onClose) { Text("已了解，关闭核对") } })
}
