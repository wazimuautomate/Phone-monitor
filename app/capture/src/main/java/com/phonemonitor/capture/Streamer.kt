package com.phonemonitor.capture

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import java.util.concurrent.TimeUnit

/**
 * Streams H.264 to the helper over a WebSocket.
 *
 * Protocol:
 *   1. a JSON "hello" text frame (device model/version/battery/size)
 *   2. binary frames, each = [1 byte type: 0=config, 1=key, 2=delta] + H.264 bytes
 *
 * One WebSocket == one device, so the helper identifies the device by connection.
 */
class Streamer(
    private val url: String,
    private val token: String,
    private val hello: String,
) {
    private val client = OkHttpClient.Builder()
        .pingInterval(10, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    @Volatile private var ws: WebSocket? = null
    @Volatile private var open = false

    fun start() {
        val request = Request.Builder()
            .url(url)
            .addHeader("x-pm-token", token)
            .build()
        ws = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                open = true
                webSocket.send(hello)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                open = false
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                open = false
            }
        })
    }

    fun sendFrame(type: Int, data: ByteArray) {
        val socket = ws ?: return
        if (!open) return
        val out = ByteArray(data.size + 1)
        out[0] = type.toByte()
        System.arraycopy(data, 0, out, 1, data.size)
        socket.send(ByteString.of(*out))
    }

    fun stop() {
        open = false
        runCatching { ws?.close(1000, "bye") }
        ws = null
    }
}
