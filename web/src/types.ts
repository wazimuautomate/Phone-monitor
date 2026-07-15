export type Tier = "control" | "view";
export type ConnectionType = "wifi-adb" | "usb-adb" | "wifi-app" | "internet-app";
export type DeviceStatus = "online" | "connecting" | "offline";
/** The phone's own uplink, as the phone reports it. */
export type NetworkType = "wifi" | "cell" | "none";

export interface Device {
  id: string;
  name: string;
  model?: string;
  androidVersion?: string;
  tier?: Tier;
  connection?: ConnectionType;
  status: DeviceStatus;
  battery?: number;
  charging?: boolean;
  fps?: number;
  lastUpdate?: number;
  screenLocked?: boolean;
  group?: string;
  width?: number;
  height?: number;
  controllable?: boolean;
  /** Phone granted WRITE_SETTINGS, so the Rotate control can work. */
  canRotate?: boolean;
  /** Signal bars 0..4. Undefined when the phone doesn't report it. */
  signal?: number;
  network?: NetworkType;
}

export interface ServerInfo {
  appUrls: string[];
  tokenRequired: boolean;
}

// A far-away phone paired through the relay by its 9-digit code (AnyDesk-style).
export interface RemotePhone {
  code: string;
  label?: string;
}

/** Every device we've ever seen, so History survives disconnects and restarts. */
export interface HistoryEntry {
  id: string;
  name: string;
  model?: string;
  connection?: ConnectionType;
  firstSeen: number;
  lastSeen: number;
}
