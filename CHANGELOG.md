# Changelog

All notable changes to Phone Monitor are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Desktop app v3 — complete UI redesign (sidebar shell + Control Room)

#### Fixed (client review round 2)
- **Rotating twice disconnected the phone (critical).** The rotation rebuild released the `MediaCodec` from the main thread while the encoder's drain thread was still parked in `dequeueOutputBuffer` — that races into a native abort and takes the whole capture service down, which the desktop sees as the phone dropping. The rebuild now runs on its own executor, **stops the drain loop and joins that thread before releasing anything**, and is serialised behind a lock.
- **Rotation was never detected, so the picture stayed portrait.** The agent asked `WindowManager.currentWindowMetrics` for the display size — but `CaptureService` is a Service (a non-visual context), where that API is unreliable and reports the *un-rotated* bounds. So the size never appeared to change, the VirtualDisplay was never rebuilt, and the desktop kept receiving a portrait frame with the landscape picture letterboxed inside it. It now reads the size from `DisplayManager` → `Display.getRealMetrics()`, which honours rotation from any context. Detection is also debounced (metrics lag the rotation animation) and re-checked on every 10s status tick, so a missed display event self-heals.
- Net effect: **the phone rotates, the stream really becomes landscape, and the Control Room stage goes wide with it** (the desktop already sized itself from the decoded frame — it was starved of landscape frames, not broken).

#### Fixed (client review round 1)
- **Rotate actually rotates now.** Two bugs, not one: the phone's `VirtualDisplay` is created with *fixed* bounds, so even when the handset rotated, the mirror kept the old portrait frame and just letterboxed the landscape picture inside it — the desktop could never show landscape. The agent now watches the real display and **rebuilds the VirtualDisplay + encoder at the new size**, and the fresh encoder emits a codec-config frame so the desktop's decoder re-sizes itself. The card and the Control Room stage now take their shape from the decoded frame, so **the stage really becomes landscape**. The agent also reports `canRotate` (the WRITE_SETTINGS grant), so the Rotate button is disabled with an explanation instead of silently doing nothing.
- **Screen-off alerts work.** They only ever reacted to a broadcast, so a missed one left the desktop's view stuck and it never alerted again; a phone with no keyguard never fires `USER_PRESENT` at all. The agent now also listens for `ACTION_SCREEN_ON` and **carries the screen state in every 10s status frame** (from `PowerManager.isInteractive`), so it self-heals. The alert is on by default and is now called "Screen off".
- **Devices are listed in the sidebar** instead of hidden behind a Devices page (page removed). Grouped Connected / Hidden / Disconnected with signal, battery and a contextual 3-dot menu (rendered through a portal so the sidebar's scroll container can't clip it).
- **Header actions are labelled** (Refresh / Full screen / Customize / theme) — no more guessing at bare icons. Labels collapse to icons only on very narrow windows.
- **Tile sizes are named** (S Small / M Medium / L Large / XL Extra large).
- **Removed the hover "Control" overlay** on phone tiles — the Control button under each tile already does the job.

The desktop dashboard was rebuilt from scratch on the phone app's palette, so the two products read as one system. The old single-screen grid is gone; the app is now a proper shell: **sidebar · header · monitor · status bar**, plus a dedicated **Control Room**.

