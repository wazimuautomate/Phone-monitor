# Hosting Phone Monitor

The dashboard is served by the **helper** — a persistent Node WebSocket server. To use it from
anywhere, host the helper on a platform that runs a **long-lived Node process with WebSocket
support**: **Railway** or **Render** work well. (Vercel/Netlify are serverless and cannot run it.)

Because v1 uses the **capture app** (no ADB), the whole system works over the internet:
each phone streams to `wss://<your-app>/app`, and the dashboard is viewable at `https://<your-app>`.

## Secrets you'll set

| Variable | What it is |
|---|---|
| `ACCESS_TOKEN` | The **dashboard password** (typed once to open the dashboard). |
| `APP_TOKEN` | The **phone token** (entered in each phone's capture app). |
| `MOCK` | Set to `0` to hide the demo devices in production. |

Choose your own strong values for the two tokens.

## Option A — Railway (recommended · ~$5/mo · always-on)

1. Go to **https://railway.app** → **New Project → Deploy from GitHub repo** → pick `Phone-monitor`.
2. Railway detects the **Dockerfile** and builds it.
3. Open the service → **Variables** → add:
   - `MOCK` = `0`
   - `ACCESS_TOKEN` = *your dashboard password*
   - `APP_TOKEN` = *your phone token*
4. **Settings → Networking → Generate Domain** → you get `https://<app>.up.railway.app`.
5. Open that URL, enter the dashboard password.
6. On each phone: capture app → address **`wss://<app>.up.railway.app/app`**, token = your `APP_TOKEN` → **Start**.

## Option B — Render

1. **https://render.com** → **New → Blueprint** → select the repo (it reads `render.yaml`).
   *(Or New → Web Service, build `npm install && npm run build`, start `npm start`.)*
2. Keep the **Starter** plan — the Free plan sleeps and would disconnect the phones.
3. Set env vars `MOCK=0`, `ACCESS_TOKEN`, `APP_TOKEN`.
4. Deploy → open `https://<app>.onrender.com` and connect phones to `wss://<app>.onrender.com/app`.

## Notes

- **HTTPS → WSS**: hosted URLs are HTTPS, so phones must use `wss://…/app`. The dashboard picks
  the right scheme automatically and shows the exact address to enter (Settings → *Connect app to*).
- **Always-on**: use a paid/hobby tier; sleeping free tiers drop the phones.
- **Bandwidth**: video flows phone → cloud → dashboard, so the host uses bandwidth per streaming
  phone. Fine for a handful of view-only phones; watch it if you scale up.
- **Security**: `ACCESS_TOKEN` gates the dashboard, `APP_TOKEN` gates phone streams. Keep both
  secret. This is shared-secret auth — good for a small private deployment; per-user logins can
  come later.
- **Auto-deploy**: both platforms redeploy automatically on every push to `main`.

## Alternative: keep the helper local, expose via tunnel

If you'd rather run the helper on a PC at the client's site (e.g. to add ADB/Tier-1 later), run it
locally and expose it with a tunnel (Cloudflare Tunnel / ngrok / Tailscale), then point phones and
the dashboard at the tunnel URL. Same tokens apply.
