import type { Device } from "../types";
import { PhoneScreen } from "./PhoneScreen";

export function DeviceCard({ device }: { device: Device }) {
  const online = device.status === "online";
  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">{device.name}</span>
        <span className={`live ${online ? "on" : "off"}`}>
          <span className="live-dot" /> {online ? "Live" : device.status}
        </span>
      </div>

      <PhoneScreen device={device} />

      <div className="card-foot">
        <div>
          <span className="k">Model:</span> {device.model ?? "—"}
        </div>
        <div>Android {device.androidVersion ?? "—"}</div>
        <div>
          <span className="k">Battery:</span> {device.battery ?? "—"}%
          {device.charging ? " ⚡" : ""}
        </div>
      </div>
    </div>
  );
}
