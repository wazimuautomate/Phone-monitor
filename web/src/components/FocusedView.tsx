import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Device } from "../types";
import type { ControlCmd, ControlKey } from "../lib/ws";
import { videoBus } from "../lib/video-bus";
import { PhoneScreen } from "./PhoneScreen";
import {
  IconBack,
  IconBattery,
  IconBell,
  IconClose,
  IconHome,
  IconPower,
  IconRecents,
  IconVolumeDown,
  IconVolumeUp,
} from "../lib/icons";

interface FocusedViewProps {
  device: Device;
  name: string;
  onClose: () => void;
  sendControl: (deviceId: string, cmd: ControlCmd) => void;
}

interface Ripple {
  id: number;
  x: number;
  y: number;
}

/** A press treated as a tap (vs. swipe) if it moved less than this many px. */
const TAP_SLOP_PX = 6;
/** Fraction of screen height a mouse-wheel notch scrolls. */
const WHEEL_SPAN = 0.16;

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Map a client point onto the video content of an element that uses
 * `object-fit: contain`. Returns normalized coords in [0,1] (origin top-left,
 * relative to the *content*, letterboxing removed) plus pixel offsets within
 * the element (for on-screen markers).
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
  return {
    nx: clamp01((px - ox) / cw),
    ny: clamp01((py - oy) / ch),
    px,
    py,
  };
}

/**
 * Live stream quality, measured locally from the rate of decoded frames for
 * this device (independent of the WS protocol — no RTT field exists).
 */
function useStreamStats(deviceId: string) {
  const [stats, setStats] = useState({ fps: 0, intervalMs: 0, live: false });
  useEffect(() => {
    let times: number[] = [];
    let last = 0;
    const unsub = videoBus.subscribe(deviceId, (f) => {
      // Config frames are metadata, not rendered frames — ignore for timing.
      if (f.type === "config") return;
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
      const live = last !== 0 && now - last < 2000;
      setStats({ fps, intervalMs, live });
    }, 500);
    return () => {
      unsub();
      window.clearInterval(timer);
    };
  }, [deviceId]);
  return stats;
}

/**
 * Immersive, AnyDesk-style focused control view for a single phone.
 *
 * Input mapping:
 *  - click (no drag)         → tap at (x,y)
 *  - click-drag              → swipe press→release, ms = clamped press duration
 *  - mouse wheel             → short scroll swipe centered on the cursor
 *  - printable keys          → buffered text, flushed after 120ms idle / on Enter
 *  - Enter                   → flush buffer, then text "\n"
 *  - Backspace               → drop last un-flushed char, else text "\b"
 *  - Esc                     → close
 * All coordinates are normalized floats in [0,1] against the video content.
 */
