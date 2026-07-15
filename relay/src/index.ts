// ─────────────────────────────────────────────────────────────────────────────
//  Phone Monitor — REMOTE RELAY
//
//  The rendezvous that makes out-of-home ("AnyDesk-style") access work. A phone
//  agent and a desktop viewer BOTH connect OUTBOUND to this relay (so it works
//  through any NAT/firewall, no port-forwarding), and it forwards frames between
//  them, paired by a short code.
//
//    Phone agent  ── wss://relay/agent  ─┐            ┌─ wss://relay/viewer?code=… ── Desktop
//                                        └──[ ROOM ]──┘   (video →, control ←)
//
//  It forwards the phone's existing on-wire protocol verbatim:
//    - text  "hello"  {type:"hello",…}   → viewers
//    - text  "status" {type:"status",…}  → viewers
//    - binary [1 byte type + H.264]       → viewers
//    - text  "control"{type:"control",…}  ← from a viewer → the agent
//  plus its own small control plane (welcome / linked / waiting / *-left).
//
//  Media is encrypted in transit (WSS) but passes THROUGH the relay — this is not
//  end-to-end. True P2P (WebRTC/DTLS) is a later optimization; see REBUILD-PLAN.md.
// ─────────────────────────────────────────────────────────────────────────────

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomInt } from "node:crypto";
import { WebSocketServer, type RawData, type WebSocket } from "ws";

const PORT = Number(process.env.PORT ?? 8788);
const HOST = process.env.HOST ?? "0.0.0.0";
// Optional shared secret. When set, every connection must present it via ?token=
// or the x-pm-token header. Empty = open (fine for local testing; set it in prod).
const RELAY_TOKEN = process.env.RELAY_TOKEN ?? "";
// How long a room survives after its agent drops, so the phone can reconnect and
// reclaim the same code (and viewers stay attached across the blip).
const RECLAIM_TTL_MS = Number(process.env.RECLAIM_TTL_MS ?? 5 * 60 * 1000);

interface Room {
  code: string;
  agent: WebSocket | null;
  viewers: Set<WebSocket>;
  lastHello: string | null; // replayed to a late-joining viewer
  lastConfig: Buffer | null; // H.264 SPS/PPS — a viewer can't decode without it
  agentGoneAt: number | null;
}

const rooms = new Map<string, Room>();
// Reverse index so a closing socket finds its room/role in O(1).
const conns = new WeakMap<WebSocket, { code: string; role: "agent" | "viewer" }>();

function genCode(): string {
  let code: string;
  do {
    code = String(randomInt(100_000_000, 1_000_000_000)); // 9 digits, AnyDesk-style
  } while (rooms.has(code));
  return code;
}

function sendJson(ws: WebSocket, msg: unknown): void {
  if (ws.readyState === ws.OPEN) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* socket closing */
    }
  }
}

function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data as ArrayBuffer);
}

// ── Agent (phone) ────────────────────────────────────────────────────────────

function onAgentConnect(ws: WebSocket, desired: string | null): void {
  // Reclaim the requested code (reconnect / relay restart), or mint a new one.
  let room: Room;
  if (desired && rooms.has(desired)) {
    room = rooms.get(desired)!;
    if (room.agent && room.agent !== ws) {
      try {
        room.agent.close(1000, "replaced by newer agent");
      } catch {
        /* ignore */
      }
    }
  } else {
    const code = desired && !rooms.has(desired) ? desired : genCode();
    room = { code, agent: null, viewers: new Set(), lastHello: null, lastConfig: null, agentGoneAt: null };
    rooms.set(code, room);
  }
  room.agent = ws;
  room.agentGoneAt = null;
  conns.set(ws, { code: room.code, role: "agent" });

  sendJson(ws, { type: "welcome", code: room.code });
  // Any viewers already waiting are now live.
  for (const v of room.viewers) sendJson(v, { type: "linked" });

  ws.on("message", (data: RawData, isBinary: boolean) => {
    const buf = toBuffer(data);
    if (isBinary) {
      // Cache the H.264 config (type byte 0) so late viewers can start decoding.
      if (buf.length >= 1 && buf[0] === 0) room.lastConfig = buf;
      for (const v of room.viewers) forwardBinary(v, buf);
    } else {
      const text = buf.toString();
      // Cache the latest hello to replay to viewers that join mid-stream.
      if (isHello(text)) room.lastHello = text;
      for (const v of room.viewers) forwardText(v, text);
    }
  });

  ws.on("close", () => {
    if (conns.get(ws)?.role === "agent" && room.agent === ws) {
      room.agent = null;
      room.agentGoneAt = Date.now();
      for (const v of room.viewers) sendJson(v, { type: "agent-left" });
    }
    conns.delete(ws);
  });
  ws.on("error", () => ws.close());
}

