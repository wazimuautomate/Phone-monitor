// Dashboard-side client for the helper WebSocket, with auto-reconnect.

export interface WireDevice {
  id: string;
  name: string;
  status: string;
  tier?: string;
  connection?: string;
  battery?: number;
}

export type HubMessage =
  | { type: "devices"; devices: WireDevice[] }
  | { type: "device"; device: WireDevice }
  | { type: "removed"; deviceId: string }
  | { type: "stats"; deviceId: string; patch: Partial<WireDevice> };

interface HubHandlers {
  onOpen?: () => void;
  onClose?: () => void;
  onMessage?: (msg: HubMessage) => void;
}

export function connectHub(handlers: HubHandlers) {
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
    get socket() {
      return socket;
    },
    close() {
      closed = true;
      if (retry) clearTimeout(retry);
      socket.close();
    },
  };
}
