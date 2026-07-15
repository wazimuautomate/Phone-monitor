// Core types shared by every capture backend. New connection types implement
// `DeviceSource` and never require changes in the dashboard.

/** What a connected device can do. */
export type Tier = "control" | "view";

/** How a device is connected. */
export type ConnectionType = "wifi-adb" | "usb-adb" | "wifi-app" | "internet-app";

/** The phone's own uplink, as the phone reports it. */
export type NetworkType = "wifi" | "cell" | "none";

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
  screenLocked?: boolean;
  group?: string;
  /** Signal bars 0..4, as reported by the phone. Undefined = not reported. */
  signal?: number;
  /** The phone's uplink (wifi / cell). Undefined = not reported. */
  network?: NetworkType;
  width?: number; // captured screen width in px (for coordinate mapping)
  height?: number; // captured screen height in px
  controllable?: boolean; // device accepts remote-control commands
}

/**
 * A remote-control command sent dashboard -> helper -> device.
 * Coordinates are normalized floats in [0,1], origin top-left (x right, y down),
 * so they are resolution-independent; the device maps them to real pixels.
 */
export type ControlKey =
  | "back"
  | "home"
  | "recents"
  | "notifications"
  | "power"
  | "volup"
  | "voldown"
  | "lock";

export type ControlCmd =
  | { action: "tap"; x: number; y: number }
  | { action: "swipe"; x1: number; y1: number; x2: number; y2: number; ms?: number }
  | { action: "key"; key: ControlKey }
  // Toggle the phone between portrait and landscape.
  | { action: "rotate" }
  | { action: "text"; text: string };

/** An encoded H.264 packet headed for the browser (decoded via WebCodecs). */
export interface VideoPacket {
  deviceId: string;
  type: "config" | "keyframe" | "delta";
  data: Uint8Array;
  timestamp: number;
}

export type SourceEvent =
  | { kind: "device"; info: DeviceInfo }
  | { kind: "removed"; deviceId: string; reason: "user" | "disconnect" }
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
  /** Optional: deliver a remote-control command to a device this source owns. Returns true if handled. */
  sendControl?(deviceId: string, cmd: ControlCmd): boolean;
}
