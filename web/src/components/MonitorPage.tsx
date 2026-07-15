import { useLayoutEffect, useState } from "react";
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

/** Phone-shaped tile: what a card is besides the screen (head + Control + padding). */
const CARD_CHROME_PX = 96;
const PAGE_PADDING_PX = 32;
const PHONE_ASPECT = 9 / 19.5;
const MIN_TILE_PX = 130;

/**
 * Widest tile whose whole card still fits the visible height. A phone you have
 * to scroll to finish looking at isn't much use in a monitoring grid, so the
 * chosen tile size acts as a MAXIMUM and this caps it to what actually fits.
 */
function useFitTile(enabled: boolean): number | null {
  const [fit, setFit] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!enabled) {
      setFit(null);
      return;
    }
    // The scroll container is what we have to fit inside.
    const box = document.querySelector(".content") as HTMLElement | null;
    if (!box) return;
    const measure = () => {
      const h = box.clientHeight;
      if (h <= 0) return;
      const usable = h - PAGE_PADDING_PX - CARD_CHROME_PX;
      setFit(Math.max(MIN_TILE_PX, Math.floor(usable * PHONE_ASPECT)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [enabled]);
  return fit;
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
  const fitTile = useFitTile(settings.fitToWindow && settings.columns === 0);

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
  // Tile size is a ceiling: never wider than the user asked for, never taller
  // than the window.
  const tile = fitTile === null ? settings.tileSize : Math.min(settings.tileSize, fitTile);
  const style = fixed
    ? ({ "--cols": settings.columns } as React.CSSProperties)
    : ({ "--tile": `${tile}px` } as React.CSSProperties);

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
      <div
        className={`grid ${fixed ? "fixed" : ""} ${fitTile !== null ? "fit" : ""} ${reorder ? "reorder" : ""}`}
        style={style}
      >
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
