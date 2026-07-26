plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.linka.agent"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.linka.agent"
        minSdk = 26
        targetSdk = 34
        // Fonte única da versão: o agente reporta BuildConfig.VERSION_NAME, então
        // a versão do pacote e a versão reportada não podem mais divergir (elas
        // divergiram: o painel dizia 0.10.1 e o Android ainda via 0.1.0).
        versionCode = 1005
        versionName = "0.11.1"
    }


    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.media3:media3-exoplayer:1.4.1")
    implementation("androidx.media3:media3-ui:1.4.1")
}
