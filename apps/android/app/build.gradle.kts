/**
 * 这是应用模块的配置，控制我们App的所有功能
 * 每一行都有详细注释，请仔细阅读
 */

plugins {
    // 应用Android应用插件，这样Gradle知道如何构建APK
    alias(libs.plugins.android.application)
    // 应用Kotlin插件，支持Kotlin语言
    alias(libs.plugins.kotlin.android)
    // Kotlin序列化插件，用于AI请求的JSON转换
    alias(libs.plugins.kotlin.serialization)
}

val apiBaseUrl = providers.gradleProperty("KELING_API_BASE_URL")
    .orElse("https://ucn5aajxnx7f.feishu.link/app/app_17h4dw5jwdg/api").get().trimEnd('/')
require(apiBaseUrl.startsWith("https://") || apiBaseUrl.startsWith("http://")) {
    "KELING_API_BASE_URL must be an absolute HTTP(S) URL"
}

// Package the same canonical artwork used by the web app.
val sharedExpeditionDirectory = rootProject.file("../../packages/shared/src/expedition")
val packagedAssetDirectory = layout.buildDirectory.dir("generated/packaged-assets")
val preparePackagedAssets by tasks.registering(Sync::class) {
    from("src/main/assets") { exclude("stellar/**") }
    from(rootProject.file("../../assets/stellar")) {
        include("*.webp", "app_icon.png", "manifest.json")
        into("stellar")
    }
    from(sharedExpeditionDirectory) { include("chapter.json"); into("expedition") }
    into(packagedAssetDirectory)
}

val expeditionTestResourceDirectory = layout.buildDirectory.dir("generated/expedition-test-resources")
val prepareExpeditionTestResources by tasks.registering(Sync::class) {
    from(sharedExpeditionDirectory) { include("chapter.json", "fixtures.json"); into("expedition") }
    into(expeditionTestResourceDirectory)
}

val launcherResourceDirectory = layout.buildDirectory.dir("generated/launcher-resources")
val prepareLauncherResources by tasks.registering(Sync::class) {
    from(rootProject.file("../../assets/stellar/app_icon.png")) {
        into("drawable-nodpi")
        rename { "stellar_app_icon.png" }
    }
    into(launcherResourceDirectory)
}

android {
    // 应用的命名空间，必须是唯一的，通常用反向域名
    namespace = "com.keling.app"

    // Compile against Android API 34.
    compileSdk = 34

    defaultConfig {
        // 应用的唯一标识，发布到应用商店后不能改
        applicationId = "com.keling.app"

        // 最低支持的Android版本，API 26 = Android 8.0
        minSdk = 26

        // 目标SDK版本，表示为这个版本优化
        targetSdk = 34

        // 版本号，每次更新应用要+1
        versionCode = 20
        // 版本名称，用户看到的版本
        versionName = "4.0.4-direct-cloud-preview"
        buildConfigField("String", "API_BASE_URL", "\"${apiBaseUrl.replace("\\", "\\\\").replace("\"", "\\\"")}\"")

        // 启用矢量图支持，这样图标可以缩放不失真
        vectorDrawables {
            useSupportLibrary = true
        }

    }

    sourceSets.getByName("main").apply {
        assets.setSrcDirs(listOf(packagedAssetDirectory))
        res.srcDir(launcherResourceDirectory)
    }
    sourceSets.getByName("test").resources.setSrcDirs(listOf(expeditionTestResourceDirectory))



    /**
     * 构建类型配置
     * debug: 开发时使用，包含调试信息，文件大
     * release: 发布时使用，优化代码，文件小
     */
    buildTypes {
        release {
            // Trusted signing stays disabled until a new key is generated and
            // supplied through protected CI secrets. Never embed credentials here.
            isMinifyEnabled = false
            // 代码混淆规则文件（暂时不用）
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    // Java编译配置，使用Java 17的新特性
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    // Kotlin编译配置，与Java版本对应
    kotlinOptions {
        jvmTarget = "17"
    }

    // 启用Compose功能，这是现代Android UI框架
    buildFeatures {
        compose = true
        buildConfig = true
    }

    // Compose编译器版本，必须与Kotlin版本配套
    // Kotlin 1.9.22 对应 Compose Compiler 1.5.8
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.8"
    }

    // 打包配置，排除一些不需要的文件
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

tasks.named("preBuild").configure { dependsOn(preparePackagedAssets, prepareLauncherResources) }
tasks.matching { it.name.endsWith("UnitTestJavaRes") }.configureEach { dependsOn(prepareExpeditionTestResources) }

/**
 * 依赖配置：这里列出App需要的所有第三方库
 * 每个库都有特定用途，我按功能分组
 */
dependencies {
    // ==================== 核心Compose库 ====================
    // Compose物料清单（BOM），统一管理所有Compose库的版本
    val composeBom = platform(libs.androidx.compose.bom)
    implementation(composeBom)

    // Compose UI核心，包含所有基础组件（Text, Button, Column等）
    implementation("androidx.compose.ui:ui")
    // Compose图形库，用于自定义绘制
    implementation("androidx.compose.ui:ui-graphics")
    // Compose预览工具，Android Studio右侧可以实时预览
    implementation("androidx.compose.ui:ui-tooling-preview")
    // Compose Material 3，Google的设计系统组件（按钮、卡片等）
    implementation("androidx.compose.material3:material3")
    // Compose动画库，用于实现平滑过渡效果
    implementation("androidx.compose.animation:animation")

    // ==================== 架构组件 ====================
    // ViewModel，用于管理界面数据和业务逻辑
    // 屏幕旋转时数据不会丢失
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.7.0")
    // 生命周期感知，自动管理资源释放
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.7.0")

    // ==================== 数据存储 ====================
    // DataStore，用于保存用户偏好设置（比SharedPreferences更现代）
    implementation("androidx.datastore:datastore-preferences:1.1.1")

    // ==================== 网络请求 ====================
    // Ktor客户端，用于调用AI API（比Retrofit更轻量，Kotlin原生）
    implementation("io.ktor:ktor-client-android:2.3.7")
    // JSON序列化支持，自动将JSON转为Kotlin对象
    implementation("io.ktor:ktor-client-content-negotiation:2.3.7")
    implementation("io.ktor:ktor-serialization-kotlinx-json:2.3.7")

    // Kotlin序列化插件，用于数据类
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")

    // ==================== 图片加载 ====================
    // Coil，用于加载网络图片（头像等），Compose专用
    implementation("io.coil-kt:coil-compose:2.5.0")

    // ==================== 协程 ====================
    // Kotlin协程，用于异步编程（网络请求不卡界面）
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")

    // ==================== Tests ====================
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.core.ktx)
    testImplementation("junit:junit:4.13.2")
    testImplementation("io.ktor:ktor-client-mock:2.3.7")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.7.3")
    // 调试工具，预览和检查布局
    debugImplementation("androidx.compose.ui:ui-tooling")
}
