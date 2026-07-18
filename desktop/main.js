// Phone Monitor — Electron main process.
//
// The desktop app is a native window onto the local helper. On launch it starts
// the helper in-process (bundled at build/helper.cjs), which serves the React
// dashboard and hosts the /ws (dashboard) and /app (phone) WebSocket endpoints,
// then opens a Chromium window pointed at it. All the real-time capture, decode,
// and AnyDesk-style control run through that one local process — no cloud.
//
// Beyond hosting the window, main owns the things only a native app can do:
// keeping the display awake, writing screenshots/recordings to disk, picking
// folders, and real fullscreen.

const path = require("node:path");
const fs = require("node:fs");
const {
  app,
  BrowserWindow,
  shell,
  Menu,
  ipcMain,
  dialog,
  powerSaveBlocker,
} = require("electron");

const updater = require("./updater");

const PORT = Number(process.env.PM_PORT || 8787);
const HELPER_URL = `http://127.0.0.1:${PORT}/`;

let helper = null;
let win = null;
// powerSaveBlocker id while "keep screen awake" is on (null = off).
let awakeId = null;

// ---- Diagnostics ------------------------------------------------------------
//
// "It doesn't work on my PC" is impossible to act on. Everything unexpected goes
// to a log next to the app's data, and anything fatal is shown rather than
// failing silently — a machine we can't reach can still tell us what happened.

function logPath() {
  try {
    return path.join(app.getPath("userData"), "startup.log");
  } catch {
    return null;
  }
}

function logLine(message) {
  try {
    const file = logPath();
    if (file) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.appendFileSync(file, `${new Date().toISOString()}  ${message}\n`);
    }
  } catch {
    /* logging must never be the thing that breaks the app */
  }
  console.log(`[desktop] ${message}`);
}

function reportFatal(where, err) {
  const detail = err?.stack || String(err);
  logLine(`FATAL (${where}): ${detail}`);
  try {
    dialog.showErrorBox(
      "Phone Monitor couldn’t start",
      `${where}\n\n${detail}\n\nDetails were saved to:\n${logPath() ?? "(unavailable)"}`,
    );
  } catch {
    /* no UI available */
  }
}

process.on("uncaughtException", (err) => reportFatal("Unexpected error", err));
process.on("unhandledRejection", (err) => logLine(`unhandledRejection: ${err?.stack || err}`));

// Single-instance: focus the existing window instead of opening a second app.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  main();
}

async function startHelper() {
  const { createHelper } = require("./build/helper.cjs");
  helper = await createHelper({
    port: PORT,
    // Bind ALL interfaces so phones on the same Wi-Fi can reach /app. The window
    // still loads via 127.0.0.1 (loopback is included). Binding loopback-only
    // would make the advertised LAN url unreachable — phones would time out.
    host: "0.0.0.0",
    // Start with NO demo devices — a clean, blank dashboard. The user adds demo
    // phones on demand from the empty state / Settings. Opt in with PM_MOCK=1.
    mock: process.env.PM_MOCK === "1",
    webDir: path.join(__dirname, "build", "web"),
  });
}

// ---- Capture folders --------------------------------------------------------

function defaultPaths() {
  return {
    screenshots: path.join(app.getPath("pictures"), "Phone Monitor"),
    recordings: path.join(app.getPath("videos"), "Phone Monitor"),
  };
}

// ---- Keep the display awake -------------------------------------------------

/**
 * While on, Windows never blanks or sleeps the display — the whole point of a
 * wall of phones you can glance at. Idempotent; safe to call repeatedly.
 */
function setKeepAwake(on) {
  if (on) {
    if (awakeId === null || !powerSaveBlocker.isStarted(awakeId)) {
      awakeId = powerSaveBlocker.start("prevent-display-sleep");
    }
  } else if (awakeId !== null) {
    if (powerSaveBlocker.isStarted(awakeId)) powerSaveBlocker.stop(awakeId);
    awakeId = null;
  }
  return awakeId !== null && powerSaveBlocker.isStarted(awakeId);
}

// ---- IPC --------------------------------------------------------------------

