# Remote access — deploy the relay and connect from anywhere

The **local** method (same Wi-Fi) needs nothing. The **remote** method — control your
phone from another network / city / country, AnyDesk-style — needs one small always-on
server on the public internet: the **relay** (`relay/`). The phone and desktop both
connect *outbound* to it (so no port-forwarding), and it pairs them by a 9-digit code.

> **Why a server at all?** A phone and a desktop on different networks can't reach each
> other directly (private IPs + NAT). The relay is the meeting point. See `CONNECTIVITY.md`.

## 1. Deploy the relay (pick one)

### A) Render (blueprint — easiest)
1. Push this repo to GitHub (already done).
2. Render → **New → Blueprint** → pick this repo. It reads `render.yaml` and deploys
   **only** the relay (`rootDir: relay`).
3. It generates a `RELAY_TOKEN` — open the service → **Environment** and copy its value.
4. Copy the service URL, e.g. `https://phone-monitor-relay.onrender.com`.
   Your relay address for the apps is the **wss://** form:
   `wss://phone-monitor-relay.onrender.com`

> Use the **Starter** plan (always-on). The Free plan sleeps when idle and your phone
> would drop off; fine for a quick test (it reconnects), not for leaving phones connected.

### B) Any Docker host (Fly.io, Railway, a VPS…)
```bash
cd relay
docker build -t phone-monitor-relay .
docker run -p 8788:8788 -e RELAY_TOKEN=your-secret phone-monitor-relay
```
Put it behind HTTPS (the apps use `wss://`). On Fly/Railway, set `RELAY_TOKEN` and the
platform provides `PORT` automatically.

### C) Manual (Render/Railway "Node" service, no blueprint)
- Root directory: `relay`
- Build: `npm install && npm run build`
- Start: `npm start`
- Env: `RELAY_TOKEN=<a secret>` (and the platform sets `PORT`).

### D) Zero-hosting quick test (local + a tunnel)
Run the relay on your PC and expose it with a free Cloudflare quick tunnel — no account,
public `https://…trycloudflare.com` URL:
```bash
npm run build -w relay && npm start -w relay      # relay on http://localhost:8788
cloudflared tunnel --url http://localhost:8788    # prints a public https URL
```
Use the printed URL as `wss://<that-host>` in both apps. Good for a first demo; the URL
changes each run.

## 2. Point both apps at the relay
Set the **same two values** in the phone app and the desktop app:
- **Relay server:** `wss://<your-relay-host>` (no path — the apps add `/agent` and `/viewer`).
- **Relay token:** the `RELAY_TOKEN` you set/generated.

Desktop: **Settings → Remote phones**. Phone: the **Remote access** section.

## 3. Pair and connect
1. On the **phone**: set the relay server (+ token), tap **Start remote**, grant screen
   capture, and make sure **Remote control** (Accessibility) is enabled. The app shows a
   **code** like `916 429 577`.
2. On the **desktop**: Settings → Remote phones → set the relay server (+ token) → enter
   that code → **Add**. The phone appears as a tile. Click it to view and control — from
   anywhere.

The phone keeps its code across reconnects, so you only pair once.

## 4. Security (read this)
- **Set `RELAY_TOKEN`.** It's the gate to your relay — without it, anyone who finds the
  URL could use it and (worse) probe codes. With it set in your apps, outsiders can't
  connect at all.
- Traffic is **encrypted in transit** (wss://) but **passes through the relay** — this is
  *not* end-to-end. The relay operator (you) could in principle see frames. True
  peer-to-peer (WebRTC/DTLS, media never touches the server) is a planned upgrade
  (`REBUILD-PLAN.md`).
- The 9-digit code selects *which* phone; the token gates *access to the relay*. Keep the
  token private (it's baked into your app config).

## 5. Troubleshooting
- **Phone shows no code:** it can't reach the relay. Check the relay URL is `wss://…`, the
  token matches, and the relay is deployed/awake (`/health` should return JSON).
- **Desktop says the phone is offline:** the phone isn't connected to the relay right now
  (closed app / no data). The desktop keeps retrying and links up when the phone returns.
- **Works locally but not remotely:** confirm both apps use the **same** relay URL + token,
  and the relay host serves HTTPS (`https://<host>/health` loads in a browser).
- **Laggy:** relay-routed media adds latency vs. the LAN path; a relay geographically near
  you helps. The P2P upgrade will reduce this.
