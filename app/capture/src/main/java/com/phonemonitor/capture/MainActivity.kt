package com.phonemonitor.capture

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.util.DisplayMetrics
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.phonemonitor.capture.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var projectionManager: MediaProjectionManager

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

        val prefs = getSharedPreferences("pm", MODE_PRIVATE)
        binding.helperUrl.setText(prefs.getString("helperUrl", "ws://192.168.1.50:8787/app"))
        binding.token.setText(prefs.getString("token", ""))

        binding.startButton.setOnClickListener {
            prefs.edit()
                .putString("helperUrl", binding.helperUrl.text.toString())
                .putString("token", binding.token.text.toString())
                .apply()
            ensureNotificationPermission()
            requestBatteryExemption()
            CaptureState.set(CaptureState.CONNECTING, "Requesting permission…")
            captureLauncher.launch(projectionManager.createScreenCaptureIntent())
        }

        binding.stopButton.setOnClickListener {
            stopService(Intent(this, CaptureService::class.java))
            CaptureState.set(CaptureState.IDLE, "Stopped")
        }
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
                    Intent(
                        Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                        Uri.parse("package:$packageName"),
                    ),
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
