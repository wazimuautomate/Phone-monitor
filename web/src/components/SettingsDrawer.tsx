import { IconMinus, IconPlus } from "../lib/icons";

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

const COLUMN_OPTIONS = [0, 1, 2, 3, 4, 5, 6];

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
      <div className="settings-grid">
        <section className="settings-section">
          <h4>Layout</h4>
          <div className="settings-row">
            <span className="settings-label">Columns per row</span>
            <div className="seg">
              {COLUMN_OPTIONS.map((n) => (
                <button
                  key={n}
                  className={`seg-btn ${columns === n ? "active" : ""}`}
                  onClick={() => onColumns(n)}
                  title={n === 0 ? "Auto — up to 4 per row" : `${n} per row`}
                >
                  {n === 0 ? "Auto" : n}
                </button>
              ))}
            </div>
          </div>
          <div className="settings-row">
            <span className="settings-label">Reorder devices</span>
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
        </section>

        <section className="settings-section">
          <h4>Demo devices</h4>
          <div className="settings-row">
            <span className="settings-label">Add or remove fake phones</span>
            <div className="btn-pair">
              <button className="ghost-btn" onClick={onRemoveDemo} title="Remove a demo device">
                <IconMinus />
              </button>
              <button className="ghost-btn" onClick={onAddDemo} title="Add a demo device">
                <IconPlus />
              </button>
            </div>
          </div>
        </section>

        <section className="settings-section wide">
          <h4>Connect a phone</h4>
          <p className="settings-hint">
            In the capture app, enter one of these addresses{tokenRequired ? " and the pairing token" : ""}:
          </p>
          {appUrls.length ? (
            <ul className="url-list">
              {appUrls.map((u) => (
                <li key={u}>
                  <code>{u}</code>
                </li>
              ))}
            </ul>
          ) : (
            <p className="settings-hint">No LAN address detected yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}
