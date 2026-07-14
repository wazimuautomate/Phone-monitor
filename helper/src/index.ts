import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer, type WebSocket } from "ws";
import { SourceManager } from "./sources/source-manager.js";
import { MockSource } from "./sources/mock-source.js";
import { WifiAppSource } from "./sources/wifi-app-source.js";
import { attachHub } from "./ws-hub.js";

const PORT = Number(process.env.PORT ?? 8787);
// Bind all interfaces by default so phones on the LAN can reach the /app endpoint.
const HOST = process.env.HOST ?? "0.0.0.0";
const APP_TOKEN = process.env.APP_TOKEN ?? ""; // capture app -> /app
const ACCESS_TOKEN = process.env.ACCESS_TOKEN ?? ""; // dashboard password -> /ws

const dir = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(dir, "../../web/dist");

const app = express();
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "phone-monitor-helper", authRequired: ACCESS_TOKEN !== "" });
});
app.use(express.static(webDist)); // serves the built dashboard in production

const server = createServer(app);

// Two WebSocket endpoints on one HTTP server, routed by path:
//   /ws  → browser dashboard      /app → Android capture app
const browserWss = new WebSocketServer({ noServer: true });
const appWss = new WebSocketServer({ noServer: true });
server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/ws") {
    if (ACCESS_TOKEN && url.searchParams.get("token") !== ACCESS_TOKEN) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    browserWss.handleUpgrade(req, socket, head, (ws) => browserWss.emit("connection", ws, req));
  } else if (url.pathname === "/app") {
    // Accept the phone token from EITHER the x-pm-token header OR a ?token= query
    // param. Query params survive every proxy; some strip custom headers on the
    // WebSocket upgrade. Reject with a real 401 so the app can say "wrong token".
    if (APP_TOKEN) {
      const provided =
        (req.headers["x-pm-token"] as string | undefined) ?? url.searchParams.get("token") ?? "";
      if (provided !== APP_TOKEN) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
    }
    appWss.handleUpgrade(req, socket, head, (ws) => appWss.emit("connection", ws, req));
  } else {
    socket.destroy();
  }
});

// Keepalive: ping each socket every 30s and drop any that misses a pong, so
// half-open connections (phone lost Wi-Fi, laptop slept) are cleaned up and the
// dashboard reflects reality. Clients auto-reply to pings, so healthy ones stay.
const alive = new WeakMap<WebSocket, boolean>();
function heartbeat(wss: WebSocketServer): void {
  wss.on("connection", (ws: WebSocket) => {
    alive.set(ws, true);
    ws.on("pong", () => alive.set(ws, true));
  });
  const timer = setInterval(() => {
    for (const ws of wss.clients) {
      if (alive.get(ws) === false) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      try {
        ws.ping();
      } catch {
        /* socket already closing */
      }
    }
  }, 30000);
  wss.on("close", () => clearInterval(timer));
}
heartbeat(browserWss);
heartbeat(appWss);

const sources = new SourceManager();
if (process.env.MOCK !== "0") {
  sources.register(new MockSource()); // demo devices; disable with MOCK=0
}
sources.register(new WifiAppSource(appWss, APP_TOKEN)); // Tier-2 capture app ingest
// Phase 1: sources.register(new WifiAdbSource());

const appUrls = lanAppUrls(PORT);
attachHub(browserWss, sources, { appUrls, tokenRequired: APP_TOKEN !== "" });

await sources.start();

server.listen(PORT, HOST, () => {
  console.log(`[helper] listening on ${HOST}:${PORT}  (browser: /ws, app: /app)`);
  console.log(`[helper] app token: ${APP_TOKEN ? "required" : "(none — dev mode)"}`);
  console.log(`[helper] dashboard auth: ${ACCESS_TOKEN ? "password required" : "(open)"}`);
  for (const url of appUrls) console.log(`[helper] capture app → ${url}`);
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
