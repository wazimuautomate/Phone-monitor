package com.phonemonitor.capture

import android.app.Application
import android.content.Context
import androidx.appcompat.app.AppCompatDelegate

/**
 * Applies the user's saved theme choice (System / Light / Dark) app-wide, before
 * any activity is created, so there's no flash of the wrong theme on launch.
 */
class App : Application() {
    override fun onCreate() {
        super.onCreate()
        applySavedTheme(this)
    }

    companion object {
        const val THEME_SYSTEM = "system"
        const val THEME_LIGHT = "light"
        const val THEME_DARK = "dark"

        /** Read the stored preference and switch AppCompat's night mode to match. */
        fun applySavedTheme(context: Context) {
            val mode = context.getSharedPreferences("pm", Context.MODE_PRIVATE)
                .getString("themeMode", THEME_SYSTEM)
            AppCompatDelegate.setDefaultNightMode(nightModeFor(mode))
        }

        fun nightModeFor(mode: String?): Int = when (mode) {
            THEME_LIGHT -> AppCompatDelegate.MODE_NIGHT_NO
            THEME_DARK -> AppCompatDelegate.MODE_NIGHT_YES
            else -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
        }
    }
}
