package com.phonemonitor.capture

import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.text.TextUtils
import android.util.DisplayMetrics
import android.view.View
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.google.android.material.button.MaterialButton
import com.phonemonitor.capture.databinding.ActivityMainBinding
import org.json.JSONArray
import org.json.JSONObject

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var projectionManager: MediaProjectionManager
    private lateinit var prefs: SharedPreferences

    private val notifPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* optional */ }

    private val captureLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val data = result.data
            if (result.resultCode == Activity.RESULT_OK && data != null) {
                startCapture(result.resultCode, data)
            } else {
                CaptureState.set(CaptureState.ERROR, "Screen-capture permission denied")
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        projectionManager = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        prefs = getSharedPreferences("pm", MODE_PRIVATE)

        binding.helperUrl.setText(prefs.getString("helperUrl", ""))
        binding.token.setText(prefs.getString("token", ""))

        binding.startButton.setOnClickListener { beginCapture() }
        binding.stopButton.setOnClickListener {
            stopService(Intent(this, CaptureService::class.java))
            CaptureState.set(CaptureState.IDLE, "Stopped")
        }
        binding.clearHistory.setOnClickListener { clearHistory() }
        binding.enableControl.setOnClickListener { openAccessibilitySettings() }

        renderHistory()
    }

    override fun onResume() {
        super.onResume()
        CaptureState.listener = { state, msg -> runOnUiThread { renderStatus(state, msg) } }
        renderStatus(CaptureState.state, CaptureState.message)
        // Reflect the accessibility state each time we return (e.g. from Settings).
        renderControlStatus()
    }

    override fun onPause() {
        super.onPause()
        CaptureState.listener = null
    }

    private fun beginCapture() {
        val url = normalizeHelperUrl(binding.helperUrl.text.toString())
        val token = binding.token.text.toString().trim()
        if (url.isEmpty()) {
            CaptureState.set(CaptureState.ERROR, "Enter the helper address")
            return
        }
        // Show the cleaned-up address so the user sees exactly what we'll connect to.
        if (url != binding.helperUrl.text.toString()) binding.helperUrl.setText(url)
        prefs.edit().putString("helperUrl", url).putString("token", token).apply()
        addToHistory(url, token)
        renderHistory()
        ensureNotificationPermission()
        requestBatteryExemption()
        CaptureState.set(CaptureState.CONNECTING, "Requesting permission…")
        captureLauncher.launch(projectionManager.createScreenCaptureIntent())
    }

    /**
     * Turns whatever the user typed into a connectable helper address.
     * Accepts a bare host ("app.onrender.com"), a dashboard link
     * ("https://app.onrender.com") or a full "wss://host/app", and always returns
     * "ws(s)://host[:port]/app". This is what makes pasting the dashboard link work.
     */
    private fun normalizeHelperUrl(raw: String): String {
        var s = raw.trim()
        if (s.isEmpty()) return ""

        val lower = s.lowercase()
        s = when {
            lower.startsWith("wss://") -> "wss://" + s.substring(6)
            lower.startsWith("ws://") -> "ws://" + s.substring(5)
            lower.startsWith("https://") -> "wss://" + s.substring(8)
            lower.startsWith("http://") -> "ws://" + s.substring(7)
            else -> (if (looksLocal(s)) "ws://" else "wss://") + s
        }

        val schemeEnd = s.indexOf("://") + 3
        val scheme = s.substring(0, schemeEnd)
        val rest = s.substring(schemeEnd)

        val slash = rest.indexOf('/')
        var authority = if (slash >= 0) rest.substring(0, slash) else rest
        var path = if (slash >= 0) rest.substring(slash) else ""

        // A host[:port] can't contain a space or '=', so anything from there on is a
        // stray token the user pasted onto the URL — drop it (the token has its own field).
        val cut = authority.indexOfFirst { it == ' ' || it == '=' || it == '?' }
        if (cut >= 0) authority = authority.substring(0, cut)

        path = path.trim().trimEnd('/')
        if (path.isEmpty()) path = "/app"

        return if (authority.isEmpty()) "" else scheme + authority + path
    }

    private fun looksLocal(raw: String): Boolean {
        val host = raw.substringAfter("://").substringBefore('/').substringBefore(':').trim()
        return host == "localhost" || host.startsWith("127.") ||
            host.startsWith("10.") || host.startsWith("192.168.") ||
            Regex("^172\\.(1[6-9]|2\\d|3[0-1])\\.").containsMatchIn(host)
    }

    private fun renderStatus(state: Int, msg: String) {
        binding.status.text = msg
        val colorRes = when (state) {
            CaptureState.STREAMING -> R.color.pm_green
            CaptureState.CONNECTING -> R.color.pm_yellow
            CaptureState.ERROR -> R.color.pm_red
            else -> R.color.pm_muted
        }
        val color = ContextCompat.getColor(this, colorRes)
        binding.status.setTextColor(color)
        binding.statusDot.backgroundTintList = ColorStateList.valueOf(color)

        val busy = state == CaptureState.STREAMING || state == CaptureState.CONNECTING
        binding.startButton.isEnabled = !busy
        binding.stopButton.isEnabled = busy
    }

    // ---- Remote control (accessibility) ----

    private fun renderControlStatus() {
        val enabled = isControlEnabled()
        binding.controlStatus.setText(if (enabled) R.string.control_enabled else R.string.control_disabled)
        val color = ContextCompat.getColor(this, if (enabled) R.color.pm_green else R.color.pm_muted)
        binding.controlStatus.setTextColor(color)
        binding.controlDot.backgroundTintList = ColorStateList.valueOf(color)
    }

    /** True if our ControlService is in the system's enabled-accessibility list. */
    private fun isControlEnabled(): Boolean {
        val expected = ComponentName(this, ControlService::class.java)
        val enabled = Settings.Secure.getString(
            contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
        ) ?: return false
        val splitter = TextUtils.SimpleStringSplitter(':')
        splitter.setString(enabled)
        for (entry in splitter) {
            if (ComponentName.unflattenFromString(entry) == expected) return true
        }
        return false
    }

    private fun openAccessibilitySettings() {
        runCatching { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
    }

    // ---- Recent connections ----

    private fun loadHistory(): List<Pair<String, String>> =
        runCatching {
            val arr = JSONArray(prefs.getString("history", "[]"))
            (0 until arr.length()).map {
                val o = arr.getJSONObject(it)
                o.getString("url") to o.optString("token", "")
            }
        }.getOrDefault(emptyList())

    private fun saveHistory(list: List<Pair<String, String>>) {
        val arr = JSONArray()
        list.forEach { arr.put(JSONObject().put("url", it.first).put("token", it.second)) }
        prefs.edit().putString("history", arr.toString()).apply()
    }

    private fun addToHistory(url: String, token: String) {
        val list = loadHistory().toMutableList()
        list.removeAll { it.first == url }
        list.add(0, url to token)
        while (list.size > 5) list.removeAt(list.size - 1)
        saveHistory(list)
    }

    private fun removeFromHistory(url: String) {
        saveHistory(loadHistory().filterNot { it.first == url })
    }

    private fun clearHistory() {
        prefs.edit().remove("history").apply()
        renderHistory()
    }

    private fun renderHistory() {
        val list = loadHistory()
        binding.historyList.removeAllViews()
        val visibility = if (list.isEmpty()) View.GONE else View.VISIBLE
        binding.historyHeader.visibility = visibility
        binding.historyList.visibility = visibility
        for ((url, token) in list) {
            val btn = layoutInflater.inflate(R.layout.history_item, binding.historyList, false) as MaterialButton
            btn.text = url
            btn.setOnClickListener {
                binding.helperUrl.setText(url)
                binding.token.setText(token)
                beginCapture()
            }
            btn.setOnLongClickListener {
                removeFromHistory(url)
                renderHistory()
                true
            }
            binding.historyList.addView(btn)
        }
    }

    private fun ensureNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, android.Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            notifPermission.launch(android.Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    private fun requestBatteryExemption() {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        if (!pm.isIgnoringBatteryOptimizations(packageName)) {
            runCatching {
                startActivity(
                    Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")),
                )
            }
        }
    }

    private fun startCapture(resultCode: Int, data: Intent) {
        val metrics = DisplayMetrics()
        @Suppress("DEPRECATION")
        windowManager.defaultDisplay.getRealMetrics(metrics)

        val intent = Intent(this, CaptureService::class.java).apply {
            putExtra(CaptureService.EXTRA_RESULT_CODE, resultCode)
            putExtra(CaptureService.EXTRA_RESULT_DATA, data)
            putExtra(CaptureService.EXTRA_HELPER_URL, binding.helperUrl.text.toString())
            putExtra(CaptureService.EXTRA_TOKEN, binding.token.text.toString())
            putExtra(CaptureService.EXTRA_WIDTH, metrics.widthPixels)
            putExtra(CaptureService.EXTRA_HEIGHT, metrics.heightPixels)
            putExtra(CaptureService.EXTRA_DPI, metrics.densityDpi)
        }
        ContextCompat.startForegroundService(this, intent)
        CaptureState.set(CaptureState.CONNECTING, "Connecting to helper…")
    }
}
