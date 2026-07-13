package com.phonemonitor.capture

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
import android.util.DisplayMetrics
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.phonemonitor.capture.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var projectionManager: MediaProjectionManager

    private val notifPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { /* capture still works without it; the notification may just be hidden */ }

    private val captureLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        val data = result.data
        if (result.resultCode == Activity.RESULT_OK && data != null) {
            startCapture(result.resultCode, data)
        } else {
            setStatus("Screen-capture permission denied")
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
            captureLauncher.launch(projectionManager.createScreenCaptureIntent())
        }
        binding.stopButton.setOnClickListener {
            stopService(Intent(this, CaptureService::class.java))
            setStatus("Stopped")
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
        setStatus("Capturing → ${binding.helperUrl.text}")
        Toast.makeText(this, "Capturing started", Toast.LENGTH_SHORT).show()
    }

    private fun setStatus(text: String) {
        binding.status.text = text
    }
}
