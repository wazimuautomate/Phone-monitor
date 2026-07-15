package com.phonemonitor.capture

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.util.DisplayMetrics
import android.view.Display
import android.view.Surface
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.nio.ByteBuffer
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

/**
 * Captures the screen via MediaProjection, encodes it to H.264 with MediaCodec,
 * and streams the encoded frames to the desktop helper over a WebSocket.
 * Runs as a foreground service with a wake lock so it resists being killed.
 */
class CaptureService : Service() {

    companion object {
        const val EXTRA_RESULT_CODE = "resultCode"
        const val EXTRA_RESULT_DATA = "resultData"
        const val EXTRA_HELPER_URL = "helperUrl"
        const val EXTRA_TOKEN = "token"
        const val EXTRA_REMOTE = "remote"
        const val EXTRA_QUALITY = "quality"
        const val EXTRA_WIDTH = "width"
        const val EXTRA_HEIGHT = "height"
        const val EXTRA_DPI = "dpi"

        private const val CHANNEL_ID = "pm_capture"
        private const val NOTIF_ID = 1
        private const val FRAME_RATE = 30
    }

    // Longest-side cap and bitrate, chosen by the "Monitor quality" setting.
    private var maxDim = 900
    private var bitRate = 3_000_000

    // The real display we're mirroring. Kept so a rotation can rebuild the
    // VirtualDisplay/encoder at the NEW size — a VirtualDisplay has fixed
    // bounds, so without this a rotated phone just letterboxes inside the old
    // portrait frame and the desktop never sees a landscape picture.
    @Volatile private var screenW = 1080
    @Volatile private var screenH = 1920
    private var screenDpi = 320
    private var displayListener: DisplayManager.DisplayListener? = null
    private var drainThread: Thread? = null
    private var rotationExec: ScheduledExecutorService? = null
    private val rebuildLock = Any()

    private var projection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var encoder: MediaCodec? = null
    private var inputSurface: Surface? = null
    private var streamer: Streamer? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var statusTimer: ScheduledExecutorService? = null

    @Volatile private var running = false
    @Volatile private var firstFrameSent = false

    // Remote mode = connected outbound through the hosted relay (AnyDesk-style),
    // vs. local mode = direct to the desktop helper on the LAN. Streaming is
    // identical either way; this only shapes the status wording.
    @Volatile private var remote = false

    // True once the socket has opened at least once this session. After that,
    // a dropped connection is a transient blip ("Reconnecting…"), NOT a "can't
    // connect — check the address" error (the address is clearly reachable).
    @Volatile private var everConnected = false

