package com.keling.app.ui.screens.auth

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.keling.app.network.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

@Composable
fun AccountConnectionPanel(enabled: Boolean, onSaved: () -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    var address by remember { mutableStateOf(ApiConfig.actualBaseUrl) }
    var message by remember { mutableStateOf<String?>(null) }
    var checking by remember { mutableStateOf(false) }
    var verified by remember { mutableStateOf<String?>(null) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    Column(Modifier.fillMaxWidth().padding(vertical = 12.dp)) {
        TextButton(onClick = { expanded = !expanded }, enabled = enabled && !checking) {
            Text("服务连接")
        }
        if (expanded) {
            Text("请使用可信的服务地址", style = MaterialTheme.typography.bodySmall)
            OutlinedTextField(value = address, onValueChange = { address = it; verified = null; message = null },
                label = { Text("HTTPS 服务地址") }, enabled = enabled && !checking,
                modifier = Modifier.fillMaxWidth(), singleLine = true)
            TextButton(onClick = { address = ApiConfig.BASE_URL; verified = null; message = null }, enabled = enabled && !checking) {
                Text("恢复默认地址")
            }
            Button(onClick = {
                scope.launch {
                    checking = true; verified = null; message = null
                    try {
                        val target = normalizeEndpoint(address)
                        checkAccountService(KelingHttpClient.client, target)
                        verified = target
                        message = "连接正常"
                    } catch (e: CancellationException) { throw e }
                    catch (e: Exception) { message = connectionError(e) }
                    finally { checking = false }
                }
            }, enabled = enabled && !checking, modifier = Modifier.fillMaxWidth()) {
                Text(if (checking) "正在检测…" else "检测账号服务")
            }
            if (verified != null) {
                OutlinedButton(onClick = {
                    try { ConnectionSettings.save(context, verified!!); onSaved(); message = "地址已保存，请注册或登录。" }
                    catch (e: Exception) { message = connectionError(e) }
                }, enabled = enabled && !checking, modifier = Modifier.fillMaxWidth()) { Text("保存地址") }
            }
            message?.let { Text(it, modifier = Modifier.padding(top = 8.dp), style = MaterialTheme.typography.bodyMedium) }
        }
    }
}
