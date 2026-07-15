import { useState } from "react";
import { IconCopy, IconHelp, IconLink } from "../lib/icons";

interface StatusBarProps {
  url: string | null;
  tokenRequired: boolean;
  online: number;
  total: number;
  onHowTo: () => void;
}

export function StatusBar({ url, tokenRequired, online, total, onHowTo }: StatusBarProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked — the address is still selectable */
    }
  };

  return (
    <footer className="statusbar">
      {url ? (
        <span className="status-url" title="The address to enter in the phone app">
          <IconLink />
          <code>{url}</code>
          <button className="copy-btn" onClick={copy} aria-label="Copy address">
            <IconCopy />
          </button>
          {copied && <span className="copied">Copied</span>}
        </span>
      ) : (
        <span>Finding this PC’s Wi-Fi address…</span>
      )}

      {tokenRequired && <span className="chip warn">token required</span>}

      <button className="status-link" onClick={onHowTo}>
        <IconHelp />
        How to connect
      </button>

      <span className="status-right">
        <span>
          <b style={{ color: "var(--green-bright)" }}>{online}</b> online
        </span>
        <span className="sep">·</span>
        <span>{total} total</span>
      </span>
    </footer>
  );
}
