import { useEffect, useMemo, useRef, useState } from "react";
import { connectHub, type Hub, type HubMessage } from "./lib/ws";
import type { Device } from "./types";
import { Header } from "./components/Header";
import { DeviceCard } from "./components/DeviceCard";
import { StatusBar } from "./components/StatusBar";
import "./styles.css";

export function App() {
  const [connected, setConnected] = useState(false);
  const [devices, setDevices] = useState<Record<string, Device>>({});
  const hubRef = useRef<Hub | null>(null);

  useEffect(() => {
    const hub = connectHub({
      onOpen: () => setConnected(true),
      onClose: () => setConnected(false),
      onMessage: (msg) => setDevices((prev) => reduceDevices(prev, msg)),
    });
    hubRef.current = hub;
    return () => hub.close();
  }, []);

  const list = useMemo(
    () => Object.values(devices).sort((a, b) => a.name.localeCompare(b.name)),
    [devices],
  );

  const refresh = () => hubRef.current?.send({ type: "list" });

  return (
    <div className="app">
      <Header connected={connected} devices={list} onRefresh={refresh} />
      <main className="grid">
        {list.length === 0 ? (
          <div className="empty">
            Waiting for devices… the helper's demo source should populate this grid.
            Real phones arrive in Phase 1 (Wi-Fi debugging) and Phase 2 (capture app).
          </div>
        ) : (
          list.map((d) => <DeviceCard key={d.id} device={d} />)
        )}
      </main>
      <StatusBar devices={list} connected={connected} />
    </div>
  );
}

function reduceDevices(prev: Record<string, Device>, msg: HubMessage): Record<string, Device> {
  switch (msg.type) {
    case "devices": {
      const next: Record<string, Device> = {};
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
}
