# `@phone-monitor/relay` — Signaling Relay (SCAFFOLD)

> **Status: scaffold.** This is the foundation for the **remote (out-of-home)**
> control path from [`REBUILD-PLAN.md`](../REBUILD-PLAN.md) §2–3. It is **not** on
> the current LAN demo path and nothing in the app depends on it yet.

## What it is

A thin **WebRTC signaling broker**. Two peers — a **desktop** and a **phone /
controller** — find each other through a short **pairing code**, then the relay
passes their `offer` / `answer` / `ice` messages back and forth until they open a
direct WebRTC peer connection.

That's the whole job. The relay is a **broker only**:

- It **never touches media.** WebRTC media (screen video + input data channel) is
  peer-to-peer and **end-to-end encrypted** (DTLS-SRTP). In the happy path, once
  the two peers are connected, no media flows through this server at all.
- It holds a small **in-memory** registry of rooms keyed by pairing code. Nothing
  is persisted; rooms are cleaned up on disconnect and swept when idle.

```
 desktop ──register──►  ┌─────────┐  ◄──join── phone/controller
         ◄─code──────   │  RELAY  │   ──joined──►
         ──signal(offer)►  (this)  ◄─signal(answer/ice)──
                        └─────────┘
              (SDP/ICE only — media goes P2P, not through here)
```

## Message protocol

Transport: **WebSocket JSON** at path **`/signal`** (e.g.
`ws://HOST:PORT/signal`). One message = one JSON object with a `type` field.

Roles: `desktop` (registers a room) and `phone` / `controller` (joins one). The
relay is role-agnostic — the labels are only echoed back so each peer knows who
it's talking to.

### client → server

| Message | Meaning |
|---|---|
| `{ "type": "register", "role": "desktop" }` | Create a room; server allocates a pairing code. |
| `{ "type": "join", "role": "phone"\|"controller", "code": "AB12CD" }` | Join an existing room by code. |
| `{ "type": "signal", "code": "AB12CD", "payload": { … } }` | Relay a signaling body to the other peer. `payload` is opaque to the relay: `{ "kind":"offer", "sdp":"…" }`, `{ "kind":"answer", "sdp":"…" }`, or `{ "kind":"ice", "candidate":{…} }`. |
| `{ "type": "leave" }` | Gracefully leave the room. |

### server → client

| Message | Meaning |
|---|---|
| `{ "type": "registered", "code": "AB12CD" }` | Room created; show/share this code. |
| `{ "type": "joined", "code": "AB12CD" }` | You joined successfully. |
| `{ "type": "peer-joined", "role": "…" }` | The other peer is now present (sent to **both** sides). Begin the WebRTC offer/answer. |
| `{ "type": "peer-left", "role": "…" }` | The other peer disconnected. |
| `{ "type": "signal", "from": "…", "payload": { … } }` | A signaling body relayed from the other peer, verbatim. |
| `{ "type": "error", "message": "…" }` | Something went wrong (`no such room`, `room is full`, `malformed message`, `room expired`, …). |

### Typical flow

```
desktop → {type:"register", role:"desktop"}
server → {type:"registered", code:"AB12CD"}          # desktop displays AB12CD

phone  → {type:"join", role:"phone", code:"AB12CD"}
server → {type:"joined", code:"AB12CD"}               # to phone
server → {type:"peer-joined", role:"phone"}           # to desktop
server → {type:"peer-joined", role:"desktop"}         # to phone

desktop → {type:"signal", code:"AB12CD", payload:{kind:"offer",  sdp:"…"}}
server  → {type:"signal", from:"desktop", payload:{…}}   # to phone
phone   → {type:"signal", code:"AB12CD", payload:{kind:"answer", sdp:"…"}}
server  → {type:"signal", from:"phone",  payload:{…}}    # to desktop
# …ICE candidates trickle both ways via more {type:"signal", payload:{kind:"ice",…}}…
# → peers connect directly; media + input flow P2P, not through the relay.
```

## Run it

```bash
# from the repo root (once the orchestrator adds relay to the workspaces)
npm install
npm run build   --workspace @phone-monitor/relay
npm run start   --workspace @phone-monitor/relay
# or during development:
npm run dev     --workspace @phone-monitor/relay
```

Health check: `GET http://HOST:PORT/health` → `{ "ok": true, "rooms": <count>, "service": "phone-monitor-relay" }`

## Environment variables

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `8788` | HTTP + WS port. |
| `HOST` | `0.0.0.0` | Bind address (all interfaces — the relay is reached from off-LAN peers). |
| `RELAY_TOKEN` | *(empty)* | Optional shared secret. When set, every WS connection must pass it via `?token=…` or the `x-pm-token` header; otherwise the upgrade is rejected `401`. Empty = open dev mode. |
| `ROOM_TTL_MS` | `600000` | Idle window after which a room with no joined guest is swept. |

## ⚠️ TURN is required for the NAT-blocked path — documented, NOT implemented here

This scaffold does **signaling only**. WebRTC still needs **STUN** (to discover
public addresses) and, for the ~10–20% of networks behind **symmetric NAT** where
a direct P2P path is impossible, a **TURN relay** to forward the encrypted media.

**TURN is out of scope for this scaffold and must be provided separately**, e.g.:

- **[coturn](https://github.com/coturn/coturn)** — self-hosted on the same VPS as
  this relay (per `REBUILD-PLAN.md` §3 / §7-R3), or
- a **managed TURN service** (Cloudflare Calls / Twilio / metered.ca / etc.).

The desktop and phone WebRTC peers get the STUN/TURN URLs + credentials via their
`RTCPeerConnection` `iceServers` config (delivered out-of-band or, later, minted
by this relay). TURN traffic is **encrypted pass-through** — even when media is
relayed, the relay cannot read it (see `REBUILD-PLAN.md` §5, security model).

See `REBUILD-PLAN.md` for how this relay fits the overall v2 architecture and the
phased roadmap (remote path lands in **R3 — Remote (relay + pairing)**).
