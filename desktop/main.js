// Phone Monitor — Electron main process.
//
// The desktop app is a native window onto the local helper. On launch it starts
// the helper in-process (bundled at build/helper.cjs), which serves the React
// dashboard and hosts the /ws (dashboard) and /app (phone) WebSocket endpoints,
// then opens a Chromium window pointed at it. All the real-time capture, decode,
// and AnyDesk-style control run through that one local process — no cloud.

const path = require("node:path");
const { app, BrowserWindow, shell, Menu } = require("electron");

const PORT = Number(process.env.PM_PORT || 8787);
const HELPER_URL = `http://127.0.0.1:${PORT}/`;

let helper = null;
let win = null;

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
    mock: process.env.PM_MOCK !== "0",
    webDir: path.join(__dirname, "build", "web"),
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: "#0b0b0d",
    title: "Phone Monitor",
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

  win.on("closed", () => {
    win = null;
  });
}

function main() {
  app.whenReady().then(async () => {
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
    try {
      await helper?.close();
    } catch {
      /* ignore */
    }
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", async () => {
    try {
      await helper?.close();
    } catch {
      /* ignore */
    }
  });
}
