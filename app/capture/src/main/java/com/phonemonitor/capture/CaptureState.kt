package com.phonemonitor.capture

/** In-process capture status shared between the service and the activity UI. */
object CaptureState {
    const val IDLE = 0
    const val CONNECTING = 1
    const val STREAMING = 2
    const val ERROR = 3

    var state: Int = IDLE
        private set
    var message: String = "Idle"
        private set

    var listener: ((Int, String) -> Unit)? = null

    fun set(newState: Int, msg: String) {
        state = newState
        message = msg
        listener?.invoke(newState, msg)
    }
}
