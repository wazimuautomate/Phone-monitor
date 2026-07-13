# MEMORY.md — Running Work Log

Newest first. One entry per work session: what was done, decisions made, and what's next.
(This is the project's own log — separate from any assistant memory.)

---

## 2026-07-14 — Phase 0: project bootstrap

**Done**
- Agreed the architecture after a design discussion (see CLAUDE.md §2–3):
  - Two-tier capture: Tier 1 = ADB/scrcpy over Wi-Fi for unlocked phones (view + future control); Tier 2 = a MediaProjection capture app for carrier-locked phones (view-only). Confirmed 3 of the owner's 6 phones are truly locked (7-tap does nothing).
  - Delivery = browser dashboard + local Node helper (not Electron). Video = H.264 → WebCodecs.
  - Multiple connection types planned; Wi-Fi ADB + Wi-Fi App are the MVP pair.
- Initialized git, repo-local identity `wazimuautomate`, remote `wazimuautomate/Phone-monitor`.
- Created monorepo scaffold: root `package.json` (npm workspaces helper+web), `.gitignore`.
- Wrote the four project docs: CLAUDE.md, MEMORY.md, CHANGELOG.md, README.md.
- Scaffolded `helper/` (source-agnostic skeleton: source-manager, ws-hub, types) and `web/` (Vite+React+TS dashboard that connects to the helper WS and reports device count).
- Added `app/` placeholder documenting the Phase-2 capture app.
- Validated: helper typechecks + builds, web builds (145 KB), helper boots and serves `/health` + the dashboard (HTTP 200).
- Added GitHub Actions CI (`.github/workflows/ci.yml`: typecheck + build on push to main/feature).
- Documented in CLAUDE.md §0: continuous build loop, update-docs-and-push-every-change, `feature`/`main` branch discipline, and APK-via-Actions (no Android Studio on the low-spec dev laptop).

**Environment**
- Desktop: Node v24.15.0, npm 11.7.0, git 2.53. Java NOT installed.
- **No Android Studio on the dev laptop (low spec)** — the capture app APK is built in GitHub Actions and downloaded for testing; it can't be built/run locally.
- Project lives under OneDrive — watch for node_modules sync friction.

**Next (Phase 1)**
- Ensure `adb` (platform-tools) is on PATH.
- Wire Tier-1: pair one unlocked phone via wireless debugging, launch scrcpy through the helper, relay H.264 to the browser, decode with WebCodecs → one live tile.
