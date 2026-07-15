import { useEffect, useRef, useState } from "react";
import type { Device, HistoryEntry } from "../types";
import { Battery, Signal } from "./DeviceMeta";
import {
  IconDots,
  IconEye,
  IconEyeOff,
  IconPen,
  IconPhone,
  IconPlug,
  IconPointer,
  IconTrash,
} from "../lib/icons";

interface DevicesPageProps {
  connected: Device[];
  hidden: Device[];
  /** Seen before, not connected right now. */
  disconnected: HistoryEntry[];
  nickname: (d: Device) => string;
  onControl: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onHide: (id: string) => void;
  onUnhide: (id: string) => void;
  onRemove: (id: string) => void;
  onForget: (id: string) => void;
}

function Menu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="menu-wrap" ref={ref}>
      <button className="icon-btn" onClick={() => setOpen((v) => !v)} aria-label="Device options">
        <IconDots />
      </button>
      {open && (
        <div className="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

function Group({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="section">
      <div className="group-head">
        {title}
        <span className="n">{count}</span>
      </div>
      {count === 0 ? (
        <div className="panel panel-pad" style={{ color: "var(--muted)", fontSize: 13 }}>
          Nothing here.
        </div>
      ) : (
        <div className="panel">{children}</div>
      )}
    </div>
  );
}

export function DevicesPage({
  connected,
  hidden,
  disconnected,
  nickname,
  onControl,
  onRename,
  onHide,
  onUnhide,
  onRemove,
  onForget,
}: DevicesPageProps) {
  const rename = (d: Device) => {
    const next = window.prompt("Rename this phone", nickname(d));
    if (next && next.trim()) onRename(d.id, next.trim());
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Devices</h1>
        <p className="page-sub">Every phone this desktop knows about.</p>
      </div>

      <Group title="Connected" count={connected.length}>
        {connected.map((d) => (
          <div className="dev-row" key={d.id}>
            <span className="dev-ic">
              <IconPhone />
            </span>
            <div className="dev-main">
              <div className="dev-name">{nickname(d)}</div>
              <div className="dev-sub">
                <span>{d.model ?? "Phone"}</span>
                <span className="sep">·</span>
                <span>{d.connection === "internet-app" ? "Remote" : "Same Wi-Fi"}</span>
              </div>
            </div>
            <span className="dev-stats">
              <Signal level={d.signal} />
              <Battery level={d.battery} charging={d.charging} />
            </span>
            <Menu>
              <button onClick={() => onControl(d.id)}>
                <IconPointer /> View / control
              </button>
              <button onClick={() => rename(d)}>
                <IconPen /> Rename
              </button>
              <button onClick={() => onHide(d.id)}>
                <IconEyeOff /> Hide
              </button>
              <button className="danger" onClick={() => onRemove(d.id)}>
                <IconTrash /> Remove
              </button>
            </Menu>
          </div>
        ))}
      </Group>

      <Group title="Hidden" count={hidden.length}>
        {hidden.map((d) => (
          <div className="dev-row" key={d.id}>
            <span className="dev-ic muted">
              <IconEyeOff />
            </span>
            <div className="dev-main">
              <div className="dev-name">{nickname(d)}</div>
              <div className="dev-sub">
                <span>Hidden from the monitor grid</span>
              </div>
            </div>
            <span className="dev-stats">
              <Signal level={d.signal} />
              <Battery level={d.battery} charging={d.charging} />
            </span>
            <Menu>
              <button onClick={() => onUnhide(d.id)}>
                <IconEye /> Unhide
              </button>
              <button className="danger" onClick={() => onRemove(d.id)}>
                <IconTrash /> Remove
              </button>
            </Menu>
          </div>
        ))}
      </Group>

      <Group title="Disconnected" count={disconnected.length}>
        {disconnected.map((e) => (
          <div className="dev-row" key={e.id}>
            <span className="dev-ic muted">
              <IconPlug />
            </span>
            <div className="dev-main">
              <div className="dev-name">{e.name}</div>
              <div className="dev-sub">
                <span>{e.model ?? "Phone"}</span>
                <span className="sep">·</span>
                <span>Last seen {when(e.lastSeen)}</span>
              </div>
            </div>
            <Menu>
              <button className="danger" onClick={() => onForget(e.id)}>
                <IconTrash /> Remove
              </button>
            </Menu>
          </div>
        ))}
      </Group>
    </div>
  );
}

export function when(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(ts).toLocaleDateString();
}
