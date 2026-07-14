import { IconExpand, IconLink, IconMoon, IconRefresh, IconSettings, IconSun, Logo } from "../lib/icons";
import { CopyableUrl } from "./CopyableUrl";
import type { Theme } from "../lib/theme";

interface HeaderProps {
  connected: boolean;
  online: number;
  theme: Theme;
  refreshing: boolean;
  settingsOpen: boolean;
  primaryUrl: string | null;
  tokenRequired: boolean;
  onRefresh: () => void;
  onToggleTheme: () => void;
  onToggleSettings: () => void;
  onFullscreen: () => void;
}

export function Header({
  connected,
  online,
  theme,
  refreshing,
  settingsOpen,
  primaryUrl,
  tokenRequired,
  onRefresh,
  onToggleTheme,
  onToggleSettings,
  onFullscreen,
}: HeaderProps) {
  return (
    <header className="header">
      <div className="header-left">
        <Logo className="logo" />
        <span className="brand">Phone Monitor</span>
        <span className="device-count">{online} Connected</span>
        <span
          className={`conn-dot ${connected ? "ok" : "bad"}`}
          title={connected ? "Helper connected" : "Helper offline"}
        />
      </div>

      {primaryUrl && (
        <div className="conn-info" title="Click the address to copy it, then paste it into the capture app">
          <IconLink className="conn-icon" />
          <CopyableUrl url={primaryUrl} />
          {tokenRequired && <span className="token-tag">token</span>}
        </div>
      )}

      <div className="header-actions">
        <button className="icon-btn" onClick={onRefresh} disabled={refreshing} title="Refresh">
          <IconRefresh className={refreshing ? "spin" : ""} />
        </button>
        <button className="icon-btn" onClick={onToggleTheme} title={theme === "dark" ? "Light theme" : "Dark theme"}>
          {theme === "dark" ? <IconSun /> : <IconMoon />}
        </button>
        <button className="icon-btn" onClick={onFullscreen} title="Fullscreen">
          <IconExpand />
        </button>
        <button
          className={`icon-btn ${settingsOpen ? "active" : ""}`}
          onClick={onToggleSettings}
          title="Settings"
        >
          <IconSettings />
        </button>
      </div>
    </header>
  );
}
