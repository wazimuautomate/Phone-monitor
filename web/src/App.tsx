import { useEffect, useState } from "react";
import { connectHub, type HubMessage, type WireDevice } from "./lib/ws";

export function App() {
  const [connected, setConnected] = useState(false);
  const [devices, setDevices] = useState<Record<string, WireDevice>>({});

  useEffect(() => {
    const hub = connectHub({
      onOpen: () => setConnected(true),
      onClose: () => setConnected(false),
      onMessage: (msg: HubMessage) =>
        setDevices((prev) => {
          switch (msg.type) {
            case "devices": {
              const next: Record<string, WireDevice> = {};
              for (const d of msg.devices) next[d.id] = d;
              return next;
            }
            case "device":
              return { ...prev, [msg.device.id]: msg.device };
            case "removed": {
              const next = { ...prev };
              delete next[msg.deviceId];
              return next;
            }
            case "stats":
              return prev[msg.deviceId]
                ? { ...prev, [msg.deviceId]: { ...prev[msg.deviceId], ...msg.patch } }
                : prev;
            default:
              return prev;
          }
        }),
    });
    return () => hub.close();
  }, []);

  const list = Object.values(devices);

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>📱 Phone Monitor</h1>
        <span style={{ fontSize: 13, color: connected ? "#22c55e" : "#ef4444" }}>
          {connected ? "● helper connected" : "○ helper offline"}
        </span>
      </header>

      <p style={styles.count}>
        {list.length} device{list.length === 1 ? "" : "s"} connected
      </p>

      {list.length === 0 ? (
        <div style={styles.empty}>
          No devices yet. Tier-1 wireless-debugging pairing arrives in Phase 1;
          the Tier-2 capture app arrives in Phase 2.
        </div>
      ) : (
        <div style={styles.grid}>
          {list.map((d) => (
            <div key={d.id} style={styles.tile}>
              <strong>{d.name}</strong>
              <span style={styles.meta}>{d.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    fontFamily: "system-ui, sans-serif",
    padding: 24,
    color: "#e5e7eb",
    background: "#0b0f17",
    minHeight: "100vh",
  },
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 20 },
  title: { fontSize: 20, margin: 0 },
  count: { color: "#9ca3af", fontSize: 14 },
  empty: { marginTop: 40, color: "#6b7280", fontSize: 14, maxWidth: 520 },
  grid: {
    marginTop: 16,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: 12,
  },
  tile: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: 16,
    borderRadius: 12,
    background: "#111827",
    border: "1px solid #1f2937",
  },
  meta: { fontSize: 12, color: "#9ca3af" },
};
