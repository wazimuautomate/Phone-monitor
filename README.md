# Phone Monitor

Watch **and remotely control** all your Android phones from one beautiful desktop app — in real time, from the same room or across the internet. AnyDesk, but for your phones.

Phone Monitor is a **Windows desktop app** (`.exe`) paired with a small **Android agent app** (`.apk`). Each phone runs the agent, which streams its screen and accepts remote input; the desktop shows every phone as a live tile and lets you tap, swipe, type, and navigate any of them. Media is peer-to-peer and end-to-end encrypted — no cloud dashboard to host.

> **Direction & full plan:** see **[REBUILD-PLAN.md](REBUILD-PLAN.md)**. This is the v2 rebuild (desktop app + remote control); it supersedes the v1 "browser dashboard" design still referenced in some older docs.

## The two apps

| App | File | What it is |
|-----|------|------------|
| **Desktop** | `PhoneMonitor-<ver>-portable.exe` | The dashboard. Double-click to run — no install. Live grid of phones + AnyDesk-style focused control view. |
| **Agent** | `phone-monitor.apk` | Installed on each phone you want to monitor. Captures the screen (MediaProjection) and injects remote input (Accessibility). |

Both are produced by CI and attached to GitHub Releases (`desktop-latest`, `capture-latest`).

## How control works

- **View** — the agent encodes the screen to H.264 (hardware MediaCodec); the desktop decodes it with WebCodecs onto a canvas. Low-latency, hardware-accelerated on both ends.
- **Control** — the agent runs an **Accessibility Service**, so it can inject taps, swipes, Back/Home/Recents, notifications, volume, and text — no root, no ADB. This is exactly how AnyDesk/TeamViewer control Android. You enable it once on the phone.
- **Near or far** — on the same Wi-Fi it connects directly. For out-of-home access, a thin WebRTC signaling relay (`relay/`) brokers an end-to-end-encrypted peer connection *(remote path: in progress — LAN works today)*.
- **ADB turbo (optional)** — phones with Developer Options on the same LAN can also use scrcpy/ADB for the lowest-latency, fullest control *(planned)*.

## Architecture

```
Desktop app (Electron)                         Phone (Agent app)
┌─────────────────────────────────┐
│ React dashboard  (renderer)      │            MediaProjection → H.264 ─┐
│   H.264 → WebCodecs → canvas     │◀── view ───────────────────────────┤
│   focused view: click→tap,       │                                    │
│   drag→swipe, keys→text          │─── control ───────────────────────▶│ AccessibilityService
│        ⇅ localhost WebSocket     │    (tap/swipe/keys/text)            │ injects input
│ Embedded helper (Node)           │
│   • source manager (pluggable)   │            (LAN direct today;
│   • /ws dashboard  /app phones   │             WebRTC + relay for remote)
└─────────────────────────────────┘
```

## Layout

- `desktop/` — **Electron shell**. Starts the embedded helper and opens the window. Builds the portable `.exe`.
- `helper/` — Node + TypeScript real-time core. Serves the UI, ingests phone streams, relays video **and control**. Embeddable via `createHelper()`.
- `web/` — Vite + React + TypeScript dashboard (the desktop renderer).
- `app/` — Android (Kotlin) **Agent**: MediaProjection capture + `ControlService` (Accessibility) remote input.
- `relay/` — minimal WebRTC **signaling relay** for the remote (out-of-home) path. *(scaffold)*

## Use it (no build)

1. Download `PhoneMonitor-<ver>-portable.exe` from the `desktop-latest` release and double-click it.
2. On each phone, install `phone-monitor.apk` from the `capture-latest` release. Open it, tap **Start** (grant screen capture), and enable **Remote control** (Accessibility) when prompted.
3. Point the phone at the desktop's `ws://<desktop-lan-ip>:8787/app` address the app shows, on the same Wi-Fi. The phone appears as a live tile; click it to open the control view.

## Build from source

Requirements: **Node.js 20+**. (The Android APK is built in **GitHub Actions** — no local Android Studio needed.)

```bash
npm install

# Run the desktop app in dev (builds web + helper, bundles, launches Electron):
npm run start:desktop

# Build the distributable portable .exe (output: desktop/release/):
npm run dist:desktop
```

> **OneDrive note:** this project lives under a OneDrive-synced folder; OneDrive can fight with `node_modules`. If installs act strange, exclude the folder from sync.

## Status

Active v2 rebuild. **Working:** desktop app, live mirroring, and LAN remote control (AnyDesk-style). **Next:** WebRTC remote path (relay + pairing), ADB turbo, Controller mobile app. See [CHANGELOG.md](CHANGELOG.md) and [MEMORY.md](MEMORY.md) for detail, [REBUILD-PLAN.md](REBUILD-PLAN.md) for the roadmap.
