package com.keling.app.ui.screens.trial

import android.app.Application
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.LocalSaveableStateRegistry
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.ViewModelStoreOwner
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.compose.LocalViewModelStoreOwner
import androidx.lifecycle.viewmodel.compose.viewModel
import com.keling.app.MainAppContent
import com.keling.app.data.MemoryPreferences
import com.keling.app.network.GuestWorkspaces
import com.keling.app.ui.screens.auth.AuthViewModel
import com.keling.app.viewmodel.AppViewModel

/** Same application routes, dedicated RAM-only repositories and no saved-instance state. */
@Composable fun FullGuestScreen(auth: AuthViewModel, onExit: () -> Unit) {
    val context = LocalContext.current
    val application = context.applicationContext as Application
    val window = (context as? android.app.Activity)?.window
    DisposableEffect(window) {
        val wasSecure = window?.attributes?.flags?.and(android.view.WindowManager.LayoutParams.FLAG_SECURE) != 0
        window?.addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)
        onDispose { if (!wasSecure) window?.clearFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE) }
    }
    val guest = remember { com.keling.app.ai.SimpleAIService.clearSession(); GuestWorkspaces.create() }
    val memory = remember { MemoryPreferences() }
    val owner = remember { object : ViewModelStoreOwner { override val viewModelStore = ViewModelStore() } }
    val local: AppViewModel = viewModel(viewModelStoreOwner = owner, key = "guest-local", factory = remember(guest) {
        object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST") override fun <T : ViewModel> create(modelClass: Class<T>): T = AppViewModel(application, guest.accountId, memory) as T
        }
    })
    DisposableEffect(guest) { onDispose { owner.viewModelStore.clear(); memory.close(); GuestWorkspaces.close(guest.token); com.keling.app.ai.SimpleAIService.clearSession() } }
    LaunchedEffect(guest) { local.syncFromServer(guest.token, guest.accountId) }
    CompositionLocalProvider(LocalViewModelStoreOwner provides owner, LocalSaveableStateRegistry provides null) {
        MainAppContent(auth, local, onRetrySync = { local.syncFromServer(guest.token, guest.accountId) }, guest = guest, onGuestExit = onExit)
    }
}
