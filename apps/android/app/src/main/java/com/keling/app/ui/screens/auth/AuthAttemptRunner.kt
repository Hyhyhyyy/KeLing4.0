package com.keling.app.ui.screens.auth

import com.keling.app.network.connectionError
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow

const val AUTH_WAIT_MILLIS = 25_000L
const val AUTH_WAIT_LIMIT_MESSAGE = "等待已超过25秒，已停止等待。请检查连接后重试；如果刚才正在注册，服务可能已收到请求，可先尝试登录。"
const val AUTH_CANCEL_MESSAGE = "已停止等待。如果刚才正在注册，服务可能已收到请求，可先尝试登录。"

/** The UI deadline runs independently of DNS/socket cancellation. Old results cannot replace a retry. */
internal class AuthAttemptRunner<T>(private val scope: CoroutineScope, private val timeoutMillis: Long = AUTH_WAIT_MILLIS) {
    private var generation = 0L
    private var worker: Job? = null
    private var deadline: Job? = null
    private var activeState: MutableStateFlow<UiState<T>>? = null

    fun submit(state: MutableStateFlow<UiState<T>>, action: suspend () -> Result<T>) {
        if (activeState?.value is UiState.Loading) return
        val attempt = ++generation
        activeState = state
        state.value = UiState.Loading
        worker = scope.launch(start = CoroutineStart.LAZY) {
            try {
                val result = action()
                if (generation == attempt) state.value = result.fold(
                    onSuccess = { UiState.Success(it) },
                    onFailure = { UiState.Error(connectionError(it)) }
                )
            } catch (e: CancellationException) {
                if (generation == attempt) state.value = UiState.Error(AUTH_CANCEL_MESSAGE)
                throw e
            } catch (e: Exception) {
                if (generation == attempt) state.value = UiState.Error(connectionError(e))
            } finally {
                if (generation == attempt) { deadline?.cancel(); deadline = null }
            }
        }
        deadline = scope.launch {
            delay(timeoutMillis)
            if (generation == attempt && state.value is UiState.Loading) stop(AUTH_WAIT_LIMIT_MESSAGE)
        }
        worker?.start()
    }

    fun cancel() = stop(AUTH_CANCEL_MESSAGE)

    private fun stop(message: String) {
        if (activeState?.value !is UiState.Loading) return
        ++generation
        activeState?.value = UiState.Error(message)
        worker?.cancel(); worker = null
        deadline?.cancel(); deadline = null
    }
}
