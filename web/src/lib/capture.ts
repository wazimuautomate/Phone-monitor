// Screenshots and screen recordings of a phone, taken from the very canvas the
// WebCodecs decoder already draws into — so they capture exactly what's on
// screen with no extra decode.
import { saveCapture } from "./desktop";

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

/** Filesystem-safe device label for a filename. */
function slug(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "phone";
}

/** PNG snapshot of the current frame. Returns the saved path (desktop) or null. */
export async function takeScreenshot(
  canvas: HTMLCanvasElement,
  deviceName: string,
  dir: string,
): Promise<string | null> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return null;
  return saveCapture(dir, `${slug(deviceName)}_${stamp()}.png`, blob);
}

/**
 * Records the live canvas to a WebM file. `stop()` finalises and saves — the
 * Control Room calls it on Leave so a recording is never lost.
 */
export interface Recorder {
  stop(): Promise<string | null>;
  readonly startedAt: number;
}

export function startRecording(
  canvas: HTMLCanvasElement,
  deviceName: string,
  dir: string,
  fps = 30,
): Recorder | null {
  const anyCanvas = canvas as HTMLCanvasElement & { captureStream?: (fps: number) => MediaStream };
  if (typeof anyCanvas.captureStream !== "function" || typeof MediaRecorder === "undefined") {
    return null;
  }
  let stream: MediaStream;
  try {
    stream = anyCanvas.captureStream(fps);
  } catch {
    return null;
  }

  const mime = pickMime();
  let rec: MediaRecorder;
  try {
    rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  } catch {
    return null;
  }

  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  rec.start(1000); // flush every second so a crash still leaves most of the take
  const startedAt = Date.now();

  return {
    startedAt,
    stop: () =>
      new Promise<string | null>((resolve) => {
        rec.onstop = async () => {
          for (const t of stream.getTracks()) t.stop();
          if (chunks.length === 0) return resolve(null);
          const blob = new Blob(chunks, { type: mime || "video/webm" });
          resolve(await saveCapture(dir, `${slug(deviceName)}_${stamp()}.webm`, blob));
        };
        try {
          rec.stop();
        } catch {
          resolve(null);
        }
      }),
  };
}

function pickMime(): string {
  const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported?.(c)) return c;
  }
  return "";
}
