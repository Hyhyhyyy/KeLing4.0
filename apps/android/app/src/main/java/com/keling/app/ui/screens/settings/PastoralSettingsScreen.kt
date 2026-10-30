package com.keling.app.ui.screens.settings

/**
 * =========================
 * 田园治愈风设置页面
 * =========================
 */

import androidx.compose.animation.*
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.keling.app.R
import com.keling.app.BuildConfig
import com.keling.app.ui.components.StellarSceneCard
import com.keling.app.ui.components.StellarTheme
import com.keling.app.ui.screens.ai.ModelAccessPanel
import androidx.compose.ui.platform.LocalUriHandler
import com.keling.app.ui.theme.*

@Composable
fun PastoralSettingsScreen(
    onBack: () -> Unit,
    onNavigateToProfile: () -> Unit,
    onNavigateToAchievements: () -> Unit,
    onLogout: () -> Unit = {},
    onCheckUpdate: () -> Unit = {},
    guest: com.keling.app.network.GuestWorkspace? = null
) {
    val uriHandler = LocalUriHandler.current
    // 关于对话框
    var showAboutDialog by remember { mutableStateOf(false) }
    var showKeyPanel by remember { mutableStateOf(false) }
    if (showKeyPanel) ModelAccessPanel(onClose = { showKeyPanel = false }, sharedSession = guest?.modelAccess)

    if (showAboutDialog) {
        AboutDialog(onDismiss = { showAboutDialog = false })
    }

    Box(
        modifier = Modifier.fillMaxSize()
    ) {
        // 背景图片
        Image(
            painter = painterResource(id = R.drawable.bg_page),
            contentDescription = null,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.FillBounds
        )

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            contentPadding = PaddingValues(vertical = 20.dp)
        ) {
            // 顶部导航
            item {
                SettingsHeader(onBack = onBack)
            }
            item {
                StellarTheme { StellarSceneCard("scene_settings", "星舰设置台", "管理账户、检查版本，调整当前设备的使用方式。") }
            }
            item {
                SettingsSection(title = "自己的模型") {
                    SettingItem(icon = "✦", title = "配置 API Key 与实时模型", subtitle = if (guest != null) "本次试用内存 · 可跨模块使用 · 退出清空" else "临时内存配置 · 关闭清除 · 不云同步", onClick = { showKeyPanel = true })
                }
            }

            // 账户设置
            item {
                SettingsSection(title = "账户") {
                    SettingItem(
                        icon = "👤",
                        title = "个人资料",
                        subtitle = "修改昵称和头像",
                        onClick = onNavigateToProfile
                    )
                    SettingItem(
                        icon = "🏆",
                        title = "成就管理",
                        subtitle = "查看已解锁成就",
                        onClick = onNavigateToAchievements
                    )
                    SettingItem(
                        icon = "🚪",
                        title = if (guest != null) "退出试用并清空" else "退出登录",
                        subtitle = if (guest != null) "不保存本次内容，下次从初始空间开始" else "退出当前账号，本机学习数据保留",
                        onClick = onLogout
                    )
                }
            }

            // 通知设置
            item {
                SettingsSection(title = "通知 · 尚未接入") {
                    SettingSwitchItem(
                        icon = "🔔",
                        title = "推送通知",
                        subtitle = "尚未接入系统推送，暂不可启用",
                        checked = false, enabled = false,
                        onCheckedChange = {}
                    )
                    SettingSwitchItem(
                        icon = "⏰",
                        title = "学习提醒",
                        subtitle = "尚未接入提醒计划，暂不可启用",
                        checked = false, enabled = false,
                        onCheckedChange = {}
                    )
                    SettingSwitchItem(
                        icon = "📅",
                        title = "签到提醒",
                        subtitle = "尚未接入签到通知，暂不可启用",
                        checked = false, enabled = false,
                        onCheckedChange = {}
                    )
                }
            }

            // 效果设置
            item {
                SettingsSection(title = "效果 · 尚未接入") {
                    SettingSwitchItem(
                        icon = "🔊",
                        title = "音效",
                        subtitle = "尚未接入交互音效，暂不可启用",
                        checked = false, enabled = false,
                        onCheckedChange = {}
                    )
                    SettingSwitchItem(
                        icon = "📳",
                        title = "震动反馈",
                        subtitle = "尚未接入震动反馈，暂不可启用",
                        checked = false, enabled = false,
                        onCheckedChange = {}
                    )
                }
            }

            // 其他
            item {
                SettingsSection(title = "其他") {
                    SettingItem(
                        icon = "🔄",
                        title = "检查更新",
                        subtitle = "检查是否有新版本",
                        onClick = onCheckUpdate
                    )
                    SettingItem(
                        icon = "📖",
                        title = "使用指南",
                        subtitle = "了解如何使用课灵",
                        onClick = { uriHandler.openUri("https://github.com/Hyhyhyyy/KeLing4.0#readme") }
                    )
                    SettingItem(
                        icon = "💬",
                        title = "意见反馈",
                        subtitle = "帮助我们改进应用",
                        onClick = { uriHandler.openUri("https://github.com/Hyhyhyyy/KeLing4.0/issues") }
                    )
                    SettingItem(
                        icon = "ℹ️",
                        title = "关于课灵",
                        subtitle = "版本 ${BuildConfig.VERSION_NAME}",
                        onClick = { showAboutDialog = true }
                    )
                }
            }

            // 底部留白
            item {
                Spacer(modifier = Modifier.height(32.dp))
            }
        }
    }
}

