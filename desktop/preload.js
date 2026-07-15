// Minimal, safe bridge. Exposes only the handful of native capabilities the
// dashboard can't do itself: keeping the display awake, writing screenshots /
// recordings to disk, picking folders, and real fullscreen. Everything else
// (devices, video, control) still flows over the local /ws WebSocket, exactly
// as it does in the plain web build — which is why the renderer treats this
// bridge as optional and degrades gracefully when it is absent.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  isDesktop: true,
  platform: process.platform,
  electron: process.versions.electron,

  appVersion: () => ipcRenderer.invoke("pm:app-version"),
  defaultPaths: () => ipcRenderer.invoke("pm:default-paths"),

  /** Prevent the display from sleeping while a wall of phones is on screen. */
  keepAwake: (on) => ipcRenderer.invoke("pm:keep-awake", on),

  pickFolder: (current) => ipcRenderer.invoke("pm:pick-folder", current),

  /** Write a capture to disk. `data` is an ArrayBuffer. Returns the full path. */
  saveCapture: (dir, name, data) => ipcRenderer.invoke("pm:save-capture", { dir, name, data }),

  /** Open a folder, or reveal a file in its folder. */
  openPath: (target) => ipcRenderer.invoke("pm:open-path", target),

  setFullScreen: (on) => ipcRenderer.invoke("pm:set-fullscreen", on),
  isFullScreen: () => ipcRenderer.invoke("pm:is-fullscreen"),

  /** Fires when fullscreen changes by any route (button, F11, Esc). */
  onFullScreenChanged: (cb) => {
    const handler = (_e, value) => cb(!!value);
    ipcRenderer.on("pm:fullscreen-changed", handler);
    return () => ipcRenderer.off("pm:fullscreen-changed", handler);
  },
});