    private var receiverRegistered = false
    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                Intent.ACTION_SCREEN_OFF ->
                    streamer?.sendStatus("""{"type":"status","screenLocked":true}""")
                // SCREEN_ON as well as USER_PRESENT: a phone with no keyguard never
                // fires USER_PRESENT, which would otherwise leave the desktop
                // believing the screen is still off forever.
                Intent.ACTION_SCREEN_ON, Intent.ACTION_USER_PRESENT ->
                    streamer?.sendStatus("""{"type":"status","screenLocked":false}""")
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_OFF)
            addAction(Intent.ACTION_SCREEN_ON)
            addAction(Intent.ACTION_USER_PRESENT)
        }
        ContextCompat.registerReceiver(this, screenReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
        receiverRegistered = true
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent == null) {
            stopSelf()
            return START_NOT_STICKY
        }

        startForegroundCompat("Starting…")
        acquireWakeLock()

        val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0)
        val data = intent.getParcelableExtraCompat<Intent>(EXTRA_RESULT_DATA)
        val helperUrl = intent.getStringExtra(EXTRA_HELPER_URL).orEmpty()
        val token = intent.getStringExtra(EXTRA_TOKEN).orEmpty()
        remote = intent.getBooleanExtra(EXTRA_REMOTE, false)
        applyQuality(intent.getStringExtra(EXTRA_QUALITY).orEmpty())
        screenW = intent.getIntExtra(EXTRA_WIDTH, 1080)
        screenH = intent.getIntExtra(EXTRA_HEIGHT, 1920)
        screenDpi = intent.getIntExtra(EXTRA_DPI, 320)

        if (data == null || helperUrl.isEmpty()) {
            CaptureState.set(CaptureState.ERROR, "Missing helper address")
            stopSelf()
            return START_NOT_STICKY
        }

        // If a capture is already running (e.g. reconnecting from a history tap
        // or a restart), tear it down first — never run two streamers that would
        // fight over the same device socket and cause a reconnect loop.
        if (streamer != null || running) teardownCapture()
        everConnected = false

        val pm = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        val mp = pm.getMediaProjection(resultCode, data)
        if (mp == null) {
            CaptureState.set(CaptureState.ERROR, "Could not start capture")
            stopSelf()
            return START_NOT_STICKY
        }
        projection = mp
        mp.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() = stopCapture()
        }, null)

        val (w, h) = scale(screenW, screenH, maxDim)
        CaptureState.set(CaptureState.CONNECTING, "Connecting to ${peer()}…")
        streamer = Streamer(
            helperUrl,
            token,
            // Report the real display size so the desktop maps normalized
            // control coordinates back to exact pixels.
            buildHello(screenW, screenH),
            onStatus = { status -> onStreamerStatus(status) },
            onMessage = { text -> onControlMessage(text) },
        ).also { it.start() }
        startEncoder(w, h, screenDpi)
        startStatusUpdates()
        watchRotation()

        return START_STICKY
    }

    /**
     * Handle a text frame from the desktop/relay.
     *  - {"type":"control","cmd":{"action":…}} → forward to the accessibility service.
     *  - {"type":"welcome","code":"916429577"} → the relay's assigned remote code;
     *    save it (so we can reclaim the SAME code next time) and surface it to the UI.
     * Anything malformed or unrecognised is ignored so a bad message can't crash the stream.
     */
    private fun onControlMessage(text: String) {
        runCatching {
            val obj = JSONObject(text)
            when (obj.optString("type")) {
                "control" -> {
                    val cmd = obj.optJSONObject("cmd") ?: return@runCatching
                    val control = Control.from(cmd) ?: return@runCatching
                    ControlService.instance?.perform(control)
                }
                "welcome" -> {
                    val code = obj.optString("code")
                    if (code.isNotEmpty()) {
                        getSharedPreferences("pm", MODE_PRIVATE)
                            .edit().putString("remoteCode", code).apply()
                        CaptureState.setCode(code)
                    }
                }
            }
            // Keep this `when` in statement position (its value is unused) so it
            // needs neither an exhaustive `else` nor an `else` on the inner `if`.
            Unit
        }
    }

    private fun onStreamerStatus(status: String) {
        when {
            status == "open" -> {
                everConnected = true
                CaptureState.set(CaptureState.STREAMING, "Streaming to ${peer()}")
                updateNotification("Streaming this screen")
            }
            status.startsWith("error: ") -> {
                val reason = status.removePrefix("error: ")
                if (everConnected) {
                    // We were connected, so the address/Wi-Fi are fine — this is a
                    // transient drop. Don't scare the user with "can't connect".
                    CaptureState.set(CaptureState.CONNECTING, "Reconnecting…")
                    updateNotification("Reconnecting… ($reason)")
                } else {
                    // Never connected this session — the address/token/Wi-Fi is the
                    // likely problem, so surface it.
                    CaptureState.set(CaptureState.ERROR, "Can’t connect — $reason")
                    updateNotification("Can’t connect — $reason")
                }
            }
            else -> {
                // Clean close (e.g. server restarted) — the streamer auto-retries.
                CaptureState.set(CaptureState.CONNECTING, "Reconnecting…")
                updateNotification("Reconnecting…")
            }
        }
    }

    /** Definitive "we're live" signal: the first encoded frame reached the socket. */
    private fun onFirstFrame() {
        everConnected = true
        CaptureState.set(CaptureState.STREAMING, "Streaming to ${peer()}")
        updateNotification("Streaming this screen")
    }

    /** How we word the peer in status text: the hosted relay vs. the local helper. */
    private fun peer(): String = if (remote) "relay" else "helper"

    private fun startEncoder(w: Int, h: Int, dpi: Int) {
        val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, w, h).apply {
            setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
            setInteger(MediaFormat.KEY_BIT_RATE, bitRate)
            setInteger(MediaFormat.KEY_FRAME_RATE, FRAME_RATE)
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
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

        firstFrameSent = false
        running = true
        // Tracked so a rotation rebuild can JOIN it before releasing the codec —
        // releasing a MediaCodec while this thread sits in dequeueOutputBuffer
        // takes the whole service down (which looked like "the phone
        // disconnected when I rotated twice").
        drainThread = thread(name = "pm-encoder") { drainLoop() }
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
                        val sent = streamer?.sendFrame(type, bytes) == true
                        if (sent && !firstFrameSent) {
                            firstFrameSent = true
                            onFirstFrame()
                        }
                    }
                    codec.releaseOutputBuffer(index, false)
                }
            }
        } catch (_: Exception) {
            // encoder torn down; loop exits
        }
    }

    private fun buildHello(screenW: Int, screenH: Int): String {
        val (net, bars) = networkState()
        val sb = StringBuilder()
        sb.append("""{"type":"hello",""")
        // Stable per-device id (ANDROID_ID) so the desktop keeps ONE tile
        // across reconnects instead of spawning a phantom duplicate.
        sb.append(""""deviceId":${jsonStr(androidId())},""")
        // The name the user set in the app (Settings → Phone name); the desktop
        // shows it, so renaming on the handset syncs across.
        sb.append(""""name":${jsonStr(displayName())},""")
        sb.append(""""model":${jsonStr(Build.MODEL)},""")
        sb.append(""""manufacturer":${jsonStr(Build.MANUFACTURER)},""")
        sb.append(""""androidVersion":${jsonStr(Build.VERSION.RELEASE)},""")
        sb.append(""""width":$screenW,"height":$screenH,""")
        sb.append(""""battery":${batteryPercent()},"charging":${isCharging()},""")
        sb.append(""""network":${jsonStr(net)},""")
        sb.append(""""canRotate":${canRotate()},""")
        if (bars != null) sb.append(""""signal":$bars,""")
        sb.append(""""screenLocked":${!isScreenOn()}}""")
        return sb.toString()
    }

    /** Live stats the desktop shows: battery, charging, signal bars, and the name. */
    private fun buildStatus(): String {
        val (net, bars) = networkState()
        val sb = StringBuilder()
        sb.append("""{"type":"status",""")
        sb.append(""""battery":${batteryPercent()},"charging":${isCharging()},""")
        // Carry the screen state on every tick, not just on the SCREEN_OFF/ON
        // broadcast. If a broadcast is ever missed the desktop would otherwise
        // stay stuck on a stale value and never alert again; this self-heals.
        sb.append(""""screenLocked":${!isScreenOn()},""")
        sb.append(""""name":${jsonStr(displayName())},""")
        sb.append(""""canRotate":${canRotate()},""")
        sb.append(""""network":${jsonStr(net)}""")
        if (bars != null) sb.append(""","signal":$bars""")
        sb.append("}")
        return sb.toString()
    }

    /** True while the display is on. */
    private fun isScreenOn(): Boolean = runCatching {
        (getSystemService(Context.POWER_SERVICE) as PowerManager).isInteractive
    }.getOrDefault(true)

    // ---- Rotation ----

    /**
     * Watch the real display and rebuild the capture whenever it changes shape.
     *
     * A VirtualDisplay has FIXED bounds, so when the phone rotates the mirror
     * keeps the old portrait frame and just letterboxes the landscape picture
     * inside it — the desktop would never receive a landscape image. Recreating
     * the VirtualDisplay + encoder at the new size makes the stream genuinely
     * follow the phone, and the fresh encoder emits a new codec-config frame so
     * the desktop's decoder re-sizes itself automatically.
     */
    private fun watchRotation() {
        if (rotationExec == null) rotationExec = Executors.newSingleThreadScheduledExecutor()
        if (displayListener != null) return
        val dm = getSystemService(Context.DISPLAY_SERVICE) as DisplayManager
        val listener = object : DisplayManager.DisplayListener {
            override fun onDisplayAdded(displayId: Int) {}
            override fun onDisplayRemoved(displayId: Int) {}
            override fun onDisplayChanged(displayId: Int) {
                if (displayId != Display.DEFAULT_DISPLAY) return
                // The metrics lag the event during the rotation animation, so
                // check twice: once now, once after it settles.
                scheduleRotationCheck(0)
                scheduleRotationCheck(400)
            }
        }
        runCatching { dm.registerDisplayListener(listener, Handler(Looper.getMainLooper())) }
            .onSuccess { displayListener = listener }
    }

    private fun stopWatchingRotation() {
        val listener = displayListener
        displayListener = null
        if (listener != null) {
            runCatching {
                (getSystemService(Context.DISPLAY_SERVICE) as DisplayManager).unregisterDisplayListener(listener)
            }
        }
        runCatching { rotationExec?.shutdownNow() }
        rotationExec = null
    }

    /** Never rebuild on the main thread — see [rebuildEncoder]. */
    private fun scheduleRotationCheck(delayMs: Long) {
        val exec = rotationExec ?: return
        runCatching { exec.schedule({ runCatching { checkRotation() } }, delayMs, TimeUnit.MILLISECONDS) }
    }

    /** onDisplayChanged also fires for brightness etc., so only act on a real resize. */
    private fun checkRotation() {
        if (!running) return
        val (w, h) = realScreenSize() ?: return
        if (w == screenW && h == screenH) return
        screenW = w
        screenH = h
        val (ew, eh) = scale(w, h, maxDim)
        rebuildEncoder(ew, eh)
    }

    /**
     * Swap the encoder + VirtualDisplay for new dimensions, keeping the socket
     * (and therefore the desktop's tile) alive.
     *
     * Only ever called off the main thread, and it stops the drain loop and
     * WAITS for that thread before releasing the codec: tearing a MediaCodec
     * down underneath a thread blocked in dequeueOutputBuffer kills the process.
     */
    private fun rebuildEncoder(w: Int, h: Int) {
        synchronized(rebuildLock) {
            running = false
            runCatching { drainThread?.join(600) }
            drainThread = null
            runCatching { virtualDisplay?.release() }
            runCatching { encoder?.stop() }
            runCatching { encoder?.release() }
            runCatching { inputSurface?.release() }
            virtualDisplay = null
            encoder = null
            inputSurface = null
            if (projection == null) return
            // A fresh encoder emits a new codec-config frame, so the desktop's
            // decoder re-sizes itself and the tile becomes landscape.
            runCatching { startEncoder(w, h, screenDpi) }
                .onFailure { CaptureState.set(CaptureState.ERROR, "Couldn’t follow the rotation") }
        }
    }

    /**
     * The real display size, INCLUDING the current rotation (so it swaps w/h in
     * landscape).
     *
     * Deliberately goes through DisplayManager rather than
     * WindowManager.currentWindowMetrics: this is a Service (a non-visual
     * context), where the window-metrics APIs are unreliable and can report the
     * un-rotated bounds — which is exactly why rotation went undetected and the
     * stream stayed portrait.
     */
    private fun realScreenSize(): Pair<Int, Int>? = runCatching {
        val dm = getSystemService(Context.DISPLAY_SERVICE) as DisplayManager
        val display = dm.getDisplay(Display.DEFAULT_DISPLAY) ?: return@runCatching null
        val m = DisplayMetrics()
        @Suppress("DEPRECATION")
        display.getRealMetrics(m)
        if (m.widthPixels <= 0 || m.heightPixels <= 0) null else m.widthPixels to m.heightPixels
    }.getOrNull()

    /** The desktop's Rotate button only works if the user granted WRITE_SETTINGS. */
    private fun canRotate(): Boolean = runCatching { Settings.System.canWrite(this) }.getOrDefault(false)

    /** Push battery / charging / signal / name to the desktop every 10s. */
    private fun startStatusUpdates() {
        stopStatusUpdates()
        val ex = Executors.newSingleThreadScheduledExecutor()
        statusTimer = ex
        ex.scheduleWithFixedDelay(
            {
                runCatching { streamer?.sendStatus(buildStatus()) }
                // Safety net: if a display event was ever missed, this notices the
                // shape changed and rebuilds anyway (off the main thread already).
                runCatching { checkRotation() }
            },
            5, 10, TimeUnit.SECONDS,
        )
    }

    private fun stopStatusUpdates() {
        runCatching { statusTimer?.shutdownNow() }
        statusTimer = null
    }

    private fun displayName(): String =
        getSharedPreferences("pm", MODE_PRIVATE).getString("deviceName", null)
            ?.takeIf { it.isNotBlank() } ?: Build.MODEL

    private fun isCharging(): Boolean = runCatching {
        val bm = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        bm.isCharging
    }.getOrDefault(false)

    /** The phone's uplink and its signal bars (0..4), or null bars if unknown. */
    private fun networkState(): Pair<String, Int?> = runCatching {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val active = cm.activeNetwork ?: return@runCatching "none" to null
        val caps = cm.getNetworkCapabilities(active) ?: return@runCatching "none" to null
        when {
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi" to wifiBars()
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cell" to cellBars(caps)
            else -> "none" to null
        }
    }.getOrDefault("none" to null)

    @Suppress("DEPRECATION")
    private fun wifiBars(): Int? = runCatching {
        val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        WifiManager.calculateSignalLevel(wm.connectionInfo.rssi, 5)
    }.getOrNull()

    /**
     * Cellular bars WITHOUT the READ_PHONE_STATE permission: NetworkCapabilities
     * carries the signal strength on Android 10+. When it isn't available we
     * report nothing rather than a misleading zero.
     */
    private fun cellBars(caps: NetworkCapabilities): Int? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return null
        val dbm = runCatching { caps.signalStrength }.getOrNull() ?: return null
        if (dbm == Int.MIN_VALUE || dbm >= 0) return null
        return when {
            dbm >= -85 -> 4
            dbm >= -95 -> 3
            dbm >= -105 -> 2
            dbm >= -115 -> 1
            else -> 0
        }
    }

    @Suppress("HardwareIds")
    private fun androidId(): String =
        runCatching {
            Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
        }.getOrNull().orEmpty()

    private fun batteryPercent(): Int {
        val bm = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        return bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
    }

    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "PhoneMonitor:capture").apply {
            setReferenceCounted(false)
            acquire(4 * 60 * 60 * 1000L) // 4h safety cap
        }
    }

    private fun buildNotification(text: String): Notification =
        Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("Phone Monitor")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_view)
            .setOngoing(true)
            .build()

    private fun startForegroundCompat(text: String) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Screen capture", NotificationManager.IMPORTANCE_LOW),
        )
        val notif = buildNotification(text)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        } else {
            startForeground(NOTIF_ID, notif)
        }
    }

    private fun updateNotification(text: String) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIF_ID, buildNotification(text))
    }

    /** Release capture/stream resources. Leaves the wake lock and UI state alone. */
    private fun teardownCapture() {
        running = false
        firstFrameSent = false
        stopStatusUpdates()
        stopWatchingRotation()
        runCatching { drainThread?.join(600) }
        drainThread = null
        runCatching { virtualDisplay?.release() }
        runCatching { encoder?.stop() }
        runCatching { encoder?.release() }
        runCatching { inputSurface?.release() }
        runCatching { projection?.stop() }
        virtualDisplay = null
        encoder = null
        inputSurface = null
        projection = null
        runCatching { streamer?.stop() }
        streamer = null
    }

    private fun stopCapture() {
        teardownCapture()
        everConnected = false
        runCatching { if (wakeLock?.isHeld == true) wakeLock?.release() }
        wakeLock = null
        CaptureState.set(CaptureState.IDLE, "Stopped")
    }

    override fun onDestroy() {
        if (receiverRegistered) {
            runCatching { unregisterReceiver(screenReceiver) }
            receiverRegistered = false
        }
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

    /** Map the "Monitor quality" choice to a longest-side cap and bitrate. */
    private fun applyQuality(quality: String) {
        when (quality) {
            "low" -> {
                maxDim = 720
                bitRate = 2_000_000
            }
            "high" -> {
                maxDim = 1280
                bitRate = 6_000_000
            }
            else -> {
                maxDim = 900
                bitRate = 3_000_000
            }
        }
    }

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
