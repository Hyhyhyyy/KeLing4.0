package com.keling.app.data

import com.keling.app.network.*
import kotlinx.serialization.encodeToString
import java.time.Instant

internal fun parseApiTimestamp(value: String?): Long? = value?.toLongOrNull()
    ?: value?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }

// ==================== 转换扩展函数 ====================

/**
 * CourseData 转换为 Course
 */
fun CourseData.toCourse(): Course {
    return Course(
        id = id,
        name = name,
        code = code,
        teacher = teacher,
        schedule = json.decodeFromString<List<ScheduleSlot>>(schedule),
        location = location,
        themeColor = (themeColor.removePrefix("#").toLongOrNull(16) ?: 0xE8A87C) or 0xFF000000,
        masteryLevel = masteryLevel.toFloat(),
        plantStage = plantStage,
        planetStyleIndex = planetStyleIndex,
        totalStudyMinutes = totalStudyMinutes,
        isArchived = isArchived,
        studySessionCount = studySessionCount
    )
}

/**
 * Course 转换为 CourseData
 */
fun Course.toCourseData(): CourseData {
    return CourseData(
        id = id,
        name = name,
        code = code,
        teacher = teacher,
        schedule = json.encodeToString(schedule),
        location = location,
        themeColor = "#${themeColor.toString(16).takeLast(6)}",
        masteryLevel = masteryLevel.toDouble(),
        plantStage = plantStage,
        planetStyleIndex = planetStyleIndex,
        totalStudyMinutes = totalStudyMinutes,
        isArchived = isArchived,
        studySessionCount = studySessionCount
    )
}

/**
 * TaskData 转换为 Task
 */
fun TaskData.toTask(): Task {
    return Task(
        id = id,
        title = title,
        description = description,
        type = TaskType.entries.firstOrNull { it.name == type } ?: TaskType.DAILY_CARE,
        courseId = courseId,
        status = TaskStatus.entries.firstOrNull { it.name == status } ?: TaskStatus.PENDING,
        priority = priority,
        estimatedMinutes = estimatedMinutes,
        actualMinutes = actualMinutes,
        rewards = Rewards(
            energy = rewardsEnergy,
            crystals = rewardsCrystals,
            exp = rewardsExp
        ),
        scheduledAt = parseApiTimestamp(scheduledAt),
        createdAt = parseApiTimestamp(createdAt) ?: System.currentTimeMillis(),
        completedAt = parseApiTimestamp(completedAt)
    )
}

/**
 * UserResponse 转换为 User
 */
fun UserResponse.toUser(): User {
    return User(
        id = id,
        name = name,
        level = level,
        exp = exp,
        energy = energy,
        crystals = crystals,
        streakDays = streakDays,
        totalStudyMinutes = totalStudyMinutes,
        lastCheckInDate = lastCheckInDate,
        createdAt = parseApiTimestamp(createdAt) ?: System.currentTimeMillis()
    )
}