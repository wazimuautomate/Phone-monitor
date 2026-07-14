// ─────────────────────────────────────────────────────────────────────────────
//  Phone Monitor — SIGNALING RELAY  (SCAFFOLD, not on the current LAN demo path)
//
//  Role: a thin WebRTC signaling broker for the REMOTE (out-of-home) control path
//  described in REBUILD-PLAN.md §2–3. It pairs a "desktop" peer with a "phone" /
//  "controller" peer by a short human-friendly code, then relays SDP/ICE between
//  them. It NEVER touches media — WebRTC media is peer-to-peer and end-to-end
//  encrypted (DTLS-SRTP). A TURN server (documented in README, NOT implemented
//  here) handles the symmetric-NAT fallback where P2P can't connect.
//
//  This is a foundation scaffold. It is intentionally small and self-contained.
// ─────────────────────────────────────────────────────────────────────────────

import { createServer } from "node:http";
import { randomInt } from "node:crypto";
import express from "express";
import { WebSocketServer, type WebSocket } from "ws";

const PORT = Number(process.env.PORT ?? 8788);
// Bind all interfaces by default: the relay is reached from off-LAN peers.
const HOST = process.env.HOST ?? "0.0.0.0";
// Optional shared secret. When set, every WS connection must present it via
// ?token= or the x-pm-token header (query params survive proxies that strip
// custom headers). Empty = open (dev mode).
const RELAY_TOKEN = process.env.RELAY_TOKEN ?? "";
// Rooms with no joined guest are swept after this idle window.
const ROOM_TTL_MS = Number(process.env.ROOM_TTL_MS ?? 10 * 60 * 1000);

// ── Signaling protocol ───────────────────────────────────────────────────────

/** "desktop" registers a room; "phone"/"controller" joins it. Labels only — the
 *  relay is role-agnostic and just brokers two peers per room. */
type Role = "desktop" | "phone" | "controller";

/** Opaque-to-us WebRTC signaling body. The relay forwards it verbatim; only the
 *  peers parse it. Typed here purely for documentation. */
type SignalPayload =
  | { kind: "offer"; sdp: string }
  | { kind: "answer"; sdp: string }
  | { kind: "ice"; candidate: unknown };

/** client → server */
type ClientMessage =
  | { type: "register"; role: "desktop" }
  | { type: "join"; role: "phone" | "controller"; code: string }
  | { type: "signal"; code: string; payload: SignalPayload }
  | { type: "leave" };

/** server → client */
type ServerMessage =
  | { type: "registered"; code: string }
  | { type: "joined"; code: string }
  | { type: "peer-joined"; role: Role }
  | { type: "peer-left"; role: Role }
  | { type: "signal"; from: Role; payload: SignalPayload }
  | { type: "error"; message: string };

// ── Room registry (in-memory) ────────────────────────────────────────────────

interface Peer {
  ws: WebSocket;
  role: Role;
}

interface Room {
  code: string;
  host: Peer | null; // the "desktop" that registered
  guest: Peer | null; // the "phone"/"controller" that joined
  createdAt: number;
  lastActivity: number;
}

const rooms = new Map<string, Room>();
/** Reverse index so a closing socket can find and leave its room in O(1). */
const bindings = new WeakMap<WebSocket, { code: string; peer: Peer }>();

// Unambiguous alphabet (no I/L/O/0/1) → easy to read aloud / type on a phone.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function makeCode(len = 6): string {
  let s = "";
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}
function makeUniqueCode(): string {
  let code = makeCode();
  while (rooms.has(code)) code = makeCode();
  return code;
}

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function other(room: Room, peer: Peer): Peer | null {
  if (room.host === peer) return room.guest;
  if (room.guest === peer) return room.host;
  return null;
}

/** Remove a peer from its room, notify the other side, and drop empty rooms. */
function leaveRoom(ws: WebSocket): void {
  const binding = bindings.get(ws);
  if (!binding) return;
  bindings.delete(ws);
  const room = rooms.get(binding.code);
  if (!room) return;

  const peer = binding.peer;
  const survivor = other(room, peer);
  if (room.host === peer) room.host = null;
  if (room.guest === peer) room.guest = null;

  if (survivor) send(survivor.ws, { type: "peer-left", role: peer.role });
  // The room dies with its host; if only the guest left, the host keeps waiting.
  if (!room.host) rooms.delete(room.code);
  else room.lastActivity = Date.now();
}

// ── Message handling ─────────────────────────────────────────────────────────

function parse(raw: string): ClientMessage | null {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null) return null;
  const m = obj as Record<string, unknown>;
  return typeof m.type === "string" ? (m as ClientMessage) : null;
}

