import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { connectHub, type Hub, type HubMessage } from "./lib/ws";
import type { Device, ServerInfo } from "./types";
import { getTheme, setTheme, type Theme } from "./lib/theme";
import { loadJSON, saveJSON } from "./lib/persist";
import { Header } from "./components/Header";
import { DeviceGrid } from "./components/DeviceGrid";
import { SettingsDrawer } from "./components/SettingsDrawer";
import { StatusBar } from "./components/StatusBar";
import { HiddenTray } from "./components/HiddenTray";
import { IconClose } from "./lib/icons";
import { AlertToasts } from "./components/AlertToasts";
import type { Alert, AlertSeverity, AlertType } from "./lib/alerts";
import "./styles.css";

export function App() {
  const [theme, setThemeState] = useState<Theme>(() => getTheme());
  const [connected, setConnected] = useState(false);
  const [devices, setDevices] = useState<Record<string, Device>>({});
  const [serverInfo, setServerInfo] = useState<ServerInfo>({ appUrls: [], tokenRequired: false });

  const [nicknames, setNicknames] = useState<Record<string, string>>(() => loadJSON("pm.nicknames", {}));
  const [hidden, setHidden] = useState<string[]>(() => loadJSON("pm.hidden", []));
  const [order, setOrder] = useState<string[]>(() => loadJSON("pm.order", []));
  const [columns, setColumns] = useState<number>(() => loadJSON("pm.columns", 0));

  const [reorderMode, setReorderMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hiddenTrayOpen, setHiddenTrayOpen] = useState(false);

  const hubRef = useRef<Hub | null>(null);

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const devicesRef = useRef(devices);
  const nicknamesRef = useRef(nicknames);
  const alertMeta = useRef({ initialized: false, low: new Set<string>(), locked: new Set<string>() });
  const alertSeq = useRef(0);

  useEffect(() => {
    devicesRef.current = devices;
  }, [devices]);
  useEffect(() => {
    nicknamesRef.current = nicknames;
  }, [nicknames]);

  const pushAlert = useCallback(
    (type: AlertType, title: string, detail: string, severity: AlertSeverity) => {
      const id = `al-${++alertSeq.current}`;
      setAlerts((prev) =>
        [...prev.filter((a) => !(a.type === type && a.detail === detail)), { id, type, title, detail, severity }].slice(-5),
      );
      window.setTimeout(() => setAlerts((prev) => prev.filter((a) => a.id !== id)), 6000);
    },
    [],
  );

  const dismissAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleAlerts = useCallback(
    (msg: HubMessage) => {
      const meta = alertMeta.current;
      const label = (id: string, name: string) => nicknamesRef.current[id] ?? name;
      const LOW = 20;
      switch (msg.type) {
        case "devices": {
          meta.low.clear();
          meta.locked.clear();
          for (const d of msg.devices) {
            if ((d.battery ?? 100) <= LOW) meta.low.add(d.id);
            if (d.screenLocked) meta.locked.add(d.id);
          }
          meta.initialized = true;
          break;
        }
        case "device": {
          if (meta.initialized) {
            pushAlert("new-device", "New device", `${label(msg.device.id, msg.device.name)} connected`, "ok");
          }
          break;
        }
        case "removed": {
          if (msg.reason !== "user") {
            const dev = devicesRef.current[msg.deviceId];
            pushAlert("disconnect", "Device disconnected", `${dev ? label(dev.id, dev.name) : "A device"} lost connection`, "danger");
          }
          meta.low.delete(msg.deviceId);
          meta.locked.delete(msg.deviceId);
          break;
        }
        case "stats": {
          const dev = devicesRef.current[msg.deviceId];
          const name = dev ? label(dev.id, dev.name) : "Device";
          const { battery, screenLocked } = msg.patch;
          if (typeof battery === "number") {
            if (battery <= LOW && !meta.low.has(msg.deviceId)) {
              meta.low.add(msg.deviceId);
              pushAlert("low-battery", "Low battery", `${name} at ${battery}%`, "warn");
            } else if (battery > LOW + 3) {
              meta.low.delete(msg.deviceId);
            }
          }
          if (typeof screenLocked === "boolean") {
            if (screenLocked && !meta.locked.has(msg.deviceId)) {
              meta.locked.add(msg.deviceId);
              pushAlert("screen-lock", "Screen locked", `${name} screen locked`, "warn");
            } else if (!screenLocked) {
              meta.locked.delete(msg.deviceId);
            }
          }
          break;
        }
      }
    },
    [pushAlert],
  );

  useEffect(() => {
    const hub = connectHub({
      onOpen: () => setConnected(true),
      onClose: () => setConnected(false),
      onMessage: (msg: HubMessage) => {
        handleAlerts(msg);
        if (msg.type === "server-info") {
          setServerInfo({ appUrls: msg.appUrls, tokenRequired: msg.tokenRequired });
        } else {
          setDevices((prev) => reduceDevices(prev, msg));
        }
      },
    });
    hubRef.current = hub;
    return () => hub.close();
  }, [handleAlerts]);

  useEffect(() => saveJSON("pm.nicknames", nicknames), [nicknames]);
  useEffect(() => saveJSON("pm.hidden", hidden), [hidden]);
  useEffect(() => saveJSON("pm.order", order), [order]);
  useEffect(() => saveJSON("pm.columns", columns), [columns]);

  const exitImmersive = useCallback(() => {
    setImmersive(false);
    try {
      if (document.fullscreenElement) void document.exitFullscreen?.();
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement) setImmersive(false);
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    if (!immersive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitImmersive();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [immersive, exitImmersive]);

  const ordered = useMemo(() => {
    const ids = Object.keys(devices);
    const inOrder = order.filter((id) => devices[id]);
    const rest = ids
      .filter((id) => !inOrder.includes(id))
      .sort((a, b) => devices[a].name.localeCompare(devices[b].name));
    return [...inOrder, ...rest].map((id) => devices[id]);
  }, [devices, order]);

  const hiddenSet = useMemo(() => new Set(hidden), [hidden]);
  const visible = ordered.filter((d) => !hiddenSet.has(d.id));
  const hiddenDevices = ordered.filter((d) => hiddenSet.has(d.id));

  const online = ordered.filter((d) => d.status === "online").length;
  const avgFps = ordered.length
    ? Math.round(ordered.reduce((a, d) => a + (d.fps ?? 0), 0) / ordered.length)
    : 0;

  const primaryUrl = useMemo(() => {
    const urls = serverInfo.appUrls;
    if (!urls.length) return null;
    return urls.find((u) => /\/\/(192\.168|10\.)/.test(u)) ?? urls[0];
  }, [serverInfo]);

  const nickname = useCallback((d: Device) => nicknames[d.id] ?? d.name, [nicknames]);
  const send = (msg: unknown) => hubRef.current?.send(msg);

  const refresh = useCallback(() => {
    setRefreshing(true);
    hubRef.current?.send({ type: "list" });
    window.setTimeout(() => setRefreshing(false), 600);
  }, []);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  };

  const enterImmersive = () => {
    setImmersive(true);
    try {
      void document.documentElement.requestFullscreen?.();
    } catch {
      /* ignore */
    }
  };

  const onRename = (id: string, name: string) => setNicknames((p) => ({ ...p, [id]: name }));
  const onHide = (id: string) => setHidden((p) => (p.includes(id) ? p : [...p, id]));
  const onUnhide = (id: string) => setHidden((p) => p.filter((x) => x !== id));
  const onRemove = (id: string) => {
    send({ type: "remove", deviceId: id });
    setHidden((p) => p.filter((x) => x !== id));
    setOrder((p) => p.filter((x) => x !== id));
  };
  const onReorder = (visibleIds: string[]) => {
    const others = ordered.map((d) => d.id).filter((id) => !visibleIds.includes(id));
    setOrder([...visibleIds, ...others]);
  };

  const gridClassName = columns === 0 ? "grid auto" : "grid";
  const gridStyle = columns > 0 ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined;

  return (
    <div className={`app ${immersive ? "immersive" : ""}`}>
      <div className="topbar">
        <Header
          connected={connected}
          online={online}
          theme={theme}
          refreshing={refreshing}
          settingsOpen={settingsOpen}
          primaryUrl={primaryUrl}
          tokenRequired={serverInfo.tokenRequired}
          onRefresh={refresh}
          onToggleTheme={toggleTheme}
          onToggleSettings={() => setSettingsOpen((v) => !v)}
          onFullscreen={enterImmersive}
        />
        {settingsOpen && (
          <SettingsDrawer
            columns={columns}
            onColumns={setColumns}
            reorderMode={reorderMode}
            onToggleReorder={() => setReorderMode((v) => !v)}
            onAddDemo={() => send({ type: "mock-add" })}
            onRemoveDemo={() => send({ type: "mock-remove" })}
            appUrls={serverInfo.appUrls}
            tokenRequired={serverInfo.tokenRequired}
          />
        )}
      </div>

      {visible.length === 0 ? (
        <main className="grid-empty">
          <div className="empty">
            No visible devices. Open <strong>Settings</strong> to add demo devices, or connect the
            capture app to a phone using the address shown above.
          </div>
        </main>
      ) : (
        <DeviceGrid
          devices={visible}
          reorderMode={reorderMode}
          gridClassName={gridClassName}
          gridStyle={gridStyle}
          nickname={nickname}
          onRename={onRename}
          onHide={onHide}
          onRemove={onRemove}
          onReorder={onReorder}
        />
      )}

      {hiddenTrayOpen && (
        <HiddenTray
          devices={hiddenDevices}
          nickname={nickname}
          onUnhide={onUnhide}
          onClose={() => setHiddenTrayOpen(false)}
        />
      )}

      <StatusBar
        online={online}
        total={ordered.length}
        connected={connected}
        avgFps={avgFps}
        hiddenCount={hiddenDevices.length}
        primaryUrl={primaryUrl}
        onShowHidden={() => setHiddenTrayOpen((v) => !v)}
      />

      {immersive && (
        <button className="exit-immersive" onClick={exitImmersive} title="Exit fullscreen (Esc)">
          <IconClose />
        </button>
      )}

      <AlertToasts alerts={alerts} onDismiss={dismissAlert} />
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
