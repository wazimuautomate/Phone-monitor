import type { Device } from "../types";

export function StatusBar({ devices, connected }: { devices: Device[]; connected: boolean }) {
  const total = devices.length;
  const online = devices.filter((d) => d.status === "online").length;
  const allOnline = total > 0 && online === total;
  const avgFps = total
    ? Math.round(devices.reduce((a, d) => a + (d.fps ?? 0), 0) / total)
    : 0;

  return (
    <footer className="statusbar">
      <div className="status-left">
        <span className={`dot ${allOnline ? "ok" : total ? "warn" : "bad"}`} />
        {total === 0
          ? "No devices"
          : allOnline
            ? "All devices are online"
            : `${online} of ${total} online`}
      </div>
      <div className="status-center">
        {online}/{total} Devices
      </div>
      <div className="status-right">
        <span className={`dot ${connected ? "ok" : "bad"}`} />
        Real-time monitoring
        <span className="sep">·</span>
        FPS {avgFps}
      </div>
    </footer>
  );
}
