export type AlertType = "disconnect" | "low-battery" | "new-device" | "screen-lock";
export type AlertSeverity = "danger" | "warn" | "ok";

export interface Alert {
  id: string;
  type: AlertType;
  title: string;
  detail: string;
  severity: AlertSeverity;
}
