import { useState } from "react";
import { IconLink, IconMinus, IconPhone, IconPlus, IconTrash } from "../lib/icons";
import { CopyableUrl } from "./CopyableUrl";
import type { RemotePhone } from "../types";

interface SettingsDrawerProps {
  columns: number; // 0 = Auto (targets 4 per row)
  onColumns: (n: number) => void;
  reorderMode: boolean;
  onToggleReorder: () => void;
  onAddDemo: () => void;
  onRemoveDemo: () => void;
  appUrls: string[];
  tokenRequired: boolean;
  // Remote phones (out-of-home) — paired via the relay by 9-digit code.
  relayUrl: string;
  relayToken: string;
  remotePhones: RemotePhone[];
  onRelayUrl: (url: string) => void;
  onRelayToken: (t: string) => void;
  onAddRemote: (code: string) => void;
  onRemoveRemote: (code: string) => void;
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
  relayUrl,
  relayToken,
  remotePhones,
  onRelayUrl,
  onRelayToken,
  onAddRemote,
  onRemoveRemote,
}: SettingsDrawerProps) {
  const [code, setCode] = useState("");

  const submitCode = () => {
    onAddRemote(code);
    setCode("");
  };

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

      <div className="remote-section">
        <div className="remote-head">
          <IconLink className="remote-head-icon" />
          <span>Remote phones (out-of-home)</span>
        </div>

        <div className="remote-config">
          <input
            className="remote-input relay-url"
            type="text"
            placeholder="wss://your-relay.onrender.com"
            value={relayUrl}
            onChange={(e) => onRelayUrl(e.target.value.trim())}
            title="Relay server base URL (no path)"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
          <input
            className="remote-input relay-token"
            type="text"
            placeholder="relay token (optional)"
            value={relayToken}
            onChange={(e) => onRelayToken(e.target.value)}
            title="Optional shared secret for the relay"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
        </div>

        <form
          className="remote-add"
          onSubmit={(e) => {
            e.preventDefault();
            submitCode();
          }}
        >
          <input
            className="remote-input remote-code-input"
            type="text"
            inputMode="numeric"
            placeholder="phone code (e.g. 916 429 577)"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            title="Enter the 9-digit code shown on the phone"
          />
          <button type="submit" className="seg-btn active remote-add-btn" title="Connect this phone by code">
            Add
          </button>
        </form>

        {!relayUrl.trim() ? (
          <span className="settings-hint">Enter the relay server URL above to connect remote phones.</span>
        ) : remotePhones.length === 0 ? (
          <span className="settings-hint">No remote phones yet — add one by its code.</span>
        ) : (
          <ul className="remote-list">
            {remotePhones.map((p) => (
              <li key={p.code}>
                <span className="remote-code">
                  <IconPhone className="remote-code-icon" />
                  <code>{p.code}</code>
                  {p.label && <span className="remote-label">{p.label}</span>}
                </span>
                <button
                  className="ghost-btn small danger"
                  onClick={() => onRemoveRemote(p.code)}
                  title="Disconnect and remove this remote phone"
                >
                  <IconTrash />
                  <span>Disconnect</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
