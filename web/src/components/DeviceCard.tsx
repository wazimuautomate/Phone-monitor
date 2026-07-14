import { useEffect, useRef, useState } from "react";
import type { Device } from "../types";
import { PhoneScreen } from "./PhoneScreen";
import { IconDots, IconDrag, IconEyeOff, IconPen, IconTrash } from "../lib/icons";

interface DeviceCardProps {
  device: Device;
  name: string;
  reorderMode: boolean;
  onRename: (name: string) => void;
  onHide: () => void;
  onRemove: () => void;
}

export function DeviceCard({ device, name, reorderMode, onRename, onHide, onRemove }: DeviceCardProps) {
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);
  const online = device.status === "online";

  useEffect(() => {
    if (editing) {
      setDraft(name);
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.select();
      }
    }
  }, [editing, name]);

  const commit = () => {
    const value = draft.trim();
    if (value && value !== name) onRename(value);
    setEditing(false);
  };

  return (
    <div className="card">
      <div className="card-head">
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
          <button className="name-btn" onClick={() => setEditing(true)} title="Rename device">
            <span className="card-title">{name}</span>
            <IconPen className="pen" />
          </button>
        )}

        <div className="card-head-right">
          {reorderMode && (
            <span className="drag-handle" title="Drag to reorder">
              <IconDrag />
            </span>
          )}
          <span className={`live ${online ? "on" : "off"}`}>
            <span className="live-dot" />
            {online ? "Live" : device.status}
          </span>
          <div className="menu-wrap">
            <button className="icon-btn tiny" onClick={() => setMenuOpen((v) => !v)} title="Device options">
              <IconDots />
            </button>
            {menuOpen && (
              <div className="device-menu" onMouseLeave={() => setMenuOpen(false)}>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onHide();
                  }}
                >
                  <IconEyeOff /> Hide
                </button>
                <button
                  className="danger"
                  onClick={() => {
                    setMenuOpen(false);
                    onRemove();
                  }}
                >
                  <IconTrash /> Remove
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <PhoneScreen device={device} />
    </div>
  );
}
