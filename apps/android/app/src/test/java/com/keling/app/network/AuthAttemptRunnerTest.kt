package com.keling.app.network

import com.keling.app.ui.screens.auth.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AuthAttemptRunnerTest {
    @Test fun stalledOperationStopsAtDeadlineAndCanRetry() = runTest {
        val state = MutableStateFlow<UiState<String>>(UiState.Idle)
        val runner = AuthAttemptRunner<String>(this, 25_000)
        runner.submit(state) { awaitCancellation() }
        advanceTimeBy(25_000); runCurrent()
        assertTrue(state.value is UiState.Error)
        assertTrue((state.value as UiState.Error).message.contains("25秒"))
        runner.submit(state) { Result.success("retried") }; runCurrent()
        assertEquals(UiState.Success("retried"), state.value)
    }
    @Test fun ignoredCancellationCannotOverwriteNewAttempt() = runTest {
        val state = MutableStateFlow<UiState<String>>(UiState.Idle)
        val runner = AuthAttemptRunner<String>(this, 100)
        runner.submit(state) { withContext(NonCancellable) { delay(1000) }; Result.success("old") }
        runCurrent(); advanceTimeBy(100); runCurrent()
        runner.submit(state) { Result.success("current") }; runCurrent(); advanceUntilIdle()
        assertEquals(UiState.Success("current"), state.value)
    }
    @Test fun manualCancelEndsSpinnerWithoutWaitingForTransport() = runTest {
        val state = MutableStateFlow<UiState<String>>(UiState.Idle)
        val runner = AuthAttemptRunner<String>(this)
        runner.submit(state) { awaitCancellation() }; runCurrent(); runner.cancel()
        assertTrue(state.value is UiState.Error)
        assertTrue((state.value as UiState.Error).message.contains("可能已收到请求"))
    }
    @Test fun duplicateSubmitDoesNotSendSecondAccountRequest() = runTest {
        val state = MutableStateFlow<UiState<String>>(UiState.Idle)
        val runner = AuthAttemptRunner<String>(this)
        var calls = 0
        runner.submit(state) { calls++; awaitCancellation() }
        runner.submit(state) { calls++; Result.success("unexpected") }
        runCurrent(); assertEquals(1, calls); runner.cancel()
    }
}
