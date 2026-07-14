package com.phonemonitor.capture

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Context
import android.content.Intent
import android.graphics.Path
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.util.DisplayMetrics
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONObject

/**
 * AnyDesk-style remote control. The desktop sends control commands down the
 * (bidirectional) capture WebSocket; [CaptureService] parses them and forwards
 * them here, where we inject the matching input via the AccessibilityService
 * APIs — gestures (tap/swipe), global actions (back/home/…) and text entry.
 *
 * A normal app can't inject input, so this is a separate accessibility service
 * the user enables once in Settings. Coordinates arrive normalized 0..1 relative
 * to the full screen (origin top-left, x = right, y = down) and are mapped to the
 * real display size here.
 */
class ControlService : AccessibilityService() {

    companion object {
        @Volatile
        var instance: ControlService? = null
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
    }

    // We only inject input; incoming events are not needed.
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}

    override fun onInterrupt() {}

    override fun onUnbind(intent: Intent?): Boolean {
        instance = null
        return super.onUnbind(intent)
    }

    override fun onDestroy() {
        instance = null
        super.onDestroy()
    }

    /** Execute one control command from the desktop. Never throws. */
    fun perform(cmd: Control) {
        runCatching {
            when (cmd.action) {
                "tap" -> tap(cmd.x, cmd.y)
                "swipe" -> swipe(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.ms)
                "key" -> key(cmd.key)
                "text" -> text(cmd.text)
            }
        }
    }

    private fun tap(nx: Float, ny: Float) {
        val (w, h) = displaySize()
        val px = pxClamp(nx, w)
        val py = pxClamp(ny, h)
        // A tiny non-zero segment keeps the stroke from being a zero-length path
        // (which some devices reject) while still registering as a click.
        val path = Path().apply {
            moveTo(px, py)
            lineTo(px + 1f, py + 1f)
        }
        dispatch(path, 50L)
    }

    private fun swipe(nx1: Float, ny1: Float, nx2: Float, ny2: Float, ms: Long) {
        val (w, h) = displaySize()
        val sx = pxClamp(nx1, w)
        val sy = pxClamp(ny1, h)
        var ex = pxClamp(nx2, w)
        var ey = pxClamp(ny2, h)
        if (sx == ex && sy == ey) {
            ex += 1f
            ey += 1f
        }
        val path = Path().apply {
            moveTo(sx, sy)
            lineTo(ex, ey)
        }
        dispatch(path, ms.coerceIn(1L, 60_000L))
    }

    private fun dispatch(path: Path, durationMs: Long) {
        val stroke = GestureDescription.StrokeDescription(path, 0L, durationMs)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        dispatchGesture(gesture, null, null)
    }

    private fun key(name: String) {
        when (name) {
            "back" -> performGlobalAction(GLOBAL_ACTION_BACK)
            "home" -> performGlobalAction(GLOBAL_ACTION_HOME)
            "recents" -> performGlobalAction(GLOBAL_ACTION_RECENTS)
            "notifications" -> performGlobalAction(GLOBAL_ACTION_NOTIFICATIONS)
            "power" -> performGlobalAction(GLOBAL_ACTION_POWER_DIALOG)
            "voldown" -> adjustVolume(AudioManager.ADJUST_LOWER)
            "volup" -> adjustVolume(AudioManager.ADJUST_RAISE)
        }
    }

    private fun adjustVolume(direction: Int) {
        val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        am.adjustStreamVolume(AudioManager.STREAM_MUSIC, direction, AudioManager.FLAG_SHOW_UI)
    }

    /** Best-effort: append [s] to the currently focused editable field, if any. */
    private fun text(s: String) {
        if (s.isEmpty()) return
        val root = rootInActiveWindow ?: return
        val node = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT) ?: return
        if (!node.isEditable) return
        val existing = node.text?.toString() ?: ""
        val args = Bundle().apply {
            putCharSequence(
                AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                existing + s,
            )
        }
        node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
    }

    /** Real display size in pixels (full screen, including system bars). */
    private fun displaySize(): Pair<Int, Int> {
        val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val bounds = wm.currentWindowMetrics.bounds
            return bounds.width() to bounds.height()
        }
        val metrics = DisplayMetrics()
        @Suppress("DEPRECATION")
        wm.defaultDisplay.getRealMetrics(metrics)
        return metrics.widthPixels to metrics.heightPixels
    }

    /**
     * Normalized 0..1 → pixel. Leaves a 1px margin at the far edge so the +1px
     * nudge used for taps/degenerate swipes stays on-screen.
     */
    private fun pxClamp(norm: Float, size: Int): Float {
        if (size <= 1) return 0f
        return (norm.coerceIn(0f, 1f) * size).coerceIn(0f, (size - 2).toFloat())
    }
}

/**
 * One remote-control command. Coordinates are normalized 0..1.
 * Parsed from the desktop's `{"type":"control","cmd":{…}}` frame.
 */
data class Control(
    val action: String,
    val x: Float = 0f,
    val y: Float = 0f,
    val x1: Float = 0f,
    val y1: Float = 0f,
    val x2: Float = 0f,
    val y2: Float = 0f,
    val ms: Long = 200L,
    val key: String = "",
    val text: String = "",
) {
    companion object {
        /** Build a [Control] from a `cmd` JSON object; null if it has no action. */
        fun from(o: JSONObject): Control? {
            val action = o.optString("action", "")
            if (action.isEmpty()) return null
            return Control(
                action = action,
                x = o.optDouble("x", 0.0).toFloat(),
                y = o.optDouble("y", 0.0).toFloat(),
                x1 = o.optDouble("x1", 0.0).toFloat(),
                y1 = o.optDouble("y1", 0.0).toFloat(),
                x2 = o.optDouble("x2", 0.0).toFloat(),
                y2 = o.optDouble("y2", 0.0).toFloat(),
                ms = o.optLong("ms", 200L),
                key = o.optString("key", ""),
                text = o.optString("text", ""),
            )
        }
    }
}
