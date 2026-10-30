package com.keling.app.data

import kotlinx.coroutines.flow.first

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * =========================
 * 数据持久化层
 * =========================
 *
 * 使用 DataStore 进行数据持久化
 * - 用户设置
 * - 用户数据
 * - 对话历史
 * - 学习进度
 */

// DataStore 扩展
private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "keling_data")

/**
 * 用户偏好设置仓库
 */
class UserPreferencesRepository(private val store: DataStore<Preferences>) {

    // ==================== Keys ====================

    private object Keys {
        // 用户信息
        val USER_JSON = stringPreferencesKey("user_profile_v2")
        val USER_ID = stringPreferencesKey("user_id")
        val USER_NAME = stringPreferencesKey("user_name")
        val USER_LEVEL = intPreferencesKey("user_level")
        val USER_EXP = intPreferencesKey("user_exp")
        val USER_ENERGY = intPreferencesKey("user_energy")
        val USER_CRYSTALS = intPreferencesKey("user_crystals")
        val USER_STREAK_DAYS = intPreferencesKey("user_streak_days")
        val USER_TOTAL_STUDY_MINUTES = intPreferencesKey("user_total_study_minutes")
        val USER_CREATED_AT = longPreferencesKey("user_created_at")

        // 设置
        val DARK_MODE = booleanPreferencesKey("dark_mode")
        val NOTIFICATION_ENABLED = booleanPreferencesKey("notification_enabled")
        val SOUND_ENABLED = booleanPreferencesKey("sound_enabled")
        val AUTO_REMINDER = booleanPreferencesKey("auto_reminder")

        // API 配置
        val API_KEY = stringPreferencesKey("api_key")
        val API_ENDPOINT = stringPreferencesKey("api_endpoint")

        // 最后同步时间
        val LAST_SYNC_TIME = longPreferencesKey("last_sync_time")
    }

    // ==================== 用户数据 ====================

    /**
     * 获取用户数据
     */
    fun getUser(): Flow<User> {
        return store.data.map { prefs ->
            prefs[Keys.USER_JSON]?.let { return@map json.decodeFromString<User>(it) }
            User(
                id = prefs[Keys.USER_ID] ?: "",
                name = prefs[Keys.USER_NAME] ?: "星际园丁",
                level = prefs[Keys.USER_LEVEL] ?: 1,
                exp = prefs[Keys.USER_EXP] ?: 0,
                energy = prefs[Keys.USER_ENERGY] ?: 100,
                crystals = prefs[Keys.USER_CRYSTALS] ?: 10,
                streakDays = prefs[Keys.USER_STREAK_DAYS] ?: 0,
                totalStudyMinutes = prefs[Keys.USER_TOTAL_STUDY_MINUTES] ?: 0,
                createdAt = prefs[Keys.USER_CREATED_AT] ?: System.currentTimeMillis()
            )
        }
    }

    /**
     * 保存用户数据
     */
    suspend fun saveUser(user: User) {
        store.edit { prefs ->
            prefs[Keys.USER_JSON] = json.encodeToString(user)
            prefs[Keys.USER_ID] = user.id
            prefs[Keys.USER_NAME] = user.name
            prefs[Keys.USER_LEVEL] = user.level
            prefs[Keys.USER_EXP] = user.exp
            prefs[Keys.USER_ENERGY] = user.energy
            prefs[Keys.USER_CRYSTALS] = user.crystals
            prefs[Keys.USER_STREAK_DAYS] = user.streakDays
            prefs[Keys.USER_TOTAL_STUDY_MINUTES] = user.totalStudyMinutes
            prefs[Keys.USER_CREATED_AT] = user.createdAt
        }
    }

    /**
     * 更新用户能量
     */
    suspend fun updateEnergy(energy: Int) {
        store.edit { prefs ->
            prefs[Keys.USER_ENERGY] = energy
            prefs[Keys.USER_JSON]?.let { prefs[Keys.USER_JSON] = json.encodeToString(json.decodeFromString<User>(it).copy(energy = energy)) }
        }
    }

