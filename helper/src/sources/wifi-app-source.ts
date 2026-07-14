import type { IncomingMessage } from "node:http";
import type { RawData, WebSocket, WebSocketServer } from "ws";
import type { ConnectionType, DeviceInfo, DeviceSource, SourceEventHandler } from "./types.js";

let counter = 0;

/**
 * Tier-2 ingest: accepts WebSocket connections from the Android capture app,
 * registers each as a view-only device, and relays its H.264 frames.
 *
 * App protocol: a JSON "hello" text frame, then binary frames
 *   [1 byte type: 0=config, 1=key, 2=delta] + H.264 (Annex B).
 * One socket == one device (identified by the connection).
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
    if (this.token && req.headers["x-pm-token"] !== this.token) {
      ws.close(1008, "bad token");
      return;
    }

    const id = `app-${++counter}`;
    this.sockets.set(id, ws);
    let registered = false;

    ws.on("message", (data: RawData, isBinary: boolean) => {
      const buf = toBuffer(data);
      if (!isBinary) {
        if (this.register(id, buf.toString())) registered = true;
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
      if (this.devices.delete(id)) this.emit?.({ kind: "removed", deviceId: id });
    });
    ws.on("error", () => ws.close());
  }

  /** Disconnect a connected app device (user chose "Remove"). */
  remove(id: string): boolean {
    const ws = this.sockets.get(id);
    if (ws) ws.close(1000, "removed by user");
    this.sockets.delete(id);
    if (this.devices.delete(id)) {
      this.emit?.({ kind: "removed", deviceId: id });
      return true;
    }
    return !!ws;
  }

  private register(id: string, raw: string): boolean {
    let hello: Record<string, unknown>;
    try {
      hello = JSON.parse(raw);
    } catch {
      return false;
    }
    if (hello.type !== "hello") return false;
    const info: DeviceInfo = {
      id,
      name: (hello.model as string) || "Phone",
      model: hello.model as string | undefined,
      androidVersion: hello.androidVersion as string | undefined,
      battery: typeof hello.battery === "number" ? hello.battery : undefined,
      tier: "view",
      connection: "wifi-app",
      status: "online",
      fps: 0,
      lastUpdate: Date.now(),
    };
    this.devices.set(id, info);
    this.emit?.({ kind: "device", info });
    return true;
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
