import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.gms.google-services")
}

// Chave de produção: fora do repositório e fora do projeto. Se ela se perder,
// nenhum dos aparelhos em campo aceita atualização nunca mais — só visita com
// cabo. É o ativo mais crítico do agente.
val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
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
        versionCode = 1062
        versionName = "0.60.0"
    }


    signingConfigs {
        create("linka") {
            if (keystoreProps.getProperty("storeFile") != null) {
                storeFile = file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Sem DEBUGGABLE: em aparelho de loja, app depurável é porta aberta
            // para quem chegar com um cabo.
            isDebuggable = false
            if (keystoreProps.getProperty("storeFile") != null) {
                signingConfig = signingConfigs.getByName("linka")
            }
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
    // SO o messaging. O BOM do Firebase arrastaria analytics e companhia para
    // dentro de um APK que roda em vitrine de loja e nao mede nada disso.
    implementation("com.google.firebase:firebase-messaging:24.1.0")
}
