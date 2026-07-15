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

const PORT = Number(process.env.PM_PORT || 8787);
const HELPER_URL = `http://127.0.0.1:${PORT}/`;

let helper = null;
let win = null;
// powerSaveBlocker id while "keep screen awake" is on (null = off).
let awakeId = null;

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

  win.on("closed", () => {
    win = null;
  });
}

function main() {
  app.whenReady().then(async () => {
    registerIpc();
    try {
      await startHelper();
    } catch (err) {
      console.error("[desktop] helper failed to start:", err);
    }
    createWindow();

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