    /**
     * 更新用户结晶
     */
    suspend fun updateCrystals(crystals: Int) {
        store.edit { prefs ->
            prefs[Keys.USER_CRYSTALS] = crystals
            prefs[Keys.USER_JSON]?.let { prefs[Keys.USER_JSON] = json.encodeToString(json.decodeFromString<User>(it).copy(crystals = crystals)) }
        }
    }

    /**
     * 更新等级和经验
     */
    suspend fun updateLevelAndExp(level: Int, exp: Int) {
        store.edit { prefs ->
            prefs[Keys.USER_LEVEL] = level
            prefs[Keys.USER_EXP] = exp
            prefs[Keys.USER_JSON]?.let { prefs[Keys.USER_JSON] = json.encodeToString(json.decodeFromString<User>(it).copy(level = level, exp = exp)) }
        }
    }

    /**
     * 更新连续学习天数
     */
    suspend fun updateStreakDays(days: Int) {
        store.edit { prefs ->
            prefs[Keys.USER_STREAK_DAYS] = days
            prefs[Keys.USER_JSON]?.let { prefs[Keys.USER_JSON] = json.encodeToString(json.decodeFromString<User>(it).copy(streakDays = days)) }
        }
    }

    /**
     * 更新总学习时长
     */
    suspend fun updateTotalStudyMinutes(minutes: Int) {
        store.edit { prefs ->
            prefs[Keys.USER_TOTAL_STUDY_MINUTES] = minutes
            prefs[Keys.USER_JSON]?.let { prefs[Keys.USER_JSON] = json.encodeToString(json.decodeFromString<User>(it).copy(totalStudyMinutes = minutes)) }
        }
    }

    // ==================== 设置 ====================

    /**
     * 获取深色模式设置
     */
    fun getDarkMode(): Flow<Boolean> {
        return store.data.map { prefs ->
            prefs[Keys.DARK_MODE] ?: false
        }
    }

    /**
     * 设置深色模式
     */
    suspend fun setDarkMode(enabled: Boolean) {
        store.edit { prefs ->
            prefs[Keys.DARK_MODE] = enabled
        }
    }

    /**
     * 获取通知设置
     */
    fun getNotificationEnabled(): Flow<Boolean> {
        return store.data.map { prefs ->
            prefs[Keys.NOTIFICATION_ENABLED] ?: true
        }
    }

    /**
     * 设置通知开关
     */
    suspend fun setNotificationEnabled(enabled: Boolean) {
        store.edit { prefs ->
            prefs[Keys.NOTIFICATION_ENABLED] = enabled
        }
    }

    /**
     * 获取音效设置
     */
    fun getSoundEnabled(): Flow<Boolean> {
        return store.data.map { prefs ->
            prefs[Keys.SOUND_ENABLED] ?: true
        }
    }

    /**
     * 设置音效开关
     */
    suspend fun setSoundEnabled(enabled: Boolean) {
        store.edit { prefs ->
            prefs[Keys.SOUND_ENABLED] = enabled
        }
    }

    /**
     * 获取自动提醒设置
     */
    fun getAutoReminder(): Flow<Boolean> {
        return store.data.map { prefs ->
            prefs[Keys.AUTO_REMINDER] ?: true
        }
    }

    /**
     * 设置自动提醒
     */
    suspend fun setAutoReminder(enabled: Boolean) {
        store.edit { prefs ->
            prefs[Keys.AUTO_REMINDER] = enabled
        }
    }

    // ==================== API 配置 ====================

    /**
     * 获取 API Key
     */
    fun getApiKey(): Flow<String> {
        return store.data.map { prefs ->
            prefs[Keys.API_KEY] ?: ""
        }
    }

    /**
     * 设置 API Key
     */
    suspend fun setApiKey(key: String) {
        store.edit { prefs ->
            prefs[Keys.API_KEY] = key
        }
    }

