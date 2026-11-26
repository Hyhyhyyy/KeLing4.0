package com.keling.app.ui.components

import android.widget.Toast
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.unit.dp
import com.keling.app.network.USAGE_GUIDE_URL

@Composable
fun UsageGuideButton(modifier: Modifier = Modifier) {
    val uri = LocalUriHandler.current
    val context = LocalContext.current
    OutlinedButton(onClick = {
        runCatching { uri.openUri(USAGE_GUIDE_URL) }
            .onFailure { Toast.makeText(context, "未能打开指南，请检查浏览器", Toast.LENGTH_SHORT).show() }
    }, modifier = modifier) {
        Text("使用指南")
        Spacer(Modifier.width(4.dp))
        StellarArrow(Modifier.size(32.dp))
    }
}
