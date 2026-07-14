# Phone Monitor — Rebuild Plan (v2)

**Date:** 2026-07-14
**Status:** Approved direction, not yet built. This document supersedes the delivery/architecture decisions in `CLAUDE.md` §7 (which will be updated when we start executing).

---

## 0. Why we're replanning

The client saw the localhost demo and loved it — but the scope changed materially:

1. **Control, not just view** — he wants full **remote control of his phones, exactly like AnyDesk controls a laptop**: tap, swipe, type, navigate — from anywhere.
2. **Near *and* far** — control phones whether he's home on the same Wi-Fi or out of the house on a different network.
3. **His friends will use it too** — this becomes a shareable product, not a one-off local tool.
4. **All his phones have Developer Options enabled** — the old "carrier-locked / Tier-2-only" assumption is dead. But note: ADB *over the internet* is impractical/insecure, so remote control needs a different path than plain LAN ADB.
5. **Desktop installable app (.exe)** replaces the hosted web dashboard — for privacy, no hosting headaches, and easy install.
6. **Desktop app + mobile app**, both.
7. **UI is the hill we're judged on.** He is obsessed with a beautiful UI and highly values **real-time / low latency**. Backend correctness is our job; the UI must be something he *loves*, matching his reference mockup.

### Locked decisions (from the planning Q&A)

| Decision | Choice |
|---|---|
| **Remote connectivity** | **WebRTC P2P + relay fallback** — media is end-to-end encrypted, direct phone↔desktop when possible; a thin signaling server + a TURN server only help establish/relay the connection when NAT blocks a direct path. |
| **Mobile app** | **Both** — (a) an **on-device Agent** on each monitored phone (capture + control, connects out to the relay), and (b) a **Controller** client to watch/control phones from a phone. |
| **Desktop tech** | **Electron** (Chromium + Node) — best fit for the polished React UI, hardware WebCodecs decode, and bundling `adb`/scrcpy. Overrides the old "NOT Electron/Tauri" note. |
| **Users / accounts** | **v1 = standalone, single user (him), no accounts.** Monetization deferred: later add a **free tier (1 device)** and **accounts + billing**. |

---

## 1. Product in one paragraph

A beautiful Windows desktop app that shows a live grid of the user's Android phones and lets them **watch and remotely control every phone in real time — from the same room or across the country** — with an AnyDesk-style feel. Each phone runs a small companion app that streams its screen and accepts input. There's also a mobile Controller app for checking/controlling phones on the go. No web hosting to manage; connections are peer-to-peer and end-to-end encrypted, brokered by a minimal relay.

---

## 2. Architecture (v2)

```
                         ┌───────────────────────────────┐
                         │   Signaling + TURN relay        │   (tiny, always-on)
                         │   - pairing / connection broker │   media only relays
                         │   - TURN when P2P fails         │   when NAT blocks P2P
                         └──────────────┬────────────────┘
              WebRTC signaling (SDP/ICE)│  (no media in the happy path)
        ┌─────────────────────────────┐ │ ┌──────────────────────────────┐
        │  DESKTOP APP (Electron)      │ │ │  PHONE (Agent app)            │
        │  ┌────────────────────────┐  │ │ │  ┌────────────────────────┐  │
        │  │ Renderer (React UI)    │◄─┼─┼─┼─►│ MediaProjection → H.264 │  │  video track
        │  │  - phone grid          │  │ │ │  │  (MediaCodec, low-lat) │  │──────────────►
        │  │  - WebCodecs / <video> │  │ │ │  └────────────────────────┘  │
        │  │  - input capture       │──┼─┼─┼─►│ AccessibilityService     │  │  ◄──── input
        │  └────────────────────────┘  │ │ │  │  dispatchGesture / keys │  │  (data channel)
        │  ┌────────────────────────┐  │ │ │  └────────────────────────┘  │
        │  │ Main process (Node)    │  │ │ └──────────────────────────────┘
        │  │  - WebRTC peer(s)      │  │ │
        │  │  - LAN turbo: adb+scrcpy│ │ │ ┌──────────────────────────────┐
        │  │  - device registry/DB  │  │ │ │  CONTROLLER app (phone)       │
        │  └────────────────────────┘  │ │ │  same renderer UI, mobile     │
        └─────────────────────────────┘ └─│  shell → view/control on go   │
                                          └──────────────────────────────┘
```