#### Added
- **Collapsible sidebar** — logo + name, `Monitor` / `History` / `Settings`, a separator, then the **device list itself** (Connected / Hidden / Disconnected, each with signal, battery and a 3-dot menu), and the **live app version** pinned at the bottom.
- **Header** — connected count, device **search**, and labelled actions: Refresh, Full screen, **Customize** (named tile sizes, auto vs fixed columns, rearrange) and **theme (System / Light / Dark)**.
- **Monitor** — responsive grid that scales from a laptop to a TV (`auto-fill` + tile size, or a fixed column count). Each card: live dot, name + inline rename, **signal bars, battery, fps**, a full-height phone screen, and a **Control** button into the Control Room. Drag to reorder; demo phones and a guided empty state when nothing is connected.
- **Control Room** — header (name, live state, fps, ms, signal, battery), the phone stage with tap / drag-swipe / wheel-scroll / keyboard typing, and a full control bar: **Back, Home, Recents, Notifications, Vol −/+, Rotate, Lock, Power, Screenshot, Record, Leave**. **Multiple phones can be added to the room** and controlled side by side (click a stage to make it active). **Leave always finalises and saves an in-progress recording.**
- **History page** — every phone that ever connected (persisted), with last-seen, online state, control/reconnect and remove.
- **Settings** — per-alert toggles (**connection, low battery + threshold, weak signal, screen lock**), tile size, columns, **screenshot & recording folders** (pick + open), demo phones, theme, and **Keep the screen awake** (a real `powerSaveBlocker`, so the wall of phones never blanks).
- **Status bar** — copyable connect URL, a **How to connect** modal, and online/total counts.
- **Screenshots & recordings** — captured straight off the decoder canvas (PNG / WebM via `MediaRecorder`) and written to the chosen folder by the Electron main process.

