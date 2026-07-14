import { IconMinus, IconPlus } from "../lib/icons";
import { CopyableUrl } from "./CopyableUrl";

interface SettingsDrawerProps {
  columns: number; // 0 = Auto (targets 4 per row)
  onColumns: (n: number) => void;
  reorderMode: boolean;
  onToggleReorder: () => void;
  onAddDemo: () => void;
  onRemoveDemo: () => void;
  appUrls: string[];
  tokenRequired: boolean;
}

export function SettingsDrawer({
  columns,
  onColumns,
  reorderMode,
  onToggleReorder,
  onAddDemo,
  onRemoveDemo,
  appUrls,
  tokenRequired,
}: SettingsDrawerProps) {
  return (
    <div className="settings-drawer">
      <div className="settings-bar">
        <div className="setting-item">
          <span className="settings-label">Columns</span>
          <button
            className={`seg-btn ${columns === 0 ? "active" : ""}`}
            onClick={() => onColumns(0)}
            title="Auto — fills the row (up to 4)"
          >
            Auto
          </button>
          <input
            type="number"
            min={1}
            max={12}
            className="col-input"
            placeholder="#"
            value={columns > 0 ? columns : ""}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              onColumns(Number.isFinite(n) && n > 0 ? Math.min(n, 12) : 0);
            }}
            title="Type how many per row"
          />
        </div>

        <div className="setting-item">
          <span className="settings-label">Reorder</span>
          <button
            className={`toggle ${reorderMode ? "on" : ""}`}
            onClick={onToggleReorder}
            role="switch"
            aria-checked={reorderMode}
            title="Drag tiles to rearrange; green lines show where they'll land"
          >
            <span className="knob" />
          </button>
        </div>

        <div className="setting-item">
          <span className="settings-label">Demo devices</span>
          <div className="btn-pair">
            <button className="ghost-btn" onClick={onRemoveDemo} title="Remove a demo device">
              <IconMinus />
            </button>
            <button className="ghost-btn" onClick={onAddDemo} title="Add a demo device">
              <IconPlus />
            </button>
          </div>
        </div>

        <div className="setting-item conn-item">
          <span className="settings-label">Connect app to</span>
          {appUrls.length ? (
            <div className="url-inline">
              {appUrls.map((u) => (
                <CopyableUrl key={u} url={u} />
              ))}
              {tokenRequired && <span className="token-tag">token required</span>}
            </div>
          ) : (
            <span className="settings-hint">no LAN address</span>
          )}
        </div>
      </div>
    </div>
  );
}
