# Phone Monitor

Watch all your Android phones live, on one desktop screen, in real time.

Phone Monitor is a local **browser dashboard** backed by a small **Node.js helper** on your PC. It mirrors every phone as a live tile — battery, model, connection quality, FPS, screenshot, and (for capable phones) remote control — all over your home Wi-Fi. No cloud, nothing leaves your machine.

![concept](docs/concept.png)

## How phones connect — two tiers, every phone covered

| Tier | For which phones | How it connects | View | Control |
|------|------------------|-----------------|:----:|:-------:|
| **1 — Control** | Phones whose Developer Options work | Wireless debugging (ADB/scrcpy) — no app | ✅ | ✅ *(later)* |
| **2 — View** | Phones with carrier-locked Developer Options | The **Phone Monitor** capture app (MediaProjection) | ✅ | ❌ |

Every phone shows up as an equal live tile. The only difference is that Tier-2 phones can't be *remotely controlled* — Android forbids a normal app from injecting taps into other apps. That's a platform limit, not a design choice.

## Architecture

```
Desktop (working room)                         Phones (bedroom, on chargers)
┌─────────────────────────────────┐
│ Browser dashboard (React)        │            Tier 1: adb/scrcpy ──┐
│   H.264 → WebCodecs → canvas     │◀── Wi-Fi ──────────────────────┤
│        ⇅ WebSocket               │                                 │
│ Local helper (Node.js)           │            Tier 2: capture app ─┘
│   • source manager (pluggable)   │◀── Wi-Fi ──  (MediaProjection→H.264)
│   • stats, alerts, persistence   │
│   • serves the dashboard         │
└─────────────────────────────────┘
```

- `helper/` — Node + TypeScript. Manages device sources, relays video, serves the UI.
- `web/` — Vite + React + TypeScript dashboard.
- `app/` — Android (Kotlin) capture app for Tier-2 phones. *(built in Phase 2)*

## Requirements

- **Node.js 20+** and **npm** on the desktop.
- **Android platform-tools (`adb`)** on PATH — for Tier-1 phones. *(added in Phase 1)*
- **JDK 17 + Android Studio** — only to build the capture app. *(Phase 2)*
- Phones and desktop on the **same Wi-Fi**.

> **OneDrive note:** this project currently lives under a OneDrive-synced folder. OneDrive can fight with `node_modules` (file locks, sync churn). If installs or dev servers act strange, move the project outside OneDrive or exclude the folder from sync.

## Run (development)

```bash
npm install            # installs helper + web workspaces
npm run dev            # starts the helper and the dashboard together
```

Then open the dashboard URL the helper prints (default `http://localhost:5173` in dev).

## Phone setup

- **Tier 1 (unlocked phones):** Settings → System → Developer options → **Wireless debugging** → on. Pair from the dashboard with the 6-digit code.
- **Tier 2 (locked phones):** install the Phone Monitor app, scan the QR the dashboard shows, tap **Start**. *(Phase 2)*

**Keep phones reachable while unattended:** leave them on chargers and enable "stay awake while charging" so they don't sleep and drop off Wi-Fi.

## Status

Early development. See [CHANGELOG.md](CHANGELOG.md) for what's built and [MEMORY.md](MEMORY.md) for the running work log. Build phases and conventions live in [CLAUDE.md](CLAUDE.md).
