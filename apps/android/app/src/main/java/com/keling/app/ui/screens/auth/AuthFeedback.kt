package com.keling.app.ui.screens.auth

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

@Composable
fun AuthFeedback(state: UiState<*>, onCancel: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(top = 12.dp).semantics { liveRegion = LiveRegionMode.Polite }) {
        if (state is UiState.Loading) {
            Text("正在连接账号服务，最多等待25秒。你可以取消后重新尝试。", style = MaterialTheme.typography.bodyMedium)
            OutlinedButton(onClick = onCancel, modifier = Modifier.fillMaxWidth()) { Text("取消等待") }
        } else if (state is UiState.Error) {
            Text(state.message, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
        }
    }
}