// ── Viewer (desktop) ─────────────────────────────────────────────────────────

function onViewerConnect(ws: WebSocket, code: string | null): void {
  if (!code) {
    sendJson(ws, { type: "error", error: "missing code" });
    ws.close(1008, "missing code");
    return;
  }
  let room = rooms.get(code);
  if (!room) {
    // Allow connecting before the phone is online: hold the code and wait.
    room = { code, agent: null, viewers: new Set(), lastHello: null, lastConfig: null, agentGoneAt: Date.now() };
    rooms.set(code, room);
  }
  room.viewers.add(ws);
  conns.set(ws, { code, role: "viewer" });

  if (room.agent) {
    sendJson(ws, { type: "linked" });
    // Replay hello + H.264 config so the tile registers and can decode at once.
    if (room.lastHello) forwardText(ws, room.lastHello);
    if (room.lastConfig) forwardBinary(ws, room.lastConfig);
  } else {
    sendJson(ws, { type: "waiting" });
  }

  ws.on("message", (data: RawData, isBinary: boolean) => {
    // Viewers only send control (text). Forward to the agent.
    if (isBinary) return;
    const room2 = rooms.get(code);
    if (room2?.agent) forwardText(room2.agent, toBuffer(data).toString());
  });

  ws.on("close", () => {
    const r = rooms.get(code);
    if (r) r.viewers.delete(ws);
    conns.delete(ws);
  });
  ws.on("error", () => ws.close());
}

function forwardText(ws: WebSocket, text: string): void {
  if (ws.readyState === ws.OPEN) {
    try {
      ws.send(text);
    } catch {
      /* ignore */
    }
  }
}
function forwardBinary(ws: WebSocket, buf: Buffer): void {
  if (ws.readyState === ws.OPEN) {
    try {
      ws.send(buf, { binary: true });
    } catch {
      /* ignore */
    }
  }
}
function isHello(text: string): boolean {
  return text.length < 4096 && text.includes('"hello"') && text.includes('"type"');
}

// ── HTTP + WebSocket wiring ──────────────────────────────────────────────────

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  if (req.url && req.url.startsWith("/health")) {
    res.writeHead(200, { "content-type": "application/json" });
    let agents = 0;
    for (const r of rooms.values()) if (r.agent) agents++;
    res.end(JSON.stringify({ ok: true, service: "phone-monitor-relay", rooms: rooms.size, agents }));
    return;
  }
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("Phone Monitor relay. Connect a phone at /agent and a desktop at /viewer?code=…");
});

const agentWss = new WebSocketServer({ noServer: true });
const viewerWss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (RELAY_TOKEN) {
    const provided =
      (req.headers["x-pm-token"] as string | undefined) ?? url.searchParams.get("token") ?? "";
    if (provided !== RELAY_TOKEN) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
  }
  if (url.pathname === "/agent") {
    agentWss.handleUpgrade(req, socket, head, (ws) => agentWss.emit("connection", ws, req));
  } else if (url.pathname === "/viewer") {
    viewerWss.handleUpgrade(req, socket, head, (ws) => viewerWss.emit("connection", ws, req));
  } else {
    socket.destroy();
  }
});

agentWss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  onAgentConnect(ws, url.searchParams.get("code"));
});
viewerWss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  onViewerConnect(ws, url.searchParams.get("code"));
});

// Keepalive on both endpoints: drop half-open sockets so rooms reflect reality.
function heartbeat(wss: WebSocketServer): void {
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
        /* closing */
      }
    }
  }, 30000);
  wss.on("close", () => clearInterval(timer));
}
heartbeat(agentWss);
heartbeat(viewerWss);

// Sweep rooms whose agent has been gone past the reclaim window and that have no
// viewers, so codes don't leak forever.
const sweep = setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    const agentGone = !room.agent && room.agentGoneAt !== null && now - room.agentGoneAt > RECLAIM_TTL_MS;
    if (agentGone && room.viewers.size === 0) rooms.delete(room.code);
  }
}, 60_000);

server.listen(PORT, HOST, () => {
  console.log(`[relay] listening on ${HOST}:${PORT}  (phone: /agent, desktop: /viewer?code=…)`);
  console.log(`[relay] token: ${RELAY_TOKEN ? "required" : "(none — set RELAY_TOKEN in production)"}`);
});

process.on("SIGINT", () => {
  clearInterval(sweep);
  server.close(() => process.exit(0));
});
