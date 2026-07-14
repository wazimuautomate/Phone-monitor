# MEMORY.md — Running Work Log

Newest first. One entry per work session: what was done, decisions made, and what's next.
(This is the project's own log — separate from any assistant memory.)

---

## 2026-07-14 — v1 last touch: notification, recent connections, naming, hosting

**Done (feature):**
- Notification now flips to **"Streaming this screen"** the instant the first frame is actually sent (definitive), in addition to on WS-open — fixes the stuck "Starting…". `Streamer.sendFrame` returns Boolean; `CaptureService` triggers `onFirstFrame()`.
- Capture app **Recent connections**: saved helper address+token history (max 5) in prefs; **tap to fill + connect immediately**, long-press to remove. No more retyping.
- App label renamed to **"Phone Monitor"**; CI publishes the APK as **`phone-monitor.apk`** (deletes the old `phone-monitor-capture.apk` asset).
- Docs: hosting guidance added.

**Verification** — mobile via CI; web/helper unchanged.

**Hosting decision (recorded):** the dashboard is served by the **local helper** (`npm run build && npm start` → `http://localhost:8787`, LAN-reachable). **Vercel is NOT suitable** for the core — it would host only the static UI, which is useless without the helper on the LAN; a hosted UI needs the helper exposed via tunnel + auth (the future internet-remote feature).

---

## 2026-07-14 — v1 finish: Alerts + settings layout fix

**Done (feature):**
- **Alerts** — toast notifications (top-right, auto-dismiss, color-coded):
  - **New device** (green): a device connects after initial load (app connect / add demo).
  - **Disconnect** (red): a device drops unexpectedly. Helper tags `removed` with `reason` = `user` vs `disconnect`; user Remove / Remove-demo stay silent.
  - **Low battery** (yellow): battery ≤ 20% (once per crossing, reset > 23%).
  - **Screen lock** (yellow): app reports SCREEN_OFF / USER_PRESENT → helper `screenLocked` stat → toast.
- **Settings drawer** relaid out **horizontally** (single flex bar). **Columns** is now **Auto + a free number field**; removed the 1–6 preset buttons.
- Helper: `removed` carries `reason`; `WifiAppSource` handles `{type:"status",screenLocked}`; `DeviceInfo.screenLocked` added.
- Mobile: `CaptureService` registers a screen on/off receiver → `Streamer.sendStatus`; hello includes `screenLocked:false`.

**Verified** — helper + web build clean; WS test PASS (app device + `screenLocked` stat + disconnect `reason`). Toast rendering build-verified; mobile via CI.

**Next** — user tests v1 (redesigned dashboard + new APK); then merge the whole pass to `main`.

---

## 2026-07-14 — Enhancement pass A: mobile app redesign

**Done (feature):**
- App icon: adaptive `ic_launcher` (vector foreground matching the site logo — green phone + red live dot on black); no binary assets, works because minSdk 26.
- Material3 **dark theme** in the 5-color palette (`colors.xml`, `themes.xml`).
- Redesigned `activity_main.xml`: logo + title, OutlinedBox text fields with placeholder hints for helper address + token, green Start / red outlined Stop, color-coded status dot + text.
- `CaptureState` singleton drives live status (Idle/Connecting/Streaming/Error) into the UI and the notification.
- `Streamer` **auto-reconnects** (2s backoff) and reports status.
- Background resilience: `WAKE_LOCK` partial lock while capturing, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` prompt, `stopWithTask="false"`, foreground notification updated with status.

**Verification** — can't build Android locally; CI (android.yml) is the test. Watching for green, then updates the `capture-latest` release APK.

---

## 2026-07-14 — Enhancement pass A: desktop redesign (real-phone confirmed ✅)

Owner tested Phase 2 on a real locked phone — **it works**. Phase 2 merged to `main` as baseline.

**Desktop redesign (on feature):**
- Removed all emoji → SVG icon set (`lib/icons.tsx`) + brand Logo + **favicon** (`public/icon.svg`).
- 5-color palette (#E51219 / #2FA44A / #EFDB16 / #FFF / #000) + **light/dark theme** toggle (`lib/theme.ts`, persisted).
- Header: icon buttons (Refresh / Theme / Fullscreen / Settings); dropped Screenshot + Disconnect All; shows the **capture-app connection URL** (+token tag) from the new `server-info` message.
- Cards: removed Model/Android/Battery footer, slimmed to maximize screen; **rename via pen** (persisted nickname); per-device **menu → Hide / Remove**.
- **Immersive fullscreen**: hides header + status bar; floating ✕ / Esc to exit; also requests browser fullscreen.
- **Sticky settings drawer** (slides from top): columns Auto(=4)/1–6, **reorder toggle**, **add/remove demo devices**, connect-URL list.
- **Drag-reorder** with **green snapping lines**; order persisted. Hidden devices → status-bar "N hidden" tray to restore.
- Helper: `server-info` (LAN app URLs + tokenRequired) + `remove` / `mock-add` / `mock-remove` commands.

**Verified** — helper + web typecheck/build clean; WS test PASS (server-info delivered, mock-add adds a device, remove disconnects one).

**Next** — mobile app redesign (icon, palette, inputs, status, background/wake-lock permissions), then CI APK.

---

## 2026-07-14 — Phase 2d complete: end-to-end app→dashboard + settings + release

**Done**
- Helper `WifiAppSource` (WS ingest at `/app`): token check, `hello` → registers a Tier-2 device, binary `[type + H.264]` → video packets. `index.ts` routes `/ws` (browser) vs `/app` (app) on one HTTP server, binds `0.0.0.0` so phones can reach it, and logs the LAN `ws://…/app` URL. `ws-hub` forwards video to the browser as `[type][idLen][deviceId][H.264]`.
- Browser: `video-bus` pub/sub, `ws.ts` routes binary frames, `PhoneScreen` decodes H.264 via **WebCodecs** onto a canvas (codec string parsed from SPS; SPS/PPS prepended to each keyframe), falling back to the placeholder until frames arrive.
- Settings panel (⚙): **columns per row** (Auto/1–6), persisted in localStorage, applied to the grid.
- **Refresh** now re-syncs the device list with a spinner.
- `android.yml`: also publishes the APK to a **GitHub Release** `capture-latest` (stable download); kept the artifact; added `contents: write`.

**Verified** — helper + web typecheck/build clean; fake-app WS test PASS (device registered tier "view", 3 H.264 frames relayed with correct framing). Browser WebCodecs decode is build-verified only (needs a real phone streaming to confirm at runtime).

**CI result (green):** both workflows passed on `f7e6cc8`. APK published to Release **`capture-latest`** → `phone-monitor-capture.apk` (6.1 MB), downloadable at the repo Releases page. Node CI success.

**Next** — user installs the APK on a locked phone + runs the helper (`npm run dev`, note the printed `ws://<lan-ip>:8787/app`), enters that URL in the app, taps Start → screen should appear on the dashboard tile. Once confirmed, graduate the end-to-end path to `main`. Then Phase 1 (unlocked phones) when platform-tools is installed.

---

## 2026-07-14 — Phase 2: Android capture app (Tier 2) + APK CI

**Done**
- Scaffolded the Android capture app under `app/` (Gradle root) → module `:capture` (`app/capture`). Kotlin, classic Views (no Compose), minSdk 26 / target 34, AGP 8.5.2 / Gradle 8.9 / Kotlin 1.9.24.
- Implemented `MainActivity` (helper URL + token, MediaProjection consent, start/stop), `CaptureService` (foreground service type mediaProjection → MediaCodec H.264 + VirtualDisplay, drains encoded frames), `Streamer` (OkHttp WebSocket → JSON hello + binary `[type-byte + H.264]` frames).
- Added `.github/workflows/android.yml`: builds the debug APK on push and uploads artifact `phone-monitor-capture-debug`.
- No launcher-icon file (uses a built-in system icon) to avoid committing binary assets.

**Verification** — cannot build Android locally (no JDK/Studio); CI is the test harness. ✅ Both workflows green on `84e7c78`: Android APK built in 3m29s and uploaded as artifact `phone-monitor-capture-debug`; node CI (helper/web) success. App stays on `feature` until runtime-tested on a real phone (needs the Phase-2d loop first).

**Next**
- Watch CI; fix build errors to green.
- Phase 2d: helper `WifiAppSource` (WS ingest at `/app`) + browser WebCodecs decode → app→helper→dashboard end-to-end.

---

## 2026-07-14 — Dashboard UI + mock source (demo-ready)

**Done**
- Added `MockSource` (helper): 6 demo devices matching the mockup (SM-G991B…SM-M336B, mixed Tier 1/2) with live per-second stats jitter (fps/battery/lastUpdate). On by default; disable with `MOCK=0`.
- Extended the browser protocol: client `{type:"list"}` (Refresh) → helper re-sends the device list.
- Built the full dashboard UI matching the reference mockup: header (logo, live device count, helper-connection dot, Refresh + placeholder Screenshot/Settings/Disconnect), responsive phone-card grid (Live badge, synthetic screen with live clock + fps badge, Model/Android/Battery footer), bottom status bar (all-online, N/N devices, real-time monitoring, avg FPS). Dark theme in `styles.css`.
- Added `.gitattributes` (LF normalization) to stop CRLF churn.

**Verified**
- helper + web typecheck and build clean.
- Ran helper with mock: WS delivered 6 devices (3 control, 3 view) and ~6 stats/sec; sample patch carried fps/battery/lastUpdate. Data pipeline confirmed end-to-end.
- Could not visually screenshot (no headless browser installed) — render verified via build + live data flow; owner opens the dashboard in a browser.

**Next**
- Phase 1: real Wi-Fi ADB (scrcpy) source — wire `@yume-chan` ADB + scrcpy, pair one unlocked phone, relay H.264 → WebCodecs canvas in `PhoneScreen`.

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
