package com.keling.app.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.keling.app.network.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive

/**
 * 认证状态管理
 * 管理用户的登录状态、Token存储等
 */

// 认证相关的DataStore
private val Context.authDataStore: DataStore<Preferences> by preferencesDataStore(name = "auth_data")

/**
 * 认证状态
 */
@Serializable
sealed class AuthState {
    @Serializable
    data object Loading : AuthState()

    @Serializable
    data class Authenticated(
        val token: String,
        val userId: String,
        val email: String,
        val name: String
    ) : AuthState()

    @Serializable
    data object Unauthenticated : AuthState()
}

/**
 * 认证仓库
 */
class AuthRepository(private val context: Context) {

    private object Keys {
        val TOKEN = stringPreferencesKey("auth_token")
        val SERVER = stringPreferencesKey("auth_server")
        val USER_ID = stringPreferencesKey("user_id")
        val USER_EMAIL = stringPreferencesKey("user_email")
        val USER_NAME = stringPreferencesKey("user_name")
    }

    private val api = AuthApi()

    /**
     * 获取认证状态
     */
    fun getAuthState(): Flow<AuthState> {
        return context.authDataStore.data.map { prefs ->
            val token = prefs[Keys.TOKEN]
            if (token.isNullOrBlank() || prefs[Keys.USER_ID].isNullOrBlank() ||
                !sameAccountService(prefs[Keys.SERVER] ?: ApiConfig.BASE_URL, ApiConfig.actualBaseUrl)) {
                AuthState.Unauthenticated
            } else {
                AuthState.Authenticated(
                    token = token,
                    userId = prefs[Keys.USER_ID] ?: "",
                    email = prefs[Keys.USER_EMAIL] ?: "",
                    name = prefs[Keys.USER_NAME] ?: ""
                )
            }
        }
    }

    /**
     * 获取Token
     */
    fun getToken(): Flow<String?> {
        return context.authDataStore.data.map { prefs ->
            prefs[Keys.TOKEN].takeIf { sameAccountService(prefs[Keys.SERVER] ?: ApiConfig.BASE_URL, ApiConfig.actualBaseUrl) }
        }
    }

    /**
     * 检查是否已登录
     */
    fun isLoggedIn(): Flow<Boolean> {
        return getToken().map { !it.isNullOrEmpty() }
    }

    /**
     * 用户注册
     */
    suspend fun register(name: String, email: String, password: String): Result<AuthResponse> {
        authInputError(email, password, name)?.let { return Result.failure(IllegalArgumentException(it)) }
        val result = api.register(name.trim(), email.trim().lowercase(java.util.Locale.ROOT), password)
        val payload = result.getOrNull()
        if (result.isSuccess && (payload?.token.isNullOrBlank() || payload?.user?.id.isNullOrBlank() || payload?.error != null)) {
            return Result.failure(IllegalStateException(payload?.error ?: "登录响应不完整，请重试"))
        }

        if (result.isSuccess) {
            val response = result.getOrNull()
            if (response?.token != null && response.user != null) {
                saveAuthData(
                    token = response.token,
                    userId = response.user.id,
                    email = response.user.email,
                    name = response.user.name
                )
            }
        }

        return result
    }

    /**
     * 用户登录
     */
    suspend fun login(email: String, password: String): Result<AuthResponse> {
        authInputError(email, password)?.let { return Result.failure(IllegalArgumentException(it)) }
        val result = api.login(email.trim().lowercase(java.util.Locale.ROOT), password)
        val payload = result.getOrNull()
        if (result.isSuccess && (payload?.token.isNullOrBlank() || payload?.user?.id.isNullOrBlank() || payload?.error != null)) {
            return Result.failure(IllegalStateException(payload?.error ?: "登录响应不完整，请重试"))
        }

        if (result.isSuccess) {
            val response = result.getOrNull()
            if (response?.token != null && response.user != null) {
                saveAuthData(
                    token = response.token,
                    userId = response.user.id,
                    email = response.user.email,
                    name = response.user.name
                )
            }
        }

        return result
    }

    /**
     * 用户登出
     */
    suspend fun logout() {
        context.authDataStore.edit { prefs ->
            prefs.remove(Keys.TOKEN)
            prefs.remove(Keys.USER_ID)
            prefs.remove(Keys.USER_EMAIL)
            prefs.remove(Keys.USER_NAME)
        }
    }

    /**
     * 保存认证数据
     */
    private suspend fun saveAuthData(token: String, userId: String, email: String, name: String) {
        currentCoroutineContext().ensureActive()
        context.authDataStore.edit { prefs ->
            prefs[Keys.TOKEN] = token
            prefs[Keys.SERVER] = ApiConfig.actualBaseUrl
            prefs[Keys.USER_ID] = userId
            prefs[Keys.USER_EMAIL] = email
            prefs[Keys.USER_NAME] = name
        }
    }

    /**
     * 更新Token
     */
    suspend fun updateToken(token: String) {
        context.authDataStore.edit { prefs ->
            prefs[Keys.TOKEN] = token
        }
    }

    /**
     * 获取当前用户ID
     */
    fun getCurrentUserId(): Flow<String?> {
        return context.authDataStore.data.map { prefs ->
            prefs[Keys.USER_ID]
        }
    }
}
