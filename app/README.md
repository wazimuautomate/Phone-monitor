# Phone Monitor — Android capture app (Tier 2)

The view-only capture app for phones whose Developer Options are carrier-locked
(so ADB/scrcpy can't be used). It streams the screen to the desktop helper over Wi-Fi.

## Design

- **Capture:** `MediaProjection` → `MediaCodec` H.264 encoder (hardware, `Surface` input).
- **Transport:** OkHttp WebSocket → helper's `wifi-app` source. Same H.264 → WebCodecs
  decode path the dashboard uses for Tier-1.
- **Protocol:** a JSON `hello` text frame (model / Android version / battery / size),
  then binary frames = `[1 byte type: 0=config, 1=key, 2=delta] + H.264`.
- **Reliability:** foreground service (`mediaProjection` type), auto-reconnecting socket.
- **View-only:** a normal app cannot inject input into other apps (Android security
  boundary), so Tier-2 phones are viewable but not remotely controllable — a platform
  limit, not a project decision. See [../CLAUDE.md](../CLAUDE.md) §2.

## Project layout

```
app/                     Gradle root (rootProject "PhoneMonitorCapture")
├─ settings.gradle.kts
├─ build.gradle.kts
├─ gradle.properties
└─ capture/              the :capture application module
   ├─ build.gradle.kts   AGP 8.5.2 · Kotlin 1.9.24 · minSdk 26 · target 34
   └─ src/main/java/com/phonemonitor/capture/
      ├─ MainActivity.kt   helper URL + token, MediaProjection consent, start/stop
      ├─ CaptureService.kt foreground service: projection → encoder → drain loop
      └─ Streamer.kt        WebSocket streaming
```

## Building the APK (no Android Studio needed)

The dev laptop can't build Android, so the APK is built in **GitHub Actions**
(`.github/workflows/android.yml`) on every push that touches `app/**`.

To get it:
1. Open the repo's **Actions** tab → the latest **Android APK** run.
2. Download the **`phone-monitor-capture-debug`** artifact (a zip containing the APK).
3. Unzip and install the APK on the phone (`Install unknown apps` must be allowed).

## Using it (once installed)

1. Open **Phone Monitor Capture**.
2. Enter the helper address, e.g. `ws://<desktop-ip>:8787/app`, and the pairing token.
3. Tap **Start capturing** → grant the screen-capture prompt. The screen appears on
   the desktop dashboard tile.

## Staying alive in the background

The app keeps a **foreground service + partial wake lock** and prompts to be **exempted from
battery optimization**, so Android is far less likely to kill it while a screen is left streaming.
It also **auto-reconnects** to the helper (2s backoff) if the connection drops. The status —
Idle / Connecting / Streaming / Reconnecting — shows both in the app (color-coded) and the
ongoing notification.

> QR pairing (scan the helper's code instead of typing the address) is a later enhancement.
