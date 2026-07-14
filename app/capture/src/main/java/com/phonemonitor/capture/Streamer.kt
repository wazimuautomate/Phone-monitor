package com.phonemonitor.capture

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Streams H.264 to the helper over a WebSocket, auto-reconnecting on drop.
 *
 * Protocol:
 *   1. a JSON "hello" text frame (device model/version/battery/size)
 *   2. binary frames = [1 byte type: 0=config, 1=key, 2=delta] + H.264 bytes
 *
 * `onStatus` receives "open" | "error" | "closed".
 */
class Streamer(
    private val url: String,
    private val token: String,
    private val hello: String,
    private val onStatus: (String) -> Unit,
) {
    private val client = OkHttpClient.Builder()
        .pingInterval(10, TimeUnit.SECONDS)
        .build()

    private val scheduler = Executors.newSingleThreadScheduledExecutor()

    @Volatile private var ws: WebSocket? = null
    @Volatile private var open = false
    @Volatile private var stopped = false

    fun start() {
        connect()
    }

    private fun connect() {
        if (stopped) return
        val request = Request.Builder()
            .url(url)
            .addHeader("x-pm-token", token)
            .build()
        ws = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                open = true
                webSocket.send(hello)
                onStatus("open")
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                open = false
                onStatus("error")
                scheduleReconnect()
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                open = false
                onStatus("closed")
                scheduleReconnect()
            }
        })
    }

    private fun scheduleReconnect() {
        if (stopped) return
        try {
            scheduler.schedule({ connect() }, 2, TimeUnit.SECONDS)
        } catch (_: Exception) {
            /* scheduler shut down */
        }
    }

    fun sendFrame(type: Int, data: ByteArray): Boolean {
        val socket = ws ?: return false
        if (!open) return false
        val out = ByteArray(data.size + 1)
        out[0] = type.toByte()
        System.arraycopy(data, 0, out, 1, data.size)
        return socket.send(ByteString.of(*out))
    }

    /** Send a JSON status text frame (e.g. screen lock changes). */
    fun sendStatus(json: String) {
        val socket = ws ?: return
        if (open) socket.send(json)
    }

    fun stop() {
        stopped = true
        open = false
        runCatching { ws?.close(1000, "bye") }
        ws = null
        scheduler.shutdownNow()
    }
}
