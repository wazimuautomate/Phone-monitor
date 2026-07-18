package com.tricreta.phonemonitor

import android.app.Application
import android.content.Context
import androidx.appcompat.app.AppCompatDelegate
import java.io.PrintWriter
import java.io.StringWriter

/**
 * Applies the user's saved theme choice (System / Light / Dark) app-wide, before
 * any activity is created, so there's no flash of the wrong theme on launch, and
 * records any crash so it can be shown on the next launch.
 */
class App : Application() {
    override fun onCreate() {
        super.onCreate()
        installCrashRecorder()
        applySavedTheme(this)
    }

    /**
     * Remember why the app died. Phones in the field are the only place some of
     * this can happen, and "it just closed" is not a bug report — this turns the
     * next launch into one, with no cable or adb needed.
     */
    private fun installCrashRecorder() {
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            runCatching {
                val stack = StringWriter().also { error.printStackTrace(PrintWriter(it)) }.toString()
                getSharedPreferences("pm", Context.MODE_PRIVATE)
                    .edit()
                    .putString("lastCrash", "${error.javaClass.name}: ${error.message}\n\n${stack.take(2500)}")
                    // commit(), not apply() — this process is about to die.
                    .commit()
            }
            previous?.uncaughtException(thread, error)
        }
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
