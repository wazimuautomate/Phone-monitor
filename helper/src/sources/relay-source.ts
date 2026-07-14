import { WebSocket, type RawData } from "ws";
import type {
  ConnectionType,
  ControlCmd,
  DeviceInfo,
  DeviceSource,
  SourceEventHandler,
} from "./types.js";

/**
 * Remote (out-of-home) ingest. Connects to the relay as a VIEWER for one pairing
 * code, receives a phone agent's forwarded stream, and exposes it as a normal
 * device — so a remote phone appears on the dashboard identically to a LAN one.
 * Video flows phone → relay → here; control flows here → relay → phone.
 *
 * One RelaySource == one remote phone (one code). Auto-reconnects to the relay.
 */
export class RelaySource implements DeviceSource {
  readonly connection: ConnectionType = "internet-app";
  private readonly deviceId: string;
  private device?: DeviceInfo;
  private ws?: WebSocket;
  private emit?: SourceEventHandler;
  private closed = false;
  private reconnectTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly relayUrl: string, // base, e.g. wss://relay.example.com
    private readonly code: string,
    private readonly token?: string,
  ) {
    this.deviceId = `relay-${code}`;
  }

  /** The pairing code this source is watching (used by the SourceManager registry). */
  get pairingCode(): string {
    return this.code;
  }

  async start(emit: SourceEventHandler): Promise<void> {
    this.emit = emit;
    this.connect();
  }

  private viewerUrl(): string {
    const base = this.relayUrl.replace(/\/+$/, "");
    const q = new URLSearchParams({ code: this.code });
    if (this.token) q.set("token", this.token);
    return `${base}/viewer?${q.toString()}`;
  }

  private connect(): void {
    if (this.closed) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.viewerUrl());
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.on("message", (data: RawData, isBinary: boolean) => this.onMessage(data, isBinary));
    ws.on("close", () => {
      this.markOffline();
      this.scheduleReconnect();
    });
    ws.on("error", () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    });
  }

  private onMessage(data: RawData, isBinary: boolean): void {
    const buf = toBuffer(data);
    if (isBinary) {
      if (!this.device || buf.length < 1) return;
      const type = buf[0] === 0 ? "config" : buf[0] === 1 ? "keyframe" : "delta";
      this.emit?.({
        kind: "video",
        packet: {
          deviceId: this.deviceId,
          type,
          data: new Uint8Array(buf.subarray(1)),
          timestamp: Date.now(),
        },
      });
      if (this.device) this.device.lastUpdate = Date.now();
      return;
    }

    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(buf.toString());
    } catch {
      return;
    }
    switch (msg.type) {
      case "hello":
        this.registerDevice(msg);
        break;
      case "status":
        this.applyStatus(msg);
        break;
      case "agent-left":
      case "waiting":
        this.markOffline();
        break;
      // "linked" → wait for the agent's hello; "error" → keep retrying.
    }
  }

  private registerDevice(msg: Record<string, unknown>): void {
    const info: DeviceInfo = {
      id: this.deviceId,
      name: (msg.model as string) || `Remote phone ${this.code}`,
      model: msg.model as string | undefined,
      androidVersion: msg.androidVersion as string | undefined,
      battery: typeof msg.battery === "number" ? msg.battery : undefined,
      tier: "view",
      connection: "internet-app",
      status: "online",
      fps: 0,
      screenLocked: msg.screenLocked === true,
      width: typeof msg.width === "number" ? msg.width : undefined,
      height: typeof msg.height === "number" ? msg.height : undefined,
      controllable: true,
      lastUpdate: Date.now(),
    };
    this.device = info;
    this.emit?.({ kind: "device", info });
  }

  private applyStatus(msg: Record<string, unknown>): void {
    if (this.device && typeof msg.screenLocked === "boolean") {
      this.device.screenLocked = msg.screenLocked;
      this.device.lastUpdate = Date.now();
      this.emit?.({
        kind: "stats",
        deviceId: this.deviceId,
        patch: { screenLocked: msg.screenLocked, lastUpdate: this.device.lastUpdate },
      });
    }
  }

  private markOffline(): void {
    if (this.device) {
      this.device = undefined;
      this.emit?.({ kind: "removed", deviceId: this.deviceId, reason: "disconnect" });
    }
  }

  /** Send a remote-control command up to the relay, which forwards it to the phone. */
  sendControl(id: string, cmd: ControlCmd): boolean {
    if (id !== this.deviceId) return false;
    const ws = this.ws;
    if (!ws || ws.readyState !== ws.OPEN) return false;
    try {
      ws.send(JSON.stringify({ type: "control", cmd }));
      return true;
    } catch {
      return false;
    }
  }

  list(): DeviceInfo[] {
    return this.device ? [this.device] : [];
  }

  private scheduleReconnect(): void {
    if (this.closed || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, 2000);
  }

  async stop(): Promise<void> {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    try {
      this.ws?.close(1000, "stopped");
    } catch {
      /* ignore */
    }
    this.ws = undefined;
    this.markOffline();
  }
}

function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data as ArrayBuffer);
}
