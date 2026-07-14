import type { Device } from "../types";

interface HeaderProps {
  connected: boolean;
  devices: Device[];
  refreshing: boolean;
  settingsOpen: boolean;
  onRefresh: () => void;
  onToggleSettings: () => void;
}

export function Header({
  connected,
  devices,
  refreshing,
  settingsOpen,
  onRefresh,
  onToggleSettings,
}: HeaderProps) {
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
        <button className="action" onClick={onRefresh} disabled={refreshing} title="Re-sync device list">
          <span className={refreshing ? "spin" : ""}>⟳</span> Refresh
        </button>
        <button className="action" title="Coming in Phase 5" disabled>
          ▢ Screenshot
        </button>
        <button
          className={`action ${settingsOpen ? "active" : ""}`}
          onClick={onToggleSettings}
          title="Settings"
        >
          ⚙ Settings
        </button>
        <button className="action danger" title="Coming in Phase 6" disabled>
          ✕ Disconnect All
        </button>
      </div>
    </header>
  );
}
