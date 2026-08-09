import java.util.Properties

plugins {
    id("com.android.application")
}

val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "com.donghan.sound"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.donghan.soundfx"
        minSdk = 29
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }

    signingConfigs {
        create("release") {
            storeFile = localProps.getProperty("RELEASE_STORE_FILE")?.let { file(it) }
            storePassword = localProps.getProperty("RELEASE_STORE_PASSWORD")
            keyAlias = localProps.getProperty("RELEASE_KEY_ALIAS")
            keyPassword = localProps.getProperty("RELEASE_STORE_PASSWORD")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("com.google.android.material:material:1.14.0")
    implementation("androidx.datastore:datastore-preferences:1.1.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")

    testImplementation("junit:junit:4.13.2")
}
