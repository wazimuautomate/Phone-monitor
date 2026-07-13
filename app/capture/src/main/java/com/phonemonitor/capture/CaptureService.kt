package com.phonemonitor.capture

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
import android.view.Surface
import java.nio.ByteBuffer
import kotlin.concurrent.thread

/**
 * Captures the screen via MediaProjection, encodes it to H.264 with MediaCodec,
 * and streams the encoded frames to the desktop helper over a WebSocket.
 */
class CaptureService : Service() {

    companion object {
        const val EXTRA_RESULT_CODE = "resultCode"
        const val EXTRA_RESULT_DATA = "resultData"
        const val EXTRA_HELPER_URL = "helperUrl"
        const val EXTRA_TOKEN = "token"
        const val EXTRA_WIDTH = "width"
        const val EXTRA_HEIGHT = "height"
        const val EXTRA_DPI = "dpi"

        private const val CHANNEL_ID = "pm_capture"
        private const val NOTIF_ID = 1
        private const val MAX_DIM = 900 // scale the longest side down to this (bandwidth)
        private const val BIT_RATE = 3_000_000
        private const val FRAME_RATE = 30
    }

    private var projection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var encoder: MediaCodec? = null
    private var inputSurface: Surface? = null
    private var streamer: Streamer? = null

    @Volatile private var running = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent == null) {
            stopSelf()
            return START_NOT_STICKY
        }

        startForegroundCompat()

        val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0)
        val data = intent.getParcelableExtraCompat<Intent>(EXTRA_RESULT_DATA)
        val helperUrl = intent.getStringExtra(EXTRA_HELPER_URL).orEmpty()
        val token = intent.getStringExtra(EXTRA_TOKEN).orEmpty()
        val screenW = intent.getIntExtra(EXTRA_WIDTH, 1080)
        val screenH = intent.getIntExtra(EXTRA_HEIGHT, 1920)
        val dpi = intent.getIntExtra(EXTRA_DPI, 320)

        if (data == null || helperUrl.isEmpty()) {
            stopSelf()
            return START_NOT_STICKY
        }

        val pm = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        val mp = pm.getMediaProjection(resultCode, data)
        if (mp == null) {
            stopSelf()
            return START_NOT_STICKY
        }
        projection = mp
        mp.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() = stopCapture()
        }, null)

        val (w, h) = scale(screenW, screenH, MAX_DIM)
        streamer = Streamer(helperUrl, token, buildHello(w, h)).also { it.start() }
        startEncoder(w, h, dpi)

        return START_STICKY
    }

    private fun startEncoder(w: Int, h: Int, dpi: Int) {
        val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, w, h).apply {
            setInteger(
                MediaFormat.KEY_COLOR_FORMAT,
                MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface,
            )
            setInteger(MediaFormat.KEY_BIT_RATE, BIT_RATE)
            setInteger(MediaFormat.KEY_FRAME_RATE, FRAME_RATE)
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1) // keyframe/sec → fast joins
        }
        val codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
        codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        inputSurface = codec.createInputSurface()
        codec.start()
        encoder = codec

        virtualDisplay = projection?.createVirtualDisplay(
            "pm-capture",
            w, h, dpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            inputSurface, null, null,
        )

        running = true
        thread(name = "pm-encoder") { drainLoop() }
    }

    private fun drainLoop() {
        val codec = encoder ?: return
        val info = MediaCodec.BufferInfo()
        try {
            while (running) {
                val index = codec.dequeueOutputBuffer(info, 10_000)
                if (index >= 0) {
                    val buf: ByteBuffer? = codec.getOutputBuffer(index)
                    if (buf != null && info.size > 0) {
                        buf.position(info.offset)
                        buf.limit(info.offset + info.size)
                        val bytes = ByteArray(info.size)
                        buf.get(bytes)
                        val type = when {
                            info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0 -> 0
                            info.flags and MediaCodec.BUFFER_FLAG_KEY_FRAME != 0 -> 1
                            else -> 2
                        }
                        streamer?.sendFrame(type, bytes)
                    }
                    codec.releaseOutputBuffer(index, false)
                }
            }
        } catch (_: Exception) {
            // encoder torn down; loop exits
        }
    }

    private fun buildHello(w: Int, h: Int): String =
        """{"type":"hello",""" +
            """"model":${jsonStr(Build.MODEL)},""" +
            """"manufacturer":${jsonStr(Build.MANUFACTURER)},""" +
            """"androidVersion":${jsonStr(Build.VERSION.RELEASE)},""" +
            """"width":$w,"height":$h,"battery":${batteryPercent()}}"""

    private fun batteryPercent(): Int {
        val bm = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        return bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
    }

    private fun startForegroundCompat() {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Screen capture", NotificationManager.IMPORTANCE_LOW),
        )
        val notif: Notification = Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("Phone Monitor")
            .setContentText("Sharing this screen")
            .setSmallIcon(android.R.drawable.ic_menu_view)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        } else {
            startForeground(NOTIF_ID, notif)
        }
    }

    private fun stopCapture() {
        running = false
        runCatching { virtualDisplay?.release() }
        runCatching { encoder?.stop() }
        runCatching { encoder?.release() }
        runCatching { inputSurface?.release() }
        runCatching { projection?.stop() }
        virtualDisplay = null
        encoder = null
        inputSurface = null
        projection = null
        streamer?.stop()
        streamer = null
    }

    override fun onDestroy() {
        stopCapture()
        super.onDestroy()
    }

    private fun scale(w: Int, h: Int, max: Int): Pair<Int, Int> {
        val longSide = maxOf(w, h)
        if (longSide <= max) return even(w) to even(h)
        val ratio = max.toDouble() / longSide
        return even((w * ratio).toInt()) to even((h * ratio).toInt())
    }

    private fun even(v: Int): Int = if (v % 2 == 0) v else v - 1

    private fun jsonStr(s: String?): String {
        val safe = (s ?: "").replace("\\", "\\\\").replace("\"", "\\\"")
        return "\"$safe\""
    }
}

private inline fun <reified T> Intent.getParcelableExtraCompat(name: String): T? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        getParcelableExtra(name, T::class.java)
    } else {
        @Suppress("DEPRECATION")
        getParcelableExtra(name) as? T
    }
