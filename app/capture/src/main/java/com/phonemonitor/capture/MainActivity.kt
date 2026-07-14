package com.phonemonitor.capture

import android.app.Activity
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

        binding.helperUrl.setText(prefs.getString("helperUrl", "ws://192.168.1.50:8787/app"))
        binding.token.setText(prefs.getString("token", ""))

        binding.startButton.setOnClickListener { beginCapture() }
        binding.stopButton.setOnClickListener {
            stopService(Intent(this, CaptureService::class.java))
            CaptureState.set(CaptureState.IDLE, "Stopped")
        }

        renderHistory()
    }

    override fun onResume() {
        super.onResume()
        CaptureState.listener = { state, msg -> runOnUiThread { renderStatus(state, msg) } }
        renderStatus(CaptureState.state, CaptureState.message)
    }

    override fun onPause() {
        super.onPause()
        CaptureState.listener = null
    }

    private fun beginCapture() {
        val url = binding.helperUrl.text.toString().trim()
        val token = binding.token.text.toString().trim()
        if (url.isEmpty()) {
            CaptureState.set(CaptureState.ERROR, "Enter a helper address")
            return
        }
        prefs.edit().putString("helperUrl", url).putString("token", token).apply()
        addToHistory(url, token)
        renderHistory()
        ensureNotificationPermission()
        requestBatteryExemption()
        CaptureState.set(CaptureState.CONNECTING, "Requesting permission…")
        captureLauncher.launch(projectionManager.createScreenCaptureIntent())
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

    private fun renderHistory() {
        val list = loadHistory()
        binding.historyList.removeAllViews()
        val visibility = if (list.isEmpty()) View.GONE else View.VISIBLE
        binding.historyLabel.visibility = visibility
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