    /**
     * 获取 API Endpoint
     */
    fun getApiEndpoint(): Flow<String> {
        return store.data.map { prefs ->
            prefs[Keys.API_ENDPOINT] ?: "https://api.deepseek.com"
        }
    }

    /**
     * 设置 API Endpoint
     */
    suspend fun setApiEndpoint(endpoint: String) {
        store.edit { prefs ->
            prefs[Keys.API_ENDPOINT] = endpoint
        }
    }

    // ==================== 同步时间 ====================

    /**
     * 获取最后同步时间
     */
    fun getLastSyncTime(): Flow<Long> {
        return store.data.map { prefs ->
            prefs[Keys.LAST_SYNC_TIME] ?: 0L
        }
    }

    /**
     * 更新最后同步时间
     */
    suspend fun updateLastSyncTime() {
        store.edit { prefs ->
            prefs[Keys.LAST_SYNC_TIME] = System.currentTimeMillis()
        }
    }

    // ==================== 清理 ====================

    /**
     * 清除所有数据
     */
    suspend fun clearAll() {
        store.edit { prefs ->
            prefs.clear()
        }
    }
}

/**
 * 课程数据仓库
 */
class CourseDataRepository(private val store: DataStore<Preferences>) {

    private val json = Json { ignoreUnknownKeys = true }

    // Keys
    private val COURSES_KEY = stringPreferencesKey("courses_data")

    /**
     * 获取所有课程
     */
    fun getCourses(): Flow<List<Course>> {
        return store.data.map { prefs ->
            val data = prefs[COURSES_KEY] ?: "[]"
            try {
                json.decodeFromString<List<Course>>(data)
            } catch (e: kotlinx.serialization.SerializationException) {
                throw IllegalStateException("本地数据读取失败，已保留原始数据，请勿清除应用数据", e)
            }
        }
    }

    /**
     * 保存所有课程
     */
    suspend fun saveCourses(courses: List<Course>) {
        store.edit { prefs ->
            prefs[COURSES_KEY] = json.encodeToString(courses)
        }
    }

    /**
     * 添加课程
     */
    suspend fun addCourse(course: Course) {
        store.edit { prefs ->
            val courses = json.decodeFromString<List<Course>>(prefs[COURSES_KEY] ?: "[]")
            if (courses.none { it.id == course.id }) {
                prefs[COURSES_KEY] = json.encodeToString(courses + course)
            }
        }
    }

    /**
     * 更新课程
     */
    suspend fun updateCourse(course: Course) {
        store.edit { prefs ->
            val courses = json.decodeFromString<List<Course>>(prefs[COURSES_KEY] ?: "[]")
            val updated = courses.map { if (it.id == course.id) course else it }
            prefs[COURSES_KEY] = json.encodeToString(updated)
        }
    }

    /**
     * 删除课程
     */
    suspend fun deleteCourse(courseId: String) {
        store.edit { prefs ->
            val courses = json.decodeFromString<List<Course>>(prefs[COURSES_KEY] ?: "[]")
            prefs[COURSES_KEY] = json.encodeToString(courses.filter { it.id != courseId })
        }
    }
}

/**
 * 任务数据仓库
 */
class TaskDataRepository(private val store: DataStore<Preferences>) {

    private val json = Json { ignoreUnknownKeys = true }

    private val TASKS_KEY = stringPreferencesKey("tasks_data")

    /**
     * 获取所有任务
     */
    fun getTasks(): Flow<List<Task>> {
        return store.data.map { prefs ->
            val data = prefs[TASKS_KEY] ?: "[]"
            try {
                json.decodeFromString<List<Task>>(data)
            } catch (e: kotlinx.serialization.SerializationException) {
                throw IllegalStateException("本地数据读取失败，已保留原始数据，请勿清除应用数据", e)
            }
        }
    }

    /**
     * 保存所有任务
     */
    suspend fun saveTasks(tasks: List<Task>) {
        store.edit { prefs ->
            prefs[TASKS_KEY] = json.encodeToString(tasks)
        }
    }

