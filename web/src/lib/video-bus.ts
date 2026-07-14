// A tiny pub/sub for decoded-from-the-wire H.264 frames, keyed by device id.
// ws.ts publishes binary frames here; each PhoneScreen subscribes for its device.

export interface VideoFrameMsg {
  deviceId: string;
  type: "config" | "keyframe" | "delta";
  data: Uint8Array;
}

type Cb = (f: VideoFrameMsg) => void;

const subs = new Map<string, Set<Cb>>();

export const videoBus = {
  publish(f: VideoFrameMsg): void {
    subs.get(f.deviceId)?.forEach((cb) => cb(f));
  },
  subscribe(deviceId: string, cb: Cb): () => void {
    let set = subs.get(deviceId);
    if (!set) {
      set = new Set();
      subs.set(deviceId, set);
    }
    set.add(cb);
    return () => {
      set!.delete(cb);
      if (set!.size === 0) subs.delete(deviceId);
    };
  },
};
