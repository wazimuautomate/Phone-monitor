// Dashboard-side client for the helper WebSocket, with auto-reconnect.
// JSON frames carry control messages; binary frames carry H.264 video.
import type { Device } from "../types";
import { videoBus } from "./video-bus";

export type HubMessage =
  | { type: "devices"; devices: Device[] }
  | { type: "device"; device: Device }
  | { type: "removed"; deviceId: string }
  | { type: "stats"; deviceId: string; patch: Partial<Device> };

interface HubHandlers {
  onOpen?: () => void;
  onClose?: () => void;
  onMessage?: (msg: HubMessage) => void;
}

export interface Hub {
  send(msg: unknown): void;
  close(): void;
}

export function connectHub(handlers: HubHandlers): Hub {
  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
  let socket = new WebSocket(url);
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | undefined;

  const wire = (s: WebSocket) => {
    s.binaryType = "arraybuffer";
    s.onopen = () => handlers.onOpen?.();
    s.onclose = () => {
      handlers.onClose?.();
      if (!closed) {
        retry = setTimeout(() => {
          socket = new WebSocket(url);
          wire(socket);
        }, 1000);
      }
    };
    s.onmessage = (ev) => {
      if (ev.data instanceof ArrayBuffer) {
        routeVideo(ev.data);
        return;
      }
      try {
        handlers.onMessage?.(JSON.parse(ev.data as string) as HubMessage);
      } catch {
        // ignore malformed frames
      }
    };
  };
  wire(socket);

  return {
    send(msg: unknown) {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
    },
    close() {
      closed = true;
      if (retry) clearTimeout(retry);
      socket.close();
    },
  };
}

// Binary frame layout from the helper: [type][idLen][deviceId][H.264 payload].
function routeVideo(buffer: ArrayBuffer): void {
  const view = new Uint8Array(buffer);
  if (view.length < 2) return;
  const typeByte = view[0];
  const idLen = view[1];
  const deviceId = new TextDecoder().decode(view.subarray(2, 2 + idLen));
  const data = view.subarray(2 + idLen);
  videoBus.publish({
    deviceId,
    type: typeByte === 0 ? "config" : typeByte === 1 ? "keyframe" : "delta",
    data,
  });
}
