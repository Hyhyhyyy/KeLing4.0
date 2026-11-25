package com.keling.app.data

import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import org.junit.Assert.*
import org.junit.Test

class MemoryPreferencesTest {
    @Test fun newlyCreatedLearningRecordsKeepTheirTimestampsAcrossReads() = runBlocking {
        val memory = MemoryPreferences()
        val repo = DataRepository(memory)
        try {
            repeat(20) { i ->
                val task = Task("t$i", "任务", "", TaskType.DAILY_CARE)
                repo.tasks.saveTasks(listOf(task))
                val note = Note("n$i", "笔记", "内容", NoteSource.USER_CREATED)
                repo.notes.saveNotes(listOf(note))
                val course = Course("c$i", "课程", "", "")
                repo.courses.saveCourses(listOf(course))
                delay(5)
                assertEquals(listOf(task), repo.tasks.getTasks().first())
                assertEquals(listOf(note), repo.notes.getNotes().first())
                assertEquals(listOf(course), repo.courses.getCourses().first())
            }
        } finally { memory.close() }
    }

    @Test fun legacyRepositoriesOperateWithoutFilesAndNewSessionStartsEmpty() = runBlocking {
        val memory = MemoryPreferences(); val fresh = MemoryPreferences()
        val old = DataRepository(memory); val next = DataRepository(fresh)
        old.notes.addNote(Note("n", "游客笔记", "仅内存", NoteSource.USER_CREATED))
        old.courses.addCourse(Course("c", "课程", "", ""))
        assertEquals(1, old.notes.getNotes().first().size)
        assertEquals(1, old.courses.getCourses().first().size)
        assertTrue(next.notes.getNotes().first().isEmpty())
        memory.close()
        assertTrue(old.notes.getNotes().first().isEmpty())
        try { old.notes.addNote(Note("late", "不能恢复", "", NoteSource.USER_CREATED)); fail("Closed store writable") } catch (_: IllegalStateException) { }
        fresh.close()
    }
}
