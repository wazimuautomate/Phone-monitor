import { useState } from "react";
import type { CSSProperties } from "react";
import type { Device } from "../types";
import { DeviceCard } from "./DeviceCard";

interface DeviceGridProps {
  devices: Device[]; // ordered + visible
  reorderMode: boolean;
  gridClassName: string;
  gridStyle?: CSSProperties;
  nickname: (d: Device) => string;
  onRename: (id: string, name: string) => void;
  onHide: (id: string) => void;
  onRemove: (id: string) => void;
  onReorder: (orderedVisibleIds: string[]) => void;
}

export function DeviceGrid({
  devices,
  reorderMode,
  gridClassName,
  gridStyle,
  nickname,
  onRename,
  onHide,
  onRemove,
  onReorder,
}: DeviceGridProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [target, setTarget] = useState<{ id: string; side: "before" | "after" } | null>(null);

  const finishDrop = () => {
    if (dragId && target) {
      const ids = devices.map((d) => d.id).filter((id) => id !== dragId);
      const idx = ids.indexOf(target.id);
      const insertAt = target.side === "after" ? idx + 1 : idx;
      ids.splice(insertAt, 0, dragId);
      onReorder(ids);
    }
    setDragId(null);
    setTarget(null);
  };

  return (
    <div className={`${gridClassName} ${reorderMode ? "reordering" : ""}`} style={gridStyle}>
      {devices.map((d) => {
        const isTarget = target?.id === d.id && dragId !== d.id;
        const cellClass = [
          "grid-cell",
          dragId === d.id ? "dragging" : "",
          isTarget ? `drop-${target!.side}` : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <div
            key={d.id}
            className={cellClass}
            draggable={reorderMode}
            onDragStart={(e) => {
              setDragId(d.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              if (!reorderMode || !dragId || dragId === d.id) return;
              e.preventDefault();
              const rect = e.currentTarget.getBoundingClientRect();
              setTarget({ id: d.id, side: e.clientX < rect.left + rect.width / 2 ? "before" : "after" });
            }}
            onDrop={(e) => {
              e.preventDefault();
              finishDrop();
            }}
            onDragEnd={() => {
              setDragId(null);
              setTarget(null);
            }}
          >
            <DeviceCard
              device={d}
              name={nickname(d)}
              reorderMode={reorderMode}
              onRename={(name) => onRename(d.id, name)}
              onHide={() => onHide(d.id)}
              onRemove={() => onRemove(d.id)}
            />
          </div>
        );
      })}
    </div>
  );
}
