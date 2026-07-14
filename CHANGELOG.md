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

### Notes
- Branch strategy: `feature` (all work) + `main` (tested-working only). APK is built in CI (the dev laptop has no Android Studio).
- Established the two-tier capture design (Tier 1 ADB/scrcpy, Tier 2 MediaProjection app) and the wireless-first, no-cloud architecture.

## [0.1.0] — 2026-07-14
- Initial repository bootstrap (Phase 0).
