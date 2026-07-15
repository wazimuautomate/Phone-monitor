import { useCallback, useEffect, useRef, useState } from "react";
import type { Device } from "../types";
import { videoBus, type VideoFrameMsg } from "../lib/video-bus";

/**
 * Renders a phone's screen. If a live H.264 stream is arriving for this device
 * it is decoded via WebCodecs onto a canvas; otherwise a synthetic placeholder
 * is shown so the layout matches the real product (and demo devices work).
 */
interface PhoneScreenProps {
  device: Device;
  /** Fills its container instead of using the phone aspect ratio. */
  fill?: boolean;
  showFps?: boolean;
  /** Reports the intrinsic (decoded) video dimensions when they change. */
  onVideoSize?: (w: number, h: number) => void;
  /** Hands out the canvas so callers can screenshot / record exactly what's drawn. */
  onCanvas?: (canvas: HTMLCanvasElement | null) => void;
  children?: React.ReactNode;
}

export function PhoneScreen({
  device,
  fill,
  showFps,
  onVideoSize,
  onCanvas,
  children,
}: PhoneScreenProps) {
  const [hasVideo, setHasVideo] = useState(false);
  const [ratio, setRatio] = useState<string | undefined>(undefined);
  const onFirstFrame = useCallback(() => setHasVideo(true), []);

  // Shape the box to the real picture. The phone re-encodes at the new size when
  // it rotates, so this follows it into landscape instead of letterboxing.
  const handleSize = useCallback(
    (w: number, h: number) => {
      if (w > 0 && h > 0) setRatio(`${w} / ${h}`);
      onVideoSize?.(w, h);
    },
    [onVideoSize],
  );

  return (
    <div className={`screen ${fill ? "fill" : ""}`} style={fill || !ratio ? undefined : { aspectRatio: ratio }}>
      <LiveScreen
        deviceId={device.id}
        onFirstFrame={onFirstFrame}
        onVideoSize={handleSize}
        onCanvas={onCanvas}
      />
      {!hasVideo && <MockScreen device={device} />}
      {showFps && <span className="fps-badge">{device.fps ?? 0} fps</span>}
      {children}
    </div>
  );
}

function LiveScreen({
  deviceId,
  onFirstFrame,
  onVideoSize,
  onCanvas,
}: {
  deviceId: string;
  onFirstFrame: () => void;
  onVideoSize?: (w: number, h: number) => void;
  onCanvas?: (canvas: HTMLCanvasElement | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Keep the latest callbacks without re-subscribing the decoder.
  const onVideoSizeRef = useRef(onVideoSize);
  onVideoSizeRef.current = onVideoSize;
  const onCanvasRef = useRef(onCanvas);
  onCanvasRef.current = onCanvas;

  useEffect(() => {
    onCanvasRef.current?.(canvasRef.current);
    return () => onCanvasRef.current?.(null);
  }, [deviceId]);

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
    let lastW = 0;
    let lastH = 0;

    const makeDecoder = (codec: string): VideoDecoderLike => {
      const d = new w.VideoDecoder!({
        output: (frame: VideoFrameLike) => {
          if (ctx) {
            if (canvas.width !== frame.displayWidth) canvas.width = frame.displayWidth;
            if (canvas.height !== frame.displayHeight) canvas.height = frame.displayHeight;
            ctx.drawImage(frame as unknown as CanvasImageSource, 0, 0, canvas.width, canvas.height);
            if (lastW !== frame.displayWidth || lastH !== frame.displayHeight) {
              lastW = frame.displayWidth;
              lastH = frame.displayHeight;
              onVideoSizeRef.current?.(lastW, lastH);
            }
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
      className="mock"
      style={{ background: `linear-gradient(160deg, hsl(${hue} 45% 24%), hsl(${(hue + 40) % 360} 55% 12%))` }}
    >
      <div className="mock-bar">
        <span>
          {hh}:{mm}
        </span>
        <span>▮▮▮</span>
      </div>
      <div className="mock-mid">
        <div className="mock-time">
          {hh}:{mm}
        </div>
        <div className="mock-date">{date}</div>
      </div>
      <div className="mock-note">
        {device.id.startsWith("mock-") ? "Demo phone" : "Waiting for the screen…"}
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