// ==================== 组件 ====================

/**
 * 页面头部
 */
@Composable
private fun SettingsHeader(onBack: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        // 返回按钮
        Surface(
            onClick = onBack,
            shape = CircleShape,
            color = BeigeSurface,
            shadowElevation = 0.dp
        ) {
            Box(
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                contentAlignment = Alignment.Center
            ) {
                Image(
                    painter = painterResource(id = R.drawable.ic_arrow_left),
                    contentDescription = "返回",
                    modifier = Modifier.size(60.dp)
                )
            }
        }

        // 标题
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = "设置",
                style = MaterialTheme.typography.titleLarge,
                color = EarthBrown,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = "应用配置",
                style = MaterialTheme.typography.labelSmall,
                color = MintGreen
            )
        }

        // 占位
        Spacer(modifier = Modifier.width(52.dp))
    }
}

/**
 * 设置区块
 */
@Composable
private fun SettingsSection(
    title: String,
    content: @Composable ColumnScope.() -> Unit
) {
    Column {
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            color = EarthBrown,
            fontWeight = FontWeight.Bold
        )
        Spacer(modifier = Modifier.height(12.dp))
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(20.dp),
            color = CreamWhite.copy(alpha = 0.8f),
            shadowElevation = 0.dp
        ) {
            Box {
                Image(
                    painter = painterResource(id = R.drawable.bg_card_module),
                    contentDescription = null,
                    modifier = Modifier.matchParentSize(),
                    contentScale = ContentScale.FillBounds
                )
                Column(content = content)
            }
        }
    }
}

/**
 * 设置项（可点击）
 */
@Composable
fun SettingItem(
    icon: String,
    title: String,
    subtitle: String,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() }
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // 图标
        Surface(
            shape = RoundedCornerShape(12.dp),
            color = BeigeSurface
        ) {
            Box(
                modifier = Modifier.padding(10.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(text = icon, fontSize = 20.sp)
            }
        }

        Spacer(modifier = Modifier.width(14.dp))

        // 文字
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyLarge,
                color = EarthBrown,
                fontWeight = FontWeight.Medium
            )
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = EarthBrownLight
            )
        }

        // 箭头
        Text(text = "›", fontSize = 20.sp, color = EarthBrownLight)
    }
}

/**
 * 设置项（开关）
 */
@Composable
fun SettingSwitchItem(
    icon: String,
    title: String,
    subtitle: String,
    checked: Boolean,
    enabled: Boolean = true,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // 图标
        Surface(
            shape = RoundedCornerShape(12.dp),
            color = if (checked) MintGreen.copy(alpha = 0.2f) else BeigeSurface
        ) {
            Box(
                modifier = Modifier.padding(10.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(text = icon, fontSize = 20.sp)
            }
        }

        Spacer(modifier = Modifier.width(14.dp))

        // 文字
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyLarge,
                color = EarthBrown,
                fontWeight = FontWeight.Medium
            )
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = EarthBrownLight
            )
        }

        // 开关
        Switch(
            checked = checked,
            enabled = enabled,
            onCheckedChange = onCheckedChange,
            colors = SwitchDefaults.colors(
                checkedThumbColor = Color.White,
                checkedTrackColor = MintGreen,
                uncheckedThumbColor = Color.White,
                uncheckedTrackColor = WarmGray
            )
        )
    }
}

/**
 * 关于对话框
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AboutDialog(onDismiss: () -> Unit) {
    val context = androidx.compose.ui.platform.LocalContext.current

    AlertDialog(
        onDismissRequest = onDismiss
    ) {
        Surface(
            shape = RoundedCornerShape(24.dp),
            color = CreamWhite
        ) {
            Column(
                modifier = Modifier.padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Image(
                    painter = painterResource(id = R.drawable.ic_logo),
                    contentDescription = "课灵Logo",
                    modifier = Modifier.size(80.dp)
                )
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    text = "课灵",
                    style = MaterialTheme.typography.headlineSmall,
                    color = EarthBrown,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "版本 ${BuildConfig.VERSION_NAME}",
                    style = MaterialTheme.typography.bodySmall,
                    color = EarthBrownLight
                )
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    text = "一款AI驱动的学习管理应用\n让学习像培育星球一样有趣",
                    style = MaterialTheme.typography.bodyMedium,
                    color = EarthBrown,
                    textAlign = TextAlign.Center
                )
                Spacer(modifier = Modifier.height(20.dp))

                // 网页端链接
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = MintGreen.copy(alpha = 0.15f),
                    modifier = Modifier.clickable {
                        val intent = android.content.Intent(
                            android.content.Intent.ACTION_VIEW,
                            android.net.Uri.parse("https://web-ashy-rho-36.vercel.app")
                        )
                        context.startActivity(intent)
                    }
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center
                    ) {
                        Text(
                            text = "🌐",
                            fontSize = 18.sp
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "访问网页版",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MintGreen,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))
                TextButton(onClick = onDismiss) {
                    Text("关闭", color = WarmSunOrange)
                }
            }
        }
    }
}
