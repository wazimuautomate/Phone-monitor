# Phone Monitor — Android capture app (Tier 2)

**Status: placeholder — built in Phase 2.**

This is the view-only capture app for phones whose Developer Options are carrier-locked
(so ADB/scrcpy can't be used). It streams the screen to the desktop helper over Wi-Fi.

## Planned design

- **Capture:** `MediaProjection` → `MediaCodec` H.264 encoder (hardware).
- **Transport:** WebSocket client → helper's `wifi-app` source. Same H.264 → WebCodecs
  decode path the dashboard already uses for Tier-1.
- **Pairing:** scan a QR the dashboard shows (helper address + one-time token).
- **Reliability:** foreground service, keep-alive, auto-reconnect.
- **Stats:** reports battery / model / Android version via normal Android APIs.

## Why view-only

A normal Android app cannot inject input into other apps (Android security boundary),
so Tier-2 phones can be viewed but not remotely controlled. This is a platform limit,
not a project decision. See [../CLAUDE.md](../CLAUDE.md) §2.

## Build (later)

Requires JDK 17 + Android Studio / Android SDK. Toolchain and Gradle project land in Phase 2.
