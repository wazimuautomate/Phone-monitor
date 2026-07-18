# Signing & Release — Phone Monitor (permanent identity)

This documents the **permanent** Android release signing setup. Treat the keystore as
the app's forever-signature: **never regenerate or replace it.** Losing it (or its
passwords) means you can no longer ship in-place updates — every user would have to
uninstall and reinstall.

> The passwords are **NOT** in this file, in git, in CI logs, or in any APK. They live
> only in (a) your password manager / the local `CREDENTIALS.txt` backup, and (b) the
> repo's GitHub Actions secrets.

## Permanent identity (frozen — do not change)

| Thing | Value |
|---|---|
| Android `applicationId` / `namespace` | `com.tricreta.phonemonitor` |
| Desktop `appId` | `com.tricreta.phonemonitor.desktop` |
| First release | `versionName 1.0.0`, `versionCode 1` |

## The keystore

| Field | Value |
|---|---|
| File | `phone-monitor-release.jks` |
| Local location | `C:\Users\ADMIN\.phone-monitor-signing\phone-monitor-release.jks` (outside the repo) |
| Store type | `JKS` |
| Key alias | `phoneMonitorRelease` |
| Algorithm | RSA 2048, 10000-day validity (expires 2053) |
| SHA-256 | `66:A6:94:42:7A:35:29:06:42:93:73:97:80:6F:5F:F8:D6:0D:B6:F4:56:4E:4F:5D:EF:B0:79:06:26:AE:AE:77` |
| SHA-1 | `B7:ED:F1:B3:2E:2D:85:6E:06:BB:BE:C1:A6:ED:8A:3D:E5:9C:AE:C0` |

Local backups (all gitignored, keep them safe): `CREDENTIALS.txt` (passwords) and
`phone-monitor-release.jks.base64.txt` (the keystore, base64) in the same folder.

### How it was generated (for the record — do NOT re-run)

```bash
keytool -genkeypair -v \
  -keystore phone-monitor-release.jks -storetype JKS \
  -alias phoneMonitorRelease \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass <STORE_PASSWORD> -keypass <KEY_PASSWORD> \
  -dname "CN=Phone Monitor, OU=Release, O=Tricreta, C=US"
```

### Verify the certificate fingerprint

```bash
# from the keystore
keytool -list -v -keystore phone-monitor-release.jks -alias phoneMonitorRelease
# from a built APK (must match the SHA-256 above)
apksigner verify --print-certs phone-monitor-release-v1.0.0.apk
```

## GitHub Actions secrets (already set on wazimuautomate/Phone-monitor)

| Secret | Contents |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | base64 of `phone-monitor-release.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | the store password |
| `ANDROID_KEY_ALIAS` | `phoneMonitorRelease` |
| `ANDROID_KEY_PASSWORD` | the key password |

Re-create the base64 if you ever rotate secrets (you shouldn't rotate the keystore itself):

```bash
# Git Bash / Linux / macOS
openssl base64 -A -in phone-monitor-release.jks -out keystore.b64
# then: gh secret set ANDROID_KEYSTORE_BASE64 -R wazimuautomate/Phone-monitor < keystore.b64
```

```powershell
# PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("phone-monitor-release.jks")) | Set-Content keystore.b64 -Encoding ascii
```

The `android.yml` workflow decodes the keystore to a temp file, writes a temporary
`app/keystore.properties`, runs `assembleRelease`, and **deletes both** afterwards
(even on failure). Secrets are passed via `env:` and never echoed.

## Debug vs release

| | Debug | Release |
|---|---|---|
| Signed with | Android debug key (CI default) | the permanent keystore above |
| applicationId | `com.tricreta.phonemonitor.debug` | `com.tricreta.phonemonitor` |
| Launcher label | **Phone Monitor Debug** | **Phone Monitor** |
| APK name | `phone-monitor-debug-v<version>.apk` | `phone-monitor-release-v<version>.apk` |

They install **side by side** — a debug build can never overwrite or update the release
app. **Ship only the release APK to the client.**

## Versioning rules

- `versionCode` is a positive integer that **must strictly increase** every release.
  CI fails the build if the new `versionCode` is ≤ the last published one.
- `versionName` is semantic:
  - Bug fix: `1.0.0 → 1.0.1`
  - New backward-compatible feature: `1.0.1 → 1.1.0`
  - Major/breaking or redesign: `1.1.0 → 2.0.0`
- Both live in `app/capture/build.gradle.kts` (`versionCode` / `versionName`).

## One-time uninstall (this first release only)

The move to the permanent identity changed the package name **and** the signing key at
once. Android cannot update across either change, so **existing installs must be
uninstalled once** before installing `phone-monitor-release-v1.0.0.apk`. From then on,
every future release installs **in place, without uninstalling and without losing data**
(same applicationId + same key + higher versionCode).
