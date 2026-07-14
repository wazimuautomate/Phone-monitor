// Core types shared by every capture backend. New connection types implement
// `DeviceSource` and never require changes in the dashboard.

/** What a connected device can do. */
export type Tier = "control" | "view";

/** How a device is connected. */
export type ConnectionType = "wifi-adb" | "usb-adb" | "wifi-app" | "internet-app";

export type DeviceStatus = "online" | "connecting" | "offline";

export interface DeviceInfo {
  id: string;
  name: string; // nickname, or a sensible default
  model?: string;
  androidVersion?: string;
  tier: Tier;
  connection: ConnectionType;
  status: DeviceStatus;
  battery?: number; // 0..100
  charging?: boolean;
  fps?: number;
  lastUpdate?: number; // epoch ms
  group?: string;
}

/** An encoded H.264 packet headed for the browser (decoded via WebCodecs). */
export interface VideoPacket {
  deviceId: string;
  type: "config" | "keyframe" | "delta";
  data: Uint8Array;
  timestamp: number;
}

export type SourceEvent =
  | { kind: "device"; info: DeviceInfo }
  | { kind: "removed"; deviceId: string }
  | { kind: "video"; packet: VideoPacket }
  | { kind: "stats"; deviceId: string; patch: Partial<DeviceInfo> };

export type SourceEventHandler = (event: SourceEvent) => void;

/**
 * A capture backend + transport. Tier-1 ADB, Tier-2 app, USB, and future
 * internet sources are all implementations of this interface.
 */
export interface DeviceSource {
  readonly connection: ConnectionType;
  /** Begin discovering/serving devices; emit events as they change. */
  start(emit: SourceEventHandler): Promise<void>;
  /** Stop and release all resources. */
  stop(): Promise<void>;
  /** Currently-known devices from this source. */
  list(): DeviceInfo[];
  /** Optional: disconnect/remove a device this source owns. Returns true if handled. */
  remove?(deviceId: string): boolean;
}
