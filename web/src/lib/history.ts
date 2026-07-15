// Every device we've ever seen, so History survives disconnects and restarts.
// Keyed by the phone's stable device id, so a phone that reconnects updates its
// existing entry instead of piling up duplicates.
import { useSyncExternalStore } from "react";
import { loadJSON, saveJSON } from "./persist";
import type { Device, HistoryEntry } from "../types";

const KEY = "pm.history";
const MAX = 50;

let entries: HistoryEntry[] = loadJSON<HistoryEntry[]>(KEY, []);
const listeners = new Set<() => void>();

function commit(next: HistoryEntry[]): void {
  entries = next.slice(0, MAX);
  saveJSON(KEY, entries);
  for (const l of listeners) l();
}

export function getHistory(): HistoryEntry[] {
  return entries;
}

/** Record (or refresh) a device. Demo phones are deliberately not remembered. */
export function rememberDevice(device: Device): void {
  if (device.id.startsWith("mock-")) return;
  const now = Date.now();
  const existing = entries.find((e) => e.id === device.id);
  const entry: HistoryEntry = {
    id: device.id,
    name: device.name,
    model: device.model,
    connection: device.connection,
    firstSeen: existing?.firstSeen ?? now,
    lastSeen: now,
  };
  commit([entry, ...entries.filter((e) => e.id !== device.id)]);
}

/** Keep lastSeen fresh while a device stays connected. */
export function touchDevice(id: string): void {
  const existing = entries.find((e) => e.id === id);
  if (!existing) return;
  commit(entries.map((e) => (e.id === id ? { ...e, lastSeen: Date.now() } : e)));
}

export function forgetDevice(id: string): void {
  commit(entries.filter((e) => e.id !== id));
}

export function clearHistory(): void {
  commit([]);
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useHistory(): HistoryEntry[] {
  return useSyncExternalStore(subscribe, getHistory, getHistory);
}
