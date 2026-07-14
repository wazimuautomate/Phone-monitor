interface SettingsPanelProps {
  columns: number; // 0 = auto-fit
  onColumns: (n: number) => void;
}

const COLUMN_OPTIONS = [0, 1, 2, 3, 4, 5, 6];

export function SettingsPanel({ columns, onColumns }: SettingsPanelProps) {
  return (
    <div className="settings-panel">
      <div className="settings-row">
        <label>Columns per row</label>
        <div className="seg">
          {COLUMN_OPTIONS.map((n) => (
            <button
              key={n}
              className={`seg-btn ${columns === n ? "active" : ""}`}
              onClick={() => onColumns(n)}
            >
              {n === 0 ? "Auto" : n}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
