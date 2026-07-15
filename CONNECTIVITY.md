# Connectivity — how phones connect (now, and for remote)

This answers: *can we reach a phone remotely, how "remote" (same house vs another
country), and should there be one connection method or several?* It's the plain-
language companion to `REBUILD-PLAN.md` §2.

## TL;DR
- **Today: LAN-only.** Phone and desktop must be on the **same Wi-Fi**. Confirmed working.
- **Remote (any other case): not built yet.** It's the next milestone.
- **Recommendation: ONE adaptive method**, not a menu. It uses the same-LAN path when
  local, peer-to-peer when remote, and a relay only as a last resort. To the user it's
  a single experience.

## 1. Why the current link is LAN-only
The desktop shows `ws://192.168.x.x:8787/app`. That `192.168.x.x` is a **private
address** that only exists on your local network — it is not reachable from the
internet. Even the desktop's public IP would not work, because home routers use
**NAT** and drop unsolicited inbound connections. So the current method works **only**
when both devices are on the same LAN.

## 2. The "distances" — and why they're the same problem
| Scenario | Works today? | Needs |
|---|:---:|---|
| Same house, **same Wi-Fi** | ✅ | nothing (LAN direct) |
| Same house, **phone on mobile data** | ❌ | remote path |
| **Different city / country** | ❌ | remote path (identical mechanism) |

"In-house remote" and "different-country remote" are **not** different features. The
instant the two devices aren't on the same network, both need the same remote path.

## 3. The remote path (recommended): WebRTC + a thin relay
The AnyDesk model:
1. Phone and desktop each connect **outbound** to a small always-on **signaling relay**
   (outbound → no router port-forwarding required).
2. They exchange connection details there and pair with a short **code** (like an
   AnyDesk ID) — no IP addresses.
3. They then talk **directly, peer-to-peer, end-to-end encrypted**. Video does **not**
   pass through our server in the normal case.
4. Only if a strict router blocks the direct path (~10–20% of networks) does traffic
   fall back through a **TURN** relay (encrypted pass-through).

**Infrastructure:** one cheap always-on box running the signaling server (`relay/`,
already scaffolded) + a TURN server. Small and low-cost because media is peer-to-peer
in the common case. Media stays end-to-end encrypted regardless.

## 4. One method, or several?
**One adaptive method.** WebRTC's ICE negotiation automatically tries, in order:
1. **Local** (same-LAN direct) — fastest, free, no server.
2. **Direct internet** (peer-to-peer) — remote, still no media through our server.
3. **TURN relay** — only when 1 and 2 both fail.

So the single WebRTC path *already contains* the LAN case. The user never chooses
"local vs remote" — they use a pairing code (remembered after the first time) and it
connects the best available way. Internally: fast + fallback tiers. Externally: one
experience.

We keep today's raw-LAN WebSocket as an optional **turbo** for same-network use
(marginally lower latency, zero relay), but it's not a choice the user has to make.

## 5. Faster interim (only if remote is needed before WebRTC is built)
Host the existing helper in the cloud as a **dumb relay**: phone and desktop both
connect to it and it forwards bytes between them. Works anywhere immediately (this is
what ran on Render in v1). **Trade-off:** all video flows through the server (bandwidth
cost, and the server can see the stream), with higher latency. A stopgap — WebRTC is
the real answer.

## 6. What changes for the user
- **Now:** paste the LAN address.
- **Remote:** enter a **pairing code** once; the phone stays paired and reconnects
  itself. No IP, no port-forwarding.

## 7. Where this sits on the roadmap
LAN view + control is **done and confirmed** (R0–R1). The remote path (relay + pairing
+ WebRTC on both agent and desktop) is the next milestone (`REBUILD-PLAN.md` R2–R3).
