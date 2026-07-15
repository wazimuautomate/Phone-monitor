import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Device } from "../types";
import type { ControlCmd, ControlKey } from "../lib/ws";
import { videoBus } from "../lib/video-bus";
import { PhoneScreen } from "./PhoneScreen";
import { Battery, Signal } from "./DeviceMeta";
import { useSettings } from "../lib/settings";
import { defaultCapturePaths } from "../lib/desktop";
import { startRecording, takeScreenshot, type Recorder } from "../lib/capture";
import {
  IconBack,
  IconBell,
  IconCamera,
  IconCheck,
  IconClose,
  IconHome,
  IconLeave,
  IconLock,
  IconPlus,
  IconPower,
  IconRecents,
  IconRecord,
  IconRotate,
  IconStop,
  IconVolumeDown,
  IconVolumeUp,
} from "../lib/icons";

interface ControlRoomProps {
  /** Devices on stage, in order. The first is the one opened from the grid. */
  devices: Device[];
  /** Everything else that could be added to the room. */
  available: Device[];
  nickname: (d: Device) => string;
  sendControl: (deviceId: string, cmd: ControlCmd) => void;
  onAdd: (id: string) => void;
  onDrop: (id: string) => void;
  onLeave: () => void;
  onToast: (title: string, detail: string, severity: "ok" | "warn" | "danger") => void;
}

/** A press that moved less than this many px counts as a tap, not a swipe. */
const TAP_SLOP_PX = 6;
/** Fraction of screen height one mouse-wheel notch scrolls. */
const WHEEL_SPAN = 0.16;

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Map a client point onto video drawn with `object-fit: contain`. Returns
 * normalized [0,1] coords against the *content* (letterboxing removed), plus
 * pixel offsets inside the element for the on-screen markers.
 */
function normalize(el: HTMLElement, clientX: number, clientY: number, vw: number, vh: number) {
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0 || vw === 0 || vh === 0) return null;
  const vAspect = vw / vh;
  const eAspect = r.width / r.height;
  let cw = r.width;
  let ch = r.height;
  let ox = 0;
  let oy = 0;
  if (eAspect > vAspect) {
    ch = r.height;
    cw = ch * vAspect;
    ox = (r.width - cw) / 2;
  } else {
    cw = r.width;
    ch = cw / vAspect;
    oy = (r.height - ch) / 2;
  }
  const px = clientX - r.left;
  const py = clientY - r.top;
  return { nx: clamp01((px - ox) / cw), ny: clamp01((py - oy) / ch), px, py };
}

/** Live decode rate for one device, measured locally (no RTT field on the wire). */
function useStreamStats(deviceId: string) {
  const [stats, setStats] = useState({ fps: 0, intervalMs: 0, live: false });
  useEffect(() => {
    let times: number[] = [];
    let last = 0;
    const unsub = videoBus.subscribe(deviceId, (f) => {
      if (f.type === "config") return; // metadata, not a rendered frame
      const now = performance.now();
      last = now;
      times.push(now);
    });
    const timer = window.setInterval(() => {
      const now = performance.now();
      times = times.filter((t) => now - t < 1000);
      const fps = times.length;
      const intervalMs =
        times.length >= 2 ? Math.round((times[times.length - 1] - times[0]) / (times.length - 1)) : 0;
      setStats({ fps, intervalMs, live: last !== 0 && now - last < 2000 });
    }, 500);
    return () => {
      unsub();
      window.clearInterval(timer);
    };
  }, [deviceId]);
  return stats;
}

interface Ripple {
  id: number;
  x: number;
  y: number;
}

