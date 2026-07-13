// Dashboard-side client for the helper WebSocket, with auto-reconnect.
import type { Device } from "../types";

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
      try {
        handlers.onMessage?.(JSON.parse(ev.data as string) as HubMessage);
      } catch {
        // ignore non-JSON frames (future binary video)
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
