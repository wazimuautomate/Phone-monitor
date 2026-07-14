# Changelog

All notable changes to Phone Monitor are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### v2 — Desktop app + AnyDesk-style remote control (in progress)

The project pivoted from a hosted browser dashboard to an **installable desktop app** with real **remote control** of phones. See `REBUILD-PLAN.md` for the full plan.

#### Added
- **Electron desktop app** (`desktop/`): a native Windows window that embeds the helper in-process and serves the dashboard locally, then points a Chromium window at it. Builds a **portable `.exe`** (`npm run dist:desktop`) — double-click to run, no install. Assets are bundled with esbuild (`desktop/scripts/build.mjs`); the helper ships as a single `build/helper.cjs`.
- **Remote control, end-to-end (AnyDesk-style):**
  - Android **Agent** gained `ControlService` (an AccessibilityService) that injects **tap, swipe, Back/Home/Recents/Notifications/Power, volume, and text** — no root, no ADB. The capture WebSocket is now **bidirectional** (desktop → phone control frames), and an in-app card lets the user enable the service.
  - Helper routes control: `/ws` accepts `{type:"control",deviceId,cmd}` and forwards to the owning source; `WifiAppSource.sendControl()` sends `{type:"control",cmd}` down the phone socket. New `ControlCmd` type (normalized 0..1 coordinates).
  - Dashboard gained an **AnyDesk-style focused control view**: click a phone to open a large live screen with on-screen nav buttons; click→tap, drag→swipe, wheel→scroll, keyboard→text — plus a UI polish pass.
- **WebRTC signaling relay** (`relay/`): a minimal broker (pairing codes + SDP/ICE relay, never touches media) for the future out-of-home path. TURN is documented, not yet implemented.
- **CI**: `desktop.yml` builds the Windows portable `.exe` on every push and publishes it to the `desktop-latest` release (mirrors `android.yml` → `capture-latest`).
- Helper `DeviceInfo` gained `width`/`height` (real screen px, for coordinate mapping) and `controllable`; the agent's `hello` now reports real display pixels.

#### Changed
- **Helper no longer depends on `express`** — a small built-in static server + `/health` replaces it, so the helper bundles cleanly into Electron. `index.ts` now exports `createHelper(options)` (embeddable) alongside its CLI bootstrap.
- Monorepo gained `desktop` and `relay` workspaces and root scripts `prepare:desktop` / `start:desktop` / `dist:desktop`.
- `CLAUDE.md` gained a v2-pivot banner; `README.md` rewritten around the desktop app + agent.

#### Retired
- Cloud hosting of the dashboard (Docker/Render/`HOSTING.md`, dashboard-password login) is superseded by the desktop app + peer-to-peer model.

---

### v1 (cloud-hosting era — superseded by v2 above)

### Added
- **Cloud hosting**: `Dockerfile`, `render.yaml`, and `HOSTING.md` (Railway/Render) so the dashboard runs remotely and phones connect from anywhere over `wss://`.
- **Dashboard password** (`ACCESS_TOKEN`) with a login screen gating the live connection; `APP_TOKEN` still gates phone streams.
- Hosted-aware **connect URL**: the dashboard shows `wss://<host>/app` when deployed (LAN address when local).
- Capture app: **"How to connect" instructions** on the main screen, plus a hint that pasting just the dashboard link works.
- Capture app: **Clear** button to wipe the recent-connections list (long-press still removes one).
- Dashboard: connection address is now **click-to-copy** (header, status bar, and Settings → "Connect app to") with a "Copied!" hint.

### Fixed
- Capture app **could not connect to a hosted helper**: the address the user typed was used verbatim, so a missing `/app` path (or a token pasted onto the URL) made every attempt drop with "Connection lost — reconnecting". The app now **normalizes the address**: adds `wss://` (or `ws://` for LAN), converts `http(s)://`→`ws(s)://`, appends `/app` when no path is given, and strips a stray `=token`/`?…`/space accidentally pasted into the URL. Pasting the plain dashboard link (`https://your-app.onrender.com`) now connects.
- Capture app now shows the **real failure reason** instead of a blanket "Connection lost — reconnecting": wrong token (401), wrong path/404, server waking (502/503/504), DNS/Wi-Fi ("can't find that address"), or TLS ("use wss://"). A clean server restart shows "Reconnecting…" (not an error).

