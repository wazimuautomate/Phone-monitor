import { useEffect, useState } from "react";
import type { ThemeMode } from "../lib/theme";
import type { RemotePhone } from "../types";
import { QrCode } from "./QrCode";
import { patchAlerts, patchSettings, TILE_SIZES, useSettings } from "../lib/settings";
import {
  appVersion,
  checkForUpdate,
  defaultCapturePaths,
  installUpdate,
  isDesktop,
  openPath,
  pickFolder,
  setKeepAwake,
  type UpdateInfo,
} from "../lib/desktop";
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
  relayCfg: { url: string; token: string };
  onRelayCfg: (cfg: { url: string; token: string }) => void;
  remotePhones: RemotePhone[];
  onRelayConnect: (code: string, label?: string) => void;
  onRelayDisconnect: (code: string) => void;
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button className={`toggle ${on ? "on" : ""}`} onClick={() => onChange(!on)} aria-label={label} aria-pressed={on}>
      <span />
    </button>
  );
}

export function SettingsPage({
  themeMode,
  onTheme,
  demoCount,
  onAddDemo,
  onRemoveDemo,
  relayCfg,
  onRelayCfg,
  remotePhones,
  onRelayConnect,
  onRelayDisconnect,
}: SettingsPageProps) {
  const s = useSettings();
  const [defaults, setDefaults] = useState({ screenshots: "", recordings: "" });
  const desktop = isDesktop();

  const [codeInput, setCodeInput] = useState("");
  const [qrCode, setQrCode] = useState<string | null>(null);

  const relayReady = relayCfg.url.trim().length > 0;

  const showPairingQr = () => {
    // Desktop mints the code and starts watching that relay room; the phone
    // scans the QR and joins it — no typing on either side.
    const code = String(Math.floor(100000000 + Math.random() * 900000000));
    onRelayConnect(code, "Paired by QR");
    setQrCode(code);
  };

  const addByCode = () => {
    const c = codeInput.replace(/\D/g, "");
    if (c.length >= 6) {
      onRelayConnect(c);
      setCodeInput("");
    }
  };

  const [version, setVersion] = useState("—");
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    void defaultCapturePaths().then(setDefaults);
    void appVersion().then(setVersion);
  }, []);

  const runUpdateCheck = async () => {
    setChecking(true);
    setUpdate(await checkForUpdate());
    setChecking(false);
  };

  const runInstall = async () => {
    if (update?.status !== "available") return;
    setInstalling(true);
    // The app quits to run the installer, so this promise may not resolve.
    await installUpdate(update.assetUrl, update.exe);
  };

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
            <div className="seg" style={{ width: 340 }}>
              {TILE_SIZES.map((o) => (
                <button
                  key={o.value}
                  className={s.tileSize === o.value ? "on" : ""}
                  onClick={() => patchSettings({ tileSize: o.value })}
                >
                  <b>{o.short}</b> {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="row">
            <div className="row-main">
              <div className="row-title">Fit phones to the window</div>
              <div className="row-sub">
                Shrink tiles so a whole phone is visible without scrolling. Tile size stays the
                maximum.
              </div>
            </div>
            <Toggle
              on={s.fitToWindow}
              label="Fit phones to the window"
              onChange={(v) => patchSettings({ fitToWindow: v })}
            />
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
              <div className="row-title">Screen off</div>
              <div className="row-sub">Tell me when a phone’s screen turns off or locks.</div>
            </div>
            <Toggle
              on={s.alerts.screenLock}
              label="Screen off alerts"
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

      {/* Remote phones (away from home, via the relay) */}
      <div className="section">
        <h2 className="section-title">Remote phones</h2>
        <div className="panel">
          <div className="row">
            <div className="row-main">
              <div className="row-title">Relay server</div>
              <div className="row-sub">
                Watch and control phones from anywhere — even on mobile data. Set the same relay
                server and token on the phone and here.
              </div>
            </div>
          </div>

          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <input
                placeholder="wss://your-relay-host"
                value={relayCfg.url}
                onChange={(e) => onRelayCfg({ ...relayCfg, url: e.target.value.trim() })}
              />
            </div>
          </div>
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <input
                placeholder="Relay token"
                value={relayCfg.token}
                onChange={(e) => onRelayCfg({ ...relayCfg, token: e.target.value.trim() })}
              />
            </div>
          </div>

          <div className="row">
            <div className="row-main">
              <div className="row-title">Pair a phone</div>
              <div className="row-sub">
                {relayReady
                  ? "Show a QR the phone scans, or type the code the phone is showing."
                  : "Enter a relay server above first."}
              </div>
            </div>
            <button className="btn primary" onClick={showPairingQr} disabled={!relayReady}>
              Show pairing QR
            </button>
          </div>

          {qrCode && relayReady && (
            <div className="row" style={{ flexDirection: "column", alignItems: "center", gap: 10 }}>
              <QrCode
                value={JSON.stringify({ v: 1, relay: relayCfg.url, relayToken: relayCfg.token, code: qrCode })}
                size={200}
              />
              <div className="row-sub">
                On the phone: Remote → <b>Scan QR code</b>. Or enter code <b>{qrCode}</b>.
              </div>
            </div>
          )}

          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <input
                placeholder="Phone code (9 digits)"
                inputMode="numeric"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
              />
            </div>
            <button
              className="btn"
              onClick={addByCode}
              disabled={!relayReady || codeInput.replace(/\D/g, "").length < 6}
            >
              <IconPlus />
              Add
            </button>
          </div>

          {remotePhones.map((p) => (
            <div className="row" key={p.code}>
              <div className="row-main">
                <div className="row-title">{p.label || "Remote phone"}</div>
                <div className="row-sub mono">Code {p.code}</div>
              </div>
              <button className="btn" onClick={() => onRelayDisconnect(p.code)}>
                <IconMinus />
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* About & updates (desktop app only) */}
      {desktop && (
        <div className="section">
          <h2 className="section-title">About &amp; updates</h2>
          <div className="panel">
            <div className="row">
              <div className="row-main">
                <div className="row-title">Version</div>
                <div className="row-sub">
                  Phone Monitor v{version}
                  {update?.status === "up-to-date" && " — you're on the latest version."}
                  {update?.status === "not-configured" && " — updates aren't enabled for this build."}
                  {update?.status === "error" && ` — couldn't check: ${update.reason}`}
                </div>
              </div>
              <button className="btn" onClick={runUpdateCheck} disabled={checking || installing}>
                {checking ? "Checking…" : "Check for updates"}
              </button>
            </div>

            {update?.status === "available" && (
              <div className="row">
                <div className="row-main">
                  <div className="row-title">Update available — v{update.version}</div>
                  <div className="row-sub">
                    Installs over your current version without uninstalling or losing settings. The
                    app restarts to finish.
                  </div>
                </div>
                <button className="btn primary" onClick={runInstall} disabled={installing}>
                  {installing ? "Downloading…" : "Download & install"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
