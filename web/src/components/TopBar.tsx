import { useEffect, useRef, useState } from "react";
import type { ThemeMode } from "../lib/theme";
import { patchSettings, TILE_SIZES, useSettings } from "../lib/settings";
import {
  IconCheck,
  IconClose,
  IconExpand,
  IconMoon,
  IconRefresh,
  IconSearch,
  IconShrink,
  IconSliders,
  IconSun,
  IconSystem,
} from "../lib/icons";

interface TopBarProps {
  online: number;
  connected: boolean;
  search: string;
  refreshing: boolean;
  fullscreen: boolean;
  reorder: boolean;
  themeMode: ThemeMode;
  onSearch: (q: string) => void;
  onRefresh: () => void;
  onToggleFullscreen: () => void;
  onToggleReorder: () => void;
  onTheme: (mode: ThemeMode) => void;
}

/** Close a popover on outside-click / Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

export function TopBar({
  online,
  connected,
  search,
  refreshing,
  fullscreen,
  reorder,
  themeMode,
  onSearch,
  onRefresh,
  onToggleFullscreen,
  onToggleReorder,
  onTheme,
}: TopBarProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const settings = useSettings();

  const customRef = useDismiss(customOpen, () => setCustomOpen(false));
  const themeRef = useDismiss(themeOpen, () => setThemeOpen(false));

  const ThemeIcon = themeMode === "light" ? IconSun : themeMode === "dark" ? IconMoon : IconSystem;
  const themeLabel = themeMode === "light" ? "Light" : themeMode === "dark" ? "Dark" : "System";

  return (
    <header className="topbar">
      <span className="top-count" title={connected ? "Helper connected" : "Helper offline"}>
        <span className={`dot ${connected ? "" : "bad"}`} />
        <b>{online}</b> connected
      </span>

      <div className="top-spacer" />

      <label className="search">
        <IconSearch />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search devices…"
          aria-label="Search devices"
        />
        {search && (
          <button className="search-clear" onClick={() => onSearch("")} aria-label="Clear search">
            <IconClose />
          </button>
        )}
      </label>

      {/* Every action is labelled — nothing here should need guessing. */}
      <button className="tool-btn" onClick={onRefresh} disabled={refreshing}>
        <IconRefresh className={refreshing ? "spin" : ""} />
        <span>Refresh</span>
      </button>

      <button className="tool-btn" onClick={onToggleFullscreen}>
        {fullscreen ? <IconShrink /> : <IconExpand />}
        <span>{fullscreen ? "Exit full screen" : "Full screen"}</span>
      </button>

      <div className="pop-wrap" ref={customRef}>
        <button className={`tool-btn ${customOpen ? "on" : ""}`} onClick={() => setCustomOpen((v) => !v)}>
          <IconSliders />
          <span>Customize</span>
        </button>
        {customOpen && (
          <div className="pop">
            <div className="pop-title">Tile size</div>
            <div className="seg seg-col" style={{ marginBottom: 12 }}>
              {TILE_SIZES.map((o) => (
                <button
                  key={o.value}
                  className={settings.tileSize === o.value ? "on" : ""}
                  onClick={() => patchSettings({ tileSize: o.value })}
                >
                  <b>{o.short}</b> {o.label}
                </button>
              ))}
            </div>

            <div className="pop-row">
              <span>Fit phones to the window</span>
              <button
                className={`toggle ${settings.fitToWindow ? "on" : ""}`}
                onClick={() => patchSettings({ fitToWindow: !settings.fitToWindow })}
                aria-label="Fit phones to the window"
              >
                <span />
              </button>
            </div>

            <div className="pop-title">Columns</div>
            <div className="pop-row">
              <span>Auto (fit width)</span>
              <button
                className={`toggle ${settings.columns === 0 ? "on" : ""}`}
                onClick={() => patchSettings({ columns: settings.columns === 0 ? 4 : 0 })}
                aria-label="Auto columns"
              >
                <span />
              </button>
            </div>
            {settings.columns > 0 && (
              <div className="pop-row">
                <span>Fixed columns</span>
                <input
                  className="num"
                  type="number"
                  min={1}
                  max={12}
                  value={settings.columns}
                  onChange={(e) =>
                    patchSettings({ columns: Math.min(12, Math.max(1, Number(e.target.value) || 1)) })
                  }
                />
              </div>
            )}

            <div className="pop-title" style={{ marginTop: 12 }}>
              Arrange
            </div>
            <button className={`pop-item ${reorder ? "active" : ""}`} onClick={onToggleReorder}>
              <IconSliders />
              {reorder ? "Done rearranging" : "Rearrange devices"}
            </button>
          </div>
        )}
      </div>

      <div className="pop-wrap" ref={themeRef}>
        <button className={`tool-btn ${themeOpen ? "on" : ""}`} onClick={() => setThemeOpen((v) => !v)}>
          <ThemeIcon />
          <span>{themeLabel}</span>
        </button>
        {themeOpen && (
          <div className="pop" style={{ minWidth: 180 }}>
            <div className="pop-title">Theme</div>
            {(
              [
                ["system", "System", IconSystem],
                ["light", "Light", IconSun],
                ["dark", "Dark", IconMoon],
              ] as [ThemeMode, string, (p: { className?: string }) => JSX.Element][]
            ).map(([mode, label, Icon]) => (
              <button
                key={mode}
                className={`pop-item ${themeMode === mode ? "active" : ""}`}
                onClick={() => {
                  onTheme(mode);
                  setThemeOpen(false);
                }}
              >
                <Icon />
                {label}
                {themeMode === mode && <IconCheck className="tick" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
