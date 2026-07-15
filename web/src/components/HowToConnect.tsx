import { useState } from "react";
import { IconClose, IconCopy, IconHelp } from "../lib/icons";

interface HowToConnectProps {
  url: string | null;
  tokenRequired: boolean;
  onClose: () => void;
}

export function HowToConnect({ url, tokenRequired, onClose }: HowToConnectProps) {
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
    <div className="modal-back" onClick={onClose} role="dialog" aria-modal="true" aria-label="How to connect">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <IconHelp className="row-icon" />
          <h3>How to connect a phone</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <IconClose />
          </button>
        </div>
        <div className="modal-body">
          <ol className="steps">
            <li>
              Put this PC and the phone on the <b>same Wi-Fi</b>.
            </li>
            <li>
              On the phone, open the <b>Phone Monitor</b> app and go to the <b>Remote</b> tab.
            </li>
            <li>
              Type this address into <b>Desktop address</b>, then tap <b>Connect</b>:
            </li>
          </ol>

          <div style={{ margin: "14px 0" }}>
            {url ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <code className="empty-url">{url}</code>
                <button className="btn" onClick={copy}>
                  <IconCopy />
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            ) : (
              <p>Finding this PC’s Wi-Fi address…</p>
            )}
          </div>

          <ol className="steps" start={4}>
            {tokenRequired && (
              <li>
                Enter the <b>pairing token</b> this PC is using.
              </li>
            )}
            <li>
              Allow <b>screen capture</b> when Android asks.
            </li>
            <li>
              For tap/swipe control, turn on <b>Remote control</b> in the phone app.
            </li>
          </ol>

          <p style={{ marginTop: 14 }}>
            Away from home? Use the phone’s <b>Away from home</b> section to connect through your relay,
            then add it here by its code.
          </p>
        </div>
      </div>
    </div>
  );
}
