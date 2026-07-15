import type { IncomingMessage } from "node:http";
import type { RawData, WebSocket, WebSocketServer } from "ws";
import type {
  ConnectionType,
  ControlCmd,
  DeviceInfo,
  DeviceSource,
  SourceEventHandler,
} from "./types.js";
import { bars, netType, phoneName, statusPatch } from "./phone-fields.js";

let fallbackCounter = 0;

/**
 * Tier-2 ingest: accepts WebSocket connections from the Android capture app,
 * registers each as a controllable device, and relays its H.264 frames.
 *
 * App protocol:
 *   - text "hello"  {type:"hello", deviceId, model, androidVersion, battery, width, height}
 *   - text "status" {type:"status", screenLocked}
 *   - binary frames [1 byte type: 0=config,1=key,2=delta] + H.264 (Annex B)
 *
 * Devices are keyed by the phone's STABLE `deviceId` (ANDROID_ID), not by the
 * socket — so when a phone drops and auto-reconnects it reuses the same tile
 * instead of spawning a phantom duplicate. A reconnect replaces the old socket.
 */
export class WifiAppSource implements DeviceSource {
  readonly connection: ConnectionType = "wifi-app";
  private readonly devices = new Map<string, DeviceInfo>();
  private readonly sockets = new Map<string, WebSocket>(); // deviceId -> current socket
  private emit?: SourceEventHandler;

  constructor(
    private readonly wss: WebSocketServer,
    private readonly token: string,
  ) {}

  async start(emit: SourceEventHandler): Promise<void> {
    this.emit = emit;
    this.wss.on("connection", (ws: WebSocket, req: IncomingMessage) => this.onConnection(ws, req));
  }

  private onConnection(ws: WebSocket, req: IncomingMessage): void {
    // Token may arrive via the x-pm-token header or a ?token= query param.
    // (The upgrade handler already gates this; re-checked here as defense in depth.)
    if (this.token) {
      const url = new URL(req.url ?? "/", "http://localhost");
      const provided =
        (req.headers["x-pm-token"] as string | undefined) ?? url.searchParams.get("token") ?? "";
      if (provided !== this.token) {
        ws.close(1008, "bad token");
        return;
      }
    }

    // The device id is unknown until the "hello" arrives.
    let deviceId: string | null = null;

    ws.on("message", (data: RawData, isBinary: boolean) => {
      const buf = toBuffer(data);
      if (!isBinary) {
        const resolved = this.handleText(deviceId, buf.toString(), ws);
        if (resolved) deviceId = resolved;
        return;
      }
      if (!deviceId || buf.length < 1) return;
      const type = buf[0] === 0 ? "config" : buf[0] === 1 ? "keyframe" : "delta";
      this.emit?.({
        kind: "video",
        packet: { deviceId, type, data: new Uint8Array(buf.subarray(1)), timestamp: Date.now() },
      });
      const dev = this.devices.get(deviceId);
      if (dev) dev.lastUpdate = Date.now();
    });

    ws.on("close", () => {
      // Only forget the device if THIS socket is still its current one. If the
      // phone already reconnected (a newer socket replaced this one), leave the
      // device in place so the tile doesn't flicker away.
      if (deviceId && this.sockets.get(deviceId) === ws) {
        this.sockets.delete(deviceId);
        if (this.devices.delete(deviceId)) {
          this.emit?.({ kind: "removed", deviceId, reason: "disconnect" });
        }
      }
    });
    ws.on("error", () => ws.close());
  }

  /**
   * Deliver a remote-control command to a connected app device. The command is
   * sent as a JSON text frame `{type:"control",cmd}`; the phone's Accessibility
   * service injects the corresponding gesture/key/text. Returns true if sent.
   */
  sendControl(id: string, cmd: ControlCmd): boolean {
    const ws = this.sockets.get(id);
    if (!ws || ws.readyState !== ws.OPEN) return false;
    try {
      ws.send(JSON.stringify({ type: "control", cmd }));
      return true;
    } catch {
      return false;
    }
  }

  /** Disconnect a connected app device (user chose "Remove"). */
  remove(id: string): boolean {
    const ws = this.sockets.get(id);
    if (ws) ws.close(1000, "removed by user");
    this.sockets.delete(id);
    if (this.devices.delete(id)) {
      this.emit?.({ kind: "removed", deviceId: id, reason: "user" });
      return true;
    }
    return !!ws;
  }

  /**
   * Handle a text frame. Returns the resolved (stable) device id when a "hello"
   * registers or updates a device, so the caller can bind this socket to it.
   */
  private handleText(currentId: string | null, raw: string, ws: WebSocket): string | null {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw);
    } catch {
      return null;
    }

    if (msg.type === "hello") {
      // Prefer the phone's stable id; fall back to a per-connection id for
      // older apps that don't send one.
      const stableRaw = typeof msg.deviceId === "string" ? msg.deviceId.trim() : "";
      const id = stableRaw ? `app-${stableRaw}` : (currentId ?? `app-${++fallbackCounter}`);

      // If a previous socket is still registered for this device (a stale /
      // half-open connection from before the reconnect), close it and take over.
      const existing = this.sockets.get(id);
      if (existing && existing !== ws) {
        try {
          existing.close(1000, "replaced by newer connection");
        } catch {
          /* ignore */
        }
      }
      this.sockets.set(id, ws);

      const info: DeviceInfo = {
        id,
        // The phone's own "Phone name" wins, so renaming on the handset shows up
        // here; otherwise fall back to the model.
        name: phoneName(msg) ?? (msg.model as string) ?? "Phone",
        model: msg.model as string | undefined,
        androidVersion: msg.androidVersion as string | undefined,
        battery: typeof msg.battery === "number" ? msg.battery : undefined,
        charging: typeof msg.charging === "boolean" ? msg.charging : undefined,
        signal: bars(msg.signal),
        network: netType(msg.network),
        canRotate: typeof msg.canRotate === "boolean" ? msg.canRotate : undefined,
        tier: "view",
        connection: "wifi-app",
        status: "online",
        fps: 0,
        screenLocked: msg.screenLocked === true,
        width: typeof msg.width === "number" ? msg.width : undefined,
        height: typeof msg.height === "number" ? msg.height : undefined,
        // The agent app injects input via its AccessibilityService, so app
        // devices are remotely controllable (AnyDesk-style), not view-only.
        controllable: true,
        lastUpdate: Date.now(),
      };
      this.devices.set(id, info);
      // Re-emitting an existing id updates the same tile (the dashboard upserts
      // by id), so a reconnect never creates a duplicate.
      this.emit?.({ kind: "device", info });
      return id;
    }

    if (msg.type === "status") {
      const id = currentId;
      if (id) {
        const dev = this.devices.get(id);
        const patch = statusPatch(msg);
        if (dev && Object.keys(patch).length > 0) {
          Object.assign(dev, patch);
          dev.lastUpdate = Date.now();
          this.emit?.({ kind: "stats", deviceId: id, patch: { ...patch, lastUpdate: dev.lastUpdate } });
        }
      }
    }
    return null;
  }

  list(): DeviceInfo[] {
    return [...this.devices.values()];
  }

  async stop(): Promise<void> {
    for (const ws of this.sockets.values()) ws.close(1001, "shutdown");
    this.sockets.clear();
    this.devices.clear();
  }
}

function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data as ArrayBuffer);
}
