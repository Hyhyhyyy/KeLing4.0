package com.keling.app.data

import com.keling.app.network.CourseData
import com.keling.app.network.TaskData
import org.junit.Assert.*
import org.junit.Test

class SyncPolicyTest {
    @Test fun localEditsWinAndNewRemoteRecordsAreImportedOnce() {
        val local = listOf(Course("a", "本地修改", "", "", isArchived = true))
        val remote = listOf(Course("a", "云端旧版本", "", ""), Course("b", "新课", "", ""))
        val result = importUnseen(local, remote + remote, emptySet()) { it.id }
        assertEquals(listOf("a", "b"), result.map { it.id })
        assertEquals(local.first(), result.first())
        assertEquals(result, importUnseen(result, remote, setOf("a", "b")) { it.id })
    }

    @Test fun previouslyImportedThenDeletedRecordIsNotResurrected() {
        val remote = listOf(Course("deleted", "旧课", "", ""))
        assertTrue(importUnseen(emptyList(), remote, setOf("deleted")) { it.id }.isEmpty())
    }

    @Test fun courseScheduleSurvivesApiRoundTrip() {
        val original = Course("a", "数学", "M", "老师", schedule = listOf(ScheduleSlot(2, 8, 30, 90)))
        assertEquals(original, original.toCourseData().toCourse())
    }

    @Test fun serverDatesAcceptIsoAndMilliseconds() {
        assertEquals(0L, parseApiTimestamp("1970-01-01T00:00:00.000Z"))
        assertEquals(1234L, parseApiTimestamp("1234"))
        assertNull(parseApiTimestamp("invalid"))
        val task = TaskData("t", "作业", type = "NEW_TYPE", status = "NEW_STATUS", completedAt = "1970-01-01T00:00:00Z").toTask()
        assertEquals(TaskType.DAILY_CARE, task.type)
        assertEquals(TaskStatus.PENDING, task.status)
        assertEquals(0L, task.completedAt)
    }

    @Test fun invalidCourseColorFallsBackWithoutCrashing() {
        assertEquals(0xFFE8A87C, CourseData("c", "课程", themeColor = "broken").toCourse().themeColor)
    }

    @Test fun activeFilterExcludesAbandonedAndSearchFindsCourse() {
        val courses = listOf(Course("c", "Kotlin课程", "", ""))
        val tasks = TaskStatus.entries.map { Task(it.name, "练习", "内容", TaskType.DAILY_CARE, courseId = "c", status = it) }
        assertEquals(listOf("IN_PROGRESS", "PENDING"), filterTasks(tasks, courses, TaskFilter.ACTIVE, " kotlin ").map { it.id })
        assertTrue(filterTasks(tasks, courses, TaskFilter.ALL, "不存在").isEmpty())
    }
}
