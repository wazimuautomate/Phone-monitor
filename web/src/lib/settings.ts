// App settings, persisted to localStorage and shared via a tiny store so any
// component can read/patch them without prop-drilling.
import { useSyncExternalStore } from "react";
import { loadJSON, saveJSON } from "./persist";

/** Which alerts the user wants to see as toasts. */
export interface AlertPrefs {
  connection: boolean; // device connected / disconnected
  battery: boolean; // battery fell below the threshold
  signal: boolean; // signal dropped to 1 bar or none
  screenLock: boolean; // phone screen locked
}

export interface Settings {
  /** 0 = auto (fit to width); otherwise a fixed column count. */
  columns: number;
  /** Tile size in px (grid min column width) when columns is auto. */
  tileSize: number;
  alerts: AlertPrefs;
  /** Warn when battery drops to/below this. */
  batteryThreshold: number;
  screenshotDir: string;
  recordingDir: string;
  keepAwake: boolean;
}

const KEY = "pm.settings";

export const DEFAULTS: Settings = {
  columns: 0,
  tileSize: 240,
  alerts: { connection: true, battery: true, signal: true, screenLock: false },
  batteryThreshold: 20,
  screenshotDir: "",
  recordingDir: "",
  keepAwake: false,
};

let current: Settings = { ...DEFAULTS, ...loadJSON<Partial<Settings>>(KEY, {}) } as Settings;
// A partial saved blob (e.g. from an older version) must not leave `alerts` half-set.
current.alerts = { ...DEFAULTS.alerts, ...(current.alerts ?? {}) };

const listeners = new Set<() => void>();

export function getSettings(): Settings {
  return current;
}

export function patchSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  saveJSON(KEY, current);
  for (const l of listeners) l();
}

export function patchAlerts(patch: Partial<AlertPrefs>): void {
  patchSettings({ alerts: { ...current.alerts, ...patch } });
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Reactive read of the whole settings object. */
export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}
