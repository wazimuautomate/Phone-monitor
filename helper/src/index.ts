import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer } from "ws";
import { SourceManager } from "./sources/source-manager.js";
import { MockSource } from "./sources/mock-source.js";
import { attachHub } from "./ws-hub.js";

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "127.0.0.1"; // localhost-only by default (security)

const dir = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(dir, "../../web/dist");

const app = express();
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "phone-monitor-helper" });
});
app.use(express.static(webDist)); // serves the built dashboard in production

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

const sources = new SourceManager();
if (process.env.MOCK !== "0") {
  sources.register(new MockSource()); // demo devices until real sources are wired
}
// Phase 1: sources.register(new WifiAdbSource());
// Phase 2: sources.register(new WifiAppSource(PAIRING_TOKEN));
attachHub(wss, sources);

await sources.start();

server.listen(PORT, HOST, () => {
  console.log(`[helper] http://${HOST}:${PORT}  (WebSocket: /ws)`);
  console.log(`[helper] ${sources.devices().length} device(s) known — register sources to add capture backends`);
});
