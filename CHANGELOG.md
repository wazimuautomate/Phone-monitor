# Changelog

All notable changes to Phone Monitor are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

### Changed
- Removed the Screenshot and Disconnect-All header buttons; removed the Model/Android/Battery card footer to give screens more space.
- Settings drawer is now a single **horizontal bar**, and the **Columns** control is **Auto + a free number field** (the 1–6 preset buttons were removed).

### Notes
- Branch strategy: `feature` (all work) + `main` (tested-working only). APK is built in CI (the dev laptop has no Android Studio).
- Established the two-tier capture design (Tier 1 ADB/scrcpy, Tier 2 MediaProjection app) and the wireless-first, no-cloud architecture.

## [0.1.0] — 2026-07-14
- Initial repository bootstrap (Phase 0).
