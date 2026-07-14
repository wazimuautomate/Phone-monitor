import { useCallback, useEffect, useRef, useState } from "react";
import type { Device } from "../types";
import { videoBus, type VideoFrameMsg } from "../lib/video-bus";

/**
 * Renders a phone's screen. If a live H.264 stream is arriving for this device
 * it is decoded via WebCodecs onto a canvas; otherwise a synthetic placeholder
 * screen is shown so the layout matches the real product (and demo devices work).
 */
export function PhoneScreen({ device }: { device: Device }) {
  const [hasVideo, setHasVideo] = useState(false);
  const onFirstFrame = useCallback(() => setHasVideo(true), []);
  return (
    <div className="screen">
      <LiveScreen deviceId={device.id} onFirstFrame={onFirstFrame} />
      {!hasVideo && <MockScreen device={device} />}
      <span className="fps-badge">{device.fps ?? 0} fps</span>
    </div>
  );
}

function LiveScreen({ deviceId, onFirstFrame }: { deviceId: string; onFirstFrame: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const w = window as unknown as {
      VideoDecoder?: new (init: unknown) => VideoDecoderLike;
      EncodedVideoChunk?: new (init: unknown) => unknown;
    };
    if (!w.VideoDecoder || !w.EncodedVideoChunk) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    let decoder: VideoDecoderLike | null = null;
    let config: Uint8Array | null = null;
    let haveKey = false;
    let ts = 0;
    let firstShown = false;

    const makeDecoder = (codec: string): VideoDecoderLike => {
      const d = new w.VideoDecoder!({
        output: (frame: VideoFrameLike) => {
          if (ctx) {
            if (canvas.width !== frame.displayWidth) canvas.width = frame.displayWidth;
            if (canvas.height !== frame.displayHeight) canvas.height = frame.displayHeight;
            ctx.drawImage(frame as unknown as CanvasImageSource, 0, 0, canvas.width, canvas.height);
            if (!firstShown) {
              firstShown = true;
              onFirstFrame();
            }
          }
          frame.close();
        },
        error: () => {
          /* decoder error — a fresh config will rebuild it */
        },
      });
      d.configure({ codec, optimizeForLatency: true });
      return d;
    };

    const decode = (type: "key" | "delta", data: Uint8Array) => {
      try {
        decoder?.decode(new w.EncodedVideoChunk!({ type, timestamp: ts++, data }));
      } catch {
        /* drop frame */
      }
    };

    const unsub = videoBus.subscribe(deviceId, (f: VideoFrameMsg) => {
      if (f.type === "config") {
        config = f.data.slice();
        try {
          decoder?.close();
        } catch {
          /* ignore */
        }
        haveKey = false;
        try {
          decoder = makeDecoder(codecFromSps(config) ?? "avc1.42E01E");
        } catch {
          decoder = null;
        }
      } else if (f.type === "keyframe") {
        if (!decoder || !config) return;
        decode("key", concat(config, f.data));
        haveKey = true;
      } else {
        if (!decoder || !haveKey) return;
        decode("delta", f.data.slice());
      }
    });

    return () => {
      unsub();
      try {
        decoder?.close();
      } catch {
        /* ignore */
      }
    };
  }, [deviceId, onFirstFrame]);

  return <canvas ref={canvasRef} className="live-canvas" />;
}

function MockScreen({ device }: { device: Device }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const date = now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const hue = (device.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0) * 37) % 360;

  return (
    <div
      className="mock-screen"
      style={{ background: `linear-gradient(160deg, hsl(${hue} 45% 24%), hsl(${(hue + 40) % 360} 55% 12%))` }}
    >
      <div className="mock-statusbar">
        <span>
          {hh}:{mm}
        </span>
        <span className="mock-icons">▮▮▮</span>
      </div>
      <div className="mock-clock">
        <div className="mock-time">
          {hh}:{mm}
        </div>
        <div className="mock-date">{date}</div>
      </div>
      <div className="mock-badge">
        {device.tier === "view" ? "Tier 2 · view only" : "Tier 1 · control"} · awaiting stream
      </div>
    </div>
  );
}

// ---- WebCodecs helpers ----

interface VideoFrameLike {
  displayWidth: number;
  displayHeight: number;
  close(): void;
}
interface VideoDecoderLike {
  configure(cfg: { codec: string; optimizeForLatency?: boolean }): void;
  decode(chunk: unknown): void;
  close(): void;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

// Build the exact "avc1.PPCCLL" codec string from the SPS in an Annex-B config buffer.
function codecFromSps(config: Uint8Array): string | null {
  for (let i = 0; i + 4 < config.length; i++) {
    const sc3 = config[i] === 0 && config[i + 1] === 0 && config[i + 2] === 1;
    const sc4 = config[i] === 0 && config[i + 1] === 0 && config[i + 2] === 0 && config[i + 3] === 1;
    if (sc3 || sc4) {
      const nal = sc3 ? i + 3 : i + 4;
      if (nal + 3 < config.length && (config[nal] & 0x1f) === 7) {
        return `avc1.${hex(config[nal + 1])}${hex(config[nal + 2])}${hex(config[nal + 3])}`;
      }
    }
  }
  return null;
}
function hex(n: number): string {
  return n.toString(16).padStart(2, "0");
}