function handleRegister(ws: WebSocket, msg: Extract<ClientMessage, { type: "register" }>): void {
  if (bindings.has(ws)) return send(ws, { type: "error", message: "already in a room" });
  if (msg.role !== "desktop") return send(ws, { type: "error", message: "only desktop can register" });

  const code = makeUniqueCode();
  const peer: Peer = { ws, role: "desktop" };
  const now = Date.now();
  rooms.set(code, { code, host: peer, guest: null, createdAt: now, lastActivity: now });
  bindings.set(ws, { code, peer });
  send(ws, { type: "registered", code });
}

function handleJoin(ws: WebSocket, msg: Extract<ClientMessage, { type: "join" }>): void {
  if (bindings.has(ws)) return send(ws, { type: "error", message: "already in a room" });
  if (msg.role !== "phone" && msg.role !== "controller")
    return send(ws, { type: "error", message: "join role must be phone or controller" });
  if (typeof msg.code !== "string") return send(ws, { type: "error", message: "missing code" });

  const room = rooms.get(msg.code.toUpperCase());
  const host = room?.host;
  if (!room || !host) return send(ws, { type: "error", message: "no such room" });
  if (room.guest) return send(ws, { type: "error", message: "room is full" });

  const peer: Peer = { ws, role: msg.role };
  room.guest = peer;
  room.lastActivity = Date.now();
  bindings.set(ws, { code: room.code, peer });
  send(ws, { type: "joined", code: room.code });

  // Tell both peers the room is now complete.
  send(host.ws, { type: "peer-joined", role: peer.role });
  send(ws, { type: "peer-joined", role: host.role });
}

function handleSignal(ws: WebSocket, msg: Extract<ClientMessage, { type: "signal" }>): void {
  const binding = bindings.get(ws);
  if (!binding) return send(ws, { type: "error", message: "not in a room" });
  const room = rooms.get(binding.code);
  if (!room) return send(ws, { type: "error", message: "room closed" });

  const target = other(room, binding.peer);
  if (!target) return send(ws, { type: "error", message: "peer not connected" });

  room.lastActivity = Date.now();
  // Verbatim relay — we do not inspect or store the payload.
  send(target.ws, { type: "signal", from: binding.peer.role, payload: msg.payload });
}

function onMessage(ws: WebSocket, raw: string): void {
  const msg = parse(raw);
  if (!msg) return send(ws, { type: "error", message: "malformed message" });

  switch (msg.type) {
    case "register":
      return handleRegister(ws, msg);
    case "join":
      return handleJoin(ws, msg);
    case "signal":
      return handleSignal(ws, msg);
    case "leave":
      return leaveRoom(ws);
    default:
      return send(ws, { type: "error", message: `unknown type: ${(msg as { type: string }).type}` });
  }
}

// ── HTTP + WebSocket wiring ──────────────────────────────────────────────────

const app = express();
app.get("/health", (_req, res) => {
  res.json({ ok: true, rooms: rooms.size, service: "phone-monitor-relay" });
});

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname !== "/signal") {
    socket.destroy();
    return;
  }
  if (RELAY_TOKEN) {
    const provided =
      (req.headers["x-pm-token"] as string | undefined) ?? url.searchParams.get("token") ?? "";
    if (provided !== RELAY_TOKEN) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});

wss.on("connection", (ws: WebSocket) => {
  ws.on("message", (data) => onMessage(ws, data.toString()));
  ws.on("close", () => leaveRoom(ws));
  ws.on("error", () => leaveRoom(ws));
});

// Keepalive: drop half-open sockets (peer lost network) so rooms reflect reality.
const alive = new WeakMap<WebSocket, boolean>();
wss.on("connection", (ws: WebSocket) => {
  alive.set(ws, true);
  ws.on("pong", () => alive.set(ws, true));
});
const pingTimer = setInterval(() => {
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
wss.on("close", () => clearInterval(pingTimer));

// Sweep rooms whose guest never arrived (or left) and have gone idle.
const sweepTimer = setInterval(() => {
  const cutoff = Date.now() - ROOM_TTL_MS;
  for (const room of rooms.values()) {
    if (!room.guest && room.lastActivity < cutoff) {
      if (room.host) send(room.host.ws, { type: "error", message: "room expired" });
      rooms.delete(room.code);
    }
  }
}, 60000);

server.listen(PORT, HOST, () => {
  console.log(`[relay] SCAFFOLD signaling server on ${HOST}:${PORT}  (ws: /signal)`);
  console.log(`[relay] token: ${RELAY_TOKEN ? "required" : "(none — dev mode)"}`);
  console.log(`[relay] TURN fallback: NOT implemented here — see README.md`);
});

process.on("SIGINT", () => {
  clearInterval(pingTimer);
  clearInterval(sweepTimer);
  server.close(() => process.exit(0));
});
