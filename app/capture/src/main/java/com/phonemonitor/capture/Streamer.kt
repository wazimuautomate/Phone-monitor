package com.phonemonitor.capture

import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
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
 * `onStatus` receives "open", "closed", or "error: <human reason>".
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
            .url(requestUrl())
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
                onStatus("error: ${describeFailure(t, response)}")
                scheduleReconnect()
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                open = false
                onStatus("closed")
                scheduleReconnect()
            }
        })
    }

    /**
     * ws(s) URL with the token also carried as a ?token= query param — the same
     * mechanism the dashboard uses. Some proxies strip custom headers on the
     * WebSocket upgrade, so the header alone can silently fail; the query param
     * always survives. OkHttp needs an http(s) URL to build one, then we map back.
     */
    private fun requestUrl(): String {
        if (token.isEmpty()) return url
        val httpish = url.replaceFirst("wss://", "https://").replaceFirst("ws://", "http://")
        val built = httpish.toHttpUrlOrNull()?.newBuilder()
            ?.setQueryParameter("token", token)
            ?.build()
            ?.toString()
            ?: return url
        return built.replaceFirst("https://", "wss://").replaceFirst("http://", "ws://")
    }

    /** Turns an OkHttp failure into something the user can act on. */
    private fun describeFailure(t: Throwable, response: Response?): String {
        response?.let {
            return when (it.code) {
                401, 403 -> "wrong token (server said ${it.code})"
                404 -> "wrong address — check it ends with /app (404)"
                502, 503, 504 -> "server waking up or down (${it.code}) — retrying"
                else -> "server said HTTP ${it.code}"
            }
        }
        val msg = t.message ?: t.javaClass.simpleName
        return when {
            msg.contains("Unable to resolve host", true) -> "can’t find that address — check it and Wi-Fi"
            msg.contains("Failed to connect", true) ||
                msg.contains("timeout", true) -> "can’t reach the server — check address & Wi-Fi"
            msg.contains("CertPath", true) ||
                msg.contains("SSL", true) ||
                msg.contains("trust", true) -> "secure-connection problem — use wss:// (not ws://)"
            else -> msg
        }
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