### Changed
- **Phone token now travels as `?token=` query param as well as the `x-pm-token` header.** The dashboard's `/ws` already authenticates via query param and works through Cloudflare/Render; some proxies strip custom headers on the WebSocket upgrade, so the header alone could silently fail. `/app` now accepts the token from **either**, and rejects a bad one with a real **HTTP 401** (so the app can name the cause).
- **Helper keepalive**: pings every socket (dashboard + phones) every 30s and drops any that misses a pong, so half-open connections (phone lost Wi-Fi, laptop slept) are cleaned up and the dashboard reflects reality.
- Verified against the live Render deployment: a realistic 30fps stream (1877 frames / 3.5 MB) held for 75s with no drop — the hosting is stable; connection failures were client-side (address/token), which the new diagnostics now surface.

## [1.0.0] — 2026-07-14

### Added
- Project scaffold: npm-workspaces monorepo (`helper`, `web`, `app`).
- Project docs: `CLAUDE.md` (architecture & instructions), `MEMORY.md` (work log), `CHANGELOG.md`, `README.md`.
- Helper skeleton: source-agnostic `SourceManager`, `DeviceSource` types, browser WebSocket hub, static serving of the web build.
- Web dashboard skeleton: Vite + React + TS app that connects to the helper over WebSocket and shows connection status + device count.
- `app/` placeholder for the Phase-2 Android MediaProjection capture app.
- GitHub Actions CI (`ci.yml`) that typechecks and builds the desktop workspaces on every push.
- Mock device source (6 demo phones with live-updating stats) so the dashboard runs without any hardware (`MOCK=0` disables it).
- Full dashboard UI matching the reference mockup: header with live device count + actions, responsive phone-card grid (Live badge, synthetic screen, Model/Android/Battery footer), and a bottom status bar. Dark theme.
- `{type:"list"}` refresh message in the browser ↔ helper protocol.
- `.gitattributes` for LF line-ending normalization.
- Android capture app (Tier 2): MediaProjection → H.264 (MediaCodec) → WebSocket streaming, with a minimal helper-address/token UI and a foreground service.
- `android.yml` GitHub Actions workflow that builds a downloadable debug APK artifact (the dev laptop has no Android Studio).
- Helper `/app` WebSocket ingest (`WifiAppSource`) + browser **WebCodecs** H.264 decode → live Tier-2 mirroring end-to-end. Helper now binds `0.0.0.0` and prints the LAN app URL.
- Settings panel: choose grid **columns per row** (Auto/1–6), persisted.
- Refresh button re-syncs the device list with visual feedback.
- APK also published to a **GitHub Release** (`capture-latest`) for easy download, not just as a CI artifact.
- Dashboard redesign: emoji-free **SVG icon set**, brand logo + **favicon**, 5-color palette, and a **light/dark theme** toggle.
- Per-device **rename** (pen icon), and a per-device menu to **Hide** (with a status-bar tray to restore) or **Remove** (disconnects it).
- **Immersive fullscreen** mode (hides header + status bar; floating ✕ / Esc to exit).
- **Settings drawer** (sticky, slides from top): grid columns (Auto=4 / 1–6), **drag-reorder** with green snapping lines, and **add/remove demo devices**.
- The **capture-app connection URL** (+ token) is shown in the header and status bar via a new `server-info` message — no more hunting in the terminal.
- Capture-app redesign: **adaptive launcher icon** matching the site, Material3 dark UI in the palette, labeled inputs with placeholder hints, and a color-coded **connection status** (Idle/Connecting/Streaming/Reconnecting).
- Capture app now **auto-reconnects**, holds a **wake lock**, prompts for **battery-optimization exemption**, and survives task-swipe (`stopWithTask=false`) so it isn't killed while streaming in the background.
- **Real-time alerts** (toasts): **new-device**, **disconnect**, **low-battery** (≤20%), and **screen-lock** — color-coded and auto-dismissing. The helper distinguishes an intentional Remove from a real disconnect, and the capture app reports screen lock/unlock.
- Capture app **Recent connections**: remembers helper addresses — tap one to reconnect, long-press to remove — so you don't retype the address.

### Changed
- Removed the Screenshot and Disconnect-All header buttons; removed the Model/Android/Battery card footer to give screens more space.
- Settings drawer is now a single **horizontal bar**, and the **Columns** control is **Auto + a free number field** (the 1–6 preset buttons were removed).
- Capture app renamed to **Phone Monitor**; the release APK is now **`phone-monitor.apk`**.

### Fixed
- Capture-app notification no longer stays on "Starting…" — it shows **"Streaming this screen"** as soon as frames flow.

### Notes
- Branch strategy: `feature` (all work) + `main` (tested-working only). APK is built in CI (the dev laptop has no Android Studio).
- Established the two-tier capture design (Tier 1 ADB/scrcpy, Tier 2 MediaProjection app) and the wireless-first, no-cloud architecture.

## [0.1.0] — 2026-07-14
- Initial repository bootstrap (Phase 0).
