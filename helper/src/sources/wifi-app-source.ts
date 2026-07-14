import type { IncomingMessage } from "node:http";
import type { RawData, WebSocket, WebSocketServer } from "ws";
import type {
  ConnectionType,
  ControlCmd,
  DeviceInfo,
  DeviceSource,
  SourceEventHandler,
} from "./types.js";

let counter = 0;

/**
 * Tier-2 ingest: accepts WebSocket connections from the Android capture app,
 * registers each as a view-only device, and relays its H.264 frames.
 *
 * App protocol:
 *   - text "hello"  {type:"hello", model, androidVersion, battery, width, height}
 *   - text "status" {type:"status", screenLocked}
 *   - binary frames [1 byte type: 0=config,1=key,2=delta] + H.264 (Annex B)
 * One socket == one device.
 */
export class WifiAppSource implements DeviceSource {
  readonly connection: ConnectionType = "wifi-app";
  private readonly devices = new Map<string, DeviceInfo>();
  private readonly sockets = new Map<string, WebSocket>();
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

    const id = `app-${++counter}`;
    this.sockets.set(id, ws);
    let registered = false;

    ws.on("message", (data: RawData, isBinary: boolean) => {
      const buf = toBuffer(data);
      if (!isBinary) {
        if (this.handleText(id, buf.toString())) registered = true;
        return;
      }
      if (!registered || buf.length < 1) return;
      const type = buf[0] === 0 ? "config" : buf[0] === 1 ? "keyframe" : "delta";
      this.emit?.({
        kind: "video",
        packet: { deviceId: id, type, data: new Uint8Array(buf.subarray(1)), timestamp: Date.now() },
      });
      const dev = this.devices.get(id);
      if (dev) dev.lastUpdate = Date.now();
    });

    ws.on("close", () => {
      this.sockets.delete(id);
      if (this.devices.delete(id)) this.emit?.({ kind: "removed", deviceId: id, reason: "disconnect" });
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

  /** Returns true if this text frame registered a new device. */
  private handleText(id: string, raw: string): boolean {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw);
    } catch {
      return false;
    }

    if (msg.type === "hello") {
      const info: DeviceInfo = {
        id,
        name: (msg.model as string) || "Phone",
        model: msg.model as string | undefined,
        androidVersion: msg.androidVersion as string | undefined,
        battery: typeof msg.battery === "number" ? msg.battery : undefined,
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
      this.emit?.({ kind: "device", info });
      return true;
    }

    if (msg.type === "status") {
      const dev = this.devices.get(id);
      if (dev && typeof msg.screenLocked === "boolean") {
        dev.screenLocked = msg.screenLocked;
        dev.lastUpdate = Date.now();
        this.emit?.({
          kind: "stats",
          deviceId: id,
          patch: { screenLocked: msg.screenLocked, lastUpdate: dev.lastUpdate },
        });
      }
    }
    return false;
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
