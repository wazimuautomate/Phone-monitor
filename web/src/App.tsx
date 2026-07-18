import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { connectHub, type ControlCmd, type Hub, type HubMessage } from "./lib/ws";
import type { Device, RemotePhone, ServerInfo } from "./types";
import { applyTheme, getThemeMode, setThemeMode, watchSystemTheme, type ThemeMode } from "./lib/theme";
import { loadJSON, saveJSON } from "./lib/persist";
import { getSettings, useSettings } from "./lib/settings";
import { appVersion, onFullScreenChanged, setFullScreen, setKeepAwake } from "./lib/desktop";
import { clearHistory, forgetDevice, rememberDevice, touchDevice, useHistory } from "./lib/history";
import type { Alert, AlertSeverity, AlertType } from "./lib/alerts";
import { Sidebar, type Page } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { StatusBar } from "./components/StatusBar";
import { MonitorPage } from "./components/MonitorPage";
import { HistoryPage } from "./components/HistoryPage";
import { SettingsPage } from "./components/SettingsPage";
import { ControlRoom } from "./components/ControlRoom";
import { HowToConnect } from "./components/HowToConnect";
import { AlertToasts } from "./components/AlertToasts";
import "./styles.css";

export function App() {
  const [themeMode, setMode] = useState<ThemeMode>(() => getThemeMode());
  const [connected, setConnected] = useState(false);
  const [devices, setDevices] = useState<Record<string, Device>>({});
  const [serverInfo, setServerInfo] = useState<ServerInfo>({ appUrls: [], tokenRequired: false });
  const [version, setVersion] = useState("—");

  const [page, setPage] = useState<Page>("monitor");
  const [collapsed, setCollapsed] = useState<boolean>(() => loadJSON("pm.sidebar", false));
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [fullscreen, setFs] = useState(false);
  const [reorder, setReorder] = useState(false);
  const [howTo, setHowTo] = useState(false);

  const [nicknames, setNicknames] = useState<Record<string, string>>(() => loadJSON("pm.nicknames", {}));
  const [hidden, setHidden] = useState<string[]>(() => loadJSON("pm.hidden", []));
  const [order, setOrder] = useState<string[]>(() => loadJSON("pm.order", []));
  /** Device ids on stage in the control room. Empty = room closed. */
  const [roomIds, setRoomIds] = useState<string[]>([]);

  // Away-from-home relay: the server/token to broker through, and the phones
  // paired to it (by code). Reconnected on every hub (re)connect.
  const [relayCfg, setRelayCfg] = useState<{ url: string; token: string }>(() =>
    loadJSON("pm.relay", { url: "", token: "" }),
  );
  const [remotePhones, setRemotePhones] = useState<RemotePhone[]>(() => loadJSON("pm.remotePhones", []));

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const hubRef = useRef<Hub | null>(null);
  const history = useHistory();
  useSettings(); // re-render when settings change (grid size, alert prefs, …)

  // ---- Theme ----
  useEffect(() => {
    applyTheme(themeMode);
    return watchSystemTheme(() => {});
  }, [themeMode]);

  const onTheme = (mode: ThemeMode) => {
    setThemeMode(mode);
    setMode(mode);
  };

  // ---- Desktop bits ----
  useEffect(() => {
    void appVersion().then(setVersion);
    // Re-apply the saved keep-awake choice on launch.
    if (getSettings().keepAwake) void setKeepAwake(true);
    return onFullScreenChanged(setFs);
  }, []);

  useEffect(() => saveJSON("pm.sidebar", collapsed), [collapsed]);
  useEffect(() => saveJSON("pm.nicknames", nicknames), [nicknames]);
  useEffect(() => saveJSON("pm.hidden", hidden), [hidden]);
  useEffect(() => saveJSON("pm.order", order), [order]);
  useEffect(() => saveJSON("pm.relay", relayCfg), [relayCfg]);
  useEffect(() => saveJSON("pm.remotePhones", remotePhones), [remotePhones]);

  // Refs so the hub's onOpen (a stable closure) can reconnect saved phones.
  const relayCfgRef = useRef(relayCfg);
  relayCfgRef.current = relayCfg;
  const remotePhonesRef = useRef(remotePhones);
  remotePhonesRef.current = remotePhones;

  // ---- Alerts ----
  const pushAlert = useCallback((type: AlertType, title: string, detail: string, severity: AlertSeverity) => {
    const id = `al-${Math.random().toString(36).slice(2)}`;
    setAlerts((prev) =>
      [...prev.filter((a) => !(a.type === type && a.detail === detail)), { id, type, title, detail, severity }].slice(-5),
    );
    window.setTimeout(() => setAlerts((prev) => prev.filter((a) => a.id !== id)), 6000);
  }, []);

  const toast = useCallback(
    (title: string, detail: string, severity: AlertSeverity) => pushAlert("connection", title, detail, severity),
    [pushAlert],
  );

  // Bookkeeping so each condition fires once per transition, not per stats tick.
  const devicesRef = useRef(devices);
  devicesRef.current = devices;
  const nickRef = useRef(nicknames);
  nickRef.current = nicknames;
  const meta = useRef({ ready: false, low: new Set<string>(), weak: new Set<string>(), locked: new Set<string>() });

  const label = useCallback((id: string, name: string) => nickRef.current[id] ?? name, []);

  const handleAlerts = useCallback(
    (msg: HubMessage) => {
      const { alerts: prefs, batteryThreshold: threshold } = getSettings();
      const m = meta.current;
      switch (msg.type) {
        case "devices": {
          m.low.clear();
          m.weak.clear();
          m.locked.clear();
          for (const d of msg.devices) {
            if ((d.battery ?? 100) <= threshold) m.low.add(d.id);
            if ((d.signal ?? 4) <= 1) m.weak.add(d.id);
            if (d.screenLocked) m.locked.add(d.id);
          }
          m.ready = true;
          break;
        }
        case "device": {
          if (m.ready && prefs.connection) {
            pushAlert("connection", "Phone connected", `${label(msg.device.id, msg.device.name)} is online`, "ok");
          }
          break;
        }
        case "removed": {
          if (msg.reason !== "user" && prefs.connection) {
            const dev = devicesRef.current[msg.deviceId];
            pushAlert(
              "connection",
              "Phone disconnected",
              `${dev ? label(dev.id, dev.name) : "A phone"} dropped`,
              "danger",
            );
          }
          m.low.delete(msg.deviceId);
          m.weak.delete(msg.deviceId);
          m.locked.delete(msg.deviceId);
          break;
        }
        case "stats": {
          const dev = devicesRef.current[msg.deviceId];
          const name = dev ? label(dev.id, dev.name) : "Phone";
          const { battery, signal, screenLocked } = msg.patch;

          if (typeof battery === "number" && prefs.battery) {
            if (battery <= threshold && !m.low.has(msg.deviceId)) {
              m.low.add(msg.deviceId);
              pushAlert("battery", "Low battery", `${name} at ${battery}%`, "warn");
            } else if (battery > threshold + 3) {
              m.low.delete(msg.deviceId);
            }
          }
          if (typeof signal === "number" && prefs.signal) {
            if (signal <= 1 && !m.weak.has(msg.deviceId)) {
              m.weak.add(msg.deviceId);
              pushAlert("signal", "Weak signal", `${name} has ${signal === 0 ? "no" : "1"} bar`, "warn");
            } else if (signal >= 3) {
              m.weak.delete(msg.deviceId);
            }
          }
          if (typeof screenLocked === "boolean" && prefs.screenLock) {
            if (screenLocked && !m.locked.has(msg.deviceId)) {
              m.locked.add(msg.deviceId);
              pushAlert("screenLock", "Screen off", `${name}’s screen turned off`, "warn");
            } else if (!screenLocked) {
              m.locked.delete(msg.deviceId);
            }
          }
          break;
        }
      }
    },
    [pushAlert, label],
  );

  // ---- Hub ----
  useEffect(() => {
    const hub = connectHub({
      onOpen: () => {
        setConnected(true);
        // Re-attach every saved remote phone so they survive helper restarts.
        const { url, token } = relayCfgRef.current;
        if (url) {
          for (const p of remotePhonesRef.current) {
            hub.send({ type: "relay-connect", relayUrl: url, code: p.code, token });
          }
        }
      },
      onClose: () => setConnected(false),
      onMessage: (msg: HubMessage) => {
        handleAlerts(msg);
        if (msg.type === "server-info") {
          setServerInfo({ appUrls: msg.appUrls, tokenRequired: msg.tokenRequired });
          return;
        }
        // Remember real phones so History outlives a disconnect.
        if (msg.type === "device") rememberDevice(msg.device);
        if (msg.type === "devices") msg.devices.forEach(rememberDevice);
        if (msg.type === "stats") touchDevice(msg.deviceId);
        setDevices((prev) => reduceDevices(prev, msg));
      },
    });
    hubRef.current = hub;
    return () => hub.close();
  }, [handleAlerts]);

  const send = (msg: unknown) => hubRef.current?.send(msg);

  // ---- Remote phones (relay) ----
  const relayConnect = (code: string, label?: string) => {
    const { url, token } = relayCfg;
    if (!url || !code) return;
    send({ type: "relay-connect", relayUrl: url, code, token });
    setRemotePhones((prev) => (prev.some((p) => p.code === code) ? prev : [...prev, { code, label }]));
  };
  const relayDisconnect = (code: string) => {
    send({ type: "relay-disconnect", code });
    setRemotePhones((prev) => prev.filter((p) => p.code !== code));
  };

  const sendControl = useCallback(
    (deviceId: string, cmd: ControlCmd) => hubRef.current?.sendControl(deviceId, cmd),
    [],
  );

  // ---- Derived ----
  const ordered = useMemo(() => {
    const ids = Object.keys(devices);
    const inOrder = order.filter((id) => devices[id]);
    const rest = ids
      .filter((id) => !inOrder.includes(id))
      .sort((a, b) => devices[a].name.localeCompare(devices[b].name));
    return [...inOrder, ...rest].map((id) => devices[id]);
  }, [devices, order]);

  const nickname = useCallback((d: Device) => nicknames[d.id] ?? d.name, [nicknames]);
  const hiddenSet = useMemo(() => new Set(hidden), [hidden]);

  const matches = useCallback(
    (d: Device) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return `${nickname(d)} ${d.model ?? ""}`.toLowerCase().includes(q);
    },
    [search, nickname],
  );

  const visible = ordered.filter((d) => !hiddenSet.has(d.id) && matches(d));
  const hiddenDevices = ordered.filter((d) => hiddenSet.has(d.id));
  const online = ordered.filter((d) => d.status === "online").length;
  const demoCount = ordered.filter((d) => d.id.startsWith("mock-")).length;
  const onlineIds = useMemo(
    () => new Set(ordered.filter((d) => d.status === "online").map((d) => d.id)),
    [ordered],
  );
  const disconnected = useMemo(() => history.filter((e) => !devices[e.id]), [history, devices]);

  const connectUrl = useMemo(() => {
    const host = location.hostname;
    const isLocal = host === "localhost" || host === "127.0.0.1";
    if (!isLocal) return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/app`;
    // The helper already ranks the most-likely-reachable interface first, so
    // take the top candidate rather than guessing by regex (which could prefer a
    // VPN's 10.x adapter over the real Wi-Fi address).
    return serverInfo.appUrls[0] ?? null;
  }, [serverInfo]);

  // ---- Actions ----
  const refresh = () => {
    setRefreshing(true);
    send({ type: "list" });
    window.setTimeout(() => setRefreshing(false), 600);
  };

  const toggleFullscreen = async () => setFs(await setFullScreen(!fullscreen));

  const onRename = (id: string, name: string) => setNicknames((p) => ({ ...p, [id]: name }));
  const onHide = (id: string) => setHidden((p) => (p.includes(id) ? p : [...p, id]));
  const onUnhide = (id: string) => setHidden((p) => p.filter((x) => x !== id));
  const onRemove = (id: string) => {
    send({ type: "remove", deviceId: id });
    setHidden((p) => p.filter((x) => x !== id));
    setOrder((p) => p.filter((x) => x !== id));
    setRoomIds((p) => p.filter((x) => x !== id));
  };
  const onReorder = (visibleIds: string[]) => {
    const others = ordered.map((d) => d.id).filter((id) => !visibleIds.includes(id));
    setOrder([...visibleIds, ...others]);
  };

  const openRoom = (id: string) => setRoomIds([id]);
  const roomDevices = roomIds.map((id) => devices[id]).filter(Boolean);
  const roomAvailable = ordered.filter((d) => d.status === "online" && !roomIds.includes(d.id));

  // Close the room if every phone in it went away.
  useEffect(() => {
    if (roomIds.length > 0 && roomIds.every((id) => !devices[id])) setRoomIds([]);
  }, [roomIds, devices]);

  return (
    <div className="app">
      <Sidebar
        page={page}
        collapsed={collapsed}
        version={version}
        connected={ordered.filter((d) => !hiddenSet.has(d.id))}
        hidden={hiddenDevices}
        disconnected={disconnected}
        nickname={nickname}
        onNavigate={setPage}
        onToggleCollapse={() => setCollapsed((v) => !v)}
        onControl={openRoom}
        onRename={onRename}
        onHide={onHide}
        onUnhide={onUnhide}
        onRemove={onRemove}
        onForget={forgetDevice}
      />

      <div className="main">
        <TopBar
          online={online}
          connected={connected}
          search={search}
          refreshing={refreshing}
          fullscreen={fullscreen}
          reorder={reorder}
          themeMode={themeMode}
          onSearch={setSearch}
          onRefresh={refresh}
          onToggleFullscreen={() => void toggleFullscreen()}
          onToggleReorder={() => setReorder((v) => !v)}
          onTheme={onTheme}
        />

        <div className="content">
          {page === "monitor" && (
            <MonitorPage
              devices={visible}
              nickname={nickname}
              reorder={reorder}
              search={search}
              connectUrl={connectUrl}
              onRename={onRename}
              onControl={openRoom}
              onReorder={onReorder}
              onAddDemo={() => send({ type: "mock-add" })}
              onHowTo={() => setHowTo(true)}
            />
          )}


          {page === "history" && (
            <HistoryPage
              entries={history}
              onlineIds={onlineIds}
              onControl={openRoom}
              onForget={forgetDevice}
              onClear={clearHistory}
              onHowTo={() => setHowTo(true)}
            />
          )}

          {page === "settings" && (
            <SettingsPage
              themeMode={themeMode}
              onTheme={onTheme}
              demoCount={demoCount}
              onAddDemo={() => send({ type: "mock-add" })}
              onRemoveDemo={() => send({ type: "mock-remove" })}
              relayCfg={relayCfg}
              onRelayCfg={setRelayCfg}
              remotePhones={remotePhones}
              onRelayConnect={relayConnect}
              onRelayDisconnect={relayDisconnect}
            />
          )}
        </div>

        <StatusBar
          url={connectUrl}
          tokenRequired={serverInfo.tokenRequired}
          online={online}
          total={ordered.length}
          onHowTo={() => setHowTo(true)}
        />
      </div>

      {roomDevices.length > 0 && (
        <ControlRoom
          devices={roomDevices}
          available={roomAvailable}
          nickname={nickname}
          sendControl={sendControl}
          onAdd={(id) => setRoomIds((p) => [...p, id])}
          onDrop={(id) => setRoomIds((p) => p.filter((x) => x !== id))}
          onLeave={() => setRoomIds([])}
          onToast={toast}
        />
      )}

      {howTo && (
        <HowToConnect url={connectUrl} tokenRequired={serverInfo.tokenRequired} onClose={() => setHowTo(false)} />
      )}

      <AlertToasts alerts={alerts} onDismiss={(id) => setAlerts((p) => p.filter((a) => a.id !== id))} />
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
      return prev[msg.deviceId] ? { ...prev, [msg.deviceId]: { ...prev[msg.deviceId], ...msg.patch } } : prev;
    default:
      return prev;
  }
}