#### Changed
- **Protocol + agent now carry real data for the new UI** — `DeviceInfo` gained `signal` (0–4 bars) and `network` (wifi/cell); the agent reports them plus `charging` and its **own name** every 10s, so **renaming a phone on the handset syncs to the desktop**. Signal is best-effort and permission-free (Wi-Fi RSSI; cellular via `NetworkCapabilities` on Android 10+) — when a phone can't report it the UI shows flat/inert bars rather than a fake zero.
- **New control commands**: `lock` (accessibility `GLOBAL_ACTION_LOCK_SCREEN`, API 28+) and `rotate` (portrait↔landscape; needs the WRITE_SETTINGS grant, offered on the phone's Settings tab — skipped silently when not granted).
- Electron `main` gained IPC for keep-awake, capture saving, folder picking, version and fullscreen; `preload` exposes them as an optional bridge so the plain web build still works (browser fallbacks: download, Screen Wake Lock, DOM fullscreen).
- Desktop version → **3.0.0**.

> **Not built:** *location* alerts. Nothing in the pipeline collects location (the agent has no GPS permission and never has), so the toggle was left out rather than shipped inert.

### Android Agent app — full four-tab UI redesign (Home / Remote / History / Settings)

Rebuilt the on-device **Agent** UI from one long scroll into a clean four-tab shell with a bottom nav, matching the new design direction (plain words, real features only, same brand palette as the desktop app). **No functional flow was dropped** — local connect, relay/remote-code connect, accessibility remote control and connection history are all preserved and re-wired.

#### Added
- **Bottom-nav shell** (`activity_main.xml` + `BottomNavigationView`): one `MainActivity` hosts four page layouts (`page_home` / `page_remote` / `page_history` / `page_settings`) toggled by visibility — keeps the MediaProjection consent launcher, accessibility checks and history in one place.
- **Home** — live status card (Monitoring / Connecting / Not connected), a Start/Stop monitoring button, this-phone info (name, local Wi-Fi IP, battery + charging), and a 3-step quick-setup carousel.
- **Remote** — the connection hub: *On the same Wi-Fi* (desktop address + token → Connect) and *Away from home* (relay address + token → Start, with the live 9-digit code), plus the remote-control (accessibility) enable card and a live connection-status strip.
- **History** — recent desktop connections as cards (tap to reconnect, long-press to remove, Clear all) with an empty state.
- **Settings** — **theme switch: System / Light / Dark (default System)**; a permissions overview (screen capture, remote control, keep-running, notifications) with live on/off chips that deep-link to the right Android screen; editable phone name; **Monitor quality (Low/Medium/High)** that now actually drives capture resolution + bitrate; a "Later features" note (QR pairing — *Soon*); and About.
- **Light theme**: the app is now DayNight — a full light palette (`values/colors.xml`) + dark palette (`values-night/colors.xml`), applied app-wide from a new `App : Application` and switched live via `AppCompatDelegate`.
- ~18 hand-authored vector icons + card / chip / segment / step drawables on the brand palette (`#0B0B0D` / `#2FA44A`).

#### Changed
- Copy rewritten to plain words throughout ("monitor", not "stream"; removed marketing lines like "optimized for low-latency transmission").
- `CaptureService` reads `EXTRA_QUALITY` → Low/Medium/High map to 720p·2 Mbps / 900p·3 Mbps / 1280p·6 Mbps.
- `MainActivity` rewritten around the four tabs (page switching + all wiring); `strings.xml` / `colors.xml` / `themes.xml` reworked; `history_item.xml` restyled as a card row.

> Built in CI (the dev laptop has no Android Studio); install `phone-monitor.apk` from the `capture-latest` release to test on a phone. HTML mockups of the four screens live in `mobile-redesign/`.

### Remote access (out-of-home) — connect from any network

A second connection method alongside the local (same-Wi-Fi) one: control a phone from a different network / city / country, AnyDesk-style, brokered by a hosted relay and paired with a 9-digit code.

- **Relay server** (`relay/`): rebuilt from the WebRTC-signaling scaffold into an **agent↔viewer forwarding relay**. Phone and desktop each connect *outbound* (works through any NAT), get paired by a code, and it forwards H.264 + control both ways. It reclaims a phone's code across reconnects and replays the last `hello` + H.264 config frame so a late-joining desktop can register and decode immediately. Optional `RELAY_TOKEN` gate. Verified end-to-end locally with a simulated phone (code assigned, tile registered, video flowed, control reached the phone).
- **Desktop `RelaySource`**: a remote phone joins the *exact same* pipeline as a LAN phone — it appears as a normal tile (connection `internet-app`) and works with the existing focused control view. Managed from **Settings → Remote phones** (relay URL + optional token + connect-by-code + list), and saved phones auto-reconnect after a restart. `remove` on a remote tile disconnects it.
- **Android Remote mode**: alongside the untouched local flow, a "Remote access (anywhere)" section connects to the relay's `/agent`, shows the assigned pairing code as `916 429 577`, and keeps the code stable across reconnects. Streaming + control are identical to local.
- **Deploy**: `render.yaml` (Render blueprint, relay only), `relay/Dockerfile`, and **`REMOTE.md`** (deploy + pairing + security guide, incl. a zero-hosting local-tunnel option). CI now typechecks the relay.
- **Honest scope:** relay-routed media is encrypted in transit (wss) but passes *through* the relay — not end-to-end. True peer-to-peer WebRTC (media off the server) remains a later latency/privacy optimization.

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

#### Fixed (first real-phone test — Samsung SM-A055F, confirmed working)
- **Phones couldn't connect to the desktop app at all.** The Electron shell started the helper on `127.0.0.1`, so it never listened on the Wi-Fi interface even though it advertised a `ws://<lan-ip>/app` URL — every phone timed out. It now binds all interfaces, and ranks real LAN ranges (192.168/10) above virtual adapters (Docker/WSL/Hyper-V) so the address shown first is the one a phone can reach.
- **One phone appeared as two tiles** (one a demo-looking placeholder). The helper assigned a new id per socket, so a reconnect spawned a phantom. Devices are now keyed by the phone's stable `deviceId` (ANDROID_ID, sent in `hello`); a reconnect replaces the old socket and reuses the same tile. Also guarded a double `onStartCommand` that could run two streamers at once.
- **Phone showed "Can't connect" even while streaming.** OkHttp fires `onFailure` on transient blips too; the app now shows "Reconnecting…" once it has connected, reserving "Can't connect — check address" for a genuine first-connect failure.
- **"Enable remote control" stayed showing after enabling** (Samsung). Detection now uses `AccessibilityManager` (plus both flattened-name forms) instead of only parsing the `ENABLED_ACCESSIBILITY_SERVICES` string.
- **Desktop opened full of demo devices.** Demo (`mock`) is now **off** by default (`PM_MOCK=1` to opt in); the dashboard starts blank with an empty state that shows the connect address and an "add demo phone" button.

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
