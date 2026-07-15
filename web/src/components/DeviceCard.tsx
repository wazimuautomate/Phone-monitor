import { useEffect, useRef, useState } from "react";
import type { Device } from "../types";
import { PhoneScreen } from "./PhoneScreen";
import { Battery, Signal } from "./DeviceMeta";
import { IconPen, IconPointer } from "../lib/icons";

interface DeviceCardProps {
  device: Device;
  name: string;
  reorder: boolean;
  onRename: (name: string) => void;
  onControl: () => void;
}

export function DeviceCard({ device, name, reorder, onRename, onControl }: DeviceCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);
  const online = device.status === "online";

  useEffect(() => {
    if (!editing) return;
    setDraft(name);
    const el = inputRef.current;
    el?.focus();
    el?.select();
  }, [editing, name]);

  const commit = () => {
    const value = draft.trim();
    if (value && value !== name) onRename(value);
    setEditing(false);
  };

  return (
    <div className={`card ${online ? "" : "offline"}`}>
      <div className="card-head">
        {/* Dot only — the name needs the room at small tile sizes. */}
        <span className={`live ${online ? "" : "off"}`} title={online ? "Live" : device.status}>
          <i />
        </span>

        {editing ? (
          <input
            ref={inputRef}
            className="name-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              else if (e.key === "Escape") setEditing(false);
            }}
          />
        ) : (
          <button className="card-name" onClick={() => setEditing(true)} title={`${name} — click to rename`}>
            <b>{name}</b>
            <IconPen />
          </button>
        )}

        <span className="card-meta">
          <Signal level={device.signal} />
          <Battery level={device.battery} charging={device.charging} />
          <span>{device.fps ?? 0} fps</span>
        </span>
      </div>

      {reorder ? (
        <PhoneScreen device={device} />
      ) : (
        <div onClick={onControl} role="button" tabIndex={-1} style={{ display: "contents" }}>
          <PhoneScreen device={device}>
            <div className="screen-hint">
              <IconPointer />
              <span>Control</span>
            </div>
          </PhoneScreen>
        </div>
      )}

      <div className="card-foot">
        <button className="btn" onClick={onControl} disabled={!online}>
          <IconPointer />
          Control
        </button>
      </div>
    </div>
  );
}
