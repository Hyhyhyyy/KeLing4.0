package com.keling.app.ui.screens.greenhouse

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.keling.app.R
import com.keling.app.data.Course
import com.keling.app.data.Task
import com.keling.app.data.TaskStatus
import com.keling.app.ui.theme.*
import com.keling.app.viewmodel.AppViewModel
import kotlinx.coroutines.delay
import kotlin.random.Random
import com.keling.app.ui.components.CourseCreationWizard

/**
 * =========================
 * 田园治愈风温室
 * 星球培育花园
 * =========================
 *
 * 特点：
 * - 温暖的花园背景
 * - 星球作为可爱的"果实"
 * - 柔和的卡片设计
 * - 治愈系动画
 */

// ==================== 星球资源 ====================

val PLANET_ASSETS = com.keling.app.data.PlanetStyles.entries.map { it.assetPath }

fun getPlanetAsset(index: Int, courseId: String = ""): String = com.keling.app.data.PlanetStyles.assetPath(index, courseId)

// ==================== 主页面 ====================

/**
 * 田园风温室页面
 */
@Composable
fun PastoralGreenhouseScreen(
    viewModel: AppViewModel,
    onBack: () -> Unit
) {
    val courses = viewModel.courses.value
    val tasks = viewModel.tasks.value

    var showCreateDialog by remember { mutableStateOf(false) }
    var editingCourse by remember { mutableStateOf<Course?>(null) }

    // 使用新的课程创建向导
    if (showCreateDialog) {
        CourseCreationWizard(
            onDismiss = { showCreateDialog = false },
            onConfirm = { course ->
                viewModel.addCourse(course)
                showCreateDialog = false
            },
            editingCourse = editingCourse,
            existingCourses = courses
        )
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
            // ===== 顶部导航 =====
            item {
                PastoralGreenhouseHeader(
                    onBack = onBack,
                    onAddPlanet = {
                        editingCourse = null
                        showCreateDialog = true
                    }
                )
            }

            // ===== 温室概览 =====
            item {
                GreenhouseOverview(
                    totalPlanets = courses.size,
                    healthyCount = courses.count { it.masteryLevel >= 0.6f },
                    needCareCount = courses.count { it.masteryLevel < 0.4f }
                )
            }

            // ===== 星球列表 =====
            if (courses.isEmpty()) {
                item {
                    EmptyGardenPlanetState(
                        onCreatePlanet = {
                            editingCourse = null
                            showCreateDialog = true
                        }
                    )
                }
            } else {
                items(courses) { course ->
                    val relatedTasks = tasks.filter { it.courseId == course.id }
                    val pendingTasks = relatedTasks.count { it.status == TaskStatus.PENDING }

                    PastoralPlanetCard(
                        course = course,
                        pendingTasks = pendingTasks,
                        onPlanetClick = { viewModel.openCourseGreenhouse(course.id) },
                        onEdit = {
                            editingCourse = course
                            showCreateDialog = true
                        }
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
 * 温室头部
 */
@Composable
private fun PastoralGreenhouseHeader(
    onBack: () -> Unit,
    onAddPlanet: () -> Unit
) {
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
                text = "星球培育温室",
                style = MaterialTheme.typography.titleLarge,
                color = EarthBrown,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = "呵护每一颗知识星球",
                style = MaterialTheme.typography.labelSmall,
                color = MintGreen
            )
        }

        // 添加按钮
        Surface(
            onClick = onAddPlanet,
            shape = RoundedCornerShape(12.dp),
            color = MintGreen.copy(alpha = 0.2f)
        ) {
            Box(
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "+",
                    style = MaterialTheme.typography.titleMedium,
                    color = MintGreen,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

/**
 * 温室概览
 */
@Composable
private fun GreenhouseOverview(
    totalPlanets: Int,
    healthyCount: Int,
    needCareCount: Int
) {
    val infiniteTransition = rememberInfiniteTransition(label = "overview")

    val glowAlpha by infiniteTransition.animateFloat(
        initialValue = 0.1f,
        targetValue = 0.2f,
        animationSpec = infiniteRepeatable(
            animation = tween(2000, easing = EaseInOutSine),
            repeatMode = RepeatMode.Reverse
        ),
        label = "glow"
    )

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .drawBehind {
                drawRoundRect(
                    color = MintGreen.copy(alpha = glowAlpha),
                    cornerRadius = CornerRadius(20.dp.toPx()),
                    size = Size(size.width + 8.dp.toPx(), size.height + 8.dp.toPx()),
                    topLeft = Offset(-4.dp.toPx(), -4.dp.toPx())
                )
            },
        shape = RoundedCornerShape(20.dp),
        color = CreamWhite,
        shadowElevation = 0.dp
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            StatItem(
                icon = "🌍",
                value = totalPlanets.toString(),
                label = "培育星球",
                color = MintGreen
            )

            StatItem(
                icon = "✨",
                value = healthyCount.toString(),
                label = "茁壮成长",
                color = CreamYellow
            )

            StatItem(
                icon = "💧",
                value = needCareCount.toString(),
                label = "需要关爱",
                color = WarmSunOrange
            )
        }
    }
}

@Composable
private fun StatItem(
    icon: String,
    value: String,
    label: String,
    color: Color
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(text = icon, fontSize = 24.sp)
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = value,
            style = MaterialTheme.typography.headlineSmall,
            color = color,
            fontWeight = FontWeight.Bold
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = EarthBrownLight
        )
    }
}

/**
 * 田园风星球卡片
 */
@Composable
private fun PastoralPlanetCard(
    course: Course,
    pendingTasks: Int,
    onPlanetClick: () -> Unit,
    onEdit: () -> Unit
) {
    val planetAsset = getPlanetAsset(course.planetStyleIndex, course.id)
    val planetColor = PlanetColors.Custom.getOrNull(course.planetStyleIndex % PlanetColors.Custom.size) ?: WarmSunOrange

    val infiniteTransition = rememberInfiniteTransition(label = "planet")

    val breatheScale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 1.03f,
        animationSpec = infiniteRepeatable(
            animation = tween(3000, easing = EaseInOutSine),
            repeatMode = RepeatMode.Reverse
        ),
        label = "breathe"
    )

    val glowAlpha by infiniteTransition.animateFloat(
        initialValue = 0.15f,
        targetValue = 0.3f,
        animationSpec = infiniteRepeatable(
            animation = tween(2000, easing = EaseInOutSine),
            repeatMode = RepeatMode.Reverse
        ),
        label = "glow"
    )

    // 生长状态
    val growthStage = when {
        course.masteryLevel >= 0.8f -> GrowthStage.THRIVING
        course.masteryLevel >= 0.6f -> GrowthStage.HEALTHY
        course.masteryLevel >= 0.4f -> GrowthStage.GROWING
        else -> GrowthStage.NEEDS_CARE
    }

    Surface(
        onClick = onPlanetClick,
        modifier = Modifier
            .fillMaxWidth()
            .drawBehind {
                drawRoundRect(
                    color = planetColor.copy(alpha = glowAlpha * 0.5f),
                    cornerRadius = CornerRadius(20.dp.toPx()),
                    size = Size(size.width + 6.dp.toPx(), size.height + 6.dp.toPx()),
                    topLeft = Offset(-3.dp.toPx(), -3.dp.toPx())
                )
            },
        shape = RoundedCornerShape(20.dp),
        color = CreamWhite,
        shadowElevation = 0.dp
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // ===== 星球图像 =====
            Box(
                modifier = Modifier.size(80.dp),
                contentAlignment = Alignment.Center
            ) {
                // 星球图片 - 直接显示，不带圆形框
                Box(
                    modifier = Modifier
                        .size(76.dp)
                        .graphicsLayer {
                            scaleX = breatheScale
                            scaleY = breatheScale
                        },
                    contentAlignment = Alignment.Center
                ) {
                    AsyncImage(
                        model = "file:///android_asset/$planetAsset",
                        contentDescription = course.name,
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop
                    )
                }

                // 状态指示
                Box(
                    modifier = Modifier.align(Alignment.BottomEnd)
                ) {
                    Surface(
                        shape = CircleShape,
                        color = growthStage.color,
                        modifier = Modifier.size(18.dp)
                    ) {
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = growthStage.icon,
                                fontSize = 10.sp
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.width(16.dp))

            // ===== 星球信息 =====
            Column(modifier = Modifier.weight(1f)) {
                // 名称
                Text(
                    text = course.name,
                    style = MaterialTheme.typography.titleMedium,
                    color = EarthBrown,
                    fontWeight = FontWeight.Bold
                )

                Spacer(modifier = Modifier.height(4.dp))

                // 状态标签
                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = growthStage.color.copy(alpha = 0.15f)
                ) {
                    Text(
                        text = growthStage.label,
                        style = MaterialTheme.typography.labelSmall,
                        color = growthStage.color,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                    )
                }

                Spacer(modifier = Modifier.height(8.dp))

                // 掌握度进度条
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(8.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(BeigeSurface)
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxHeight()
                            .fillMaxWidth(course.masteryLevel)
                            .background(
                                Brush.horizontalGradient(
                                    colors = listOf(planetColor, planetColor.copy(alpha = 0.7f))
                                )
                            )
                    )
                }

                Spacer(modifier = Modifier.height(4.dp))

                Text(
                    text = "掌握度 ${(course.masteryLevel * 100).toInt()}%",
                    style = MaterialTheme.typography.labelSmall,
                    color = EarthBrownLight
                )
            }

            // ===== 操作区 =====
            Column(
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // 编辑按钮
                Surface(
                    onClick = onEdit,
                    shape = RoundedCornerShape(10.dp),
                    color = BeigeSurface
                ) {
                    Text(
                        text = "✏️",
                        fontSize = 14.sp,
                        modifier = Modifier.padding(8.dp)
                    )
                }

                // 任务数量
                if (pendingTasks > 0) {
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = WarmSunOrange.copy(alpha = 0.15f)
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Image(
                                painter = painterResource(id = R.drawable.ic_icon),
                                contentDescription = "任务",
                                modifier = Modifier.size(12.dp)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = "$pendingTasks",
                                style = MaterialTheme.typography.labelSmall,
                                color = WarmSunOrange,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            }
        }
    }
}

/**
 * 生长阶段
 */
private enum class GrowthStage(
    val label: String,
    val icon: String,
    val color: Color
) {
    THRIVING("茁壮成长", "✨", CreamYellow),
    HEALTHY("健康成长", "🌱", MintGreen),
    GROWING("正在生长", "🌿", SkyBlue),
    NEEDS_CARE("需要关爱", "💧", WarmSunOrange)
}

/**
 * 空状态
 */
@Composable
private fun EmptyGardenPlanetState(
    onCreatePlanet: () -> Unit
) {
    val infiniteTransition = rememberInfiniteTransition(label = "empty")

    val floatOffset by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = -10f,
        animationSpec = infiniteRepeatable(
            animation = tween(2000, easing = EaseInOutSine),
            repeatMode = RepeatMode.Reverse
        ),
        label = "float"
    )

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        color = CreamWhite,
        shadowElevation = 0.dp
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Box(
                modifier = Modifier
                    .graphicsLayer { translationY = floatOffset }
                    .size(88.dp),
                contentAlignment = Alignment.Center
            ) {
                Box(
                    modifier = Modifier
                        .matchParentSize()
                        .blur(20.dp)
                        .background(MintGreen.copy(alpha = 0.2f), CircleShape)
                )

                Surface(
                    modifier = Modifier.size(72.dp),
                    shape = CircleShape,
                    color = MintGreen.copy(alpha = 0.2f)
                ) {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Image(
                            painter = painterResource(id = R.drawable.ic_icon),
                            contentDescription = "课程",
                            modifier = Modifier.size(36.dp)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = "温室还是空的呢",
                style = MaterialTheme.typography.titleMedium,
                color = EarthBrown,
                fontWeight = FontWeight.Bold
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "种下你的第一颗知识星球\n开启你的星际培育之旅",
                style = MaterialTheme.typography.bodySmall,
                color = EarthBrownLight,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(16.dp))

            // 创建按钮
            Surface(
                onClick = onCreatePlanet,
                shape = RoundedCornerShape(12.dp),
                color = MintGreen
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 24.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Image(
                        painter = painterResource(id = R.drawable.ic_icon),
                        contentDescription = "创建",
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "种下星球",
                        style = MaterialTheme.typography.labelLarge,
                        color = Color.White,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
    }
}

/**
 * 星球创建对话框
 */
@Composable
private fun PastoralPlanetCreationDialog(
    editingCourseId: String?,
    dialogCourseName: String,
    dialogPlanetStyleIndex: Int,
    onNameChange: (String) -> Unit,
    onStyleChange: (Int) -> Unit,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        shape = RoundedCornerShape(24.dp),
        containerColor = CreamWhite,
        title = {
            Column {
                Text(
                    text = if (editingCourseId == null) "种下新星球" else "调整星球",
                    style = MaterialTheme.typography.headlineSmall,
                    color = EarthBrown,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "为你的知识星球起个名字",
                    style = MaterialTheme.typography.bodySmall,
                    color = EarthBrownLight
                )
            }
        },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // 名称输入
                OutlinedTextField(
                    value = dialogCourseName,
                    onValueChange = onNameChange,
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = {
                        Text(
                            "输入星球名称",
                            color = EarthBrownLight
                        )
                    },
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = MintGreen,
                        unfocusedBorderColor = WarmGray,
                        focusedContainerColor = BeigeSurfaceLight,
                        unfocusedContainerColor = BeigeSurfaceLight,
                        focusedTextColor = EarthBrown,
                        unfocusedTextColor = EarthBrown,
                        cursorColor = MintGreen
                    )
                )

                // 星球样式选择
                Text(
                    text = "选择星球外观",
                    style = MaterialTheme.typography.labelMedium,
                    color = EarthBrown
                )

                LazyRow(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(PLANET_ASSETS.size) { index ->
                        val asset = PLANET_ASSETS[index]
                        val isSelected = dialogPlanetStyleIndex == index

                        Box(
                            modifier = Modifier
                                .size(52.dp)
                                .border(
                                    width = if (isSelected) 3.dp else 0.dp,
                                    color = if (isSelected) MintGreen else Color.Transparent,
                                    shape = RoundedCornerShape(8.dp)
                                )
                                .clickable { onStyleChange(index) },
                            contentAlignment = Alignment.Center
                        ) {
                            AsyncImage(
                                model = "file:///android_asset/$asset",
                                contentDescription = "Planet $index",
                                modifier = Modifier.fillMaxSize(),
                                contentScale = ContentScale.Crop
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            Surface(
                onClick = onConfirm,
                shape = RoundedCornerShape(12.dp),
                color = MintGreen,
                enabled = dialogCourseName.trim().isNotEmpty()
            ) {
                Text(
                    text = "确认种植",
                    style = MaterialTheme.typography.labelMedium,
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                )
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(
                    text = "取消",
                    color = EarthBrownLight
                )
            }
        }
    )
}

/**
 * 背景装饰
 */
@Composable
private fun GreenhouseBackgroundDecorations() {
    val decorations = remember { List(6) { DecorationParticle() } }

    Box(modifier = Modifier.fillMaxSize()) {
        decorations.forEach { particle ->
            FloatingDecoration(particle = particle)
        }
    }
}

private class DecorationParticle {
    val x = Random.nextFloat()
    val y = Random.nextFloat()
    val size = Random.nextInt(4, 10)
    val alpha = Random.nextFloat() * 0.08f + 0.03f
    val speed = Random.nextInt(4000, 8000)
}

@Composable
private fun FloatingDecoration(particle: DecorationParticle) {
    val alpha by rememberInfiniteTransition(label = "deco").animateFloat(
        initialValue = particle.alpha * 0.5f,
        targetValue = particle.alpha,
        animationSpec = infiniteRepeatable(
            animation = tween(particle.speed, easing = EaseInOutSine),
            repeatMode = RepeatMode.Reverse
        ),
        label = "alpha"
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .drawBehind {
                drawCircle(
                    color = MintGreen.copy(alpha = alpha),
                    radius = particle.size.dp.toPx(),
                    center = Offset(
                        x = particle.x * size.width,
                        y = particle.y * size.height
                    )
                )
            }
    )
}