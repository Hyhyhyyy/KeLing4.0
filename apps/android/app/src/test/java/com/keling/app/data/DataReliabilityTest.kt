package com.keling.app.data

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import org.junit.Assert.*
import org.junit.Test
import java.nio.file.Files

class DataReliabilityTest {
    private fun withStore(test: suspend (androidx.datastore.core.DataStore<androidx.datastore.preferences.core.Preferences>) -> Unit) = runBlocking {
        val directory = Files.createTempDirectory("keling-test").toFile()
        val job = SupervisorJob()
        val store = PreferenceDataStoreFactory.create(scope = CoroutineScope(Dispatchers.IO + job)) {
            directory.resolve("test.preferences_pb")
        }
        try { withTimeout(5_000) { test(store) } }
        finally { job.cancelAndJoin(); directory.deleteRecursively() }
    }

    @Test fun concurrentNoteReviewsIncrementExactlyOncePerCall() = withStore { store ->
        val repo = NoteDataRepository(store)
        repo.addNote(Note("n", "标题", "内容", NoteSource.USER_CREATED))
        coroutineScope { repeat(50) { launch { repo.updateNoteReview("n") } } }
        assertEquals(50, repo.getNotes().first().single().reviewCount)
    }

    @Test fun concurrentCourseAddsPreserveEveryRecordAndReturn() = withStore { store ->
        val repo = CourseDataRepository(store)
        coroutineScope { repeat(25) { n -> launch { repo.addCourse(Course("$n", "课程$n", "", "")) } } }
        assertEquals(25, repo.getCourses().first().size)
        repo.updateCourse(Course("0", "改名", "", "", isArchived = true))
        repo.deleteCourse("1")
        assertEquals(24, repo.getCourses().first().size)
        assertTrue(repo.getCourses().first().first { it.id == "0" }.isArchived)
    }

    @Test fun chatAppendDoesNotRepeatItselfAndRespectsLimit() = withStore { store ->
        val repo = ChatHistoryRepository(store)
        repeat(105) { repo.addEntry(ChatHistoryEntry("s", "user", "$it", it.toLong())) }
        val messages = repo.getHistory().first()
        assertEquals(100, messages.size)
        assertEquals("5", messages.first().content)
        assertEquals("104", messages.last().content)
    }

    @Test fun profileRoundTripPreservesCheckInAndUserPreferences() = withStore { store ->
        val repo = UserPreferencesRepository(store)
        val user = User("alice", lastCheckInDate = "2026-10-28", streakProtectionCards = 3,
            avatarUrl = "avatar", bio = "学习", weeklyStudyGoal = 420)
        repo.saveUser(user)
        assertEquals(user, repo.getUser().first())
        repo.updateEnergy(17)
        assertEquals(user.copy(energy = 17), repo.getUser().first())
    }

    @Test fun legacyDataMigratesOnlyToItsKnownOwner() = withStore { store ->
        UserPreferencesRepository(store).saveUser(User("alice"))
        val empty = androidx.datastore.preferences.core.emptyPreferences()
        assertTrue(OwnedLegacyMigration("alice", store).shouldMigrate(empty))
        assertFalse(OwnedLegacyMigration("bob", store).shouldMigrate(empty))
        assertFalse(OwnedLegacyMigration("alice", store).shouldMigrate(store.data.first()))
        OwnedLegacyMigration("alice", store).cleanUp()
        assertEquals("alice", UserPreferencesRepository(store).getUser().first().id)
    }

    @Test fun cloudImportPreservesLocalEditsArchivedCoursesAndDeletes() = withStore { store ->
        val repo = DataRepository(store)
        val original = Course("c", "本地版本", "", "", isArchived = true)
        repo.courses.saveCourses(listOf(original))
        repo.importCloudSnapshot(listOf(original.copy(name = "云端旧名")), emptyList(), User("alice"))
        assertEquals(listOf(original), repo.courses.getCourses().first())
        repo.courses.deleteCourse("c")
        repo.importCloudSnapshot(listOf(original), emptyList(), User("alice"))
        assertTrue(repo.courses.getCourses().first().isEmpty())
    }

    @Test fun completionPersistsTaskRewardsAndStudyLogTogether() = withStore { store ->
        val repo = DataRepository(store)
        val task = Task("t", "任务", "", TaskType.DAILY_CARE, status = TaskStatus.COMPLETED)
        val user = User("alice", energy = 150, totalStudyMinutes = 25)
        val record = StudyRecord("r", "alice", taskId = "t", type = StudyType.TASK_COMPLETION, durationMinutes = 25)
        repo.saveTaskCompletion(listOf(task), user, listOf(record))
        assertEquals(listOf(task), repo.tasks.getTasks().first())
        assertEquals(user, repo.userPrefs.getUser().first())
        assertEquals(listOf(record), repo.studyRecords.getRecords().first())
    }
}
