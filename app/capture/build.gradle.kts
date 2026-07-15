plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.phonemonitor.capture"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.phonemonitor.capture"
        minSdk = 26
        targetSdk = 34
        // Keep in step with the desktop app so a pair of artifacts is obviously
        // the same release. versionCode encodes the semver (3.1.0 -> 30100) so it
        // always increases and Android will accept the upgrade.
        versionCode = 30100
        versionName = "3.1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
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
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}