    /**
     * 添加任务
     */
    suspend fun addTask(task: Task) {
        store.edit { prefs ->
            val tasks = json.decodeFromString<List<Task>>(prefs[TASKS_KEY] ?: "[]")
            if (tasks.none { it.id == task.id }) {
                prefs[TASKS_KEY] = json.encodeToString(tasks + task)
            }
        }
    }

    /**
     * 更新任务状态
     */
    suspend fun updateTaskStatus(taskId: String, status: TaskStatus, actualMinutes: Int? = null) {
        store.edit { prefs ->
            val tasks = json.decodeFromString<List<Task>>(prefs[TASKS_KEY] ?: "[]")
            val updated = tasks.map { task ->
                if (task.id == taskId) {
                    task.copy(
                        status = status,
                        actualMinutes = actualMinutes ?: task.actualMinutes,
                        completedAt = if (status == TaskStatus.COMPLETED) System.currentTimeMillis() else null
                    )
                } else {
                    task
                }
            }
            prefs[TASKS_KEY] = json.encodeToString(updated)
        }
    }

    /**
     * 删除任务
     */
    suspend fun deleteTask(taskId: String) {
        store.edit { prefs ->
            val tasks = json.decodeFromString<List<Task>>(prefs[TASKS_KEY] ?: "[]")
            prefs[TASKS_KEY] = json.encodeToString(tasks.filter { it.id != taskId })
        }
    }
}

/**
 * 笔记数据仓库
 */
class NoteDataRepository(private val store: DataStore<Preferences>) {

    private val json = Json { ignoreUnknownKeys = true }

    private val NOTES_KEY = stringPreferencesKey("notes_data")

    /**
     * 获取所有笔记
     */
    fun getNotes(): Flow<List<Note>> {
        return store.data.map { prefs ->
            val data = prefs[NOTES_KEY] ?: "[]"
            try {
                json.decodeFromString<List<Note>>(data)
            } catch (e: kotlinx.serialization.SerializationException) {
                throw IllegalStateException("本地数据读取失败，已保留原始数据，请勿清除应用数据", e)
            }
        }
    }

    /**
     * 保存所有笔记
     */
    suspend fun saveNotes(notes: List<Note>) {
        store.edit { prefs ->
            prefs[NOTES_KEY] = json.encodeToString(notes)
        }
    }

    /**
     * 添加笔记
     */
    suspend fun addNote(note: Note) {
        store.edit { prefs ->
            val notes = json.decodeFromString<List<Note>>(prefs[NOTES_KEY] ?: "[]")
            if (notes.none { it.id == note.id }) {
                prefs[NOTES_KEY] = json.encodeToString(notes + note)
            }
        }
    }

    /**
     * 更新笔记复习次数
     */
    suspend fun updateNoteReview(noteId: String) {
        store.edit { prefs ->
            val notes = json.decodeFromString<List<Note>>(prefs[NOTES_KEY] ?: "[]")
            val updated = notes.map { note ->
                if (note.id == noteId) {
                    note.copy(
                        reviewCount = note.reviewCount + 1,
                        lastReviewedAt = System.currentTimeMillis()
                    )
                } else {
                    note
                }
            }
            prefs[NOTES_KEY] = json.encodeToString(updated)
        }
    }

    /**
     * 删除笔记
     */
    suspend fun deleteNote(noteId: String) {
        store.edit { prefs ->
            val notes = json.decodeFromString<List<Note>>(prefs[NOTES_KEY] ?: "[]")
            prefs[NOTES_KEY] = json.encodeToString(notes.filter { it.id != noteId })
        }
    }
}

/**
 * 知识图谱数据仓库
 */
class KnowledgeGraphRepository(private val store: DataStore<Preferences>) {

    private val json = Json { ignoreUnknownKeys = true }

    private val NODES_KEY = stringPreferencesKey("knowledge_nodes_data")

