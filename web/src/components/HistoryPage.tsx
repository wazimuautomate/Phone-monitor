import type { HistoryEntry } from "../types";
import { when } from "../lib/format";
import { IconHistory, IconPhone, IconPointer, IconTrash } from "../lib/icons";

interface HistoryPageProps {
  entries: HistoryEntry[];
  /** Ids that are connected right now, so we can offer "view" instead of a hint. */
  onlineIds: Set<string>;
  onControl: (id: string) => void;
  onForget: (id: string) => void;
  onClear: () => void;
  onHowTo: () => void;
}

export function HistoryPage({
  entries,
  onlineIds,
  onControl,
  onForget,
  onClear,
  onHowTo,
}: HistoryPageProps) {
  return (
    <div className="page">
      <div className="page-head" style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <h1 className="page-title">History</h1>
          <p className="page-sub">Every phone that has ever connected to this desktop.</p>
        </div>
        <button className="btn" onClick={onClear} disabled={entries.length === 0}>
          Clear all
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="empty" style={{ minHeight: "40vh" }}>
          <div className="empty-card">
            <IconHistory className="empty-icon" />
            <h2>No history yet</h2>
            <p>Phones you connect will be listed here, so you can reconnect or remove them later.</p>
            <button className="btn" onClick={onHowTo}>
              How to connect
            </button>
          </div>
        </div>
      ) : (
        <div className="panel">
          {entries.map((e) => {
            const online = onlineIds.has(e.id);
            return (
              <div className="dev-row" key={e.id}>
                <span className={`dev-ic ${online ? "" : "muted"}`}>
                  <IconPhone />
                </span>
                <div className="dev-main">
                  <div className="dev-name">{e.name}</div>
                  <div className="dev-sub">
                    <span>{e.model ?? "Phone"}</span>
                    <span className="sep">·</span>
                    <span>{e.connection === "internet-app" ? "Remote" : "Same Wi-Fi"}</span>
                    <span className="sep">·</span>
                    <span>Last seen {when(e.lastSeen)}</span>
                  </div>
                </div>
                {online ? (
                  <span className="chip on">Connected</span>
                ) : (
                  <span className="chip">Offline</span>
                )}
                {online ? (
                  <button className="btn" onClick={() => onControl(e.id)}>
                    <IconPointer />
                    Control
                  </button>
                ) : (
                  <button className="btn" onClick={onHowTo} title="Reconnect from the phone">
                    Reconnect
                  </button>
                )}
                <button className="icon-btn" onClick={() => onForget(e.id)} title="Remove from history">
                  <IconTrash />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
