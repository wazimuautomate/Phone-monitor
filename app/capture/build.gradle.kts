import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Release signing is read from app/keystore.properties (local / CI-written) or,
// as a fallback, from environment variables. Neither the keystore nor the
// passwords live in source control — see SIGNING.md. When nothing is configured
// (e.g. a plain `assembleRelease` on a dev box) the release build stays unsigned
// rather than failing, so the debug pipeline is unaffected.
val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
    if (keystorePropsFile.exists()) FileInputStream(keystorePropsFile).use { load(it) }
}

fun signingValue(propKey: String, envKey: String): String? =
    keystoreProps.getProperty(propKey) ?: System.getenv(envKey)

android {
    namespace = "com.tricreta.phonemonitor"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.tricreta.phonemonitor"
        minSdk = 26
        targetSdk = 34
        // First permanent, release-signed identity. versionCode must ALWAYS
        // increase; versionName is semantic (major.minor.patch). See SIGNING.md.
        versionCode = 1
        versionName = "1.0.0"
        // The launcher label; debug overrides it so both apps can coexist.
        manifestPlaceholders["appLabel"] = "@string/app_name"
    }

    signingConfigs {
        create("release") {
            val storePath = signingValue("storeFile", "KEYSTORE_FILE")
            if (storePath != null) {
                storeFile = file(storePath)
                storePassword = signingValue("storePassword", "KEYSTORE_PASSWORD")
                keyAlias = signingValue("keyAlias", "KEY_ALIAS")
                keyPassword = signingValue("keyPassword", "KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            // Only sign when a keystore is actually configured; otherwise leave
            // the release unsigned so a keyless build still succeeds.
            if (signingConfigs.getByName("release").storeFile != null) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
        debug {
            // Separate identity + label so a debug build installs ALONGSIDE the
            // release app and can never be mistaken for (or overwrite) it.
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
            manifestPlaceholders["appLabel"] = "Phone Monitor Debug"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        viewBinding = true
        // Generates BuildConfig (VERSION_NAME/VERSION_CODE + our custom fields).
        buildConfig = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    // QR scanning for pairing — self-contained, no Google Play Services needed
    // (important for sideloaded phones without GMS).
    implementation("com.journeyapps:zxing-android-embedded:4.3.0")
}
