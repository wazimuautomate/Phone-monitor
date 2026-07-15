# MEMORY.md — Running Work Log

Newest first. One entry per work session: what was done, decisions made, and what's next.
(This is the project's own log — separate from any assistant memory.)

---

## 2026-07-15 — Rotation, round 3: the rebuild itself was killing the connection

**NEVER release the VirtualDisplay to resize it.** On Android 14+ releasing it ends the MediaProjection session → `MediaProjection.Callback.onStop()` → our `stopCapture()` → streamer closes → the desktop sees "phone disconnected". My round-2 "fix" (release + recreate at the new size) *was* the disconnect the client reported.

**Correct pattern (what scrcpy does):** keep ONE VirtualDisplay for the whole session and re-point it —
`display.setSurface(null)` → `newEncoder(w,h)` → `display.resize(w,h,dpi)` → `display.setSurface(newSurface)` → release the OLD codec/surface. Projection is released only on a genuine teardown. Still join the drain thread first (a MediaCodec released under `dequeueOutputBuffer` aborts the process).

Rotation has now cost three rounds; the three traps, in order: (1) `WindowManager.currentWindowMetrics` lies in a Service — use `DisplayManager` → `Display.getRealMetrics()`; (2) don't release a MediaCodec under its drain thread; (3) don't release the VirtualDisplay at all.

---

## 2026-07-15 — Rotation: why it "never worked" (two independent bugs)

Client: rotate turns the phone but the desktop stays portrait, and **rotating twice disconnects the phone**. Both were real, and neither was the button.

1. **Detection never fired.** `CaptureService` used `WindowManager.currentWindowMetrics` to read the display size. That's a *visual-context* API; from a Service it's unreliable and returns the **un-rotated** bounds, so `w/h` never appeared to swap → the VirtualDisplay was never rebuilt → the desktop kept getting a portrait frame with the landscape picture letterboxed inside it (exactly what the client's screenshot showed). **Fix:** read via `DisplayManager.getDisplay(DEFAULT_DISPLAY).getRealMetrics()` — honours rotation from any context. Plus a 0ms+400ms debounce (metrics lag the rotation animation) and a re-check on the 10s status tick so a missed display event self-heals.
2. **The rebuild crashed the service.** It released the `MediaCodec` from the main thread while the `pm-encoder` drain thread was parked in `dequeueOutputBuffer` → native abort → service dies → "phone disconnected". **Fix:** rebuild on its own executor, `running=false` then **join the drain thread** before releasing, all behind a lock. `drainThread` is now tracked; teardown joins it too.

**Key insight for next time:** the desktop needed NO change — it already sizes the card/stage from the decoded frame (`PhoneScreen` sets `aspect-ratio` from `VideoFrame.displayWidth/Height`, and a rebuilt encoder emits a fresh codec-config so the decoder re-sizes itself). The UI was starved of landscape frames, not broken. Don't go looking in the renderer for this class of bug.

---

## 2026-07-15 — Desktop app v3: complete UI redesign (sidebar shell + Control Room)

Client: "the desktop UI is very bad with limited features — complete fresh redesign, use the mobile app's colour theme." Rebuilt `web/` from scratch (old layout deliberately discarded); helper/Electron/agent extended to feed it real data.

- **Shell:** `App.tsx` = Sidebar (collapsible; Monitor/History/Settings · separator · Devices+count · version pinned bottom) + TopBar (count, search, refresh, fullscreen, customize, theme) + page + StatusBar (copyable URL, How-to-connect modal, counts). Pages: Monitor / Devices / History / Settings. Control Room is an overlay.
- **Control Room:** multi-phone stages (add others, click to activate), header metrics (fps/ms/signal/battery), full bar (Back/Home/Recents/Notifs/Vol±/Rotate/Lock/Power/Screenshot/Record/Leave). Leave always finalises+saves a running recording. Captures come off the decoder canvas (PNG / WebM MediaRecorder) → Electron writes to the chosen folder.
- **New real data (protocol):** `DeviceInfo.signal` (0–4) + `.network`; agent sends `name`/`charging`/`signal`/`network` in `hello` **and a status frame every 10s** → **phone rename syncs to desktop**. Parsing shared via `helper/src/sources/phone-fields.ts` (used by both wifi-app-source and relay-source). Signal is permission-free best-effort (Wi-Fi RSSI; cell via `NetworkCapabilities.getSignalStrength()` API29+); **unknown → undefined → inert bars, never a fake 0**.
- **New controls:** `key:"lock"` (GLOBAL_ACTION_LOCK_SCREEN, API28+) and `{action:"rotate"}` (USER_ROTATION; needs WRITE_SETTINGS — new permission row on the phone's Settings tab; no-ops if ungranted).
- **Electron:** IPC for keep-awake (`powerSaveBlocker` — client called this "very very important"), save-capture, pick-folder, app-version, fullscreen(+event). `lib/desktop.ts` wraps it so the plain web build degrades (download / Screen Wake Lock / DOM fullscreen). Desktop → **3.0.0**.
- **Declined (honestly):** *location* alerts — no location anywhere in the pipeline; not shipping an inert toggle.

**Verified for real, not just typechecked:** ran the app locally and drove it over CDP (`--remote-debugging-port`) — screenshotted Monitor (6 cards), Devices, History, Settings, Control Room, 2-phone room, light theme; 0 console errors; the "Weak signal" toast fired from the new signal field.

**Gotchas for next time:** this shell has `ELECTRON_RUN_AS_NODE=1` set — `npx electron` runs as plain Node (`app` undefined) unless you `unset` it. And a running copy of the app holds the single-instance lock, so a dev instance silently quits — use `--user-data-dir=<tmp>` + `PM_PORT=<other>` to run alongside it.

---

## 2026-07-15 — Android Agent app: full four-tab UI redesign (+ light/dark theme)

Client ran the earlier Agent screens through Google Stitch, liked the look, and asked to implement it in the real app — but Stitch had invented irrelevant content (streaming jargon, a fake "Administrator" person, cloud relay, iPad/MacBook history). Redesigned to match our actual product, then built it in the Android app.

- **Structure:** single `MainActivity` + `BottomNavigationView` hosting four `page_*.xml` layouts toggled by visibility (no fragments — keeps the consent launcher / accessibility checks / history in one place, lowest CI-build risk since the laptop can't build Android locally).
  - **Home** = status + connected-to + this-phone (name / local IP / battery) + quick setup.
  - **Remote** = the connection hub: *On the same Wi-Fi* (helper address + token → Connect) **and** *Away from home* (relay address + token → Start + live 9-digit code) + remote-control (accessibility) enable. Preserves both existing flows (`normalizeHelperUrl` / `normalizeRelayBase`, `beginCapture(remote)`).
  - **History** = recent local connections (tap reconnect, long-press remove, Clear all) — unchanged storage.
  - **Settings** = **theme (System/Light/Dark, default System)**, permissions overview w/ live chips (screen capture, remote control, keep-running, notifications), editable phone name, **Monitor quality (Low/Med/High → real `EXTRA_QUALITY` on `CaptureService`: 720p/900p/1280p + 2/3/6 Mbps)**, "Later features" (QR pairing = Soon), About.
- **Theme:** app converted to `Theme.Material3.DayNight`; light palette in `values/colors.xml`, dark in `values-night/colors.xml`; applied app-wide by new `App : Application` and switched live via `AppCompatDelegate.setDefaultNightMode` (pref `themeMode`). All layouts use adaptive `pm_*` colors (no more hardcoded `pm_white`).
- **Copy:** plain words ("monitor" not "stream"); removed marketing/fake content.
- **Assets:** ~18 vector icons + card20 / chip / seg / step / tag drawables + bottom-nav menu + `nav_item_color` selector + `Pm.*` row/section/seg styles.
- **Verification:** can't build locally; cross-checked every `@string`/`@drawable`/`@color`/`@style`/`R.*` reference and every `binding.pageX.<id>` against its layout — all resolve. Relies on CI (`android.yml`) to compile the APK.

**Note:** the repo advanced mid-session (relay feature landed at commit 902d33d) — folded the relay/remote-code path into the Remote tab rather than treating "internet" as a future feature. HTML mockups in `mobile-redesign/`.

---

## 2026-07-15 — Remote access (out-of-home) implemented: relay + pairing codes

Client asked for TWO connection methods: the existing LAN one **and** AnyDesk-style remote (control a phone from another city). Built the remote path **relay-brokered**, reusing the entire H.264 → WebCodecs → control pipeline:

- **`relay/`** rebuilt from the signaling scaffold into an **agent↔viewer forwarding relay**: pairs a phone (`/agent`) and a desktop (`/viewer?code=`) by a 9-digit code, forwards video + control, reclaims a phone's code across reconnects, and replays the cached `hello` + H.264 config so a late-joining viewer registers/decodes at once. Optional `RELAY_TOKEN`. **Verified end-to-end locally** with a simulated phone (code assigned, tile registered, 8 video frames relayed, a tap reached the phone).
- **helper `RelaySource`** (viewer client) → a remote phone appears as a normal `internet-app` tile. `SourceManager.addRelay/removeRelay/relayCodes`; `ws-hub` handles `relay-connect`/`relay-disconnect`; `remove` on a `relay-<code>` tile disconnects it.
- **web**: Settings → Remote phones (relay URL + optional token + connect-by-code + list; auto-reconnect saved phones on hub open). localStorage `pm.relayUrl` / `pm.relayToken` / `pm.remotePhones`.
- **android**: "Remote access" mode — `normalizeRelayBase` (never appends `/app`), connects to `<base>/agent?code=<saved>`, handles `{type:"welcome",code}` → prefs `remoteCode` + `CaptureState.code` → displays `916 429 577`. Local mode untouched; `CaptureService.remote` flag + `EXTRA_REMOTE`.
- **deploy**: `render.yaml` (relay only, `rootDir: relay`), `relay/Dockerfile`, `REMOTE.md`; `ci.yml` typechecks relay.

Shipped `PhoneMonitor-2.1.0-portable.exe` + rebuilt `phone-monitor.apk` (CI).

**Protocol** (agent↔relay↔viewer): agent → `/agent` → relay `{type:"welcome",code}`; then agent streams `hello`/`status`/binary `[type+H.264]`, receives `{type:"control",cmd}`. viewer → `/viewer?code=` → relay `{type:"linked"|"waiting"}`, receives forwarded agent frames, sends `control`. Relay control-plane types: welcome/linked/waiting/agent-left/error.

**Honest scope / next:** media flows THROUGH the relay (wss encrypted in transit, NOT end-to-end). True WebRTC P2P (media off the server) deferred — needs a native WebRTC stack on Android. **Remote is inert until the relay is deployed publicly** (Render blueprint) — the one infra step the owner does, like the v1 Render deploy. This is the R3 (relay+pairing) approach; R2 (WebRTC transport) is now reframed as a later optimization.

---

## 2026-07-15 — v2 fixes CONFIRMED on a real phone; connectivity Q&A

**Client tested the fixed build on a real Samsung SM-A055F — LAN view + AnyDesk-style control work, and all four reported bugs are fixed:**
- One phone = one tile — helper keys app devices by the phone's stable ANDROID_ID (now sent in `hello`) and replaces the stale socket on reconnect instead of spawning a phantom placeholder tile. Also guarded a double `onStartCommand` that ran two streamers.
- No more false "Can't connect" while streaming — Android tracks `everConnected`; after the first open, drops show "Reconnecting…", and "Can't connect — check address" is reserved for a genuine first-connect failure.
- Accessibility "Enable remote control" card flips to Enabled — detection now uses `AccessibilityManager` (Samsung formats `ENABLED_ACCESSIBILITY_SERVICES` differently) plus both flattened-name forms.
- Desktop starts blank — `mock` off by default (was on); empty state shows the connect address + an "add demo phone" button. (Earlier same-day fix: the Electron helper had bound loopback-only, so phones couldn't connect at all — now binds 0.0.0.0 and ranks real Wi-Fi IPs above virtual adapters.)
Shipped: `PhoneMonitor-2.0.1-portable.exe` + rebuilt `phone-monitor.apk` (both verified; APK dex confirmed to contain the new code).

**Direction:** UI is deliberately **deprioritized** — focus is logic robustness. **Remote access is NOT built yet:** the connect link is a private LAN address (192.168/8787), so it only works on the same Wi-Fi.

**Connectivity plan (client asked; recorded in `CONNECTIVITY.md`):** ONE adaptive method = WebRTC + a thin signaling/TURN relay (`relay/` scaffolded). ICE auto-tiers same-LAN → direct P2P internet → TURN fallback, so "same-house different network" and "different country" are the *same* problem — both solved by the one WebRTC path (LAN stays as an optional turbo). Remote pairing shifts from typing an IP to an AnyDesk-style **code**. Interim option if remote is needed fast: host the helper as a cloud dumb-relay (v1 Render approach) — works anywhere but routes all video through the server. Next milestone: build the WebRTC path (`REBUILD-PLAN.md` R2–R3). No decision yet on proper-vs-interim.

---

## 2026-07-14 — v2 pivot: desktop app + AnyDesk-style remote control (built)

**Scope change** (client, after the v1 demo): from a hosted browser dashboard to an **installable desktop app + phone agent** with real **remote control** (AnyDesk-style), near *and* far; his phones all have Dev Options; UI + realtime are paramount; friends will use it (monetization later — free tier 1 device / accounts later). Full plan in `REBUILD-PLAN.md`. Decisions locked: WebRTC P2P + relay fallback; mobile = agent **and** controller; Electron; standalone v1 (him).

**Built this session** (parallelized: 3 subagents for app/, web/, relay/ + main-thread integration):
- **Electron desktop app** (`desktop/`): `main.js` starts the helper in-process (`createHelper()`) and opens a Chromium window at `http://127.0.0.1:8787`. Assets bundled by esbuild (`scripts/build.mjs`): `web/dist` → `build/web`, helper → single `build/helper.cjs`. **Built + verified a portable `.exe`** (`desktop/release/PhoneMonitor-2.0.0-portable.exe`, 71 MB): launched it, embedded helper served `/health` 200 + the dashboard, clean shutdown.
- **Helper**: dropped `express` (tiny built-in static server + `/health`) so it bundles into Electron; `index.ts` now exports `createHelper(opts)` + keeps CLI. **Control channel**: `ControlCmd` type (normalized 0..1 coords), `/ws` `{type:"control",deviceId,cmd}` → `SourceManager.sendControl` → `WifiAppSource.sendControl` sends `{type:"control",cmd}` down the phone socket. `DeviceInfo` gained width/height/controllable.
- **Android Agent** (`app/`): new `ControlService` (AccessibilityService) injects tap/swipe/back/home/recents/notifications/power/volume/text — no root/ADB. Capture WS is now bidirectional; `CaptureService` parses control frames → `ControlService.instance.perform`. `hello` reports real display px. Enable-accessibility card in `MainActivity`.
- **Web** (`web/`): AnyDesk-style **FocusedView** (click a card → big screen + on-screen nav bar; click→tap, drag→swipe, wheel→scroll, keys→text) + `sendControl` on the ws hub + `video-bus` caches the codec config for late subscribers + a UI polish pass. tsc clean.
- **Relay** (`relay/`): minimal signaling broker (pairing codes + SDP/ICE relay, no media) for the future remote path; TURN documented not implemented. Typechecks clean.
- **CI**: `desktop.yml` builds the portable `.exe` (→ `desktop-latest` release); `android.yml` already builds the APK (→ `capture-latest`); `ci.yml` skips Electron's binary download.
- **Docs**: `REBUILD-PLAN.md`, CLAUDE v2 banner, README rewrite, CHANGELOG v2 section.

**Verified locally**: helper typecheck, web `vite build`, relay typecheck, helper esbuild bundle boots, and the packaged `.exe` runs and serves. **APK** builds in CI only (no local Android Studio).

**Next**: push `feature` → CI produces `.apk` + CI `.exe`; then WebRTC remote path (wire `relay/` + pairing into desktop & agent), ADB turbo, Controller app, then monetization. Merge to `main` once the client confirms on real phones.

---

## 2026-07-14 — Diagnose live Render deploy + make phone connection self-explaining

**Tested against the real deployment** (`phone-monitor-yxbo.onrender.com`, creds the owner will rotate):
- `/health` → `authRequired:true`. Behind Cloudflare + Render.
- `/app` WS (header token) **connects and holds**: realistic 30fps probe ran **75s / 1877 frames / 3.5 MB, ping-pong RTT ~284ms, zero drops**. So hosting is NOT the cause of "connection lost — reconnecting" — the failure is client-side (wrong address / old APK / token).
- `/app` with **no token also stayed open** ⇒ **`APP_TOKEN` is currently empty on Render** (phone token isn't being enforced).
- `/ws?token=0987654321` → **HTTP 401** ⇒ the deployed **`ACCESS_TOKEN` is NOT `0987654321`** (the value the owner gave isn't what's set on Render).

**Done (code):**
- App `Streamer`: reports the **real failure reason** (`onFailure` reads `response.code` / exception) — 401 wrong token, 404 wrong path, 502/3/4 waking, DNS/Wi-Fi, TLS. `CaptureService` surfaces it ("Can't connect — <reason>"); clean close → "Reconnecting…" not an error.
- App `Streamer`: also sends the token as **`?token=`** (built via OkHttp `toHttpUrlOrNull().setQueryParameter`, mapped ws↔http) alongside the header — proxy-proof, mirrors `/ws`.
- Helper `index.ts`: `/app` upgrade accepts token from header **or** `?token=`, rejects bad with **HTTP 401** (was a post-upgrade 1008 close, invisible to the app). Added a **30s ping keepalive** on both WSS that terminates pong-less sockets. `WifiAppSource` re-checks both as defense.

**Verified locally** (helper with `APP_TOKEN=54321`, `ACCESS_TOKEN=0987654321`): header/query token → OPEN; wrong/absent → HTTP 401; `/ws` correct → devices, wrong → 401; full e2e — a query-token `/app` phone registered a real device + video frames reached a `/ws` dashboard client. helper+web build clean.

**Owner action (config, not code):** on Render set `APP_TOKEN`=54321 and `ACCESS_TOKEN`=<what you type in the browser>, plus `MOCK=0`; redeploy. Right now APP_TOKEN is empty (any/blank phone token connects) and the browser password is whatever was actually set (not 0987654321). Merged to `main` so Render auto-deploys the helper + a fresh APK is published to `capture-latest`.

---

## 2026-07-14 — Fix hosted phone connection + app UX (copy URL, clear recent, how-to)

**Reported:** on Render (`phone-monitor-yxbo.onrender.com`, kept awake via UptimeRobot), the capture app never connected — user entered `wss://phone-monitor-yxbo.onrender.com=my app token` and got "Connection lost — reconnecting".

**Root cause:** the helper only upgrades WebSockets on `/ws` (dashboard) and `/app` (phone); any other path is `socket.destroy()`d. The entered address had **no `/app` path** and had the **token jammed onto the URL with `=`** instead of in the separate token field. So the socket was dropped before the handshake — hence the reconnect loop. The dashboard already shows the correct `wss://<host>/app` (App.tsx derives it from `location`), so this was purely phone-side input.

**Done:**
- `MainActivity.normalizeHelperUrl()` — makes typed addresses connectable: adds scheme (`wss://`, or `ws://` for localhost/10./192.168./172.16-31/127.), converts `http(s)://`→`ws(s)://`, appends `/app` when path is empty/`/`, strips a stray space/`=`/`?` (and anything after) from the authority. Result is written back into the field so the user sees it. History now stores normalized URLs.
- Capture app UI: added a **How-to-connect** card (`bg_card` drawable + `howto_*` strings), a **Clear** recent-connections button (`clearHistory`), reworked the recent header into `historyHeader`, and replaced the LAN-only hints with hosted-friendly ones. Default helper field now starts empty.
- Dashboard: new `CopyableUrl` component (click-to-copy + "Copied!" hint) used in `Header`, `StatusBar`, and `SettingsDrawer`; CSS `.copy-url`/`.copy-hint` added.

**Verified:** `web` builds + `tsc --noEmit` clean; all Android XML resources parse. Android app builds in CI only (no local Android Studio) — push to `feature` triggers `android.yml` → downloadable APK.

**Next / notes:** token still travels as the `x-pm-token` upgrade header (Render forwards it fine). If a future proxy strips it, add a `?token=` query fallback on `/app` to mirror `/ws`.

---

## 2026-07-14 — Cloud hosting (v1 deployable from `main`)

**Done:**
- Helper auth: `ACCESS_TOKEN` gates `/ws` (checked on upgrade via `?token=`); `/health` returns `authRequired`; `APP_TOKEN` still gates `/app`.
- Dashboard: `LoginGate` password overlay (when authRequired & no/invalid token); token in localStorage + appended to the WS URL; auth-fail re-prompts.
- Hosted-aware connect URL: off-localhost the dashboard shows `wss://<host>/app` for phones; LAN URLs only when local.
- Deploy: `Dockerfile`, `.dockerignore`, `render.yaml`, `HOSTING.md` (Railway recommended; Render alt). Helper honours `PORT`/`HOST`/`MOCK`.

**Verified:** helper+web build; auth WS test PASS (health authRequired; no-token rejected; correct token connects + gets server-info); `npm start` serves the dashboard (HTTP 200) with auth — the exact cloud command.

**Deploy (client):** Railway/Render → connect repo → set `MOCK=0`, `ACCESS_TOKEN` (dashboard pw), `APP_TOKEN` (phone token) → open `https://<app>`; phones → `wss://<app>/app`. See HOSTING.md.

**Correction on earlier note:** Vercel/Netlify can't host this (serverless, no persistent WS). Use a Node/container host.

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
