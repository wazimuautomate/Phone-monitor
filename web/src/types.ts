export type Tier = "control" | "view";
export type ConnectionType = "wifi-adb" | "usb-adb" | "wifi-app" | "internet-app";
export type DeviceStatus = "online" | "connecting" | "offline";

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
}

export interface ServerInfo {
  appUrls: string[];
  tokenRequired: boolean;
}
