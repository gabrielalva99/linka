plugins {
    id("com.android.application") version "8.7.3" apply false
    id("org.jetbrains.kotlin.android") version "2.0.20" apply false
    // Le o google-services.json e gera a configuracao do Firebase no APK.
    id("com.google.gms.google-services") version "4.4.2" apply false
}