export function FocusedView({ device, name, onClose, sendControl }: FocusedViewProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [videoSize, setVideoSize] = useState<{ w: number; h: number }>({ w: 9, h: 19.5 });
  const [cursor, setCursor] = useState<{ x: number; y: number; down: boolean } | null>(null);
  const [swipe, setSwipe] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const pressRef = useRef<{ nx: number; ny: number; px: number; py: number; t: number } | null>(null);
  const rippleSeq = useRef(0);

  // Latest values for the native (non-passive) wheel listener + key buffer.
  const sendRef = useRef(sendControl);
  sendRef.current = sendControl;
  const videoSizeRef = useRef(videoSize);
  videoSizeRef.current = videoSize;

  const stats = useStreamStats(device.id);
  const online = device.status === "online";

  const onVideoSize = useCallback((w: number, h: number) => {
    if (w > 0 && h > 0) setVideoSize({ w, h });
  }, []);

  const addRipple = useCallback((x: number, y: number) => {
    const id = ++rippleSeq.current;
    setRipples((r) => [...r, { id, x, y }]);
    window.setTimeout(() => setRipples((r) => r.filter((p) => p.id !== id)), 550);
  }, []);

  const key = useCallback(
    (k: ControlKey) => sendControl(device.id, { action: "key", key: k }),
    [device.id, sendControl],
  );

  // ----- Pointer: tap / swipe -----
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
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
      const ms = Math.round(Math.min(1000, Math.max(50, dur)));
      sendControl(device.id, {
        action: "swipe",
        x1: round3(start.nx),
        y1: round3(start.ny),
        x2: round3(p.nx),
        y2: round3(p.ny),
        ms,
      });
      addRipple(p.px, p.py);
    }
  };

  const onPointerLeave = () => {
    if (!pressRef.current) setCursor(null);
  };

  // ----- Wheel (native, non-passive so we can preventDefault) -----
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const vs = videoSizeRef.current;
      const p = normalize(el, e.clientX, e.clientY, vs.w, vs.h);
      if (!p) return;
      // Wheel down (deltaY>0) reveals content below → finger swipes up (y falls).
      const dir = e.deltaY > 0 ? 1 : -1;
      const y1 = clamp01(p.ny + (dir * WHEEL_SPAN) / 2);
      const y2 = clamp01(p.ny - (dir * WHEEL_SPAN) / 2);
      sendRef.current(device.id, {
        action: "swipe",
        x1: round3(p.nx),
        y1: round3(y1),
        x2: round3(p.nx),
        y2: round3(y2),
        ms: 120,
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [device.id]);

  // ----- Keyboard: text input + Esc -----
  const bufferRef = useRef("");
  const flushTimer = useRef<number | undefined>(undefined);

  const flush = useCallback(() => {
    if (flushTimer.current !== undefined) {
      window.clearTimeout(flushTimer.current);
      flushTimer.current = undefined;
    }
    const text = bufferRef.current;
    bufferRef.current = "";
    if (text) sendRef.current(device.id, { action: "text", text });
  }, [device.id]);

  const scheduleFlush = useCallback(() => {
    if (flushTimer.current !== undefined) window.clearTimeout(flushTimer.current);
    flushTimer.current = window.setTimeout(flush, 120);
  }, [flush]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        flush();
        onClose();
        return;
      }
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return; // let browser shortcuts pass
      if (e.key === "Enter") {
        e.preventDefault();
        flush();
        sendRef.current(device.id, { action: "text", text: "\n" });
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        if (bufferRef.current.length > 0) {
          bufferRef.current = bufferRef.current.slice(0, -1);
          scheduleFlush();
        } else {
          sendRef.current(device.id, { action: "text", text: "\b" });
        }
        return;
      }
      if (e.key.length === 1) {
        e.preventDefault();
        bufferRef.current += e.key;
        scheduleFlush();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      flush();
    };
  }, [device.id, flush, scheduleFlush, onClose]);

  // ----- Header state / quality -----
  const streaming = stats.live;
  const fps = streaming ? stats.fps : device.fps ?? 0;
  const stateLabel = !online
    ? device.status === "connecting"
      ? "Connecting"
      : "Offline"
    : streaming
      ? "Live"
      : "Awaiting stream";
  const stateClass = !online ? (device.status === "connecting" ? "connecting" : "offline") : streaming ? "live" : "waiting";

  const quality = !streaming
    ? "none"
    : stats.fps >= 20
      ? "good"
      : stats.fps >= 8
        ? "fair"
        : "poor";
  const battery = device.battery;
  const batteryClass = battery === undefined ? "" : battery <= 20 ? "low" : battery <= 45 ? "mid" : "ok";

  return (
    <div className="focus-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Control ${name}`}>
      <div className="focus-frame" onClick={(e) => e.stopPropagation()}>
        <header className="focus-head">
          <div className="focus-id">
            <span className="focus-name" title={name}>
              {name}
            </span>
            <span className={`focus-state ${stateClass}`}>
              <span className="focus-state-dot" />
              {stateLabel}
            </span>
          </div>

          <div className="focus-metrics">
            <span className="focus-metric" title="Decoded frames per second">
              <span className="focus-metric-val">{fps}</span>
              <span className="focus-metric-unit">fps</span>
            </span>
            <span className={`focus-metric quality-${quality}`} title="Live stream latency (inter-frame interval)">
              <span className="focus-q-dot" />
              <span className="focus-metric-val">{streaming ? stats.intervalMs : "—"}</span>
              <span className="focus-metric-unit">ms</span>
            </span>
            {battery !== undefined && (
              <span className={`focus-metric battery ${batteryClass}`} title={device.charging ? "Charging" : "Battery"}>
                <IconBattery />
                <span className="focus-metric-val">{battery}%</span>
                {device.charging && <span className="focus-bolt">⚡</span>}
              </span>
            )}
          </div>

          <button className="focus-close" onClick={onClose} title="Close (Esc)" aria-label="Close">
            <IconClose />
          </button>
        </header>

        <div className="focus-body">
          <div className="focus-screen">
            <PhoneScreen device={device} large onVideoSize={onVideoSize} />
            <div
              ref={stageRef}
              className={`focus-input ${cursor?.down ? "pressing" : ""}`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerLeave}
            >
              {swipe && (
                <svg className="focus-swipe" aria-hidden="true">
                  <line x1={swipe.x1} y1={swipe.y1} x2={swipe.x2} y2={swipe.y2} />
                  <circle cx={swipe.x1} cy={swipe.y1} r="6" />
                </svg>
              )}
              {ripples.map((r) => (
                <span key={r.id} className="focus-ripple" style={{ left: r.x, top: r.y }} />
              ))}
              {cursor && (
                <span
                  className={`focus-cursor ${cursor.down ? "down" : ""}`}
                  style={{ left: cursor.x, top: cursor.y }}
                />
              )}
            </div>
          </div>
        </div>

        <div className="focus-controls" role="toolbar" aria-label="Device controls">
          <button className="ctrl-btn" onClick={() => key("back")} title="Back">
            <IconBack />
            <span>Back</span>
          </button>
          <button className="ctrl-btn" onClick={() => key("home")} title="Home">
            <IconHome />
            <span>Home</span>
          </button>
          <button className="ctrl-btn" onClick={() => key("recents")} title="Recent apps">
            <IconRecents />
            <span>Recents</span>
          </button>
          <button className="ctrl-btn" onClick={() => key("notifications")} title="Notifications">
            <IconBell />
            <span>Notifs</span>
          </button>
          <span className="ctrl-sep" />
          <button className="ctrl-btn" onClick={() => key("voldown")} title="Volume down">
            <IconVolumeDown />
            <span>Vol −</span>
          </button>
          <button className="ctrl-btn" onClick={() => key("volup")} title="Volume up">
            <IconVolumeUp />
            <span>Vol +</span>
          </button>
          <button className="ctrl-btn danger" onClick={() => key("power")} title="Power">
            <IconPower />
            <span>Power</span>
          </button>
        </div>
      </div>
    </div>
  );
}
