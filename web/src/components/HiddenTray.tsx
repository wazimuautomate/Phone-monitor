import type { Device } from "../types";
import { IconClose } from "../lib/icons";

interface HiddenTrayProps {
  devices: Device[];
  nickname: (d: Device) => string;
  onUnhide: (id: string) => void;
  onClose: () => void;
}

export function HiddenTray({ devices, nickname, onUnhide, onClose }: HiddenTrayProps) {
  return (
    <div className="hidden-tray">
      <div className="hidden-tray-head">
        <span>Hidden devices</span>
        <button className="icon-btn tiny" onClick={onClose} title="Close">
          <IconClose />
        </button>
      </div>
      {devices.length === 0 ? (
        <p className="settings-hint">None hidden.</p>
      ) : (
        <ul>
          {devices.map((d) => (
            <li key={d.id}>
              <span>{nickname(d)}</span>
              <button className="ghost-btn small" onClick={() => onUnhide(d.id)}>
                Show
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