### Two control paths (the key technical design)

Because his phones have Dev Options on, we get the **best of both**:

| Path | When | Capture | Control | Latency | Notes |
|---|---|---|---|---|---|
| **Agent (universal)** | Anywhere — home or remote | MediaProjection → H.264 | **Accessibility Service** (`dispatchGesture`, `performGlobalAction`, text into focused fields) | Low (WebRTC) | Works over the internet, no root, no ADB. This is the **AnyDesk model** on Android. |
| **ADB turbo (LAN)** | Same Wi-Fi only | scrcpy H.264 | `adb`/UiAutomator `input` | Lowest | Fuller, lowest-latency control when local. Optional enhancement, not required. |

The Agent is the **always-available baseline** (near and far). ADB is a **LAN turbo mode** the desktop opens automatically when the phone is reachable on the same network. Both feed the **same tile** in the UI — the dashboard doesn't care which path a phone uses (we keep the existing source-agnostic `DeviceSource` abstraction).

**Honest limitation:** Accessibility-based control gives tap, swipe, scroll, long-press, Back/Home/Recents, notifications, and text entry — the AnyDesk experience — but it is not 100% pixel-identical to a physical touch, and some secure screens (banking apps, keyguard) block MediaProjection capture and/or accessibility. We document this; ADB turbo closes most of the gap on the LAN.

### Why WebRTC is the right realtime backbone

- **NAT traversal for "far from home"** is built in (ICE/STUN/TURN) — solves remote access.
- **Adaptive resolution grid for free:** WebRTC **simulcast / SVC** lets each phone send a low-res layer for grid thumbnails and a high-res layer for the focused/fullscreen tile — this is exactly the "adaptive resolution is mandatory for scale" requirement, handled by the transport instead of hand-rolled.
- **Congestion control, jitter buffer, packet loss recovery** are built in → smooth realtime even on flaky networks, which is what he cares about.
- **Input over a data channel** — low-latency tap/swipe/key events on the same peer connection.
- **End-to-end encrypted (DTLS-SRTP)** — media never sits readable on our relay; privacy by default.

---

## 3. What we keep, rebuild, or drop

Grounded in the current repo:

### ✅ Keep (crown jewels — reuse directly)
- **Android capture pipeline** — `app/capture/.../CaptureService.kt` (MediaProjection → MediaCodec H.264, VirtualDisplay, foreground service, wake lock, battery-exemption prompt) and `Streamer.kt` (auto-reconnect, human-readable failure diagnostics, token auth). The **Agent app grows out of this**; we add Accessibility control + a WebRTC transport.
- **WebCodecs H.264 decoder** — `web/src/components/PhoneScreen.tsx` (SPS-parsed codec string, keyframe/delta handling, canvas render, `optimizeForLatency`). Reused in the Electron renderer for the ADB/scrcpy path and as a decode fallback.
- **Polished dashboard UI** — the whole `web/src/` React app the client loved: `Header`, `DeviceGrid`, `DeviceCard`, `SettingsDrawer`, `StatusBar`, `AlertToasts`, `lib/theme.ts`, `lib/icons.tsx`, brand palette, light/dark, drag-reorder, fullscreen, rename, hide/remove. **This becomes the Electron renderer**, then gets the UX/animation polish pass he wants.
- **Source-agnostic core** — `helper/src/sources/` (`DeviceSource` interface, `SourceManager`) and the `ws-hub` protocol. Moves into the Electron **main process**; new sources = WebRTC-agent source, ADB/scrcpy source.
- **Mock source** — invaluable for building the UI without hardware.
- **CI for the APK** — `.github/workflows/android.yml` (dev laptop has no Android Studio) stays essential; extends to build Agent + Controller APKs.

