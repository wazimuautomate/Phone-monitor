import { IconLink, IconPhone } from "../lib/icons";

interface StatusBarProps {
  online: number;
  total: number;
  connected: boolean;
  avgFps: number;
  hiddenCount: number;
  primaryUrl: string | null;
  onShowHidden: () => void;
}

export function StatusBar({
  online,
  total,
  connected,
  avgFps,
  hiddenCount,
  primaryUrl,
  onShowHidden,
}: StatusBarProps) {
  const allOnline = total > 0 && online === total;
  return (
    <footer className="statusbar">
      <div className="status-left">
        <span className={`dot ${allOnline ? "ok" : total ? "warn" : "bad"}`} />
        {total === 0 ? "No devices" : allOnline ? "All devices online" : `${online} of ${total} online`}
        {hiddenCount > 0 && (
          <button className="hidden-btn" onClick={onShowHidden} title="Show hidden devices">
            <IconPhone /> {hiddenCount} hidden
          </button>
        )}
      </div>

      <div className="status-center">
        {online}/{total} Devices
      </div>

      <div className="status-right">
        {primaryUrl && (
          <span className="status-url" title="Capture-app address">
            <IconLink />
            <code>{primaryUrl}</code>
          </span>
        )}
        <span className="sep">·</span>
        <span className={`dot ${connected ? "ok" : "bad"}`} /> FPS {avgFps}
      </div>
    </footer>
  );
}
