package com.tricreta.phonemonitor

import android.accessibilityservice.AccessibilityServiceInfo
import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.text.TextUtils
import android.util.DisplayMetrics
import android.view.View
import android.view.ViewGroup
import android.view.accessibility.AccessibilityManager
import android.view.animation.OvershootInterpolator
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.content.ContextCompat
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.google.android.material.button.MaterialButton
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import com.tricreta.phonemonitor.databinding.ActivityMainBinding
import com.tricreta.phonemonitor.databinding.ViewSplashBinding
import org.json.JSONArray
import org.json.JSONObject
import java.net.Inet4Address
import java.net.NetworkInterface

/**
 * Single-activity, four-tab shell (Home / Remote / History / Settings). One
 * activity hosts four page layouts and toggles their visibility from the bottom
 * nav — this keeps the MediaProjection consent launcher, accessibility checks and
 * connection history in one place.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var projectionManager: MediaProjectionManager
    private lateinit var prefs: SharedPreferences

    // What the pending MediaProjection consent will connect to once granted.
    private var pendingUrl: String = ""
    private var pendingToken: String = ""
    private var pendingRemote: Boolean = false

    // Human-readable address of the current/last target, for the status displays.
    private var lastTarget: String = ""

    private val notifPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { renderPermissions() }

    private val captureLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val data = result.data
            if (result.resultCode == Activity.RESULT_OK && data != null) {
                startCapture(result.resultCode, data)
            } else {
                CaptureState.set(CaptureState.ERROR, "Screen-capture permission denied")
            }
        }

    // Scans the desktop's pairing QR. ZXing handles the camera-permission prompt.
    private val scanLauncher =
        registerForActivityResult(ScanContract()) { result ->
            result.contents?.let { onQrScanned(it) }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        projectionManager = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        prefs = getSharedPreferences("pm", MODE_PRIVATE)

        setupNav()
        setupHome()
        setupRemote()
        setupHistory()
        setupSettings()

        // Prefill the connection inputs from what was used last time.
        binding.pageRemote.remoteHelperUrl.setText(prefs.getString("helperUrl", ""))
        binding.pageRemote.remoteToken.setText(prefs.getString("token", ""))
        binding.pageRemote.remoteRelayUrl.setText(prefs.getString("relayUrl", ""))
        binding.pageRemote.remoteRelayToken.setText(prefs.getString("relayToken", ""))

        renderHistory()
        renderCode(CaptureState.code)
        renderDeviceInfo()
        renderTheme(currentTheme())
        renderQuality(currentQuality())

        // Cold start only — not on rotation or a theme-driven recreate.
        if (savedInstanceState == null) {
            playSplash()
            // Asked here, NOT during the connect flow: a dialog racing the
            // screen-capture consent is what backgrounded us at the worst moment.
            ensureNotificationPermission()
            showLastCrashIfAny()
        }
    }

    override fun onResume() {
        super.onResume()
        CaptureState.listener = { state, msg -> runOnUiThread { renderStatus(state, msg) } }
        CaptureState.codeListener = { code -> runOnUiThread { renderCode(code) } }
        renderStatus(CaptureState.state, CaptureState.message)
        renderCode(CaptureState.code)
        renderControlStatus()
        renderPermissions()
        renderDeviceInfo()
    }

    override fun onPause() {
        super.onPause()
        CaptureState.listener = null
        CaptureState.codeListener = null
    }

    // ---- Splash ----

    /**
     * Cold-start splash: the app icon springs in over the themed background, the
     * name follows, then the whole overlay dissolves to reveal the UI already
     * built underneath. Drawn into the content root so it needs no second
     * activity and no splash theme — and it removes itself when done.
     */
    private fun playSplash() {
        val root = findViewById<ViewGroup>(android.R.id.content)
        val splash = ViewSplashBinding.inflate(layoutInflater, root, false)
        root.addView(splash.root)

        val logo = splash.splashLogo
        val name = splash.splashName

        logo.alpha = 0f
        logo.scaleX = 0.72f
        logo.scaleY = 0.72f
        name.alpha = 0f
        name.translationY = 12f * resources.displayMetrics.density

        logo.animate()
            .alpha(1f).scaleX(1f).scaleY(1f)
            .setDuration(460)
            .setInterpolator(OvershootInterpolator(1.6f))
            .start()
        name.animate()
            .alpha(1f).translationY(0f)
            .setStartDelay(160)
            .setDuration(320)
            .start()

        splash.root.postDelayed({
            if (isFinishing || isDestroyed) return@postDelayed
            logo.animate().scaleX(1.08f).scaleY(1.08f).setDuration(280).start()
            splash.root.animate()
                .alpha(0f)
                .setDuration(280)
                .withEndAction { root.removeView(splash.root) }
                .start()
        }, 900L)
    }

    // ---- Navigation ----

    private fun setupNav() {
        binding.bottomNav.setOnItemSelectedListener { item ->
            binding.pageHome.root.visibility = show(item.itemId == R.id.nav_home)
            binding.pageRemote.root.visibility = show(item.itemId == R.id.nav_remote)
            binding.pageHistory.root.visibility = show(item.itemId == R.id.nav_history)
            binding.pageSettings.root.visibility = show(item.itemId == R.id.nav_settings)
            true
        }
        binding.bottomNav.selectedItemId = R.id.nav_home
    }

    private fun show(visible: Boolean): Int = if (visible) View.VISIBLE else View.GONE

    // ---- Home ----

    private fun setupHome() {
        binding.pageHome.homeToggle.setOnClickListener { onToggleMonitoring() }
        binding.pageHome.homePhoneCard.setOnClickListener { renamePhone() }
    }

    private fun onToggleMonitoring() {
        val busy = CaptureState.state == CaptureState.STREAMING || CaptureState.state == CaptureState.CONNECTING
        if (busy) {
            stopMonitoring()
            return
        }
        when {
            binding.pageRemote.remoteHelperUrl.text.toString().isNotBlank() -> beginCapture(remote = false)
            binding.pageRemote.remoteRelayUrl.text.toString().isNotBlank() -> beginCapture(remote = true)
            else -> {
                binding.bottomNav.selectedItemId = R.id.nav_remote
                Toast.makeText(this, R.string.need_address, Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun stopMonitoring() {
        stopService(Intent(this, CaptureService::class.java))
        CaptureState.set(CaptureState.IDLE, "Stopped")
    }

    /**
     * If the app died last time, show why and let the user copy it. Beats
     * "it just closed" when the phone is in someone else's hands.
     */
    private fun showLastCrashIfAny() {
        val crash = prefs.getString("lastCrash", null)?.takeIf { it.isNotBlank() } ?: return
        prefs.edit().remove("lastCrash").apply()
        AlertDialog.Builder(this)
            .setTitle(R.string.crash_title)
            .setMessage(crash)
            .setPositiveButton(R.string.crash_copy) { _, _ ->
                runCatching {
                    val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                    cm.setPrimaryClip(ClipData.newPlainText("Phone Monitor crash", crash))
                    Toast.makeText(this, R.string.crash_copied, Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun renamePhone() {
        val input = EditText(this).apply {
            setText(deviceName())
            setSelection(text.length)
        }
        AlertDialog.Builder(this)
            .setTitle(R.string.rename_title)
            .setView(input)
            .setPositiveButton(R.string.save) { _, _ ->
                val name = input.text.toString().trim()
                if (name.isEmpty() || name == Build.MODEL) prefs.edit().remove("deviceName").apply()
                else prefs.edit().putString("deviceName", name).apply()
                renderDeviceInfo()
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    // ---- Remote (connect) ----

    private fun setupRemote() {
        binding.pageRemote.remoteConnectLocal.setOnClickListener { beginCapture(remote = false) }
        binding.pageRemote.remoteConnectRelay.setOnClickListener { beginCapture(remote = true) }
        binding.pageRemote.remoteDisconnect.setOnClickListener { stopMonitoring() }
        binding.pageRemote.remoteScanQr.setOnClickListener {
            scanLauncher.launch(
                ScanOptions()
                    .setPrompt(getString(R.string.scan_prompt))
                    .setBeepEnabled(false)
                    .setOrientationLocked(false)
                    .setDesiredBarcodeFormats(ScanOptions.QR_CODE),
            )
        }
    }

    /**
     * Handle a scanned pairing QR. Payload is JSON:
     *   relay path: {"v":1,"relay":"wss://…","relayToken":"…","code":"…"}
     *   LAN path:   {"v":1,"url":"ws://…/app","token":"…"}
     * A plain (non-JSON) string is treated as a LAN address. The relay path wins
     * when present — it works from anywhere, including on a full-tunnel VPN.
     */
    private fun onQrScanned(text: String) {
        val remote = binding.pageRemote
        try {
            val j = JSONObject(text)
            val relay = j.optString("relay").trim()
            val code = j.optString("code").trim()
            val url = j.optString("url").trim()
            when {
                relay.isNotEmpty() && code.isNotEmpty() -> {
                    remote.remoteRelayUrl.setText(relay)
                    remote.remoteRelayToken.setText(j.optString("relayToken"))
                    // Adopt the desktop's pairing code so we join its relay room.
                    prefs.edit().putString("remoteCode", code).apply()
                    binding.bottomNav.selectedItemId = R.id.nav_remote
                    beginCapture(remote = true)
                }
                url.isNotEmpty() -> {
                    remote.remoteHelperUrl.setText(url)
                    remote.remoteToken.setText(j.optString("token"))
                    binding.bottomNav.selectedItemId = R.id.nav_remote
                    beginCapture(remote = false)
                }
                else -> CaptureState.set(CaptureState.ERROR, getString(R.string.scan_bad))
            }
        } catch (_: Exception) {
            // Not JSON — assume it's a plain desktop address.
            remote.remoteHelperUrl.setText(text)
            binding.bottomNav.selectedItemId = R.id.nav_remote
            beginCapture(remote = false)
        }
    }

    /**
     * Kick off a capture. `remote=false` connects to the local desktop helper on the
     * LAN. `remote=true` connects OUTBOUND to the hosted relay, which assigns a
     * 9-digit code the user types on the desktop. The chosen URL/token/mode are
     * stashed so [startCapture] can use them once the consent dialog returns.
     */
    private fun beginCapture(remote: Boolean) {
        val url: String
        val token: String
        if (remote) {
            val base = normalizeRelayBase(binding.pageRemote.remoteRelayUrl.text.toString())
            if (base.isEmpty()) {
                CaptureState.set(CaptureState.ERROR, getString(R.string.relay_need_addr))
                return
            }
            if (base != binding.pageRemote.remoteRelayUrl.text.toString()) {
                binding.pageRemote.remoteRelayUrl.setText(base)
            }
            token = binding.pageRemote.remoteRelayToken.text.toString().trim()
            prefs.edit().putString("relayUrl", base).putString("relayToken", token).apply()

            // Connect to the relay's /agent endpoint; reclaim our previous code if we have one.
            var connect = "$base/agent"
            val savedCode = prefs.getString("remoteCode", "").orEmpty()
            if (savedCode.isNotEmpty()) connect += "?code=" + Uri.encode(savedCode)
            url = connect
            lastTarget = base
        } else {
            val u = normalizeHelperUrl(binding.pageRemote.remoteHelperUrl.text.toString())
            if (u.isEmpty()) {
                CaptureState.set(CaptureState.ERROR, getString(R.string.need_address))
                binding.bottomNav.selectedItemId = R.id.nav_remote
                return
            }
            if (u != binding.pageRemote.remoteHelperUrl.text.toString()) {
                binding.pageRemote.remoteHelperUrl.setText(u)
            }
            token = binding.pageRemote.remoteToken.text.toString().trim()
            prefs.edit().putString("helperUrl", u).putString("token", token).apply()
            addToHistory(u, token)
            renderHistory()
            url = u
            lastTarget = u
        }

        pendingUrl = url
        pendingToken = token
        pendingRemote = remote
        // Ask for NOTHING else here. Opening another screen (battery settings, a
        // permission dialog) can leave us in the background when the consent
        // result arrives, and startForegroundService() from the background throws
        // ForegroundServiceStartNotAllowedException — the app dies the instant the
        // user taps "Entire screen". Those prompts now happen once we're live.
        CaptureState.set(CaptureState.CONNECTING, "Requesting permission…")
        captureLauncher.launch(projectionManager.createScreenCaptureIntent())
    }

    /**
     * Turns whatever the user typed for the relay into a base "ws(s)://host[:port]"
     * (no path — we append /agent when connecting). Bare hosts default to wss://.
     */
    private fun normalizeRelayBase(raw: String): String {
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
        val cut = authority.indexOfFirst { it == ' ' || it == '=' || it == '?' }
        if (cut >= 0) authority = authority.substring(0, cut)

        return if (authority.isEmpty()) "" else scheme + authority
    }

    /**
     * Turns whatever the user typed into a connectable helper address. Accepts a
     * bare host, a dashboard link, or a full "wss://host/app", and always returns
     * "ws(s)://host[:port]/app".
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

    // ---- Status rendering ----

    private fun renderStatus(state: Int, msg: String) {
        val colorRes = when (state) {
            CaptureState.STREAMING -> R.color.pm_green
            CaptureState.CONNECTING -> R.color.pm_yellow
            CaptureState.ERROR -> R.color.pm_red
            else -> R.color.pm_muted
        }
        val color = ContextCompat.getColor(this, colorRes)
        val monitoring = state == CaptureState.STREAMING
        val connecting = state == CaptureState.CONNECTING
        val busy = monitoring || connecting

        // Header
        binding.headerStatusText.setText(
            when {
                monitoring -> R.string.hdr_connected
                connecting -> R.string.hdr_connecting
                else -> R.string.hdr_offline
            },
        )
        binding.headerStatusText.setTextColor(color)
        tintDot(binding.headerDot, color)

        // Home status card
        val home = binding.pageHome
        home.homeStatusHeadline.setText(
            when {
                monitoring -> R.string.status_monitoring
                connecting -> R.string.status_connecting
                else -> R.string.status_offline
            },
        )
        home.homeStatusHeadline.setTextColor(
            ContextCompat.getColor(
                this,
                when {
                    monitoring -> R.color.pm_green_bright
                    connecting -> R.color.pm_yellow
                    state == CaptureState.ERROR -> R.color.pm_red
                    else -> R.color.pm_text
                },
            ),
        )
        home.homeStatusSub.setText(
            when {
                monitoring -> R.string.home_sub_monitoring
                connecting -> R.string.home_sub_connecting
                else -> R.string.home_sub_offline
            },
        )
        tintDot(home.homeStatusDot, color)
        home.homeConnChip.visibility = if (busy && lastTarget.isNotEmpty()) View.VISIBLE else View.GONE
        home.homeConnUrl.text = lastTarget

        // Home monitor toggle
        home.homeToggle.setText(if (busy) R.string.stop_monitoring else R.string.start_monitoring)
        home.homeToggle.backgroundTintList = ColorStateList.valueOf(
            ContextCompat.getColor(this, if (busy) R.color.pm_red else R.color.pm_green),
        )
        home.homeToggle.setTextColor(
            ContextCompat.getColor(this, if (busy) R.color.pm_white else R.color.pm_black),
        )

        // Remote connection card
        val remote = binding.pageRemote
        remote.remoteStatusText.setText(
            when {
                monitoring -> R.string.connected
                connecting -> R.string.status_connecting
                else -> R.string.not_connected
            },
        )
        remote.remoteStatusText.setTextColor(color)
        tintDot(remote.remoteStatusDot, color)
        remote.remoteStatusUrl.text = if (busy && lastTarget.isNotEmpty()) lastTarget else getString(R.string.dash)
        remote.remoteDisconnect.visibility = if (busy) View.VISIBLE else View.GONE
        remote.remoteConnectLocal.isEnabled = !busy
        remote.remoteConnectRelay.isEnabled = !busy

        // Settings screen-capture chip reflects whether capture is active.
        renderChip(binding.pageSettings.setScreenChip, monitoring || connecting)
    }

    /** Show the relay-assigned code as "916 429 577"; muted placeholder until assigned. */
    private fun renderCode(code: String) {
        if (code.isEmpty()) {
            binding.pageRemote.remoteCodeText.text = getString(R.string.remote_code_placeholder)
            binding.pageRemote.remoteCodeText.setTextColor(ContextCompat.getColor(this, R.color.pm_muted))
        } else {
            binding.pageRemote.remoteCodeText.text = formatCode(code)
            binding.pageRemote.remoteCodeText.setTextColor(ContextCompat.getColor(this, R.color.pm_green))
        }
    }

    private fun formatCode(code: String): String =
        code.filter { it.isDigit() }.chunked(3).joinToString(" ")

    private fun tintDot(dot: View, color: Int) {
        dot.backgroundTintList = ColorStateList.valueOf(color)
    }

    // ---- Remote control (accessibility) ----

    private fun renderControlStatus() {
        // Remote control now lives only in Settings (its card was removed from
        // the Remote page).
        renderChip(binding.pageSettings.setRemoteChip, isControlEnabled())
    }

    /** True if our ControlService is in the system's enabled-accessibility list. */
    private fun isControlEnabled(): Boolean {
        val expected = ComponentName(this, ControlService::class.java)

        runCatching {
            val am = getSystemService(Context.ACCESSIBILITY_SERVICE) as AccessibilityManager
            for (info in am.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)) {
                val si = info.resolveInfo?.serviceInfo ?: continue
                if (si.packageName == expected.packageName && si.name == expected.className) return true
            }
        }

        val enabled = Settings.Secure.getString(
            contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
        ) ?: return false
        val flat = expected.flattenToString()
        val short = expected.flattenToShortString()
        val splitter = TextUtils.SimpleStringSplitter(':')
        splitter.setString(enabled)
        for (entry in splitter) {
            if (entry.equals(flat, ignoreCase = true) ||
                entry.equals(short, ignoreCase = true) ||
                ComponentName.unflattenFromString(entry) == expected
            ) {
                return true
            }
        }
        return false
    }

    private fun openAccessibilitySettings() {
        runCatching { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
    }

    /** Slide-up card explaining how to connect — stays in place (no nav jump). */
    private fun showHowToConnect() {
        val sheet = BottomSheetDialog(this)
        val view = layoutInflater.inflate(R.layout.sheet_how_to_connect, null)
        sheet.setContentView(view)
        view.findViewById<View>(R.id.howGotIt).setOnClickListener { sheet.dismiss() }
        sheet.show()
    }

    // ---- Settings ----

    private fun setupSettings() {
        val s = binding.pageSettings
        s.themeSystem.setOnClickListener { applyThemeChoice(App.THEME_SYSTEM) }
        s.themeLight.setOnClickListener { applyThemeChoice(App.THEME_LIGHT) }
        s.themeDark.setOnClickListener { applyThemeChoice(App.THEME_DARK) }

        s.qualLow.setOnClickListener { setQuality("low") }
        s.qualMed.setOnClickListener { setQuality("medium") }
        s.qualHigh.setOnClickListener { setQuality("high") }

        s.setRemoteRow.setOnClickListener { openAccessibilitySettings() }
        s.setBatteryRow.setOnClickListener { requestBatteryExemption() }
        s.setRotateRow.setOnClickListener { requestWriteSettings() }
        s.setNotifRow.setOnClickListener { onNotifRow() }
        s.setNameRow.setOnClickListener { renamePhone() }
        s.setHowRow.setOnClickListener { showHowToConnect() }
        s.setUpdateRow.setOnClickListener {
            val pending = pendingUpdate
            if (pending != null) startUpdateDownload(pending) else checkForUpdates()
        }

        // Show the real installed version instead of a hardcoded string.
        s.setVersionValue.text = "v" + BuildConfig.VERSION_NAME
    }

    // ---- In-app update ----

    private var updateBusy = false
    private var pendingUpdate: Updater.Update? = null

    private fun checkForUpdates() {
        if (updateBusy) return
        val s = binding.pageSettings
        if (BuildConfig.DEBUG) {
            s.setUpdateSub.setText(R.string.update_not_configured)
            return
        }
        updateBusy = true
        pendingUpdate = null
        s.setUpdateProgress.visibility = View.VISIBLE
        s.setUpdateSub.setText(R.string.update_checking)
        Thread {
            val result = Updater.check()
            runOnUiThread {
                updateBusy = false
                s.setUpdateProgress.visibility = View.GONE
                when (result) {
                    is Updater.Result.NotConfigured -> s.setUpdateSub.setText(R.string.update_not_configured)
                    is Updater.Result.UpToDate -> s.setUpdateSub.setText(R.string.update_uptodate)
                    is Updater.Result.Failed -> s.setUpdateSub.text = getString(R.string.update_failed, result.reason)
                    is Updater.Result.Available -> {
                        pendingUpdate = result.update
                        s.setUpdateSub.text = getString(R.string.update_available, result.update.versionName)
                    }
                }
            }
        }.start()
    }

    private fun startUpdateDownload(update: Updater.Update) {
        if (updateBusy) return
        updateBusy = true
        val s = binding.pageSettings
        s.setUpdateProgress.visibility = View.VISIBLE
        s.setUpdateSub.setText(R.string.update_downloading)
        Thread {
            val apk = Updater.download(this, update)
            runOnUiThread {
                updateBusy = false
                s.setUpdateProgress.visibility = View.GONE
                if (apk != null) {
                    // The system installer is the user's confirmation prompt.
                    runCatching { startActivity(Updater.installIntent(this, apk)) }
                        .onFailure { s.setUpdateSub.text = getString(R.string.update_failed, it.message ?: "install") }
                } else {
                    pendingUpdate = update // keep it so the user can retry
                    s.setUpdateSub.text = getString(R.string.update_failed, "download")
                }
            }
        }.start()
    }

    private fun currentTheme(): String = prefs.getString("themeMode", App.THEME_SYSTEM) ?: App.THEME_SYSTEM

    private fun applyThemeChoice(mode: String) {
        prefs.edit().putString("themeMode", mode).apply()
        renderTheme(mode)
        // Recreates the activity if the effective night mode changed.
        AppCompatDelegate.setDefaultNightMode(App.nightModeFor(mode))
    }

    private fun renderTheme(mode: String) {
        val s = binding.pageSettings
        selectSeg(
            when (mode) {
                App.THEME_LIGHT -> s.themeLight
                App.THEME_DARK -> s.themeDark
                else -> s.themeSystem
            },
            s.themeSystem, s.themeLight, s.themeDark,
        )
    }

    private fun currentQuality(): String = prefs.getString("quality", "medium") ?: "medium"

    private fun setQuality(quality: String) {
        prefs.edit().putString("quality", quality).apply()
        renderQuality(quality)
    }

    private fun renderQuality(quality: String) {
        val s = binding.pageSettings
        selectSeg(
            when (quality) {
                "low" -> s.qualLow
                "high" -> s.qualHigh
                else -> s.qualMed
            },
            s.qualLow, s.qualMed, s.qualHigh,
        )
    }

    /** Highlight one segment of a Low/Med/High-style control; mute the rest. */
    private fun selectSeg(selected: TextView, vararg all: TextView) {
        for (t in all) {
            val on = t === selected
            t.setBackgroundResource(if (on) R.drawable.bg_seg_selected else 0)
            t.setTextColor(ContextCompat.getColor(this, if (on) R.color.pm_black else R.color.pm_muted))
        }
    }

    private fun renderPermissions() {
        renderChip(binding.pageSettings.setRemoteChip, isControlEnabled())
        renderChip(binding.pageSettings.setBatteryChip, isIgnoringBattery())
        renderChip(binding.pageSettings.setRotateChip, canWriteSettings())
        renderChip(binding.pageSettings.setNotifChip, notificationsEnabled())
        val active = CaptureState.state == CaptureState.STREAMING || CaptureState.state == CaptureState.CONNECTING
        renderChip(binding.pageSettings.setScreenChip, active)
    }

    /** Green "On" chip when [on], muted "Off" chip otherwise. */
    private fun renderChip(chip: TextView, on: Boolean) {
        chip.setText(if (on) R.string.on else R.string.off)
        chip.setBackgroundResource(if (on) R.drawable.chip_green else R.drawable.chip_muted)
        chip.setTextColor(ContextCompat.getColor(this, if (on) R.color.pm_green else R.color.pm_muted))
    }

    private fun isIgnoringBattery(): Boolean {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        return pm.isIgnoringBatteryOptimizations(packageName)
    }

    /** WRITE_SETTINGS — only used for the desktop's "rotate" control. */
    private fun canWriteSettings(): Boolean = runCatching { Settings.System.canWrite(this) }.getOrDefault(false)

    private fun requestWriteSettings() {
        runCatching {
            startActivity(
                Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS, Uri.parse("package:$packageName")),
            )
        }
    }

    private fun notificationsEnabled(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(this, android.Manifest.permission.POST_NOTIFICATIONS) ==
                PackageManager.PERMISSION_GRANTED
        } else {
            true
        }

    private fun onNotifRow() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !notificationsEnabled()) {
            notifPermission.launch(android.Manifest.permission.POST_NOTIFICATIONS)
        } else {
            runCatching {
                startActivity(
                    Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, packageName),
                )
            }
        }
    }

    // ---- This phone info ----

    private fun deviceName(): String = prefs.getString("deviceName", null)?.takeIf { it.isNotBlank() } ?: Build.MODEL

    private fun renderDeviceInfo() {
        binding.pageHome.homePhoneName.text = deviceName()
        binding.pageSettings.setNameValue.text = deviceName()
        binding.pageHome.homeIp.text = localIp() ?: getString(R.string.dash)
        binding.pageHome.homeBattery.text = batteryText()
    }

    private fun localIp(): String? = runCatching {
        for (intf in NetworkInterface.getNetworkInterfaces()) {
            for (addr in intf.inetAddresses) {
                if (!addr.isLoopbackAddress && addr is Inet4Address && addr.isSiteLocalAddress) {
                    return@runCatching addr.hostAddress
                }
            }
        }
        null
    }.getOrNull()

    private fun batteryText(): String {
        val bm = registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED)) ?: return getString(R.string.dash)
        val level = bm.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val scale = bm.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
        val status = bm.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
        if (level < 0 || scale <= 0) return getString(R.string.dash)
        val pct = level * 100 / scale
        val charging = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL
        return if (charging) "$pct%  •  ${getString(R.string.charging)}" else "$pct%"
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

    private fun setupHistory() {
        binding.pageHistory.historyClear.setOnClickListener { clearHistory() }
    }

    private fun clearHistory() {
        prefs.edit().remove("history").apply()
        renderHistory()
    }

    private fun renderHistory() {
        val list = loadHistory()
        val container = binding.pageHistory.historyListContainer
        container.removeAllViews()
        binding.pageHistory.historyEmpty.visibility = if (list.isEmpty()) View.VISIBLE else View.GONE
        binding.pageHistory.historyHint.visibility = if (list.isEmpty()) View.GONE else View.VISIBLE
        binding.pageHistory.historyClear.isEnabled = list.isNotEmpty()
        for ((url, token) in list) {
            val btn = layoutInflater.inflate(R.layout.history_item, container, false) as MaterialButton
            btn.text = url
            btn.setOnClickListener {
                binding.pageRemote.remoteHelperUrl.setText(url)
                binding.pageRemote.remoteToken.setText(token)
                beginCapture(remote = false)
            }
            btn.setOnLongClickListener {
                removeFromHistory(url)
                renderHistory()
                true
            }
            container.addView(btn)
        }
    }

    // ---- Permissions the capture needs ----

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
            putExtra(CaptureService.EXTRA_HELPER_URL, pendingUrl)
            putExtra(CaptureService.EXTRA_TOKEN, pendingToken)
            putExtra(CaptureService.EXTRA_REMOTE, pendingRemote)
            putExtra(CaptureService.EXTRA_QUALITY, currentQuality())
            putExtra(CaptureService.EXTRA_WIDTH, metrics.widthPixels)
            putExtra(CaptureService.EXTRA_HEIGHT, metrics.heightPixels)
            putExtra(CaptureService.EXTRA_DPI, metrics.densityDpi)
        }
        // Starting a foreground service can be refused (e.g. we somehow aren't in
        // the foreground any more). Report it instead of letting it kill the app
        // in front of whoever is watching.
        try {
            ContextCompat.startForegroundService(this, intent)
        } catch (e: Exception) {
            CaptureState.set(
                CaptureState.ERROR,
                "Couldn’t start monitoring: ${e.javaClass.simpleName}. Reopen the app and try again.",
            )
            return
        }
        CaptureState.set(
            CaptureState.CONNECTING,
            if (pendingRemote) "Connecting to relay…" else "Connecting to helper…",
        )

        // Now that the capture is live it's safe to send the user elsewhere; doing
        // this BEFORE the consent is what used to background us at the worst moment.
        binding.root.postDelayed({ if (!isFinishing && !isDestroyed) requestBatteryExemption() }, 1500)
    }
}
