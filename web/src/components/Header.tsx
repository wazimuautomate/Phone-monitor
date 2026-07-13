import type { Device } from "../types";

interface HeaderProps {
  connected: boolean;
  devices: Device[];
  onRefresh: () => void;
}

export function Header({ connected, devices, onRefresh }: HeaderProps) {
  const online = devices.filter((d) => d.status === "online").length;
  return (
    <header className="header">
      <div className="header-left">
        <span className="logo">📱</span>
        <span className="brand">Phone Monitor</span>
        <span className="device-count">{online} Devices Connected</span>
        <span
          className={`conn-dot ${connected ? "ok" : "bad"}`}
          title={connected ? "Helper connected" : "Helper offline"}
        />
      </div>
      <div className="header-actions">
        <button className="action" onClick={onRefresh} title="Refresh device list">
          ⟳ Refresh
        </button>
        <button className="action" title="Coming in Phase 5" disabled>
          ▢ Screenshot
        </button>
        <button className="action" title="Coming soon" disabled>
          ⚙ Settings
        </button>
        <button className="action danger" title="Coming in Phase 6" disabled>
          ✕ Disconnect All
        </button>
      </div>
    </header>
  );
}
