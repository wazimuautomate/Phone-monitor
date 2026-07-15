// App settings, persisted to localStorage and shared via a tiny store so any
// component can read/patch them without prop-drilling.
import { useSyncExternalStore } from "react";
import { loadJSON, saveJSON } from "./persist";

/** Which alerts the user wants to see as toasts. */
export interface AlertPrefs {
  connection: boolean; // device connected / disconnected
  battery: boolean; // battery fell below the threshold
  signal: boolean; // signal dropped to 1 bar or none
  screenLock: boolean; // phone screen went off / locked
}

/** Tile sizes, named so nobody has to guess what "M" means. */
export const TILE_SIZES = [
  { short: "S", label: "Small", value: 180 },
  { short: "M", label: "Medium", value: 240 },
  { short: "L", label: "Large", value: 320 },
  { short: "XL", label: "Extra large", value: 420 },
] as const;

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
  /** Shrink tiles so a whole phone fits the window without scrolling. */
  fitToWindow: boolean;
  /** Schema version, so a bad default can be corrected on existing installs. */
  v?: number;
}

const KEY = "pm.settings";
const VERSION = 2;

export const DEFAULTS: Settings = {
  columns: 0,
  tileSize: 240,
  alerts: { connection: true, battery: true, signal: true, screenLock: true },
  batteryThreshold: 20,
  screenshotDir: "",
  recordingDir: "",
  // On by default: this app exists to be glanced at. A wall of phones that
  // blanks after four minutes is useless, and nobody should have to discover a
  // setting to stop that happening.
  keepAwake: true,
  // A phone you have to scroll to see the bottom of defeats the point of a
  // glanceable grid, so tiles fit the window by default.
  fitToWindow: true,
};

let current: Settings = { ...DEFAULTS, ...loadJSON<Partial<Settings>>(KEY, {}) } as Settings;
// A partial saved blob (e.g. from an older version) must not leave `alerts` half-set.
current.alerts = { ...DEFAULTS.alerts, ...(current.alerts ?? {}) };

// v2: "keep the screen awake" and the screen-off alert used to default OFF.
// Nobody chose that — it was a bad default — so correct it once for installs
// that saved settings before this. Later versions won't touch it again, so a
// deliberate "off" from here on sticks.
if ((current.v ?? 1) < VERSION) {
  current = { ...current, keepAwake: true, alerts: { ...current.alerts, screenLock: true }, v: VERSION };
  saveJSON(KEY, current);
}

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