    /**
     * 获取所有知识节点
     */
    fun getNodes(): Flow<List<KnowledgeNode>> {
        return store.data.map { prefs ->
            val data = prefs[NODES_KEY] ?: "[]"
            try {
                json.decodeFromString<List<KnowledgeNode>>(data)
            } catch (e: kotlinx.serialization.SerializationException) {
                throw IllegalStateException("本地数据读取失败，已保留原始数据，请勿清除应用数据", e)
            }
        }
    }

    /**
     * 保存所有知识节点
     */
    suspend fun saveNodes(nodes: List<KnowledgeNode>) {
        store.edit { prefs ->
            prefs[NODES_KEY] = json.encodeToString(nodes)
        }
    }

    /**
     * 添加或更新知识节点
     */
    suspend fun upsertNode(node: KnowledgeNode) {
        store.edit { prefs ->
            val nodes = json.decodeFromString<List<KnowledgeNode>>(prefs[NODES_KEY] ?: "[]")
            val existing = nodes.indexOfFirst { it.id == node.id }
            val updated = if (existing >= 0) {
                nodes.toMutableList().apply { set(existing, node) }
            } else {
                nodes + node
            }
            prefs[NODES_KEY] = json.encodeToString(updated)
        }
    }

    /**
     * 删除知识节点
     */
    suspend fun deleteNode(nodeId: String) {
        store.edit { prefs ->
            val nodes = json.decodeFromString<List<KnowledgeNode>>(prefs[NODES_KEY] ?: "[]")
            prefs[NODES_KEY] = json.encodeToString(nodes.filter { it.id != nodeId })
        }
    }
}

/**
 * 对话历史数据仓库
 */
class ChatHistoryRepository(private val store: DataStore<Preferences>) {

    private val json = Json { ignoreUnknownKeys = true }

    private val HISTORY_KEY = stringPreferencesKey("chat_history")
    private val MAX_HISTORY = 100  // 最多保存100条

    /**
     * 获取对话历史
     */
    fun getHistory(): Flow<List<ChatHistoryEntry>> {
        return store.data.map { prefs ->
            val data = prefs[HISTORY_KEY] ?: "[]"
            try {
                json.decodeFromString<List<ChatHistoryEntry>>(data)
            } catch (e: kotlinx.serialization.SerializationException) {
                throw IllegalStateException("本地数据读取失败，已保留原始数据，请勿清除应用数据", e)
            }
        }
    }

    /**
     * 添加对话记录
     */
    suspend fun addEntry(entry: ChatHistoryEntry) {
        store.edit { prefs ->
            val history = json.decodeFromString<List<ChatHistoryEntry>>(prefs[HISTORY_KEY] ?: "[]")
            val updated = (history + entry).takeLast(MAX_HISTORY)
            prefs[HISTORY_KEY] = json.encodeToString(updated)
        }
    }

    /**
     * 保存对话历史
     */
    private suspend fun saveHistory(history: List<ChatHistoryEntry>) {
        store.edit { prefs ->
            prefs[HISTORY_KEY] = json.encodeToString(history)
        }
    }

    /**
     * 清空对话历史
     */
    suspend fun clearHistory() {
        store.edit { prefs ->
            prefs[HISTORY_KEY] = "[]"
        }
    }
}

/**
 * 对话历史条目
 */
@Serializable
data class ChatHistoryEntry(
    val sessionId: String,
    val role: String,
    val content: String,
    val timestamp: Long,
    val toolUsed: String? = null,
    val toolResult: String? = null
)

/**
 * 签到记录数据仓库
 */
class CheckInRecordRepository(private val store: DataStore<Preferences>) {

    private val json = Json { ignoreUnknownKeys = true }

    private val RECORDS_KEY = stringPreferencesKey("check_in_records")

    fun getRecords(): Flow<List<CheckInRecord>> {
        return store.data.map { prefs ->
            val data = prefs[RECORDS_KEY] ?: "[]"
            try {
                json.decodeFromString<List<CheckInRecord>>(data)
            } catch (e: kotlinx.serialization.SerializationException) {
                throw IllegalStateException("本地数据读取失败，已保留原始数据，请勿清除应用数据", e)
            }
        }
    }

