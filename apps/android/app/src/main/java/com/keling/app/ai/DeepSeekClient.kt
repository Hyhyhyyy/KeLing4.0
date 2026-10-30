package com.keling.app.ai

/** Cloud AI stays disabled until authenticated backend calls and tool execution are integrated. */
class DeepSeekClient {
    suspend fun chat(systemPrompt: String, userPrompt: String): String {
        throw IllegalStateException("云端 AI 暂未启用：请先完成安全后端接入")
    }

    fun close() = Unit
}