function registerIpc() {
  ipcMain.handle("pm:app-version", () => app.getVersion());
  ipcMain.handle("pm:default-paths", () => defaultPaths());

  ipcMain.handle("pm:keep-awake", (_e, on) => setKeepAwake(!!on));

  ipcMain.handle("pm:pick-folder", async (_e, current) => {
    const res = await dialog.showOpenDialog(win, {
      title: "Choose a folder",
      defaultPath: current || app.getPath("pictures"),
      properties: ["openDirectory", "createDirectory"],
    });
    return res.canceled ? null : res.filePaths[0];
  });

  // Write a screenshot/recording the renderer produced. `data` is an ArrayBuffer.
  ipcMain.handle("pm:save-capture", async (_e, { dir, name, data }) => {
    const target = dir || defaultPaths().screenshots;
    await fs.promises.mkdir(target, { recursive: true });
    const file = path.join(target, name);
    await fs.promises.writeFile(file, Buffer.from(data));
    return file;
  });

  ipcMain.handle("pm:open-path", async (_e, target) => {
    if (!target) return false;
    // Reveal the file in its folder; plain folders just open.
    const stat = await fs.promises.stat(target).catch(() => null);
    if (stat && stat.isDirectory()) {
      await shell.openPath(target);
    } else if (stat) {
      shell.showItemInFolder(target);
    } else {
      await fs.promises.mkdir(target, { recursive: true }).catch(() => {});
      await shell.openPath(target);
    }
    return true;
  });

  ipcMain.handle("pm:set-fullscreen", (_e, on) => {
    if (!win) return false;
    win.setFullScreen(!!on);
    return win.isFullScreen();
  });
  ipcMain.handle("pm:is-fullscreen", () => !!win && win.isFullScreen());

  // ---- In-app update ----
  ipcMain.handle("pm:check-update", () => updater.checkForUpdate(__dirname, app.getVersion()));
  ipcMain.handle("pm:install-update", async (_e, { assetUrl, exe }) => {
    const file = await updater.downloadInstaller(__dirname, assetUrl, exe);
    // Launch the NSIS installer, then quit so it can replace files in place.
    // Same appId => it updates the existing install without uninstalling.
    logLine(`installing update from ${file}`);
    shell.openPath(file);
    setTimeout(() => app.quit(), 500);
    return true;
  });
}

// Quietly check on launch and let the renderer surface a badge if an update is
// waiting. Never blocks startup; failures are ignored.
function checkForUpdateOnLaunch() {
  setTimeout(async () => {
    try {
      const info = await updater.checkForUpdate(__dirname, app.getVersion());
      if (info.status === "available" && win && !win.isDestroyed()) {
        win.webContents.send("pm:update-available", info);
        logLine(`update available: v${info.version}`);
      }
    } catch {
      /* offline / not configured — ignore */
    }
  }, 4000);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: "#0b0b0d",
    title: "Phone Monitor",
    // Window + taskbar icon. The packaged .exe gets its icon from build.win.icon
    // in package.json; this is what an unpackaged `npm start` shows.
    icon: path.join(__dirname, "assets", "icon.png"),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  Menu.setApplicationMenu(null);
  win.loadURL(HELPER_URL);
  win.once("ready-to-show", () => win.show());

  // If the helper isn't quite ready on first paint, retry the load a few times.
  let retries = 0;
  win.webContents.on("did-fail-load", () => {
    if (retries++ < 10) setTimeout(() => win && !win.isDestroyed() && win.loadURL(HELPER_URL), 500);
  });

  // Open target=_blank / external links in the system browser, not a new window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) shell.openExternal(url);
    return { action: "deny" };
  });

  // Let the renderer keep its fullscreen button in sync with the real state
  // (the user can also leave fullscreen with F11 / Esc).
  const pushFs = () => win?.webContents.send("pm:fullscreen-changed", win.isFullScreen());
  win.on("enter-full-screen", pushFs);
  win.on("leave-full-screen", pushFs);

  win.webContents.on("render-process-gone", (_e, details) =>
    logLine(`renderer gone: ${details.reason} (exitCode ${details.exitCode})`),
  );
  win.webContents.on("did-fail-load", (_e, code, desc) => logLine(`did-fail-load ${code} ${desc}`));
  app.on("child-process-gone", (_e, details) =>
    logLine(`child process gone: ${details.type} ${details.reason}`),
  );

  win.on("closed", () => {
    win = null;
  });
}

function main() {
  app.whenReady().then(async () => {
    registerIpc();
    logLine(`starting  v${app.getVersion()}  electron=${process.versions.electron}  ${process.platform}/${process.arch}`);
    try {
      await startHelper();
      logLine(`helper listening on port ${PORT}`);
    } catch (err) {
      // Nearly always the port already being in use (a second copy running).
      reportFatal(`The background service couldn't start on port ${PORT}. Is Phone Monitor already running?`, err);
    }
    createWindow();
    checkForUpdateOnLaunch();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", async () => {
    setKeepAwake(false);
    try {
      await helper?.close();
    } catch {
      /* ignore */
    }
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", async () => {
    setKeepAwake(false);
    try {
      await helper?.close();
    } catch {
      /* ignore */
    }
  });
}