    suspend fun saveRecords(records: List<CheckInRecord>) {
        store.edit { prefs ->
            prefs[RECORDS_KEY] = json.encodeToString(records)
        }
    }
}

/**
 * 学习记录数据仓库
 */
class StudyRecordRepository(private val store: DataStore<Preferences>) {

    private val json = Json { ignoreUnknownKeys = true }

    private val RECORDS_KEY = stringPreferencesKey("study_records")

    fun getRecords(): Flow<List<StudyRecord>> {
        return store.data.map { prefs ->
            val data = prefs[RECORDS_KEY] ?: "[]"
            try {
                json.decodeFromString<List<StudyRecord>>(data)
            } catch (e: kotlinx.serialization.SerializationException) {
                throw IllegalStateException("本地数据读取失败，已保留原始数据，请勿清除应用数据", e)
            }
        }
    }

    suspend fun saveRecords(records: List<StudyRecord>) {
        store.edit { prefs ->
            prefs[RECORDS_KEY] = json.encodeToString(records)
        }
    }
}

/**
 * 成就数据仓库
 */
class AchievementRepository(private val store: DataStore<Preferences>) {

    private val json = Json { ignoreUnknownKeys = true }

    private val ACHIEVEMENTS_KEY = stringPreferencesKey("achievements_unlocked")

    /**
     * 获取已解锁的成就ID列表
     */
    fun getUnlockedIds(): Flow<List<String>> {
        return store.data.map { prefs ->
            val data = prefs[ACHIEVEMENTS_KEY] ?: "[]"
            try {
                json.decodeFromString<List<String>>(data)
            } catch (e: kotlinx.serialization.SerializationException) {
                throw IllegalStateException("本地数据读取失败，已保留原始数据，请勿清除应用数据", e)
            }
        }
    }

    suspend fun saveUnlockedIds(ids: List<String>) {
        store.edit { prefs ->
            prefs[ACHIEVEMENTS_KEY] = json.encodeToString(ids)
        }
    }
}

/**
 * 学习会话数据仓库
 */
class StudySessionRepository(private val store: DataStore<Preferences>) {

    private val json = Json { ignoreUnknownKeys = true }

    private val SESSIONS_KEY = stringPreferencesKey("study_sessions")

    fun getSessions(): Flow<List<StudySession>> {
        return store.data.map { prefs ->
            val data = prefs[SESSIONS_KEY] ?: "[]"
            try {
                json.decodeFromString<List<StudySession>>(data)
            } catch (e: kotlinx.serialization.SerializationException) {
                throw IllegalStateException("本地数据读取失败，已保留原始数据，请勿清除应用数据", e)
            }
        }
    }

    suspend fun saveSessions(sessions: List<StudySession>) {
        store.edit { prefs ->
            prefs[SESSIONS_KEY] = json.encodeToString(sessions)
        }
    }
}

/**
 * 番茄钟设置数据仓库
 */
class PomodoroSettingsRepository(private val store: DataStore<Preferences>) {

    private val json = Json { ignoreUnknownKeys = true }

    private val SETTINGS_KEY = stringPreferencesKey("pomodoro_settings")

    fun getSettings(): Flow<PomodoroSettings> {
        return store.data.map { prefs ->
            val data = prefs[SETTINGS_KEY]
            try {
                if (data != null) json.decodeFromString<PomodoroSettings>(data) else PomodoroSettings()
            } catch (e: kotlinx.serialization.SerializationException) {
                throw IllegalStateException("番茄钟设置读取失败，已保留原始数据", e)
            }
        }
    }

    suspend fun saveSettings(settings: PomodoroSettings) {
        store.edit { prefs ->
            prefs[SETTINGS_KEY] = json.encodeToString(settings)
        }
    }
}

/**
 * 笔记附件数据仓库
 */
class NoteAttachmentRepository(private val store: DataStore<Preferences>) {

    private val json = Json { ignoreUnknownKeys = true }

    private val ATTACHMENTS_KEY = stringPreferencesKey("note_attachments")

