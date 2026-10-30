package com.keling.app.data

enum class TaskFilter { ALL, ACTIVE, COMPLETED }

fun filterTasks(tasks: List<Task>, courses: List<Course>, filter: TaskFilter, query: String): List<Task> {
    val names = courses.associate { it.id to it.name }
    val term = query.trim()
    return tasks.filter { task ->
        val matchesStatus = when (filter) {
            TaskFilter.ALL -> true
            TaskFilter.ACTIVE -> task.status == TaskStatus.PENDING || task.status == TaskStatus.IN_PROGRESS
            TaskFilter.COMPLETED -> task.status == TaskStatus.COMPLETED
        }
        matchesStatus && (term.isEmpty() || listOf(task.title, task.description, names[task.courseId].orEmpty())
            .any { it.contains(term, ignoreCase = true) })
    }.sortedWith(compareBy<Task> { it.status == TaskStatus.COMPLETED || it.status == TaskStatus.ABANDONED }
        .thenByDescending { it.priority }.thenBy { it.scheduledAt ?: Long.MAX_VALUE }.thenBy { it.id })
}
