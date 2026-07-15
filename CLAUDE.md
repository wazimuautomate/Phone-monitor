# CLAUDE.md — Project Brain & Instructions

This file is the source of truth for anyone (human or AI) working on Phone Monitor.
Read it first. Keep it accurate.

---

## ⚠️ v2 PIVOT (2026-07-14) — read `REBUILD-PLAN.md` first

The scope changed after the client saw the v1 demo. The **full v2 plan is in `REBUILD-PLAN.md`** (the authoritative direction). Key reversals to the decisions written further down this file:

- **Delivery is now an Electron desktop app (`.exe`), NOT a hosted web dashboard.** This reverses "§7 · NOT Electron/Tauri" and "§1 · everything local, no cloud". Cloud hosting (Docker/Render/`HOSTING.md`, dashboard password) is retired.
- **Remote control is now core (AnyDesk-style), near *and* far.** Transport: WebRTC P2P + a thin signaling/TURN relay (`relay/`). LAN path works today; remote is the next milestone.
- **All the client's phones have Developer Options ON** — the "Tier-2 only / carrier-locked" assumption is dead. The Android **Agent** app captures via MediaProjection **and injects input via an AccessibilityService** (`app/…/ControlService.kt`). ADB/scrcpy is an optional LAN "turbo" path.
- **Mobile = both** an on-device Agent and a Controller app (Controller is later).
- **v2 layout adds** `desktop/` (Electron shell) and `relay/` (signaling) workspaces.

The sections below are the original v1 brain, kept for context; where they conflict with the above, the above wins.

---

## 0. Working agreement (read every session)

- **This is an autonomous, continuous build.** Build → test → fix errors → enhance → continue, one phase at a time. Don't stop at the first working piece; keep going until the phase is complete.
- **After every meaningful change or execution:** update `MEMORY.md` (what was done) and `CHANGELOG.md` (what changed), then **commit and push to GitHub** — in the same commit.
- **Branch discipline:**
  - `feature` — ALL work is pushed here, including in-progress / not-yet-verified code.
  - `main` — ONLY code that has been built and tested working is merged here.
  - Never push unverified work straight to `main`.
- **The dev laptop has NO Android Studio (low-spec machine).** The Android capture app (`app/`) therefore **cannot be built or run locally**. It is **built in CI via GitHub Actions**; the owner downloads the produced APK artifact and installs it on phones to test. Design and CI accordingly.
- **UI target:** a simple, minimal dashboard matching the reference mockup — a dark grid of phone cards (each: live screen, "Live" badge, name, Model / Android / Battery), a header with the connected-device count + actions (Refresh, Screenshot, Settings, Disconnect All), and a bottom status bar. Clean, not busy.

---

## 1. What this is

A real-time dashboard that mirrors many of the owner's Android phones on one desktop screen. **View-only first**, remote control later. Must feel **real-time / low-latency, not laggy**, and must **scale well past 6 devices**. Everything runs locally — no cloud.

The phones live in the owner's bedroom on chargers; the desktop is in a separate room on the same Wi-Fi.

## 2. The core design: two-tier, source-agnostic

Not every phone can use ADB (some are pay-as-you-go units with **carrier-locked Developer Options** — confirmed the 7-tap Build Number trick does nothing). So capture is split into two tiers, and the helper is **source-agnostic**: it manages a list of *device sources*, each = a capture backend + a transport. The dashboard treats every tile identically.

| Tier | Backend | Transport | Needs | View | Control |
|------|---------|-----------|-------|:----:|:-------:|
| **1 — Control** | scrcpy | Wi-Fi ADB (wireless debugging) | Dev options on | ✅ | ✅ (later) |
| **2 — View** | MediaProjection (custom app) | Wi-Fi WebSocket | App install only | ✅ | ❌ (Android forbids input injection from a normal app) |

Both tiers emit **H.264**, which flows to the browser and is decoded with **WebCodecs** (hardware) → canvas. One decode path for both tiers.

## 3. Connection types (build in this order)

1. **Wi-Fi + ADB** (Tier 1) — MVP
2. **Wi-Fi + App / MediaProjection** (Tier 2) — MVP
3. **USB + ADB** — easy reliability fallback; also needed to enable Wi-Fi ADB on Android ≤10
4. **Internet + App (WebRTC + TURN)** — future, for phones off the LAN

Helper auto-selects the best available per device; user can override; on drop it retries then falls back and raises an alert.

## 4. Layout

