import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer } from "ws";
import { SourceManager } from "./sources/source-manager.js";
import { MockSource } from "./sources/mock-source.js";
import { WifiAppSource } from "./sources/wifi-app-source.js";
import { attachHub } from "./ws-hub.js";

const PORT = Number(process.env.PORT ?? 8787);
// Bind all interfaces by default so phones on the LAN can reach the /app endpoint.
const HOST = process.env.HOST ?? "0.0.0.0";
const APP_TOKEN = process.env.APP_TOKEN ?? "";

const dir = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(dir, "../../web/dist");

const app = express();
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "phone-monitor-helper" });
});
app.use(express.static(webDist)); // serves the built dashboard in production

const server = createServer(app);

// Two WebSocket endpoints on one HTTP server, routed by path:
//   /ws  → browser dashboard      /app → Android capture app
const browserWss = new WebSocketServer({ noServer: true });
const appWss = new WebSocketServer({ noServer: true });
server.on("upgrade", (req, socket, head) => {
  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  if (pathname === "/ws") {
    browserWss.handleUpgrade(req, socket, head, (ws) => browserWss.emit("connection", ws, req));
  } else if (pathname === "/app") {
    appWss.handleUpgrade(req, socket, head, (ws) => appWss.emit("connection", ws, req));
  } else {
    socket.destroy();
  }
});

const sources = new SourceManager();
if (process.env.MOCK !== "0") {
  sources.register(new MockSource()); // demo devices; disable with MOCK=0
}
sources.register(new WifiAppSource(appWss, APP_TOKEN)); // Tier-2 capture app ingest
// Phase 1: sources.register(new WifiAdbSource());
attachHub(browserWss, sources);

await sources.start();

server.listen(PORT, HOST, () => {
  console.log(`[helper] listening on ${HOST}:${PORT}  (browser: /ws, app: /app)`);
  console.log(`[helper] app token: ${APP_TOKEN ? "required" : "(none — dev mode)"}`);
  for (const url of lanAppUrls(PORT)) console.log(`[helper] capture app → ${url}`);
  console.log(`[helper] ${sources.devices().length} device(s) known`);
});

function lanAppUrls(port: number): string[] {
  const urls: string[] = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === "IPv4" && !a.internal) urls.push(`ws://${a.address}:${port}/app`);
    }
  }
  return urls;
}
