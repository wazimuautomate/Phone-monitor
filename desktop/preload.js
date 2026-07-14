// Minimal, safe bridge. Exposes a tiny read-only surface so the renderer can
// tell it is running inside the desktop app (vs. a plain browser). Kept lean on
// purpose — all real work goes over the local /ws WebSocket, same as the web build.
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  isDesktop: true,
  platform: process.platform,
  version: process.versions.electron,
});
