import {
  IconChevronLeft,
  IconChevronRight,
  IconDevices,
  IconHistory,
  IconMonitor,
  IconSettings,
  Logo,
} from "../lib/icons";

export type Page = "monitor" | "history" | "settings" | "devices";

interface SidebarProps {
  page: Page;
  collapsed: boolean;
  deviceCount: number;
  version: string;
  onNavigate: (page: Page) => void;
  onToggleCollapse: () => void;
}

export function Sidebar({
  page,
  collapsed,
  deviceCount,
  version,
  onNavigate,
  onToggleCollapse,
}: SidebarProps) {
  const item = (id: Page, label: string, Icon: (p: { className?: string }) => JSX.Element, count?: number) => (
    <button
      className={`side-item ${page === id ? "active" : ""}`}
      onClick={() => onNavigate(id)}
      title={collapsed ? label : undefined}
      aria-current={page === id ? "page" : undefined}
    >
      <Icon />
      <span className="side-label">{label}</span>
      {count !== undefined && count > 0 && <span className="side-count">{count}</span>}
    </button>
  );

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="side-brand">
        {!collapsed && (
          <>
            <Logo className="side-logo" />
            <span className="side-name">Phone Monitor</span>
          </>
        )}
        <button
          className="side-collapse"
          onClick={onToggleCollapse}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <IconChevronRight /> : <IconChevronLeft />}
        </button>
      </div>

      <nav className="side-nav">
        {item("monitor", "Monitor", IconMonitor)}
        {item("history", "History", IconHistory)}
        {item("settings", "Settings", IconSettings)}
      </nav>

      <div className="side-sep" />

      <nav className="side-nav">{item("devices", "Devices", IconDevices, deviceCount)}</nav>

      <div className="side-foot">
        <span className="side-foot-text">Version </span>
        <span className="side-foot-ver">{version}</span>
      </div>
    </aside>
  );
}