/** One phone on stage: live screen + the tap/swipe/scroll input layer. */
function Stage({
  device,
  name,
  active,
  closable,
  sendControl,
  onActivate,
  onClose,
  onCanvas,
}: {
  device: Device;
  name: string;
  active: boolean;
  closable: boolean;
  sendControl: (deviceId: string, cmd: ControlCmd) => void;
  onActivate: () => void;
  onClose: () => void;
  onCanvas: (c: HTMLCanvasElement | null) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [videoSize, setVideoSize] = useState({ w: 9, h: 19.5 });
  const [cursor, setCursor] = useState<{ x: number; y: number; down: boolean } | null>(null);
  const [swipe, setSwipe] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const pressRef = useRef<{ nx: number; ny: number; px: number; py: number; t: number } | null>(null);
  const rippleSeq = useRef(0);

  const sendRef = useRef(sendControl);
  sendRef.current = sendControl;
  const sizeRef = useRef(videoSize);
  sizeRef.current = videoSize;

  const onVideoSize = useCallback((w: number, h: number) => {
    if (w > 0 && h > 0) setVideoSize({ w, h });
  }, []);

  const addRipple = (x: number, y: number) => {
    const id = ++rippleSeq.current;
    setRipples((r) => [...r, { id, x, y }]);
    window.setTimeout(() => setRipples((r) => r.filter((p) => p.id !== id)), 550);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    onActivate();
    const el = stageRef.current;
    if (!el) return;
    const p = normalize(el, e.clientX, e.clientY, videoSize.w, videoSize.h);
    if (!p) return;
    el.setPointerCapture?.(e.pointerId);
    pressRef.current = { nx: p.nx, ny: p.ny, px: p.px, py: p.py, t: performance.now() };
    setCursor({ x: p.px, y: p.py, down: true });
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = stageRef.current;
    if (!el) return;
    const p = normalize(el, e.clientX, e.clientY, videoSize.w, videoSize.h);
    if (!p) return;
    const press = pressRef.current;
    setCursor({ x: p.px, y: p.py, down: !!press });
    if (press) setSwipe({ x1: press.px, y1: press.py, x2: p.px, y2: p.py });
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = stageRef.current;
    const start = pressRef.current;
    pressRef.current = null;
    setSwipe(null);
    setCursor((c) => (c ? { ...c, down: false } : c));
    if (!el || !start) return;
    const p = normalize(el, e.clientX, e.clientY, videoSize.w, videoSize.h);
    if (!p) return;
    const dist = Math.hypot(p.px - start.px, p.py - start.py);
    const dur = performance.now() - start.t;
    if (dist < TAP_SLOP_PX && dur < 500) {
      sendControl(device.id, { action: "tap", x: round3(start.nx), y: round3(start.ny) });
      addRipple(start.px, start.py);
    } else {
      sendControl(device.id, {
        action: "swipe",
        x1: round3(start.nx),
        y1: round3(start.ny),
        x2: round3(p.nx),
        y2: round3(p.ny),
        ms: Math.round(Math.min(1000, Math.max(50, dur))),
      });
      addRipple(p.px, p.py);
    }
  };

  // Wheel needs a native non-passive listener so we can preventDefault.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const vs = sizeRef.current;
      const p = normalize(el, e.clientX, e.clientY, vs.w, vs.h);
      if (!p) return;
      // Wheel down reveals content below → the finger swipes up.
      const dir = e.deltaY > 0 ? 1 : -1;
      sendRef.current(device.id, {
        action: "swipe",
        x1: round3(p.nx),
        y1: round3(clamp01(p.ny + (dir * WHEEL_SPAN) / 2)),
        x2: round3(p.nx),
        y2: round3(clamp01(p.ny - (dir * WHEEL_SPAN) / 2)),
        ms: 120,
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [device.id]);

  return (
    <div
      className={`stage ${active ? "active" : ""}`}
      style={{ aspectRatio: `${videoSize.w} / ${videoSize.h}` }}
      onMouseDown={onActivate}
    >
      <PhoneScreen device={device} fill onVideoSize={onVideoSize} onCanvas={onCanvas} />
      <span className="stage-tag">{name}</span>
      {closable && (
        <button className="stage-close" onClick={onClose} title="Remove from the room" aria-label="Remove from the room">
          <IconClose />
        </button>
      )}
      <div
        ref={stageRef}
        className={`input-layer ${cursor?.down ? "press" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          if (!pressRef.current) setCursor(null);
        }}
      >
        {swipe && (
          <svg className="swipe" aria-hidden="true">
            <line x1={swipe.x1} y1={swipe.y1} x2={swipe.x2} y2={swipe.y2} />
            <circle cx={swipe.x1} cy={swipe.y1} r="6" />
          </svg>
        )}
        {ripples.map((r) => (
          <span key={r.id} className="ripple" style={{ left: r.x, top: r.y }} />
        ))}
        {cursor && <span className={`cursor ${cursor.down ? "down" : ""}`} style={{ left: cursor.x, top: cursor.y }} />}
      </div>
    </div>
  );
}

export function ControlRoom({
  devices,
  available,
  nickname,
  sendControl,
  onAdd,
  onDrop,
  onLeave,
  onToast,
}: ControlRoomProps) {
  const settings = useSettings();
  const [activeId, setActiveId] = useState(devices[0]?.id ?? "");
  const [addOpen, setAddOpen] = useState(false);
  const [recorder, setRecorder] = useState<Recorder | null>(null);
  const [defaults, setDefaults] = useState({ screenshots: "", recordings: "" });
  const canvases = useRef(new Map<string, HTMLCanvasElement>());

  useEffect(() => {
    void defaultCapturePaths().then(setDefaults);
  }, []);

  // Keep a valid active device as phones come and go.
  useEffect(() => {
    if (!devices.some((d) => d.id === activeId)) setActiveId(devices[0]?.id ?? "");
  }, [devices, activeId]);

  const active = devices.find((d) => d.id === activeId) ?? devices[0];
  const stats = useStreamStats(active?.id ?? "");

  const sendKey = (k: ControlKey) => active && sendControl(active.id, { action: "key", key: k });
  const rotate = () => active && sendControl(active.id, { action: "rotate" });

  // ---- Keyboard: type into the focused phone; Esc leaves ----
  const bufferRef = useRef("");
  const flushTimer = useRef<number | undefined>(undefined);
  const activeRef = useRef(active);
  activeRef.current = active;
  const sendRef = useRef(sendControl);
  sendRef.current = sendControl;

  const flush = useCallback(() => {
    if (flushTimer.current !== undefined) {
      window.clearTimeout(flushTimer.current);
      flushTimer.current = undefined;
    }
    const text = bufferRef.current;
    bufferRef.current = "";
    const dev = activeRef.current;
    if (text && dev) sendRef.current(dev.id, { action: "text", text });
  }, []);

  const leave = useCallback(async () => {
    flush();
    // Never lose a take: finalise and save before the room closes.
    if (recorder) {
      const path = await recorder.stop();
      onToast("Recording saved", path ?? "Saved to your downloads", "ok");
      setRecorder(null);
    }
    onLeave();
  }, [flush, recorder, onLeave, onToast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        void leave();
        return;
      }
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const dev = activeRef.current;
      if (!dev) return;
      if (e.key === "Enter") {
        e.preventDefault();
        flush();
        sendRef.current(dev.id, { action: "text", text: "\n" });
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        if (bufferRef.current.length > 0) {
          bufferRef.current = bufferRef.current.slice(0, -1);
        } else {
          sendRef.current(dev.id, { action: "text", text: "\b" });
        }
        return;
      }
      if (e.key.length === 1) {
        e.preventDefault();
        bufferRef.current += e.key;
        if (flushTimer.current !== undefined) window.clearTimeout(flushTimer.current);
        flushTimer.current = window.setTimeout(flush, 120);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      flush();
    };
  }, [flush, leave]);

  // ---- Captures ----

  const shot = async () => {
    if (!active) return;
    const canvas = canvases.current.get(active.id);
    if (!canvas || canvas.width === 0) {
      onToast("Nothing to capture", "The screen hasn’t arrived yet.", "warn");
      return;
    }
    const path = await takeScreenshot(canvas, nickname(active), settings.screenshotDir || defaults.screenshots);
    onToast("Screenshot saved", path ?? "Saved to your downloads", "ok");
  };

  const toggleRecord = async () => {
    if (recorder) {
      const path = await recorder.stop();
      setRecorder(null);
      onToast("Recording saved", path ?? "Saved to your downloads", "ok");
      return;
    }
    if (!active) return;
    const canvas = canvases.current.get(active.id);
    if (!canvas || canvas.width === 0) {
      onToast("Nothing to record", "The screen hasn’t arrived yet.", "warn");
      return;
    }
    const rec = startRecording(canvas, nickname(active), settings.recordingDir || defaults.recordings);
    if (!rec) {
      onToast("Can’t record", "This build can’t record the canvas.", "danger");
      return;
    }
    setRecorder(rec);
    onToast("Recording started", nickname(active), "ok");
  };

  if (!active) return null;

  const quality = !stats.live ? "poor" : stats.fps >= 20 ? "good" : stats.fps >= 8 ? "fair" : "poor";
  const controllable = active.controllable !== false;
  // canRotate is undefined on older agents; only disable when it's explicitly false.
  const rotatable = controllable && active.canRotate !== false;

  return (
    <div className="room" role="dialog" aria-modal="true" aria-label={`Control ${nickname(active)}`}>
      <header className="room-head">
        <div className="room-id">
          <div className="room-name">{nickname(active)}</div>
          <span className={`room-state ${stats.live ? "live" : ""}`}>
            <i />
            {stats.live ? "Live" : "Waiting for the screen…"}
          </span>
        </div>

        <div className="room-metrics">
          {recorder && (
            <span className="rec-dot">
              <i />
              REC
            </span>
          )}
          <span className="metric">
            <b>{stats.fps}</b> fps
          </span>
          <span className={`metric ${quality}`} title="Time between frames">
            <b>{stats.live ? stats.intervalMs : "—"}</b> ms
          </span>
          <span className="metric">
            <Signal level={active.signal} />
          </span>
          <span className="metric">
            <Battery level={active.battery} charging={active.charging} />
          </span>

          <div className="pop-wrap">
            <button
              className="icon-btn"
              onClick={() => setAddOpen((v) => !v)}
              title="Control another phone alongside this one"
              disabled={available.length === 0}
            >
              <IconPlus />
            </button>
            {addOpen && available.length > 0 && (
              <div className="pop" onMouseLeave={() => setAddOpen(false)}>
                <div className="pop-title">Add a phone</div>
                {available.map((d) => (
                  <button
                    key={d.id}
                    className="pop-item"
                    onClick={() => {
                      onAdd(d.id);
                      setAddOpen(false);
                    }}
                  >
                    <IconCheck />
                    {nickname(d)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button className="icon-btn" onClick={() => void leave()} title="Leave (Esc)" aria-label="Leave">
            <IconClose />
          </button>
        </div>
      </header>

      <div className="room-body">
        {devices.map((d) => (
          <Stage
            key={d.id}
            device={d}
            name={nickname(d)}
            active={d.id === active.id}
            closable={devices.length > 1}
            sendControl={sendControl}
            onActivate={() => setActiveId(d.id)}
            onClose={() => onDrop(d.id)}
            onCanvas={(c) => {
              if (c) canvases.current.set(d.id, c);
              else canvases.current.delete(d.id);
            }}
          />
        ))}
      </div>

      <div className="room-bar" role="toolbar" aria-label="Phone controls">
        <button className="ctrl" onClick={() => sendKey("back")} disabled={!controllable}>
          <IconBack />
          <span>Back</span>
        </button>
        <button className="ctrl" onClick={() => sendKey("home")} disabled={!controllable}>
          <IconHome />
          <span>Home</span>
        </button>
        <button className="ctrl" onClick={() => sendKey("recents")} disabled={!controllable}>
          <IconRecents />
          <span>Recents</span>
        </button>
        <button className="ctrl" onClick={() => sendKey("notifications")} disabled={!controllable}>
          <IconBell />
          <span>Notifs</span>
        </button>

        <span className="ctrl-sep" />

        <button className="ctrl" onClick={() => sendKey("voldown")} disabled={!controllable}>
          <IconVolumeDown />
          <span>Vol −</span>
        </button>
        <button className="ctrl" onClick={() => sendKey("volup")} disabled={!controllable}>
          <IconVolumeUp />
          <span>Vol +</span>
        </button>
        <button
          className="ctrl"
          onClick={rotate}
          disabled={!rotatable}
          title={
            rotatable
              ? "Turn the phone between portrait and landscape"
              : "Turn on “Screen rotate” in the phone app (Settings → Permissions) to allow this"
          }
        >
          <IconRotate />
          <span>Rotate</span>
        </button>
        <button className="ctrl" onClick={() => sendKey("lock")} disabled={!controllable}>
          <IconLock />
          <span>Lock</span>
        </button>
        <button className="ctrl danger" onClick={() => sendKey("power")} disabled={!controllable}>
          <IconPower />
          <span>Power</span>
        </button>

        <span className="ctrl-sep" />

        <button className="ctrl" onClick={() => void shot()}>
          <IconCamera />
          <span>Screenshot</span>
        </button>
        <button className={`ctrl ${recorder ? "rec" : ""}`} onClick={() => void toggleRecord()}>
          {recorder ? <IconStop /> : <IconRecord />}
          <span>{recorder ? "Stop" : "Record"}</span>
        </button>

        <span className="ctrl-sep" />

        <button className="ctrl danger" onClick={() => void leave()}>
          <IconLeave />
          <span>Leave</span>
        </button>
      </div>
    </div>
  );
}
