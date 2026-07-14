import { useState } from "react";

/**
 * Renders a connection URL that copies itself to the clipboard on click,
 * with brief "Copied!" feedback. Used wherever we show the capture-app address.
 */
export function CopyableUrl({ url, className }: { url: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback for browsers/contexts without the async clipboard API.
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* ignore */
      }
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <button
      type="button"
      className={`copy-url ${className ?? ""} ${copied ? "copied" : ""}`}
      onClick={copy}
      title="Click to copy this address"
    >
      <code>{url}</code>
      <span className="copy-hint">{copied ? "Copied!" : "Copy"}</span>
    </button>
  );
}
