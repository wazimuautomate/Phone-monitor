# Go-live checklist — Phone Monitor v1.0.0

Everything for this round is built and on the **`feature`** branch, verified to build in CI.
This is what turns it into the shipped, permanent, self-updating v1.0.0.

## 0. The one-time reset (unavoidable, this release only)

v1.0.0 changes the app's package **and** signing key at once, so Android/Windows can't
update the old build in place *this once*. On every device:

1. **Uninstall** the current Phone Monitor (phone) / current desktop app.
2. Install the new **release** build (below).

From then on, every update installs in place — **no uninstall, no data loss**.

## 1. Owner action — enable in-app updates (5 min, optional but recommended)

The apps read update releases from this **private** repo, so they need a read-only token.

1. GitHub → Settings → Developer settings → **Fine-grained personal access tokens** →
   *Generate new token*.
   - **Repository access:** Only select repositories → `wazimuautomate/Phone-monitor`.
   - **Permissions:** Repository permissions → **Contents: Read-only**.
   - Expiration: as long as allowed (renew before it lapses, or updates stop working).
2. Copy the token, then set it as a repo secret:
   ```bash
   gh secret set RELEASES_READ_TOKEN -R wazimuautomate/Phone-monitor
   # paste the token when prompted
   ```
3. Re-run the Android + Desktop builds (push, or re-run the workflows) so the token is
   embedded. Until this is set, **Check for updates** just says "updates aren't enabled".

> Tradeoff (you chose this over a separate public releases repo): the token ships inside
> the app. It's read-only and scoped to this one repo, so the blast radius is minimal.

## 2. Owner action — host the relay (for remote / VPN / mobile-data access)

Same-Wi-Fi works with nothing hosted. **Remote access (and the full-tunnel-VPN fix)**
needs the relay online. Deploy it (`REMOTE.md` has all options — Render blueprint is
easiest):

1. Render → New → **Blueprint** → this repo. It reads `render.yaml` and deploys **only**
   the relay. Use the **Starter** plan (always-on).
2. Copy the service URL as `wss://…onrender.com` and the generated `RELAY_TOKEN`.
3. In the **desktop** app: Settings → **Remote phones** → paste the relay server + token.
   On the **phone**: Remote → *Away from home* → same server + token (or just scan the
   desktop's pairing QR).

> Want it to "just work" without typing relay details? Send me the hosted relay URL +
> token and I'll bake them in as build defaults.

## 3. Ship it

1. **Test on `feature` first** (recommended, per branch policy): download the
   `phone-monitor-release-v1.0.0.apk` artifact / `capture-latest` release, install on a
   phone (after the one-time uninstall), and confirm connect + control.
2. **Merge `feature` → `main`.** The `main` build **signs and publishes** the canonical
   v1.0.0 to the `capture-latest` / `desktop-latest` release channels (feature builds
   never publish). The versionCode guard passes because the channel was reset.
3. Hand the client the release APK + desktop installer. Done.

## 4. Every future release

- Bump `versionCode` (must increase) and `versionName` in `app/capture/build.gradle.kts`,
  and `version` in `desktop/package.json`.
- Merge to `main`. CI signs, guards the versionCode, and publishes.
- Users get it via **Check for updates** — in place, no uninstall.

See `SIGNING.md` for the keystore, secrets, and versioning rules. The keystore passwords
are in `C:\Users\ADMIN\.phone-monitor-signing\CREDENTIALS.txt` (keep that safe, off git).
