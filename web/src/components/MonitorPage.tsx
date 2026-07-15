import { useState } from "react";
import type { Device } from "../types";
import { DeviceCard } from "./DeviceCard";
import { useSettings } from "../lib/settings";
import { IconMonitor, IconPlus } from "../lib/icons";

interface MonitorPageProps {
  devices: Device[];
  nickname: (d: Device) => string;
  reorder: boolean;
  search: string;
  connectUrl: string | null;
  onRename: (id: string, name: string) => void;
  onControl: (id: string) => void;
  onReorder: (ids: string[]) => void;
  onAddDemo: () => void;
  onHowTo: () => void;
}

export function MonitorPage({
  devices,
  nickname,
  reorder,
  search,
  connectUrl,
  onRename,
  onControl,
  onReorder,
  onAddDemo,
  onHowTo,
}: MonitorPageProps) {
  const settings = useSettings();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  if (devices.length === 0) {
    return (
      <div className="empty">
        <div className="empty-card">
          <IconMonitor className="empty-icon" />
          <h2>{search ? "No phones match that search" : "No phones connected yet"}</h2>
          {search ? (
            <p>Try a different name or model.</p>
          ) : (
            <>
              <p>
                On your phone, open the <b>Phone Monitor</b> app, go to the <b>Remote</b> tab, enter
                this address and tap <b>Connect</b>:
              </p>
              {connectUrl ? (
                <code className="empty-url">{connectUrl}</code>
              ) : (
                <p>Finding this PC’s Wi-Fi address…</p>
              )}
              <div className="empty-actions">
                <button className="btn" onClick={onHowTo}>
                  How to connect
                </button>
                <button className="btn primary" onClick={onAddDemo}>
                  <IconPlus />
                  Add a demo phone
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  const fixed = settings.columns > 0;
  const style = fixed
    ? ({ "--cols": settings.columns } as React.CSSProperties)
    : ({ "--tile": `${settings.tileSize}px` } as React.CSSProperties);

  // Reorder by dragging a card onto another; commit the new order on drop.
  const drop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const ids = devices.map((d) => d.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    onReorder(ids);
    setDragId(null);
    setOverId(null);
  };

  return (
    <div className="page page-wide">
      <div className={`grid ${fixed ? "fixed" : ""} ${reorder ? "reorder" : ""}`} style={style}>
        {devices.map((d) => (
          <div
            key={d.id}
            className={`cell ${dragId === d.id ? "dragging" : ""} ${overId === d.id ? "drop" : ""}`}
            draggable={reorder}
            onDragStart={() => setDragId(d.id)}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
            onDragOver={(e) => {
              if (!reorder || !dragId) return;
              e.preventDefault();
              setOverId(d.id);
            }}
            onDragLeave={() => setOverId((cur) => (cur === d.id ? null : cur))}
            onDrop={(e) => {
              e.preventDefault();
              drop(d.id);
            }}
          >
            <DeviceCard
              device={d}
              name={nickname(d)}
              reorder={reorder}
              onRename={(n) => onRename(d.id, n)}
              onControl={() => onControl(d.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
