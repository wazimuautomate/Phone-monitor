// Alert kinds map 1:1 onto the per-alert toggles in Settings, so a disabled
// category is never raised in the first place.
export type AlertType = "connection" | "battery" | "signal" | "screenLock";
export type AlertSeverity = "danger" | "warn" | "ok";

export interface Alert {
  id: string;
  type: AlertType;
  title: string;
  detail: string;
  severity: AlertSeverity;
}