```
phone-monitor/
├─ helper/     Node + TS: source manager, WS hub, stats, alerts, serves web build
│  └─ src/
│     ├─ index.ts               entry: http + ws + wiring
│     ├─ ws-hub.ts              browser<->helper WebSocket protocol
│     └─ sources/
│        ├─ types.ts            DeviceSource interface, Tier, DeviceInfo, VideoPacket
│        └─ source-manager.ts   registry + lifecycle of all device sources
├─ web/        Vite + React + TS: grid of live tiles
│  └─ src/
│     ├─ main.tsx
│     ├─ App.tsx
│     └─ lib/ws.ts              dashboard WebSocket client
├─ app/        Android (Kotlin) MediaProjection capture app  (Phase 2)
├─ CLAUDE.md  MEMORY.md  CHANGELOG.md  README.md
└─ package.json  (npm workspaces: helper, web)
```

## 5. Stack

- **Helper:** Node 20+, TypeScript (ESM), `express` (serve UI), `ws` (sockets). Phase 1 adds `@yume-chan/adb` + `@yume-chan/adb-server-node-tcp` + `@yume-chan/adb-scrcpy` and a bundled Google `adb`. Persistence: `better-sqlite3` (nicknames, groups, config) — added when Phase 4 needs it.
- **Web:** Vite + React + TypeScript; `@yume-chan/scrcpy-decoder-webcodecs` for decode. State via Zustand (added Phase 3). Styling stays minimal until the Phase 5 UX pass.
- **App:** Kotlin, MediaProjection + MediaCodec (H.264), OkHttp/Ktor WebSocket client, ZXing QR pairing, foreground service.

## 6. How to run (dev)

```bash
npm install
npm run dev     # helper + web together (concurrently)
```

Helper serves/relays; Vite dev server hosts the dashboard and proxies `/ws` to the helper.

## 7. Key decisions (do not silently reverse)

- **Wireless-first, no USB clutter.** USB is only a fallback / one-time enabler.
- **We DO build a mobile app**, but only as the Tier-2 view-only path. Tier-1 phones need no app.
- **Pure browser UI + local helper.** NOT Electron/Tauri (owner's choice).
- **Adaptive resolution** is mandatory for scale: low-res/low-FPS grid thumbnails, full-res only on the focused/fullscreen tile. Virtualize the grid.
- **Reuse, don't reinvent** capture/encode/decode: build on scrcpy + `@yume-chan/ya-webadb`. Reference Open STF / DeviceFarmer and ScreenStream.
- **Security:** helper binds to localhost; every app→helper connection requires a pairing token.
- **Unattended reliability:** chargers + "stay awake while charging" + auto-reconnect + offline alert.

## 8. Roadmap (phases)

- **0 — Scaffold** ✅ repo, docs, monorepo skeleton, helper+web hello-world link
- **1 — Tier-1 spike:** one unlocked phone live in the browser over Wi-Fi
- **2 — Tier-2 spike:** minimal capture app, one locked phone live in the browser
- **3 — Multi-grid:** N tiles, auto-discovery, adaptive thumbnails, capability badges
- **4 — Management:** nicknames, groups, health stats, persistence
- **5 — Focus & UX:** fullscreen, zoom, rotate, screenshot, layouts, dark/light theme
- **6 — Alerts & resilience:** disconnect / low-battery / new-device / lock alerts, auto-reconnect
- **7 — More connections:** USB+ADB, QR-pairing polish
- **8 — Remote control (Tier 1):** tap, swipe, keys, nav buttons, volume, power, clipboard
- **9 — Future:** recording, internet (WebRTC+TURN), macros, session replay, logs, permissions

## 9. Conventions

- TypeScript strict. ESM everywhere in the helper (`"type": "module"`).
- Keep the tier/transport split behind the `DeviceSource` interface — new connection types are new implementations, not changes to the dashboard.
- Small, focused modules; match existing file style.
- After meaningful work: update **MEMORY.md** and **CHANGELOG.md** in the same commit.

## 10. Repo & CI

- GitHub: `wazimuautomate/Phone-monitor` (private), on account **wazimuautomate** (wazimuautomate@gmail.com) — separate from the owner's other GitHub account. Commit identity is set repo-locally to wazimuautomate.
- **Branches:** `feature` (all work) and `main` (tested-working only). See §0.
- **CI (GitHub Actions):**
  - `.github/workflows/ci.yml` — typechecks and builds `helper` + `web` on every push.
  - `.github/workflows/android.yml` — builds the Tier-2 capture-app **APK** and uploads it as a downloadable artifact (added in Phase 2, since the local machine can't build Android).