### 🔧 Rebuild / transform
- **`helper/` → Electron main process.** Same modules, now running inside the app instead of a separate Node server serving a browser. Add: WebRTC peer management, signaling client, SQLite device registry (nicknames/groups/pairing), ADB/scrcpy source (finally wire `@yume-chan` + bundled `adb`).
- **`web/` → Electron renderer.** Same React app, loaded by the shell instead of Vite-served to a browser. Swap the dashboard's WS-to-helper for IPC-to-main (or a localhost WS that main hosts — decide in Phase 1).
- **Agent app** = current capture app **+ AccessibilityService** (input injection) **+ WebRTC** (replace/augment the raw `/app` WebSocket) **+ pairing-by-code**.

### 🗑️ Drop / retire (no longer the delivery model)
- **Cloud-hosted dashboard**: `Dockerfile`, `render.yaml`, `HOSTING.md`, the dashboard **password login** (`LoginGate.tsx`, `ACCESS_TOKEN` gate). The desktop app replaces hosting; pairing replaces the password. (Keep the code in git history; don't carry it forward.)
- **Serving `web/dist` over Express** — the renderer is loaded by Electron now.

### ✨ New components to build
1. **Electron desktop shell** — window, tray, auto-update, native menus, installer (NSIS `.exe`), code signing (later).
2. **Signaling + TURN relay** — a small always-on service: brokers pairing codes and exchanges WebRTC SDP/ICE, runs a TURN (coturn or managed) for the ~10–20% of networks that can't connect P2P. **No media in the happy path.** Cheap to run; for v1 (just him) it can even run on a single small VPS.
3. **Pairing system** — phone shows/enters a short code (or QR) to bind to a desktop; keys stored locally. No accounts needed for v1.
4. **AccessibilityService** in the Agent — the input-injection engine (the AnyDesk piece).
5. **Controller mobile app** — the renderer UI wrapped in a mobile shell (Android first), talking WebRTC to the same phones.

---

## 4. Realtime & UI — the things he'll judge

**Realtime targets** (design goals, to verify with measurement):
- Grid thumbnails: low-res (e.g. 480p) low-FPS layer via simulcast; focused tile: full-res 30–60fps.
- Glass-to-glass latency goal: **< 150 ms on LAN, < 400 ms remote** (AnyDesk-class).
- Encoder: MediaCodec H.264 baseline/CBR, low-latency mode, keyframe-on-demand, adaptive bitrate driven by WebRTC feedback.
- Input round-trip: data channel, target **< 100 ms** so control *feels* live.

**UI plan** (his obsession — treat as a first-class deliverable):
- Keep the existing dark grid-of-cards that already matches his mockup; then a dedicated **UX polish pass**: smooth animations/transitions, refined typography and spacing, tasteful motion, an AnyDesk-style **focused-phone control view** (large screen + on-screen nav buttons, gesture cursor, keyboard capture), connection-quality indicators, and delightful empty/loading/error states.
- Light/dark already exists — keep and refine.
- Use the `dataviz`/`artifact-design` sensibilities for any stats/health screens.

---

## 5. Security & privacy model

- **E2E-encrypted media** (WebRTC DTLS-SRTP) — the relay never sees decrypted screens.
- **Pairing tokens / device keys** stored locally; a phone only streams to a paired desktop.
- **Explicit on-device consent** — MediaProjection and Accessibility both require the user to grant them on the phone (Android enforces this), which is also the honest privacy story for the client.
- **Relay is broker-only** by default; TURN relaying is encrypted pass-through.
- No user database in v1 → minimal attack surface and nothing sensitive for us to hold.

---

## 6. Monetization (deferred — do NOT build in v1)

Recorded so we design without painting ourselves into a corner:
- **v1:** free, single user (the client), unlimited his own devices — for testing/validation.
- **Later:** **free tier = 1 device**; paid unlocks more devices → then **accounts + billing**. This will require the relay to gain lightweight auth and a licensing check. Keep the pairing/relay layer clean so accounts slot in without a rewrite.

---

## 7. Rebuild roadmap (phased, incremental, de-risked)

Each phase ends **working and demoable**. We prove control **locally first**, then add remote — so we never block on relay infra to show progress.

- **R0 — Foundations & brain update** — ✅ **DONE**
  Update `CLAUDE.md` (§7 reversed decisions, new architecture), `MEMORY.md`, `CHANGELOG.md`. Stand up the Electron shell loading the existing React UI (mock source) → the beautiful dashboard runs as a real `.exe`. *Demo: the app he loved, now installable.*

- **R1 — LAN control spike (AnyDesk feel, local)** — ✅ **DONE (confirmed on a real phone, 2026-07-15)**
  Add the AccessibilityService to the Agent; wire MediaProjection→H.264 and input over a **direct LAN connection** (reuse current WS transport first). One phone: live screen **+ working tap/swipe/back/home** from the desktop. *Demo: control a phone in the same room.* Note: UI polish deferred by client; several first-real-phone bugs fixed (see CHANGELOG). This is **LAN-only** — remote is R2/R3 (see `CONNECTIVITY.md`).

- **R2 — WebRTC transport** — ⏭ **NEXT (see `CONNECTIVITY.md`)**
  Replace/augment the LAN WS with WebRTC (media track + input data channel), **still on the LAN** (host-candidate only, no relay yet). Prove the realtime pipeline and simulcast layers. *Demo: same control, now over WebRTC.*

- **R3 — Remote (relay + pairing)**
  Stand up the signaling + TURN relay; add pairing-by-code. Control a phone **from a different network**. *Demo: the headline feature — control his phone from outside the house.*

- **R4 — Multi-grid at scale**
  N phones, simulcast-driven adaptive thumbnails vs. focused full-res, virtualized grid, capability/quality badges, auto-reconnect. *Demo: 6+ phones live and controllable.*

- **R5 — ADB turbo (LAN)**
  Wire `@yume-chan` ADB + scrcpy + bundled `adb`; desktop auto-detects LAN phones and upgrades them to lowest-latency full control. *Demo: local phones get the premium path automatically.*

- **R6 — Management & persistence**
  SQLite: nicknames, groups, layouts, pairing store, health/stats history.

- **R7 — UX polish pass (the "he loves it" milestone)**
  Focused control view, animations, connection-quality UI, screenshot/record, layouts, onboarding. Dedicated design investment.

- **R8 — Controller mobile app**
  Renderer UI in a mobile shell (Android first) → view/control on the go.

- **R9 — Resilience & alerts**
  Offline/low-battery/new-device/lock alerts, auto-reconnect with fallback (Agent ↔ ADB), background reliability.

- **R10 — Productization (when validated)**
  Free-tier device limit, accounts + billing, code signing + auto-update, installers for more OSes if wanted.

---

## 8. Open questions (not blocking the plan; answer before the relevant phase)

1. **Windows only, or also macOS/Linux desktop?** (Electron makes cross-platform cheap; Windows-first assumed.)
2. **Controller mobile app: Android only, or iOS too?** (Agent is Android-only by nature; the Controller could be iOS too — more work.)
3. **Relay hosting for the test phase:** cheap VPS we run (simplest) vs. his own box. Even v1 remote needs *one* small always-on server + TURN.
4. **Text input fidelity:** how much full-keyboard typing does he need remotely (Accessibility text entry vs. ADB `input text`)? Affects how hard we push the ADB turbo path.
5. **Recording/screenshots to disk** (the mockup shows "Screen Recordings", "Screenshots", "Storage Used") — confirm these are in scope for R7 and where files live.
6. **Secure-screen behavior** — acceptable that banking/keyguard screens may show black (Android's `FLAG_SECURE`)? Standard for all such tools; just set expectations.

---

## 9. Where we are (updated 2026-07-15)

**Done:** R0 (Electron `.exe` + brain) and R1 (LAN view **+** AnyDesk-style control) — **confirmed on a real phone**. UI polish is deliberately deferred; the focus is logic robustness.

**Current limitation:** connection is **LAN-only** (the connect link is a private `192.168.x.x` address). See **`CONNECTIVITY.md`** for the full explanation and the remote plan.

**Next milestone — R2/R3, remote access:** one adaptive path = WebRTC (LAN-direct → P2P internet → TURN fallback) brokered by the thin `relay/` + pairing codes. Open decision for the client: build the proper WebRTC path, or ship a quick **cloud dumb-relay** interim first (works anywhere immediately, but routes all video through the server). No decision made yet.
