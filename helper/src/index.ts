import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import { SourceManager } from "./sources/source-manager.js";
import { MockSource } from "./sources/mock-source.js";
import { WifiAppSource } from "./sources/wifi-app-source.js";
import { attachHub } from "./ws-hub.js";

/**
 * The helper is the real-time core: it serves the dashboard UI, ingests phone
 * streams, and relays video + control between phones and the dashboard.
 *
 * It runs two ways:
 *   - embedded inside the Electron desktop app (`createHelper()` in-process), or
 *   - standalone from the CLI (`node dist/index.js`) for dev / headless use.
 *
 * Two WebSocket endpoints share one HTTP server, routed by path:
 *   /ws  -> browser / desktop dashboard      /app -> Android capture+control app
 */

export interface HelperOptions {
  port?: number;
  host?: string;
  /** Gates the /app phone connection. */
  appToken?: string;
  /** Gates the /ws dashboard connection (dashboard password). Empty = open. */
  accessToken?: string;
  /** Register demo devices so the UI is alive with no hardware. */
  mock?: boolean;
  /** Directory of the built dashboard (web/dist) to serve as static files. */
  webDir?: string;
}

export interface Helper {
  server: Server;
  port: number;
  host: string;
  /** LAN `ws://…/app` URLs a phone can connect to. */
  appUrls: string[];
  close: () => Promise<void>;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

/** Start the helper. Resolves once it is listening. */
export async function createHelper(opts: HelperOptions = {}): Promise<Helper> {
  const port = opts.port ?? Number(process.env.PORT ?? 8787);
  // Bind all interfaces by default so phones on the LAN can reach /app.
  const host = opts.host ?? process.env.HOST ?? "0.0.0.0";
  const APP_TOKEN = opts.appToken ?? process.env.APP_TOKEN ?? "";
  const ACCESS_TOKEN = opts.accessToken ?? process.env.ACCESS_TOKEN ?? "";
  const mock = opts.mock ?? process.env.MOCK !== "0";
  const webDir = opts.webDir ?? defaultWebDir();

  const server = createServer((req, res) => handleHttp(req, res, webDir, ACCESS_TOKEN));

  // Two WebSocket endpoints on one HTTP server, routed by path.
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
      // Phone token from the x-pm-token header OR a ?token= query param.
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

  const stopHeartbeat = [heartbeat(browserWss), heartbeat(appWss)];

  const sources = new SourceManager();
  // Always registered so "Add a demo phone" works on demand; `mock` only decides
  // whether it starts already populated.
  sources.register(new MockSource(mock));
  sources.register(new WifiAppSource(appWss, APP_TOKEN));
  // Phase 1: sources.register(new WifiAdbSource());

  const appUrls = lanAppUrls(port);
  attachHub(browserWss, sources, { appUrls, tokenRequired: APP_TOKEN !== "" });

  await sources.start();
  await listen(server, port, host);

  console.log(`[helper] listening on ${host}:${port}  (dashboard: /ws, app: /app)`);
  console.log(`[helper] app token: ${APP_TOKEN ? "required" : "(none — dev mode)"}`);
  console.log(`[helper] dashboard auth: ${ACCESS_TOKEN ? "password required" : "(open)"}`);
  for (const url of appUrls) console.log(`[helper] capture app → ${url}`);

  const close = async (): Promise<void> => {
    for (const stop of stopHeartbeat) stop();
    await sources.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };

  return { server, port, host, appUrls, close };
}

// ---- HTTP: /health + static dashboard --------------------------------------

function handleHttp(
  req: IncomingMessage,
  res: ServerResponse,
  webDir: string,
  accessToken: string,
): void {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "phone-monitor-helper", authRequired: accessToken !== "" }));
    return;
  }

  // Static file serving from web/dist with an SPA index.html fallback.
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, "");
  let file = path.join(webDir, safe);
  // Prevent path traversal outside webDir.
  if (!file.startsWith(path.resolve(webDir))) file = path.join(webDir, "index.html");
  if (!existsSync(file) || statSync(file).isDirectory()) {
    file = path.join(webDir, "index.html");
  }
  if (!existsSync(file)) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("dashboard build not found");
    return;
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { "content-type": MIME[ext] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
}

// ---- helpers ---------------------------------------------------------------

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

/**
 * Keepalive: ping each socket every 30s and drop any that misses a pong, so
 * half-open connections (phone lost Wi-Fi, laptop slept) are cleaned up.
 * Returns a stop function.
 */
function heartbeat(wss: WebSocketServer): () => void {
  const alive = new WeakMap<WebSocket, boolean>();
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
  return () => clearInterval(timer);
}

function lanAppUrls(port: number): string[] {
  const found: { ip: string; rank: number }[] = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== "IPv4" || a.internal) continue;
      // Rank real home/office Wi-Fi ranges above virtual adapters (Docker / WSL /
      // Hyper-V), which a phone on the actual Wi-Fi can't reach — so the address
      // the dashboard shows first is the one most likely to work.
      const ip = a.address;
      const rank = ip.startsWith("192.168.")
        ? 0
        : ip.startsWith("10.")
          ? 1
          : /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
            ? 2
            : 3;
      found.push({ ip, rank });
    }
  }
  found.sort((x, y) => x.rank - y.rank);
  return found.map((u) => `ws://${u.ip}:${port}/app`);
}

function defaultWebDir(): string {
  try {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(dir, "../../web/dist");
  } catch {
    // esbuild CJS bundle (Electron) passes webDir explicitly, so this is unused there.
    return path.resolve(process.cwd(), "web/dist");
  }
}

// ---- CLI bootstrap ---------------------------------------------------------
// Only runs when invoked directly (node dist/index.js), not when imported by
// the Electron main process.
function isDirectRun(): boolean {
  try {
    return !!process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  createHelper().catch((err) => {
    console.error("[helper] failed to start:", err);
    process.exit(1);
  });
}
