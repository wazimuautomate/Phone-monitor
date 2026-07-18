// Self-contained in-app updater for the desktop app.
//
// The app is distributed as an unsigned NSIS installer from a *private* GitHub
// release, so we can't use a public update feed or electron-updater's default
// providers without shipping a token anyway. This mirrors the Android updater:
// read the `desktop-latest` release with an embedded read-only token, compare
// versions, download the installer, and run it. NSIS installs over the existing
// app (same appId) in place — no uninstall, no data loss.
//
// Only Node built-ins are used, so nothing extra needs to be packaged.

const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const RELEASE_TAG = "desktop-latest";

function readConfig(appDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(appDir, "build", "update-config.json"), "utf8"));
  } catch {
    return { token: "", repo: "" };
  }
}

// GET that follows redirects. The GitHub asset URL 302s to a storage host that
// rejects the Authorization header, so we DROP the token on any redirect hop.
function request(url, { token, accept, dest, redirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    const headers = { "User-Agent": "PhoneMonitor", Accept: accept || "application/vnd.github+json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    headers["X-GitHub-Api-Version"] = "2022-11-28";

    https
      .get(url, { headers }, (res) => {
        const { statusCode, headers: h } = res;
        if (statusCode >= 300 && statusCode < 400 && h.location) {
          res.resume();
          if (redirects <= 0) return reject(new Error("too many redirects"));
          // No token on the redirected (storage) host.
          return resolve(request(h.location, { accept, dest, redirects: redirects - 1 }));
        }
        if (statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${statusCode}`));
        }
        if (dest) {
          const file = fs.createWriteStream(dest);
          res.pipe(file);
          file.on("finish", () => file.close(() => resolve(dest)));
          file.on("error", reject);
        } else {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => resolve(Buffer.concat(chunks)));
        }
      })
      .on("error", reject);
  });
}

function cmpVersion(a, b) {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

/**
 * Returns one of:
 *   { status: "not-configured" }
 *   { status: "up-to-date", version }
 *   { status: "available", version, notes, exe, assetUrl }
 *   { status: "error", reason }
 */
async function checkForUpdate(appDir, currentVersion) {
  const { token, repo } = readConfig(appDir);
  if (!token || !repo) return { status: "not-configured" };
  try {
    const rel = JSON.parse(
      (await request(`https://api.github.com/repos/${repo}/releases/tags/${RELEASE_TAG}`, { token })).toString("utf8"),
    );
    const assets = rel.assets || [];
    const feedAsset = assets.find((a) => a.name === "latest.json");
    if (!feedAsset) return { status: "error", reason: "no update feed" };
    const feed = JSON.parse(
      (await request(feedAsset.url, { token, accept: "application/octet-stream" })).toString("utf8"),
    );
    if (cmpVersion(feed.version, currentVersion) <= 0) return { status: "up-to-date", version: currentVersion };
    const exeAsset = assets.find((a) => a.name === feed.exe);
    if (!exeAsset) return { status: "error", reason: "installer missing" };
    return { status: "available", version: feed.version, notes: feed.notes || "", exe: feed.exe, assetUrl: exeAsset.url };
  } catch (e) {
    return { status: "error", reason: e.message || "network error" };
  }
}

/** Downloads the installer into the temp dir and returns its path. */
async function downloadInstaller(appDir, assetUrl, exeName) {
  const { token } = readConfig(appDir);
  const dest = path.join(os.tmpdir(), exeName);
  await request(assetUrl, { token, accept: "application/octet-stream", dest });
  return dest;
}

module.exports = { checkForUpdate, downloadInstaller, readConfig };
