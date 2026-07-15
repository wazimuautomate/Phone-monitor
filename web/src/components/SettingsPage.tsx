import { useEffect, useState } from "react";
import type { ThemeMode } from "../lib/theme";
import { patchAlerts, patchSettings, useSettings } from "../lib/settings";
import { defaultCapturePaths, isDesktop, openPath, pickFolder, setKeepAwake } from "../lib/desktop";
import {
  IconBell,
  IconCamera,
  IconFolder,
  IconMinus,
  IconMoon,
  IconPlus,
  IconRecord,
  IconSun,
  IconSystem,
} from "../lib/icons";

interface SettingsPageProps {
  themeMode: ThemeMode;
  onTheme: (mode: ThemeMode) => void;
  demoCount: number;
  onAddDemo: () => void;
  onRemoveDemo: () => void;
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button className={`toggle ${on ? "on" : ""}`} onClick={() => onChange(!on)} aria-label={label} aria-pressed={on}>
      <span />
    </button>
  );
}

export function SettingsPage({ themeMode, onTheme, demoCount, onAddDemo, onRemoveDemo }: SettingsPageProps) {
  const s = useSettings();
  const [defaults, setDefaults] = useState({ screenshots: "", recordings: "" });
  const desktop = isDesktop();

  useEffect(() => {
    void defaultCapturePaths().then(setDefaults);
  }, []);

  const choose = async (which: "screenshotDir" | "recordingDir") => {
    const dir = await pickFolder(s[which] || undefined);
    if (dir) patchSettings({ [which]: dir } as never);
  };

  const shotDir = s.screenshotDir || defaults.screenshots;
  const recDir = s.recordingDir || defaults.recordings;

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Settings</h1>
        <p className="page-sub">How the dashboard looks, warns you, and saves captures.</p>
      </div>

      {/* Appearance */}
      <div className="section">
        <h2 className="section-title">Appearance</h2>
        <div className="panel panel-pad">
          <div className="seg">
            {(
              [
                ["system", "System", IconSystem],
                ["light", "Light", IconSun],
                ["dark", "Dark", IconMoon],
              ] as [ThemeMode, string, (p: { className?: string }) => JSX.Element][]
            ).map(([mode, label]) => (
              <button key={mode} className={themeMode === mode ? "on" : ""} onClick={() => onTheme(mode)}>
                {label}
              </button>
            ))}
          </div>
          <p className="row-sub" style={{ marginTop: 12 }}>
            System follows your PC’s light or dark setting.
          </p>
        </div>
      </div>

      {/* Display */}
      <div className="section">
        <h2 className="section-title">Display</h2>
        <div className="panel">
          <div className="row">
            <div className="row-main">
              <div className="row-title">Keep the screen awake</div>
              <div className="row-sub">
                {desktop
                  ? "Stops this PC blanking or sleeping, so the wall of phones is always visible."
                  : "Only the desktop app can hold the display awake reliably."}
              </div>
            </div>
            <Toggle
              on={s.keepAwake}
              label="Keep the screen awake"
              onChange={async (v) => {
                patchSettings({ keepAwake: v });
                await setKeepAwake(v);
              }}
            />
          </div>

          <div className="row">
            <div className="row-main">
              <div className="row-title">Tile size</div>
              <div className="row-sub">How big each phone is in the monitor grid.</div>
            </div>
            <div className="seg" style={{ width: 220 }}>
              {[
                { label: "S", v: 180 },
                { label: "M", v: 240 },
                { label: "L", v: 320 },
                { label: "XL", v: 420 },
              ].map((o) => (
                <button
                  key={o.v}
                  className={s.tileSize === o.v ? "on" : ""}
                  onClick={() => patchSettings({ tileSize: o.v })}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="row">
            <div className="row-main">
              <div className="row-title">Columns</div>
              <div className="row-sub">Auto fits as many as the window allows.</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="row-sub">Auto</span>
              <Toggle
                on={s.columns === 0}
                label="Auto columns"
                onChange={(v) => patchSettings({ columns: v ? 0 : 4 })}
              />
              {s.columns > 0 && (
                <input
                  className="num"
                  type="number"
                  min={1}
                  max={12}
                  value={s.columns}
                  onChange={(e) => patchSettings({ columns: Math.min(12, Math.max(1, Number(e.target.value) || 1)) })}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Alerts */}
      <div className="section">
        <h2 className="section-title">Alerts</h2>
        <div className="panel">
          <div className="row">
            <IconBell className="row-icon" />
            <div className="row-main">
              <div className="row-title">Connected / disconnected</div>
              <div className="row-sub">Tell me when a phone joins or drops.</div>
            </div>
            <Toggle
              on={s.alerts.connection}
              label="Connection alerts"
              onChange={(v) => patchAlerts({ connection: v })}
            />
          </div>

          <div className="row">
            <IconBell className="row-icon" />
            <div className="row-main">
              <div className="row-title">Low battery</div>
              <div className="row-sub">Warn at or below this level.</div>
            </div>
            <input
              className="num"
              type="number"
              min={5}
              max={95}
              value={s.batteryThreshold}
              onChange={(e) =>
                patchSettings({ batteryThreshold: Math.min(95, Math.max(5, Number(e.target.value) || 20)) })
              }
              disabled={!s.alerts.battery}
            />
            <Toggle on={s.alerts.battery} label="Battery alerts" onChange={(v) => patchAlerts({ battery: v })} />
          </div>

          <div className="row">
            <IconBell className="row-icon" />
            <div className="row-main">
              <div className="row-title">Weak signal</div>
              <div className="row-sub">Warn when a phone drops to one bar or none.</div>
            </div>
            <Toggle on={s.alerts.signal} label="Signal alerts" onChange={(v) => patchAlerts({ signal: v })} />
          </div>

          <div className="row">
            <IconBell className="row-icon" />
            <div className="row-main">
              <div className="row-title">Screen locked</div>
              <div className="row-sub">Tell me when a phone’s screen locks.</div>
            </div>
            <Toggle
              on={s.alerts.screenLock}
              label="Screen lock alerts"
              onChange={(v) => patchAlerts({ screenLock: v })}
            />
          </div>
        </div>
      </div>

      {/* Captures */}
      <div className="section">
        <h2 className="section-title">Screenshots &amp; recordings</h2>
        <div className="panel">
          <div className="row">
            <IconCamera className="row-icon" />
            <div className="row-main">
              <div className="row-title">Screenshot folder</div>
              <div className="row-sub mono" style={{ wordBreak: "break-all" }}>
                {desktop ? shotDir || "—" : "Saved to your browser’s downloads."}
              </div>
            </div>
            {desktop && (
              <>
                <button className="btn" onClick={() => choose("screenshotDir")}>
                  <IconFolder />
                  Change
                </button>
                <button className="btn" onClick={() => openPath(shotDir)} disabled={!shotDir}>
                  Open
                </button>
              </>
            )}
          </div>

          <div className="row">
            <IconRecord className="row-icon" />
            <div className="row-main">
              <div className="row-title">Recording folder</div>
              <div className="row-sub mono" style={{ wordBreak: "break-all" }}>
                {desktop ? recDir || "—" : "Saved to your browser’s downloads."}
              </div>
            </div>
            {desktop && (
              <>
                <button className="btn" onClick={() => choose("recordingDir")}>
                  <IconFolder />
                  Change
                </button>
                <button className="btn" onClick={() => openPath(recDir)} disabled={!recDir}>
                  Open
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Demo */}
      <div className="section">
        <h2 className="section-title">Demo phones</h2>
        <div className="panel">
          <div className="row">
            <div className="row-main">
              <div className="row-title">Fake phones for testing</div>
              <div className="row-sub">
                Handy for trying the layout with no hardware. {demoCount} in the grid.
              </div>
            </div>
            <button className="btn" onClick={onRemoveDemo} disabled={demoCount === 0}>
              <IconMinus />
              Remove
            </button>
            <button className="btn primary" onClick={onAddDemo}>
              <IconPlus />
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
