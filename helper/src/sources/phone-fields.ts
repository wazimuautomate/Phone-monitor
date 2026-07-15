// Shared parsing of the phone agent's JSON fields. Both the LAN source
// (wifi-app-source) and the remote source (relay-source) receive the SAME
// `hello` / `status` frames from the agent, so the field handling lives here
// once instead of drifting between the two.
import type { DeviceInfo, NetworkType } from "./types.js";

/** Signal bars: accept 0..4 only, rounded and clamped. Undefined if not reported. */
export function bars(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return Math.max(0, Math.min(4, Math.round(v)));
}

/** The phone's uplink type, if it reported a value we recognise. */
export function netType(v: unknown): NetworkType | undefined {
  return v === "wifi" || v === "cell" || v === "none" ? v : undefined;
}

/** A display name the phone chose (Settings → Phone name), if any. */
export function phoneName(msg: Record<string, unknown>): string | undefined {
  const name = typeof msg.name === "string" ? msg.name.trim() : "";
  return name || undefined;
}

/**
 * Build a stats patch from a `status` frame. Only fields the phone actually
 * sent are included, so an absent field never clobbers a known value.
 */
export function statusPatch(msg: Record<string, unknown>): Partial<DeviceInfo> {
  const patch: Partial<DeviceInfo> = {};
  if (typeof msg.screenLocked === "boolean") patch.screenLocked = msg.screenLocked;
  if (typeof msg.battery === "number") patch.battery = msg.battery;
  if (typeof msg.charging === "boolean") patch.charging = msg.charging;
  const signal = bars(msg.signal);
  if (signal !== undefined) patch.signal = signal;
  const network = netType(msg.network);
  if (network !== undefined) patch.network = network;
  const name = phoneName(msg);
  if (name !== undefined) patch.name = name;
  if (typeof msg.canRotate === "boolean") patch.canRotate = msg.canRotate;
  return patch;
}
