import type { WebSocket, WebSocketServer } from "ws";
import type { SourceManager } from "./sources/source-manager.js";
import type { SourceEvent } from "./sources/types.js";

/**
 * Browser <-> helper protocol.
 *   - Control messages are JSON (device list, stats, alerts, later: commands).
 *   - Video frames (Phase 1+) are sent as binary with a small header.
 */
export function attachHub(wss: WebSocketServer, sources: SourceManager): void {
  wss.on("connection", (ws: WebSocket) => {
    send(ws, { type: "devices", devices: sources.devices() });

    const off = sources.onEvent((event) => forward(ws, event));
    ws.on("close", off);
    ws.on("message", (raw) => {
      let msg: { type?: string } | undefined;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return; // ignore non-JSON frames
      }
      if (msg?.type === "list") {
        send(ws, { type: "devices", devices: sources.devices() });
      }
      // Phase 8: remote-control commands (tap/swipe/keys) will be handled here.
    });
  });
}

function forward(ws: WebSocket, event: SourceEvent): void {
  switch (event.kind) {
    case "device":
      send(ws, { type: "device", device: event.info });
      break;
    case "removed":
      send(ws, { type: "removed", deviceId: event.deviceId });
      break;
    case "stats":
      send(ws, { type: "stats", deviceId: event.deviceId, patch: event.patch });
      break;
    case "video":
      // Phase 1: binary video framing goes here.
      break;
  }
}

function send(ws: WebSocket, msg: unknown): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}
