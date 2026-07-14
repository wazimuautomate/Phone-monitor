// A tiny pub/sub for decoded-from-the-wire H.264 frames, keyed by device id.
// ws.ts publishes binary frames here; each PhoneScreen subscribes for its device.

export interface VideoFrameMsg {
  deviceId: string;
  type: "config" | "keyframe" | "delta";
  data: Uint8Array;
}

type Cb = (f: VideoFrameMsg) => void;

const subs = new Map<string, Set<Cb>>();
// Last codec-config frame (SPS/PPS) seen per device. Replayed to any late
// subscriber so a focused view opened mid-stream can build its decoder
// immediately instead of waiting for the next config frame off the wire.
const lastConfig = new Map<string, VideoFrameMsg>();

export const videoBus = {
  publish(f: VideoFrameMsg): void {
    if (f.type === "config") lastConfig.set(f.deviceId, f);
    subs.get(f.deviceId)?.forEach((cb) => cb(f));
  },
  subscribe(deviceId: string, cb: Cb): () => void {
    let set = subs.get(deviceId);
    if (!set) {
      set = new Set();
      subs.set(deviceId, set);
    }
    set.add(cb);
    // Prime a new subscriber with the cached config (only it receives this).
    const cfg = lastConfig.get(deviceId);
    if (cfg) cb(cfg);
    return () => {
      set!.delete(cb);
      if (set!.size === 0) subs.delete(deviceId);
    };
  },
};