    fun getAttachments(): Flow<Map<String, List<NoteAttachment>>> {
        return store.data.map { prefs ->
            val data = prefs[ATTACHMENTS_KEY] ?: "{}"
            try {
                json.decodeFromString<Map<String, List<NoteAttachment>>>(data)
            } catch (e: kotlinx.serialization.SerializationException) {
                throw IllegalStateException("笔记附件索引读取失败，已保留原始数据", e)
            }
        }
    }

    suspend fun saveAttachments(attachments: Map<String, List<NoteAttachment>>) {
        store.edit { prefs ->
            prefs[ATTACHMENTS_KEY] = json.encodeToString(attachments)
        }
    }
}

/**
 * 数据仓库聚合类
 */
class DataRepository internal constructor(private val store: DataStore<Preferences>) {
    constructor(context: Context, accountId: String) : this(AccountStores.get(context, accountId, context.dataStore))
    suspend fun cloudTaskIds(): Set<String> = store.data.first()[androidx.datastore.preferences.core.stringSetPreferencesKey("imported_task_ids")].orEmpty()
    suspend fun saveTaskCompletion(tasks: List<Task>, user: User, records: List<StudyRecord>) {
        store.edit { prefs ->
            prefs[stringPreferencesKey("tasks_data")] = json.encodeToString(tasks)
            prefs[stringPreferencesKey("user_profile_v2")] = json.encodeToString(user)
            prefs[stringPreferencesKey("study_records")] = json.encodeToString(records)
        }
    }

    suspend fun importCloudSnapshot(courses: List<Course>, tasks: List<Task>, user: User) {
        store.edit { prefs ->
            val courseKey = stringPreferencesKey("courses_data")
            val taskKey = stringPreferencesKey("tasks_data")
            val seenCoursesKey = androidx.datastore.preferences.core.stringSetPreferencesKey("imported_course_ids")
            val seenTasksKey = androidx.datastore.preferences.core.stringSetPreferencesKey("imported_task_ids")
            val localCourses = json.decodeFromString<List<Course>>(prefs[courseKey] ?: "[]")
            val localTasks = json.decodeFromString<List<Task>>(prefs[taskKey] ?: "[]")
            prefs[courseKey] = json.encodeToString(importUnseen(localCourses, courses, prefs[seenCoursesKey].orEmpty()) { it.id })
            prefs[taskKey] = json.encodeToString(reconcileCloudTasks(localTasks, tasks, prefs[seenTasksKey].orEmpty()))
            prefs[seenCoursesKey] = prefs[seenCoursesKey].orEmpty() + courses.map { it.id }
            prefs[seenTasksKey] = prefs[seenTasksKey].orEmpty() + tasks.map { it.id }
            val profileKey = stringPreferencesKey("user_profile_v2")
            // Seed identity while keeping local study progress and rewards intact.
            val localUser = prefs[profileKey]?.let { json.decodeFromString<User>(it) }
            prefs[profileKey] = json.encodeToString(localUser ?: user)
            prefs[longPreferencesKey("last_sync_time")] = System.currentTimeMillis()
        }
    }

    val userPrefs: UserPreferencesRepository = UserPreferencesRepository(store)
    val courses: CourseDataRepository = CourseDataRepository(store)
    val tasks: TaskDataRepository = TaskDataRepository(store)
    val notes: NoteDataRepository = NoteDataRepository(store)
    val knowledgeGraph: KnowledgeGraphRepository = KnowledgeGraphRepository(store)
    val chatHistory: ChatHistoryRepository = ChatHistoryRepository(store)
    val checkInRecords: CheckInRecordRepository = CheckInRecordRepository(store)
    val studyRecords: StudyRecordRepository = StudyRecordRepository(store)
    val achievements: AchievementRepository = AchievementRepository(store)
    val studySessions: StudySessionRepository = StudySessionRepository(store)
    val pomodoroSettings: PomodoroSettingsRepository = PomodoroSettingsRepository(store)
    val noteAttachments: NoteAttachmentRepository = NoteAttachmentRepository(store)
}
