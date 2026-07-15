import type { Device, HistoryEntry } from "../types";
import { PopMenu, type MenuItem } from "./PopMenu";
import { SignalBars } from "../lib/icons";
import {
  IconChevronLeft,
  IconChevronRight,
  IconDevices,
  IconEye,
  IconEyeOff,
  IconHistory,
  IconMonitor,
  IconPen,
  IconPointer,
  IconSettings,
  IconTrash,
  Logo,
} from "../lib/icons";

export type Page = "monitor" | "history" | "settings";

interface SidebarProps {
  page: Page;
  collapsed: boolean;
  version: string;
  connected: Device[];
  hidden: Device[];
  disconnected: HistoryEntry[];
  nickname: (d: Device) => string;
  onNavigate: (page: Page) => void;
  onToggleCollapse: () => void;
  onControl: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onHide: (id: string) => void;
  onUnhide: (id: string) => void;
  onRemove: (id: string) => void;
  onForget: (id: string) => void;
}

function Row({
  name,
  online,
  signal,
  battery,
  items,
  onClick,
}: {
  name: string;
  online: boolean;
  signal?: number;
  battery?: number;
  items: MenuItem[];
  onClick?: () => void;
}) {
  return (
    <div className="sd-row" onClick={onClick} title={name}>
      <span className={`sd-dot ${online ? "" : "off"}`} />
      <span className="sd-name">{name}</span>
      {online && <SignalBars level={signal} className="sd-sig" />}
      {online && <span className="sd-bat">{battery === undefined ? "—" : `${battery}%`}</span>}
      <PopMenu items={items} label={`${name} options`} />
    </div>
  );
}

export function Sidebar({
  page,
  collapsed,
  version,
  connected,
  hidden,
  disconnected,
  nickname,
  onNavigate,
  onToggleCollapse,
  onControl,
  onRename,
  onHide,
  onUnhide,
  onRemove,
  onForget,
}: SidebarProps) {
  const item = (id: Page, label: string, Icon: (p: { className?: string }) => JSX.Element) => (
    <button
      className={`side-item ${page === id ? "active" : ""}`}
      onClick={() => onNavigate(id)}
      title={collapsed ? label : undefined}
      aria-current={page === id ? "page" : undefined}
    >
      <Icon />
      <span className="side-label">{label}</span>
    </button>
  );

  const rename = (d: Device) => {
    const next = window.prompt("Rename this phone", nickname(d));
    if (next && next.trim()) onRename(d.id, next.trim());
  };

  const total = connected.length + hidden.length;

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

      {collapsed ? (
        <div className="side-nav">
          <button className="side-item" title={`${total} devices`} onClick={onToggleCollapse}>
            <IconDevices />
          </button>
        </div>
      ) : (
        // The list lives here rather than behind a page — the whole point is to
        // see every phone without clicking into anything.
        <div className="side-devices">
          <div className="side-group">
            Connected <span className="n">{connected.length}</span>
          </div>
          {connected.length === 0 && <div className="sd-empty">No phones connected.</div>}
          {connected.map((d) => (
            <Row
              key={d.id}
              name={nickname(d)}
              online={d.status === "online"}
              signal={d.signal}
              battery={d.battery}
              onClick={() => onControl(d.id)}
              items={[
                { label: "View / control", icon: IconPointer, onSelect: () => onControl(d.id) },
                { label: "Rename", icon: IconPen, onSelect: () => rename(d) },
                { label: "Hide", icon: IconEyeOff, onSelect: () => onHide(d.id) },
                { label: "Remove", icon: IconTrash, onSelect: () => onRemove(d.id), danger: true },
              ]}
            />
          ))}

          {hidden.length > 0 && (
            <>
              <div className="side-group">
                Hidden <span className="n">{hidden.length}</span>
              </div>
              {hidden.map((d) => (
                <Row
                  key={d.id}
                  name={nickname(d)}
                  online={d.status === "online"}
                  signal={d.signal}
                  battery={d.battery}
                  items={[
                    { label: "Unhide", icon: IconEye, onSelect: () => onUnhide(d.id) },
                    { label: "Remove", icon: IconTrash, onSelect: () => onRemove(d.id), danger: true },
                  ]}
                />
              ))}
            </>
          )}

          {disconnected.length > 0 && (
            <>
              <div className="side-group">
                Disconnected <span className="n">{disconnected.length}</span>
              </div>
              {disconnected.map((e) => (
                <Row
                  key={e.id}
                  name={e.name}
                  online={false}
                  items={[
                    { label: "Remove", icon: IconTrash, onSelect: () => onForget(e.id), danger: true },
                  ]}
                />
              ))}
            </>
          )}
        </div>
      )}

      <div className="side-foot">
        <span className="side-foot-text">Version </span>
        <span className="side-foot-ver">{version}</span>
      </div>
    </aside>
  );
}
