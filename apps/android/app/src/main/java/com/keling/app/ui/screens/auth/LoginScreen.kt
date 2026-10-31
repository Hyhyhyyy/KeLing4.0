/**
 * LoginScreen.kt
 * 登录页面 - 田园治愈风格
 */

package com.keling.app.ui.screens.auth

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.keling.app.ui.components.StellarArt
import com.keling.app.ui.theme.*

@Composable
fun LoginScreen(
    onLoginSuccess: () -> Unit,
    onNavigateToRegister: () -> Unit,
    onStartTrial: () -> Unit,
    viewModel: AuthViewModel = viewModel()
) {
    val loginState by viewModel.loginState.collectAsStateWithLifecycle()

    // 表单状态
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }

    val focusManager = LocalFocusManager.current

    // 登录成功回调
    LaunchedEffect(loginState) {
        if (loginState is UiState.Success) {
            onLoginSuccess()
        }
    }

    // 背景动画
    val infiniteTransition = rememberInfiniteTransition(label = "bg")
    val offset by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 1000f,
        animationSpec = infiniteRepeatable(
            animation = tween(20000, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "offset"
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        CreamWhite,
                        PeachPinkLight,
                        CreamYellowLight
                    )
                )
            )
    ) {
        // 装饰元素
        Box(
            modifier = Modifier
                .offset(x = (-50 + offset * 0.02f).dp, y = 50.dp)
                .size(200.dp)
                .background(
                    WarmSunOrange.copy(alpha = 0.1f),
                    CircleShape
                )
        )

        Box(
            modifier = Modifier
                .offset(x = (300 - offset * 0.01f).dp, y = 400.dp)
                .size(150.dp)
                .background(
                    MintGreen.copy(alpha = 0.1f),
                    CircleShape
                )
        )

        // 主内容
        Column(
            modifier = Modifier
                .fillMaxSize()
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(modifier = Modifier.height(16.dp))

            StellarArt("scene_login", "欢迎返回课灵星际学习站", Modifier.fillMaxWidth().aspectRatio(3f).clip(RoundedCornerShape(24.dp)), androidx.compose.ui.layout.ContentScale.Crop)

            Spacer(modifier = Modifier.height(20.dp))

            // 标题
            Text(
                text = "课灵",
                fontSize = 32.sp,
                fontWeight = FontWeight.Bold,
                color = EarthBrown
            )

            Text(
                text = "知识星球培育日记",
                fontSize = 14.sp,
                color = EarthBrown.copy(alpha = 0.7f),
                modifier = Modifier.padding(top = 4.dp)
            )

            Spacer(modifier = Modifier.height(24.dp))

            Button(onClick = onStartTrial, modifier = Modifier.fillMaxWidth()) { Text("游客试用全部功能 · 无需登录 →") }
            Text("本次数据仅保留在内存；退出或重新打开后清空。", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(vertical = 8.dp))

            // 登录卡片
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(24.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
            ) {
                Column(
                    modifier = Modifier.padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = "欢迎回来",
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Bold,
                        color = EarthBrown
                    )

                    Spacer(modifier = Modifier.height(8.dp))

                    Text(
                        text = "登录以继续你的学习之旅",
                        fontSize = 14.sp,
                        color = EarthBrown.copy(alpha = 0.6f)
                    )

                    Spacer(modifier = Modifier.height(32.dp))

                    // 邮箱输入
                    OutlinedTextField(
                        enabled = loginState !is UiState.Loading,
                        value = email,
                        onValueChange = { email = it },
                        label = { Text("邮箱") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = WarmSunOrange,
                            focusedLabelColor = WarmSunOrange,
                            cursorColor = WarmSunOrange
                        ),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Email,
                            imeAction = ImeAction.Next
                        ),
                        keyboardActions = KeyboardActions(
                            onNext = { focusManager.moveFocus(FocusDirection.Down) }
                        )
                    )

                    Spacer(modifier = Modifier.height(16.dp))

                    // 密码输入
                    OutlinedTextField(
                        enabled = loginState !is UiState.Loading,
                        value = password,
                        onValueChange = { password = it },
                        label = { Text("密码") },
                        singleLine = true,
                        visualTransformation = if (passwordVisible)
                            VisualTransformation.None
                        else
                            PasswordVisualTransformation(),
                        trailingIcon = {
                            TextButton(onClick = { passwordVisible = !passwordVisible }) {
                                Text(
                                    text = if (passwordVisible) "隐藏" else "显示",
                                    color = WarmSunOrange,
                                    fontSize = 12.sp
                                )
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = WarmSunOrange,
                            focusedLabelColor = WarmSunOrange,
                            cursorColor = WarmSunOrange
                        ),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Password,
                            imeAction = ImeAction.Done
                        ),
                        keyboardActions = KeyboardActions(
                            onDone = {
                                focusManager.clearFocus()
                                if (email.isNotBlank() && password.isNotBlank()) {
                                    viewModel.login(email.trim(), password)
                                }
                            }
                        )
                    )

                    Spacer(modifier = Modifier.height(24.dp))

                    // 登录按钮
                    Button(
                        onClick = {
                            focusManager.clearFocus()
                            viewModel.login(email.trim(), password)
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(50.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = WarmSunOrange
                        ),
                        enabled = email.isNotBlank() && password.isNotBlank() &&
                                loginState !is UiState.Loading
                    ) {
                        if (loginState is UiState.Loading) {
                            CircularProgressIndicator(
                                color = Color.White,
                                strokeWidth = 2.dp,
                                modifier = Modifier.size(24.dp)
                            )
                        } else {
                            Text(
                                text = "登 录",
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    AuthFeedback(loginState, viewModel::cancelAuth)

                    // 忘记密码（暂时不用）
                    // TextButton(onClick = { }) {
                    //     Text("忘记密码？", color = WarmSunOrange, fontSize = 14.sp)
                    // }
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            AccountConnectionPanel(enabled = loginState !is UiState.Loading) { viewModel.resetLoginState() }

            // 注册入口
            Row(
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "还没有账号？",
                    color = EarthBrown.copy(alpha = 0.6f),
                    fontSize = 14.sp
                )
                TextButton(onClick = onNavigateToRegister) {
                    Text(
                        text = "立即注册",
                        color = WarmSunOrange,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            // 游客模式
            TextButton(
                onClick = onStartTrial,
                modifier = Modifier.padding(top = 8.dp)
            ) {
                Text(
                    text = "游客试用全部功能 · 退出清空 →",
                    color = EarthBrown.copy(alpha = 0.5f),
                    fontSize = 13.sp
                )
            }

            Spacer(modifier = Modifier.height(40.dp))
        }
    }
}
